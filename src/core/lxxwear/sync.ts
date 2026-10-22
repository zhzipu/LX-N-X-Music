import RNFetchBlob from 'rn-fetch-blob'
import { getMusicUrl, getLyricInfo, getPicPath } from '@/core/music'
import {
  bakeLyricTime,
  getLyricAdjust,
  getLyricAdjustRevision,
  normalizeLyricSpeed,
  onLyricAdjustChange,
} from '@/core/lyricAdjust'
import { mergeLyrics } from '@/screens/Home/Views/Mylist/MusicList/download/lrcTool'
import { getFileExtension, getFileExtensionFromUrl } from '@/screens/Home/Views/Mylist/MusicList/download/utils'
import { privateStorageDirectoryPath, extname } from '@/utils/fs'
import downloadState from '@/store/download/state'
import { DEVICE_NAME } from './pairing'
import { getDeviceToken } from './token'
import { getPlaylistSongs, resolvePlaylists, type PlaylistOption } from './playlists'
import {
  hasAutoPlaylist,
  loadConfig,
  saveConfig,
  updatePlaylistState,
  type LxxWearConfig,
  type PlaylistSyncState,
} from './config'
import {
  LAN_SONG_FAILED,
  LAN_SONG_IDLE,
  LAN_SONG_PENDING,
  LAN_SONG_READY,
  LAN_SONG_SKIPPED,
  getLanInfo,
  isLanServerAvailable,
  markLanSongFailed,
  markLanSongLyric,
  markLanSongReady,
  onLanFinish,
  onLanPrepare,
  onLanProgress,
  onLanSkip,
  resetLanSong,
  setLanManifest,
  startLanServer,
  stopLanServer,
  type LanFinishEvent,
  type LanManifest,
  type LanPlaylistGroup,
  type LanSong,
} from './native'

/**
 * 同步核心：把选中的歌单整理成一份清单交给原生服务对外提供，
 * 手表按需来要某首时（prepare 事件）才去准备音频/歌词/封面。
 * 断点续传由手表侧完成（Range + .part），手机这边只要保证同一首能重复取到同一个文件。
 */

export interface SyncSongView {
  id: string
  name: string
  state: number
  size: number
  error?: string
}

/** 手动同步弹窗里的一行：一首歌（可能同时属于多个勾选歌单） */
export interface SyncCandidate {
  /** 稳定的歌曲 key，不含音质，换音质不会让选择失效 */
  key: string
  name: string
  artist: string
  /** 这首歌出现在哪些勾选歌单里 */
  playlistKeys: string[]
}

/**
 * 一条并行通道的实时状态。同步界面给每条通道画一根进度条，
 * 一根条里左半是「手机从音源下载到本机」，右半是「手机往手表传」。
 */
export interface SyncWorkerSlot {
  /** 通道序号 0..4，界面拿它当稳定 key */
  index: number
  /** 这条通道正在处理的歌曲 id；空串表示空闲 */
  id: string
  name: string
  /** 0 空闲 / 1 下载中 / 2 传输中 / 3 完成 */
  stage: number
  /** 下载到本机的进度 0~1 */
  download: number
  /** 传给手表的进度 0~1 */
  transfer: number
  startedAt: number
}

export interface SyncRuntime {
  /** 服务在跑 */
  running: boolean
  /** 正在解析歌单 */
  starting: boolean
  /**
   * 这一轮同步的阶段：
   * running = 手表正在拉；done = 手表已经报过「同步结束」，等用户重新开始或歌单变化
   */
  phase: 'idle' | 'running' | 'done'
  error: string
  playlistName: string
  quality: LX.Quality
  total: number
  readyCount: number
  /** 手表报过来的「本地已有、这轮跳过」的数量 */
  skippedCount: number
  /** 这一轮结束的摘要（手表报上来的统计） */
  summary: string
  finishedAt: number
  currentName: string
  /** 正在并行准备的歌曲数 */
  activeCount: number
  currentDone: number
  currentTotal: number
  /** 5 条并行通道各自的下载 / 传输进度 */
  workers: SyncWorkerSlot[]
  /** 总进度 0~1（按「首」加权，含下载与传输两段） */
  overall: number
  ip: string
  port: number
  songs: SyncSongView[]
}

/** 并行通道数：手机同时准备几首，界面也就画几根通道条 */
const PREPARE_PARALLEL = 5
/** 下载完成时这首歌在总进度里的权重：剩下的 40% 留给「传给手表」 */
const SCORE_DOWNLOAD_DONE = 0.6
/** 进度事件很密，攒一下再推给界面，免得整页每秒重绘几十次 */
const PROGRESS_PUBLISH_MS = 120

const createSlots = (): SyncWorkerSlot[] =>
  Array.from({ length: PREPARE_PARALLEL }, (_, index) => ({
    index,
    id: '',
    name: '',
    stage: 0,
    download: 0,
    transfer: 0,
    startedAt: 0,
  }))

const emptyRuntime = (): SyncRuntime => ({
  running: false,
  starting: false,
  phase: 'idle',
  error: '',
  playlistName: '',
  quality: '320k',
  total: 0,
  readyCount: 0,
  skippedCount: 0,
  summary: '',
  finishedAt: 0,
  currentName: '',
  activeCount: 0,
  currentDone: 0,
  currentTotal: 0,
  workers: createSlots(),
  overall: 0,
  ip: '',
  port: 0,
  songs: [],
})

type Listener = (state: SyncRuntime) => void

let runtime: SyncRuntime = emptyRuntime()
const listeners = new Set<Listener>()

const update = (patch: Partial<SyncRuntime>) => {
  runtime = { ...runtime, ...patch }
  listeners.forEach(listener => listener(runtime))
}

export const getSyncRuntime = (): SyncRuntime => runtime

export const subscribeSync = (listener: Listener): (() => void) => {
  listeners.add(listener)
  listener(runtime)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 主动检查歌单内容变化的间隔。手机端歌单多一首少一首、网易云那边收藏变动，
 * 都在这一轮里发现，然后下发新的 revision，手表收到广播后自己去增删文件。
 */
const PLAYLIST_WATCH_INTERVAL_MS = 60 * 1000
/** 选中网易云歌单时每次核对都要走网络，别太勤 */
const REMOTE_PLAYLIST_WATCH_MS = 3 * 60 * 1000
/** 上一次拉过网易云歌单的时间 */
let lastRemoteBuildAt = 0

interface SongRecord {
  wireId: string
  entry: LanSong
  info: LX.Music.MusicInfo
  ext: string
}

interface Session {
  config: LxxWearConfig
  records: SongRecord[]
  byId: Map<string, SongRecord>
  options: PlaylistOption[]
  revision: string
  subscriptions: Array<{ remove: () => void } | null>
  refreshTimer: ReturnType<typeof setInterval> | null
  /** 正在重建清单，防止定时器和手动触发撞在一起 */
  refreshing: boolean
}

let session: Session | null = null
/** 正在跑的准备任务数（一个任务同一时刻只处理一首） */
let activeWorkers = 0
/** 勾选/音质变化时正好在准备单曲，等队列空下来再重建清单 */
let pendingRefresh = false
const queue: string[] = []
const queued = new Set<string>()
/** 并行准备时每首的传输进度，用来算总百分比 */
const transfers = new Map<string, { done: number; total: number }>()

/** 5 条并行通道的展示状态（模块级可变对象，runtime.workers 是它的快照） */
const slots: SyncWorkerSlot[] = createSlots()
/** 歌曲 id → 它当前挂在第几条通道上 */
const slotBySong = new Map<string, number>()
/** 每首歌在总进度里的得分（0~1），只增不减，避免进度条来回跳 */
const scores = new Map<string, number>()
let scoreSum = 0
let lastPublishAt = 0

/** 记一分：只允许往上涨，同一首歌不会被重复计入总量 */
const setScore = (id: string, next: number) => {
  const prev = scores.get(id) ?? 0
  const value = Math.min(1, Math.max(prev, next))
  if (value === prev) return
  scores.set(id, value)
  scoreSum += value - prev
}

const resetScores = () => {
  scores.clear()
  scoreSum = 0
}

/** 单首重试前把它的分数退回去，否则总进度会一直算着上次那次失败 */
const clearScore = (id: string) => {
  const prev = scores.get(id) ?? 0
  if (prev === 0) return
  scores.delete(id)
  scoreSum -= prev
}

const seedScore = (id: string, value: number) => {
  const prev = scores.get(id) ?? 0
  if (value <= prev) return
  scores.set(id, value)
  scoreSum += value - prev
}

const publishProgress = (force = false) => {
  const now = Date.now()
  if (!force && now - lastPublishAt < PROGRESS_PUBLISH_MS) return
  lastPublishAt = now
  let done = 0
  let total = 0
  transfers.forEach(item => {
    done += item.done
    total += item.total
  })
  update({
    currentDone: done,
    currentTotal: total,
    activeCount: transfers.size,
    workers: slots.map(item => ({ ...item })),
    overall: runtime.total > 0 ? Math.min(1, scoreSum / runtime.total) : 0,
  })
}

/** 挑一条通道给新歌用：优先空着的，全占满了就顶掉「已经传得差不多」的那条 */
const acquireSlot = (wireId: string, name: string): number => {
  const existing = slots.findIndex(item => item.id === wireId)
  if (existing >= 0) {
    slots[existing].name = name
    slots[existing].startedAt = Date.now()
    return existing
  }
  let index = slots.findIndex(item => !item.id)
  if (index < 0) {
    // 5 条通道都在用：踢掉传输完成度最高的（剩下能利用的部分最少），
    // 都一样就踢开始得最早的
    index = 0
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].transfer > slots[index].transfer + 0.001) {
        index = i
      } else if (
        Math.abs(slots[i].transfer - slots[index].transfer) <= 0.001 &&
        slots[i].startedAt < slots[index].startedAt
      ) {
        index = i
      }
    }
  }
  const slot = slots[index]
  if (slot.id) slotBySong.delete(slot.id)
  Object.assign(slot, {
    id: wireId,
    name,
    stage: 1,
    download: 0,
    transfer: 0,
    startedAt: Date.now(),
  })
  slotBySong.set(wireId, index)
  return index
}

const patchSlot = (index: number, patch: Partial<SyncWorkerSlot>) => {
  const slot = slots[index]
  if (slot) Object.assign(slot, patch)
}

const resetSlots = () => {
  createSlots().forEach((item, index) => {
    Object.assign(slots[index], item)
  })
  slotBySong.clear()
  lastPublishAt = 0
}

const busy = () => activeWorkers > 0 || queued.size > 0

// ------------------------------------------------------------------ 工具

const hashString = (value: string): string => {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(16)
}

const parseDuration = (interval: string | null | undefined): number => {
  if (!interval) return 0
  const parts = interval.split(':').map(item => Number(item))
  if (parts.length === 0 || parts.some(item => !Number.isFinite(item))) return 0
  return parts.reduce((acc, item) => acc * 60 + item, 0) * 1000
}

const QUALITY_CHAIN: Record<LX.Quality, LX.Quality[]> = {
  master: ['master', 'hires', 'flac', '320k', '128k'],
  hires: ['hires', 'flac', '320k', '128k'],
  atmos_plus: ['atmos_plus', 'atmos', 'flac', '320k', '128k'],
  atmos: ['atmos', 'flac', '320k', '128k'],
  flac: ['flac', '320k', '128k'],
  '320k': ['320k', '128k'],
  '128k': ['128k'],
}

const wireIdOf = (song: LX.Music.MusicInfo, quality: LX.Quality) =>
  `${song.source}-${song.id}__${quality}`

/** 不带音质的歌曲 key：用户选的歌要跨音质记住 */
const songKeyOf = (song: LX.Music.MusicInfo) => `${song.source}-${song.id}`

const extOf = (song: LX.Music.MusicInfo, quality: LX.Quality): string => {
  if (song.source === 'local') {
    const ext = extname((song.meta as any).filePath ?? '')
    return ext || 'mp3'
  }
  return getFileExtension(quality)
}

const BASE_DIR = `${privateStorageDirectoryPath}/lxxwear`

const ensureDir = async (dir: string) => {
  if (!(await RNFetchBlob.fs.isDir(dir))) {
    await RNFetchBlob.fs.mkdir(dir)
  }
}

const fileSize = async (path: string): Promise<number> => {
  try {
    if (!(await RNFetchBlob.fs.exists(path))) return -1
    const stat = await RNFetchBlob.fs.stat(path)
    return Number(stat.size) || 0
  } catch {
    return -1
  }
}

/**
 * 拉直链必须带的头。B 站 CDN（upos-sz-mirrorcos / mirrorhw）是按 UA + Referer 一起判盗链的：
 * - 不带 Referer → 403
 * - 移动端浏览器 UA + 网页 Referer → 403（一样被拦）
 * - BiliApp UA + 网页 Referer → 200
 * 不校验的 mcdn 节点随便都能下，所以只有一部分歌会挂，看着像「偶发失败」。
 * 网易云直链不带 music.163.com 的 Referer/Origin 也容易被风控。
 */
const DOWNLOAD_HEADERS: Partial<Record<LX.Source, Record<string, string>>> = {
  wy: {
    'User-Agent': '',
    Referer: 'https://music.163.com/',
    Origin: 'https://music.163.com',
  },
  bili: {
    'User-Agent':
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
    Referer: 'https://www.bilibili.com/',
  },
}

const DEFAULT_DOWNLOAD_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
}

const downloadHeaders = (source: LX.Source) =>
  DOWNLOAD_HEADERS[source] ?? DEFAULT_DOWNLOAD_HEADERS

const downloadTo = async (
  url: string,
  target: string,
  source: LX.Source,
  onProgress?: (ratio: number) => void
): Promise<number> => {
  const task = RNFetchBlob.config({ path: target, fileCache: false })
    .fetch('GET', url, downloadHeaders(source))
  // 边下边报进度：CDN 没给 Content-Length 时 total 是 -1，那就只知道在动，估不出百分比
  if (onProgress) {
    task.progress?.({ count: 64, interval: 100 }, (received: number, total: number) => {
      if (total > 0) onProgress(Math.min(1, received / total))
    })
  }
  const response = await task
  const status = response.info().status
  if (status !== 200) {
    try {
      await RNFetchBlob.fs.unlink(target)
    } catch {
      // ignore
    }
    throw new Error(`下载失败 HTTP ${status}`)
  }
  const stat = await RNFetchBlob.fs.stat(target)
  return Number(stat.size) || 0
}

// ------------------------------------------------------------------ 单曲准备

const findDownloadedFile = async (song: LX.Music.MusicInfo, quality: LX.Quality) => {
  if (song.source === 'local') {
    const path = (song.meta as any).filePath as string | undefined
    if (path && (await fileSize(path)) > 0) {
      return { path, ext: extOf(song, quality), size: await fileSize(path) }
    }
  }
  const task = downloadState.tasks.find(item =>
    String(item.musicInfo.id) === String(song.id) &&
    item.quality === quality &&
    item.status === 'completed' &&
    !!item.filePath
  )
  if (!task) return null
  const size = await fileSize(task.filePath)
  if (size <= 0) return null
  return { path: task.filePath, ext: extname(task.filePath) || getFileExtension(quality), size }
}

const ensureAudio = async (
  record: SongRecord,
  quality: LX.Quality,
  onProgress?: (ratio: number) => void
): Promise<{ path: string; ext: string; size: number }> => {
  const reused = await findDownloadedFile(record.info, quality)
  if (reused) {
    onProgress?.(1)
    return reused
  }

  const ext = record.ext
  const dir = `${BASE_DIR}/audio/${quality}`
  await ensureDir(`${BASE_DIR}/audio`)
  await ensureDir(dir)
  const target = `${dir}/${hashString(record.wireId)}.${ext}`

  const cached = await fileSize(target)
  if (cached > 0) {
    onProgress?.(1)
    return { path: target, ext, size: cached }
  }

  const chain = QUALITY_CHAIN[quality] ?? [quality]
  let lastError: any = null
  for (const candidate of chain) {
    let url = ''
    try {
      url = await getMusicUrl({ musicInfo: record.info, quality: candidate, isRefresh: true })
    } catch (e) {
      lastError = e
      continue
    }
    if (!url) continue
    try {
      const size = await downloadTo(url, target, record.info.source, onProgress)
      if (size <= 0) throw new Error('下载到的文件是空的')
      return { path: target, ext, size }
    } catch (e) {
      lastError = e
    }
  }
  throw new Error(lastError?.message ?? '拿不到播放地址')
}

const ensureLyric = async (song: LX.Music.MusicInfo): Promise<string | null> => {
  // 手机端在播放页调过这首歌的歌词（手动匹配 / 时间偏移）就以那份为准，
  // 与 core/lyric 的 resolveLyric 保持同一套优先级
  const adjust = getLyricAdjust(song.id)
  let lyric = adjust?.lrc ?? ''
  let tlrc = adjust?.tlrc ?? ''
  let rlrc = adjust?.rlrc ?? ''
  if (!lyric) {
    try {
      const lyricInfo = await getLyricInfo({ musicInfo: song })
      lyric = lyricInfo.lyric ?? ''
      tlrc = tlrc || lyricInfo.tlyric || ''
      rlrc = rlrc || lyricInfo.rlyric || ''
    } catch {
      return null
    }
  }
  const text = lyric ? mergeLyrics(lyric, tlrc, rlrc) : ''
  if (!text || !text.trim()) return null
  // 手表端的 LrcView 直接吃时间轴，没有 offset / 倍速这个概念，
  // 所以手机上调出来的偏移与倍速必须在这里改写进每一行的时间戳
  const offset = adjust?.offset ?? 0
  const speed = normalizeLyricSpeed(adjust?.speed ?? 1)
  return bakeLyricTime(text, speed, offset)
}

const ensureCover = async (record: SongRecord): Promise<string | null> => {
  try {
    const url = await getPicPath({ musicInfo: record.info })
    if (!url) return null
    if (!/^https?:/i.test(url)) {
      return (await fileSize(url)) > 0 ? url : null
    }
    const dir = `${BASE_DIR}/cover`
    await ensureDir(dir)
    const ext = getFileExtensionFromUrl(url)
    const target = `${dir}/${hashString(record.wireId)}.${ext}`
    if ((await fileSize(target)) > 0) return target
    await downloadTo(url, target, record.info.source)
    return target
  } catch {
    return null
  }
}

// ------------------------------------------------------------------ 准备队列

/** 一个工作线程：从队列里不停取歌，直到队列空了再退出 */
const runWorker = async () => {
  try {
    while (queue.length > 0) {
      const wireId = queue.shift()!
      queued.delete(wireId)
      const current = session
      if (!current) break
      const record = current.byId.get(wireId)
      if (!record) {
        await markLanSongFailed(wireId, '手机端歌单里找不到这首')
        continue
      }
      // 认领一条通道：界面靠它画「第 N 个进程」的下载 / 传输进度
      const slotIndex = acquireSlot(wireId, record.entry.name)
      update({ currentName: record.entry.name })
      publishProgress(true)
      try {
        const audio = await ensureAudio(record, current.config.quality, ratio => {
          patchSlot(slotIndex, { download: ratio })
          setScore(wireId, SCORE_DOWNLOAD_DONE * ratio)
          publishProgress()
        })
        // 音频落到手机上了，后半程是手表来拉
        patchSlot(slotIndex, { download: 1, stage: 2 })
        setScore(wireId, SCORE_DOWNLOAD_DONE)
        publishProgress(true)
        const lyric = await ensureLyric(record.info)
        const cover = await ensureCover(record)
        await markLanSongReady(wireId, audio.path, audio.ext, audio.size, lyric, cover)
        update({
          readyCount: Math.min(runtime.total, runtime.readyCount + 1),
          songs: runtime.songs.map(item =>
            item.id === wireId ? { ...item, state: LAN_SONG_READY, size: audio.size } : item
          ),
        })
        publishProgress(true)
      } catch (e: any) {
        const message = e?.message ?? '准备失败'
        await markLanSongFailed(wireId, message)
        // 失败也算这首处理完了，否则总进度会永远差这几首
        setScore(wireId, 1)
        patchSlot(slotIndex, { stage: 3 })
        update({
          songs: runtime.songs.map(item =>
            item.id === wireId
              ? { ...item, state: LAN_SONG_FAILED, error: message }
              : item
          ),
        })
        publishProgress(true)
      } finally {
        // 这首不管成没成，都不再占着传输进度
        if (transfers.delete(wireId)) publishProgress(true)
      }
    }
  } finally {
    activeWorkers--
    if (activeWorkers > 0) return
    // 所有线程都闲下来了：还有活就继续拉，否则补一次被推迟的清单重建
    if (queue.length > 0) {
      pump()
    } else if (pendingRefresh) {
      pendingRefresh = false
      void refreshManifest(true)
    }
  }
}

/** 按并发数把队列铺开，最多同时跑 PREPARE_PARALLEL 首 */
const pump = () => {
  while (activeWorkers < PREPARE_PARALLEL && queue.length > 0) {
    activeWorkers++
    void runWorker()
  }
}

const enqueue = (wireId: string) => {
  if (queued.has(wireId)) return
  queued.add(wireId)
  queue.push(wireId)
  const current = session
  if (current) {
    // 上一轮报过「完成」后又来新歌（自动同步补歌）：把这一轮重新拉起来
    const restart = runtime.phase === 'done'
    const patch: Partial<SyncRuntime> = {
      overall: runtime.total > 0 ? Math.min(1, scoreSum / runtime.total) : runtime.overall,
    }
    if (restart) {
      // 收工时总分被清零了，新一轮起手先把已经就绪 / 手表已有的歌记满，
      // 否则总进度按整库分母算，永远爬不到 100%
      runtime.songs.forEach(item => {
        if (item.state !== LAN_SONG_IDLE && item.state !== LAN_SONG_PENDING) seedScore(item.id, 1)
      })
      patch.overall = runtime.total > 0 ? Math.min(1, scoreSum / runtime.total) : 0
      patch.phase = 'running'
      patch.summary = ''
      patch.finishedAt = 0
    }
    update({
      ...patch,
      songs: runtime.songs.map(item =>
        item.id === wireId && item.state === LAN_SONG_IDLE
          ? { ...item, state: LAN_SONG_PENDING }
          : item
      ),
    })
  }
  pump()
}

// ------------------------------------------------------------------ 清单构建

/** 清单里给手表看的歌单名；一个都没勾时手表那边是空曲库 */
const playlistLabel = (options: PlaylistOption[]): string =>
  options.length > 0 ? options.map(item => item.name).join(' + ') : '未选择歌单'

interface CollectedPlaylist {
  option: PlaylistOption
  songs: LX.Music.MusicInfo[]
}

/**
 * 一个歌单最终该给手表哪些歌。
 * - 没选过歌的歌单：一首都不进（点歌单名字选好歌之后才进）
 * - 选歌时勾上的：一直保留
 * - 选歌之后才加进歌单的：只有开了自动同步才带上
 */
const allowedKeysOf = (
  state: PlaylistSyncState | undefined,
  allKeys: string[]
): { keys: string[]; added: string[] } => {
  if (!state || !state.synced) return { keys: [], added: [] }
  const selected = new Set(state.selected)
  const snapshot = new Set(state.snapshot)
  const keys: string[] = []
  const added: string[] = []
  for (const key of allKeys) {
    if (selected.has(key)) {
      keys.push(key)
    } else if (state.auto && !snapshot.has(key)) {
      keys.push(key)
      added.push(key)
    }
  }
  return { keys, added }
}

/** 读取歌单内容。一个歌单读失败不影响其它歌单，失败数交给上层判断是不是网络问题 */
const collectSongs = async (
  options: PlaylistOption[]
): Promise<{ collected: CollectedPlaylist[]; failed: number }> => {
  const collected: CollectedPlaylist[] = []
  let failed = 0
  for (const option of options) {
    try {
      collected.push({ option, songs: await getPlaylistSongs(option) })
    } catch (e) {
      failed++
      console.warn('[LXXWear] 读取歌单失败', option.name, e)
    }
  }
  return { collected, failed }
}

const compose = (
  collected: CollectedPlaylist[],
  quality: LX.Quality,
  states: Record<string, PlaylistSyncState>
): { records: SongRecord[]; playlists: LanPlaylistGroup[]; added: Record<string, string[]> } => {
  const seen = new Set<string>()
  const records: SongRecord[] = []
  const playlists: LanPlaylistGroup[] = []
  const added: Record<string, string[]> = {}
  for (const { option, songs } of collected) {
    const valid = songs.filter(song => !!song?.id)
    const byKey = new Map<string, LX.Music.MusicInfo>()
    for (const song of valid) {
      const key = songKeyOf(song)
      if (!byKey.has(key)) byKey.set(key, song)
    }
    const allowed = allowedKeysOf(states[option.key], Array.from(byKey.keys()))
    if (allowed.added.length > 0) added[option.key] = allowed.added
    const group: LanPlaylistGroup = { id: option.key, name: option.name, songIds: [] }
    for (const key of allowed.keys) {
      const song = byKey.get(key)
      if (!song) continue
      const wireId = wireIdOf(song, quality)
      if (!seen.has(wireId)) {
        seen.add(wireId)
        records.push({
          wireId,
          ext: extOf(song, quality),
          info: song,
          entry: {
            id: wireId,
            name: song.name ?? '',
            artist: song.singer ?? '',
            album: (song.meta as any)?.albumName ?? '',
            duration: parseDuration(song.interval),
            ext: extOf(song, quality),
            // 手机端调过这首歌的歌词时给一个指纹，手表比对不上会重拉歌词；
            // 没调整过就是空串（不下发），手表端行为与以前完全一致
            lyricRevision: getLyricAdjustRevision(song.id) || undefined,
          },
        })
      }
      // 同一首歌可能同时在多个勾选歌单里：文件只存一份，但每个歌单都要记上它
      if (!group.songIds.includes(wireId)) group.songIds.push(wireId)
    }
    // 勾选了就保留这个歌单，哪怕这次一首歌都没选——手表上是个「0 首」的空歌单，
    // 而不是整个歌单消失。没勾选的歌单根本不在这里，手表那边会被删掉。
    playlists.push(group)
  }
  return { records, playlists, added }
}

const buildRecords = async (
  options: PlaylistOption[],
  quality: LX.Quality,
  states: Record<string, PlaylistSyncState>
): Promise<{
  records: SongRecord[]
  playlists: LanPlaylistGroup[]
  added: Record<string, string[]>
  failed: number
}> => {
  const { collected, failed } = await collectSongs(options)
  return { ...compose(collected, quality, states), failed }
}


const buildManifest = (
  playlistName: string,
  quality: LX.Quality,
  records: SongRecord[],
  playlists: LanPlaylistGroup[]
): LanManifest => {
  const playlistId = `lxxwear-${hashString(records.map(item => item.wireId).join(','))}`
  // 歌词指纹只在真的有调整时才参与 revision：没调整过的用户升级后 revision 不变，
  // 手表不会被平白触发一轮全量同步
  const lyricDigest = records
    .filter(item => item.entry.lyricRevision)
    .map(item => `${item.wireId}=${item.entry.lyricRevision}`)
    .join(',')
  const parts: unknown[] = [
    playlistName,
    quality,
    records.map(item => item.wireId),
    // 曲目没变但歌单分组变了（比如把一首歌挪到另一个勾选歌单）也要让手表重写索引
    playlists.map(item => [item.id, item.name, item.songIds]),
  ]
  // 手机上调了歌词 / 换了匹配：revision 跟着变，手表才会重新走一轮去更新歌词
  if (lyricDigest) parts.push(lyricDigest)
  const revision = hashString(JSON.stringify(parts))
  return {
    playlistId,
    playlistName,
    revision,
    quality,
    songs: records.map(item => item.entry),
    playlists,
  }
}

const applyManifest = (
  manifest: LanManifest,
  records: SongRecord[],
  keepStates = false
) => {
  // 后台刷新清单时沿用已有的「已就绪 / 已跳过」，否则每加一首歌整列都会闪回待准备
  const previous = keepStates ? new Map(runtime.songs.map(item => [item.id, item])) : null
  const songs: SyncSongView[] = records.map(item => {
    const old = previous?.get(item.wireId)
    if (old) return { ...old, name: item.entry.name }
    return {
      id: item.wireId,
      name: item.entry.name,
      state: LAN_SONG_IDLE,
      size: -1,
    }
  })
  // 总进度按这份清单重算：已经在手表上的（跳过）和已经备好的先记满
  resetScores()
  for (const item of songs) {
    if (item.state !== LAN_SONG_IDLE && item.state !== LAN_SONG_PENDING) seedScore(item.id, 1)
  }
  update({
    total: songs.length,
    readyCount: songs.filter(item => item.state === LAN_SONG_READY).length,
    skippedCount: songs.filter(item => item.state === LAN_SONG_SKIPPED).length,
    currentName: '',
    activeCount: 0,
    currentDone: 0,
    currentTotal: 0,
    overall: songs.length > 0 ? Math.min(1, scoreSum / songs.length) : 0,
    playlistName: manifest.playlistName,
    quality: manifest.quality as LX.Quality,
    songs,
  })
  prewarmAdjustedLyrics(manifest)
}

/**
 * 手机端调过歌词的歌，原生缓存里可能还留着上一版歌词。
 *
 * `/api/lyric/{id}` 是直接把原生缓存的歌词发出去的，手表只在「本地没有」或「指纹对不上」
 * 时才来要，所以这里主动把这几首的歌词重新算一份推给原生——只更新歌词、不动音频状态，
 * 已经就绪的歌不会被打回「待准备」，也不会因为这个去下载音频。
 * 同一个指纹只推一次；指纹被清掉（用户取消调整）也要推，否则原生还留着带偏移的旧版。
 */
const preparedLyricRevisions = new Map<string, string>()
const prewarmAdjustedLyrics = (manifest: LanManifest) => {
  const current = session
  if (!current) return
  const next = new Map<string, string>()
  for (const item of manifest.songs) {
    if (item.lyricRevision) next.set(item.id, item.lyricRevision)
  }
  const targets = new Set<string>()
  next.forEach((revision, id) => {
    if (preparedLyricRevisions.get(id) !== revision) targets.add(id)
  })
  preparedLyricRevisions.forEach((_revision, id) => {
    if (!next.has(id)) targets.add(id)
  })
  preparedLyricRevisions.clear()
  next.forEach((revision, id) => preparedLyricRevisions.set(id, revision))
  targets.forEach(id => {
    const record = current.byId.get(id)
    if (record) void pushLyric(record)
  })
}

/** 重算一首歌的歌词并推给原生缓存（失败就静默，手表取不到会重试） */
const pushLyric = async (record: SongRecord) => {
  try {
    const lyric = await ensureLyric(record.info)
    await markLanSongLyric(record.wireId, lyric)
  } catch (e: any) {
    console.warn('[LXXWear] 歌词更新失败', record.info.name, e?.message ?? e)
  }
}

// ------------------------------------------------------------------ 对外操作

/** 记下这轮被自动同步带进来的新歌，关自动同步时转成正式选中，不会突然被删 */
const mergeAutoAdded = (
  config: LxxWearConfig,
  added: Record<string, string[]>
): LxxWearConfig => {
  let next = config
  for (const key of Object.keys(next.playlists)) {
    const state = next.playlists[key]
    if (!state.synced || !state.auto) continue
    const list = added[key] ?? []
    const same =
      list.length === state.autoSynced.length &&
      list.every((item, index) => item === state.autoSynced[index])
    if (!same) next = updatePlaylistState(next, key, { autoSynced: list })
  }
  return next
}

/**
 * 手动同步弹窗的数据源：勾选歌单里的全部歌曲（跨歌单去重）。
 * @returns 歌曲列表 + 读失败（多半是网络/登录）的歌单数
 */
export const loadSyncCandidates = async (
  playlistIds: string[]
): Promise<{ songs: SyncCandidate[]; failed: number }> => {
  const options = resolvePlaylists(playlistIds)
  const { collected, failed } = await collectSongs(options)
  const map = new Map<string, SyncCandidate>()
  for (const item of collected) {
    for (const song of item.songs) {
      if (!song?.id) continue
      const key = songKeyOf(song)
      const exists = map.get(key)
      if (exists) {
        if (!exists.playlistKeys.includes(item.option.key)) exists.playlistKeys.push(item.option.key)
        continue
      }
      map.set(key, {
        key,
        name: song.name ?? '',
        artist: song.singer ?? '',
        playlistKeys: [item.option.key],
      })
    }
  }
  return { songs: Array.from(map.values()), failed }
}

/** 服务在跑时，界面要拿最新的配置（自动同步会往状态里写 autoSynced） */
export const getActiveConfig = (): LxxWearConfig | null => session?.config ?? null

/**
 * 只把配置记进运行中的会话，**不重建清单**。
 *
 * 界面勾了歌单、还没选歌时不能 apply（否则手表上会先冒出一个空歌单），
 * 但会话里的配置必须跟着走：之后任何「以 getActiveConfig() 为基线」的操作
 * （比如选完歌确认时把选择写进歌单状态）都会把这次勾选当成不存在，
 * 结果就是保存完歌单又变成没勾选，下一轮清单还会把它清掉。
 */
export const adoptConfig = (config: LxxWearConfig): void => {
  if (session) session.config = { ...session.config, ...config }
}

/**
 * 启动同步。
 * @param selection 手动同步时用户在弹窗里选中的歌曲 key。传了就把它记成这些歌单的新基线
 *                  （选中集合 + 当时的歌单快照），之后自动同步只补新加进来的歌。
 * @returns 实际生效的配置（带上了各歌单的同步状态）
 */
export const startSync = async (
  config: LxxWearConfig,
  selection?: string[]
): Promise<LxxWearConfig> => {
  if (!isLanServerAvailable()) throw new Error('当前安装包没有局域网服务，请重新安装')

  await stopSync()
  update({ ...emptyRuntime(), starting: true, quality: config.quality })

  try {
    // 一个歌单都没勾也是合法状态：下发空清单，手表那边会把本地曲库全部删掉
    const options = resolvePlaylists(config.playlistIds)
    // 勾了歌单却一个都解析不出来：可能列表还没加载完，也可能歌单已被删。
    // 这种情况不能当成「清空」，否则一启动就把手表洗了
    if (config.playlistIds.length > 0 && options.length === 0) {
      throw new Error('选中的歌单还没准备好，稍后再试')
    }
    const playlistName = playlistLabel(options)

    update({ playlistName })
    const { collected, failed } = await collectSongs(options)
    // 有勾选的歌单没读出来：这一轮不能继续。手表是「按清单删除」的，
    // 少一个歌单就等于把它的歌全删掉，宁可不同步也不能误删。
    // （如果那个歌单确实已经被删了，取消勾选它再同步即可。）
    if (failed > 0) {
      throw new Error(`${failed} 个歌单没读出来，已取消本次同步（避免误删手表上的歌），稍后重试`)
    }
    lastRemoteBuildAt = Date.now()

    // 手动同步：把这次的选择写成基线
    let effective = config
    if (selection) {
      const picked = new Set(selection)
      let states = config
      for (const item of collected) {
        const all: string[] = []
        for (const song of item.songs) {
          if (!song?.id) continue
          const key = songKeyOf(song)
          if (!all.includes(key)) all.push(key)
        }
        states = updatePlaylistState(states, item.option.key, {
          synced: true,
          syncedAt: Date.now(),
          selected: all.filter(key => picked.has(key)),
          snapshot: all,
          autoSynced: [],
        })
      }
      effective = states
    }

    // 勾了歌单，但一个都还没选过歌：不能拿空清单把手表洗了
    if (options.length > 0 && !options.some(item => effective.playlists[item.key]?.synced)) {
      throw new Error('这些歌单还没选歌：点歌单名字选好要同步的歌曲')
    }

    const { records, playlists, added } = compose(collected, effective.quality, effective.playlists)
    effective = mergeAutoAdded(effective, added)

    const manifest = buildManifest(playlistName, effective.quality, records, playlists)
    const started = await startLanServer(manifest, {
      name: DEVICE_NAME,
      token: await getDeviceToken(),
      port: 8686,
    })

    session = {
      config: effective,
      records,
      options,
      byId: new Map(records.map(item => [item.wireId, item])),
      revision: manifest.revision,
      subscriptions: [],
      refreshTimer: null,
      refreshing: false,
    }
    // 新一轮同步：歌词预热记录重新算，别把上一轮的状态带过来
    preparedLyricRevisions.clear()
    applyManifest(manifest, records)
    update({
      running: true,
      starting: false,
      phase: 'running',
      skippedCount: 0,
      summary: '',
      finishedAt: 0,
      ip: started.ip ?? '',
      port: started.port,
      error: '',
    })

    session.subscriptions.push(
      onLanPrepare(wireId => enqueue(wireId)),
      onLanProgress(event => {
        // 并行准备时按所有在传歌的总字节算百分比，单首进度记在 transfers 里
        const prev = transfers.get(event.id)
        transfers.set(event.id, {
          done: event.done,
          total: event.total > 0 ? event.total : (prev?.total ?? 0),
        })
        // 这首歌挂在哪条通道上，就把传输进度写到那根条的后半段
        const slotIndex = slotBySong.get(event.id)
        const ratio = event.total > 0 ? Math.min(1, event.done / event.total) : 0
        const finished = event.total > 0 && event.done >= event.total
        // 通道可能已经被下一首抢走了，但传输是真的在推进，总分照记
        setScore(event.id, finished ? 1 : SCORE_DOWNLOAD_DONE + (1 - SCORE_DOWNLOAD_DONE) * ratio)
        if (slotIndex !== undefined) {
          patchSlot(slotIndex, { transfer: ratio, stage: finished ? 3 : 2 })
        }
        publishProgress()
      }),
      // 手表本地已有这首：不准备文件，列表里标成「已跳过」
      onLanSkip(wireId => {
        setScore(wireId, 1)
        update({
          skippedCount: runtime.skippedCount + 1,
          songs: runtime.songs.map(item =>
            item.id === wireId && item.state !== LAN_SONG_READY
              ? { ...item, state: LAN_SONG_SKIPPED }
              : item
          ),
        })
        publishProgress(true)
      }),
      // 手表这一轮收工：写摘要，没开自动同步就把服务停掉，不用再手动点停止
      onLanFinish(event => { void handleLanFinish(event) }),
      // 手机端调了这首歌的歌词（手动匹配 / 时间偏移）：清单里的歌词指纹跟着变，
      // 手表收到新 revision 后会补拉歌词。拖动对齐时短时间会触发几次，这里统一节流。
      { remove: onLyricAdjustChange(scheduleLyricRefresh) }
    )

    // 服务在跑就一直盯着歌单内容：曲目增删、勾选改动都会让 revision 变化，
    // 手表收到广播后自己把多出来的删掉、缺的补上（不需要用户再点一次「开始同步」）
    session.refreshTimer = setInterval(() => { void refreshManifest() }, PLAYLIST_WATCH_INTERVAL_MS)

    await saveConfig(effective)
    return effective
  } catch (e: any) {
    const message = e?.message ?? '同步启动失败'
    update({ starting: false, running: false, phase: 'idle', summary: '', error: message })
    await stopLanServer().catch(() => {})
    session = null
    throw new Error(message)
  }
}


/**
 * 手表那边这一轮同步结束（正常完成或用户取消）。
 * 摘要写进 runtime，然后决定是否把服务停掉：
 * 还有歌单开着自动同步就留着继续盯歌单变化，否则直接停，不用用户再手动点「停止同步」。
 */
const handleLanFinish = async (event: LanFinishEvent): Promise<void> => {
  const current = session
  if (!current) return

  const parts: string[] = []
  if (event.downloaded > 0) parts.push(`新传 ${event.downloaded} 首`)
  if (event.skipped > 0) parts.push(`手表已有 ${event.skipped} 首`)
  if (event.removed > 0) parts.push(`移除 ${event.removed} 首`)
  const head = event.cancelled ? '手表已取消同步' : '同步完成'
  let summary = parts.length > 0
    ? `${head}：${parts.join('，')}`
    : `${head}（没有需要传的歌）`
  if (!event.cancelled && event.total > 0) summary += ` · 手表共 ${event.total} 首`
  if (event.message) summary += ` · ${event.message}`

  // 开着自动同步的歌单还指望这个服务盯着歌单变化，不能停
  const keepRunning = hasAutoPlaylist(current.config)
  // 这一轮收工：6 根进度条回到初始状态（5 条通道清空、总进度归零）。
  // 歌曲列表和完成摘要留着，用户还能看到这轮同步了什么。
  resetSlots()
  resetScores()
  update({
    phase: 'done',
    summary: keepRunning ? `${summary} · 服务继续运行，歌单变化会自动同步` : summary,
    finishedAt: Date.now(),
    skippedCount: event.skipped,
    currentName: '',
    activeCount: 0,
    currentDone: 0,
    currentTotal: 0,
    overall: 0,
    workers: slots.map(item => ({ ...item })),
  })
  if (!keepRunning) await stopSync({ keepResult: true })
}

/**
 * 重试一首准备失败的歌：清掉原生那边的失败标记，再把它重新排进准备队列。
 * 只清标记不行——手表下次来要这首，服务端仍会直接回 failed，不会重新触发 prepare。
 */
export const retrySong = async (wireId: string): Promise<void> => {
  const current = session
  if (!current) throw new Error('同步服务没在运行，先点「开始同步」')
  if (!current.byId.has(wireId)) throw new Error('这首歌已经不在清单里了')
  await resetLanSong(wireId)
  clearScore(wireId)
  transfers.delete(wireId)
  update({
    songs: runtime.songs.map(item =>
      item.id === wireId
        ? { ...item, state: LAN_SONG_PENDING, error: undefined, size: -1 }
        : item
    ),
  })
  enqueue(wireId)
}

/**
 * 停止同步。
 * @param options.keepResult 保留歌曲列表、统计和完成摘要（同步自然结束时用），
 *   默认清空所有状态回到「未开始」。
 */
export const stopSync = async (options?: { keepResult?: boolean }): Promise<void> => {
  const current = session
  session = null
  pendingRefresh = false
  queue.length = 0
  queued.clear()
  transfers.clear()
  if (lyricRefreshTimer) {
    clearTimeout(lyricRefreshTimer)
    lyricRefreshTimer = null
  }
  if (current) {
    current.subscriptions.forEach(item => item?.remove())
    if (current.refreshTimer) clearInterval(current.refreshTimer)
  }
  await stopLanServer().catch(() => {})

  const patch: Partial<SyncRuntime> = {
    running: false,
    starting: false,
    currentName: '',
    activeCount: 0,
    currentDone: 0,
    currentTotal: 0,
    ip: '',
    port: 0,
  }
  if (options?.keepResult) {
    // 自然结束：曲目列表、已完成/已跳过的数量、摘要都留在界面上
    patch.phase = 'done'
  } else {
    patch.phase = 'idle'
    patch.songs = []
    patch.total = 0
    patch.readyCount = 0
    patch.skippedCount = 0
    patch.summary = ''
    patch.finishedAt = 0
    patch.playlistName = ''
    patch.overall = 0
    resetScores()
    resetSlots()
    patch.workers = slots.map(item => ({ ...item }))
  }
  update(patch)
}

/**
 * 音质换了：重算清单（id 里带着音质，换了音质等于换了一批歌），
 * 手表下次同步会重新把音频拉一遍。
 */
export const changeQuality = async (quality: LX.Quality): Promise<void> => {
  const current = session
  if (current) {
    // 正在准备单曲时先记账，等队列空下来再换（换音质等于换一批歌 id）
    if (busy()) {
      current.config = { ...current.config, quality }
      pendingRefresh = true
      await saveConfig(current.config)
      return
    }
    const built = await buildRecords(current.options, quality, current.config.playlists)
    // 有歌单没读出来就先不换：换音质会整份重建清单（reset），缺一个歌单等于把它删掉
    if (built.failed > 0) throw new Error('有歌单没读出来，稍后再切换音质')
    current.config = { ...current.config, quality }
    const manifest = buildManifest(
      current.options.map(item => item.name).join(' + '),
      quality,
      built.records,
      built.playlists
    )
    current.config = mergeAutoAdded(current.config, built.added)
    await setLanManifest(manifest, true)
    current.records = built.records
    current.byId = new Map(built.records.map(item => [item.wireId, item]))
    current.revision = manifest.revision
    applyManifest(manifest, built.records)
    await saveConfig(current.config)
    return
  }
  const config = await loadConfig()
  await saveConfig({ ...config, quality })
}

/**
 * 歌词调整 → 重算清单的节流：调节模式里对一次齐就写一次偏移，等用户手停下来再算，
 * 别每次都把整份歌单重新读一遍。
 */
const LYRIC_REFRESH_DELAY = 800
let lyricRefreshTimer: ReturnType<typeof setTimeout> | null = null

const scheduleLyricRefresh = () => {
  if (!session) return
  if (lyricRefreshTimer) clearTimeout(lyricRefreshTimer)
  lyricRefreshTimer = setTimeout(() => {
    lyricRefreshTimer = null
    void refreshManifest(true)
  }, LYRIC_REFRESH_DELAY)
}

/**
 * 重新按当前配置（勾选的歌单 + 音质）核对一遍清单，变了就下发给原生服务。
 * 定时器和界面上的勾选操作都走这里，手表收到新 revision 后自己增删文件。
 */
const refreshManifest = async (force = false): Promise<void> => {
  const current = session
  if (!current) return
  // 正在给某首歌准备文件时不动清单：清了状态会让排队中的歌 id 失效
  if (busy()) {
    if (force) pendingRefresh = true
    return
  }
  if (current.refreshing) {
    // 上一轮还在算，等它算完接着按最新的配置再来一遍
    if (force) pendingRefresh = true
    return
  }
  current.refreshing = true
  try {
    // 每次都重新解析：用户可能刚刚改了勾选
    const options = resolvePlaylists(current.config.playlistIds)
    // 一个都没勾时不在后台清空手表：清空只在用户点「开始同步」时执行，
    // 否则「取消 A、再勾上 B」的中间状态会把整库删掉重下一遍
    if (options.length === 0) return
    const hasRemote = options.some(item => item.source === 'wy')
    if (hasRemote && !force && Date.now() - lastRemoteBuildAt < REMOTE_PLAYLIST_WATCH_MS) return
    const records = await buildRecords(options, current.config.quality, current.config.playlists)
    if (hasRemote) lastRemoteBuildAt = Date.now()
    // 有歌单没读出来：这一轮清单不完整，下发了就会把那个歌单的歌从手表删掉。
    // 保留原清单，等下一轮读成功再说。
    if (records.failed > 0) return

    const playlistName = playlistLabel(options)
    const manifest = buildManifest(
      playlistName,
      current.config.quality,
      records.records,
      records.playlists
    )
    // 自动同步带进来的新歌记一笔（关自动同步时转成正式选中）
    current.config = mergeAutoAdded(current.config, records.added)
    if (manifest.revision === current.revision) {
      // 清单没变也要落一次状态，省得下次又算一遍
      await saveConfig(current.config)
      return
    }

    // reset=false：id 没变、文件还在的歌保持已就绪，手表不用重下
    await setLanManifest(manifest, false)
    current.options = options
    current.records = records.records
    current.byId = new Map(records.records.map(item => [item.wireId, item]))
    current.revision = manifest.revision
    applyManifest(manifest, records.records, true)
    // 上一次已报过完成，这轮又来新清单：回到「手表正在拉」的状态
    if (runtime.phase === 'done') {
      update({ phase: 'running', summary: '', finishedAt: 0 })
    }
    await saveConfig(current.config)
    void syncRuntimeFromNative()
  } catch {
    // 刷新失败就等下一轮，不影响正在跑的同步
  } finally {
    current.refreshing = false
    if (pendingRefresh) {
      pendingRefresh = false
      void refreshManifest(true)
    }
  }
}

/**
 * 界面改了勾选之后调用：服务在跑就立刻按新勾选重建清单，
 * 取消勾选的歌单在手表上会被删掉；服务没跑但有歌单开了自动同步就顺手拉起来。
 * @returns 是否已经把改动应用下去
 */
export const applyConfig = async (config: LxxWearConfig): Promise<boolean> => {
  if (session) {
    adoptConfig(config)
    await refreshManifest(true)
    return true
  }
  if (hasAutoPlaylist(config)) {
    await startSync(config)
    return true
  }
  return false
}

/** 供界面刷新一张真实状态（文件大小、成功率之类以原生为准） */
export const syncRuntimeFromNative = async (): Promise<void> => {
  if (!runtime.running) return
  try {
    const info = await getLanInfo()
    if (!info.running) {
      update({ running: false })
      return
    }
    const songs: SyncSongView[] = info.songs.map(item => ({
      id: item.id,
      name: item.name,
      state: item.state,
      size: item.size,
      error: item.error,
    }))
    update({
      songs,
      total: songs.length,
      readyCount: songs.filter(item => item.state === LAN_SONG_READY).length,
      skippedCount: songs.filter(item => item.state === LAN_SONG_SKIPPED).length,
      ip: info.ip ?? '',
      port: info.port,
    })
  } catch {
    // ignore
  }
}

/** App 启动时，只要有歌单开着自动同步，就在后台把服务拉起来 */
export const autoStart = async (): Promise<void> => {
  try {
    const config = await loadConfig()
    if (config.playlistIds.length === 0 || !hasAutoPlaylist(config)) return
    await startSync(config)
  } catch (e) {
    console.warn('[LXXWear] 自动同步启动失败', e)
  }
}
