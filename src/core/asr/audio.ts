/**
 * 给端侧转写准备一个**本地音频文件**。
 *
 * whisper.cpp 只认文件路径（内部 mmap 解码），所以在线歌曲必须先落盘。
 * 优先级：本地音乐 > 已下载的文件 > 现下到缓存目录。
 *
 * 下载缓存在 `<cache>/lyric-asr/` 下，**只保留当前这一首**：整曲 mp3 动辄 3~10MB，
 * 每首歌都留一份几天就能吃掉几百兆，而同一个文件重复识别的收益并不大。
 */
import { getMusicUrl } from '@/core/music'
import { getAudioStream, getVideoPages } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'
import downloadState from '@/store/download/state'
import {
  downloadFile,
  mkdir,
  readDir,
  stat,
  temporaryDirectoryPath,
  unlink,
} from '@/utils/fs'
import { getFileExtensionFromUrl } from '@/screens/Home/Views/Mylist/MusicList/download/utils'

const CACHE_DIR = `${temporaryDirectoryPath}/lyric-asr`

/**
 * 拉直链必须带的头，和 `core/lxxwear/sync.ts` 里的那份保持一致：
 * B 站 CDN 按 UA + Referer 一起判盗链，网易云直链不带 Referer 也容易被风控。
 * （没有直接 import 是因为那边是模块私有常量，改这里时记得同步。）
 */
const DOWNLOAD_HEADERS: Partial<Record<string, Record<string, string>>> = {
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

const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
}

/**
 * 下载用的请求头。
 *
 * B 站额外带上登录 Cookie：取直链用的就是这份 Cookie，如果下载时不带，
 * CDN 会认为 UA 与 Cookie 不匹配，偶发 403（尤其是番剧/会员清晰度的节点）。
 */
const headersOf = (source: string): Record<string, string> => {
  const base = DOWNLOAD_HEADERS[source] ?? DEFAULT_HEADERS
  if (source !== 'bili') return base
  const cookie = getBiliCookie()
  return cookie ? { ...base, Cookie: cookie } : base
}

export interface AudioSource {
  path: string
  /** 我们自己下的临时文件（本地音乐 / 已下载的是 false） */
  temporary: boolean
  size: number
}

const sizeOf = async (path: string): Promise<number> => {
  try {
    return Number((await stat(path)).size) || 0
  } catch {
    return 0
  }
}

const safeName = (id: string) => String(id).replace(/[^\w.-]/g, '_').slice(0, 80)

/**
 * 拿这次要下载的候选地址（已按优先级排好）。
 *
 * B 站单独走 `getAudioStream`，不走通用 `getMusicUrl`：那边只回一个地址，
 * 而自动识别最需要的恰恰是「码率最高那条 + 多个备用 CDN」——
 * 64Kbps 的音频拿来跑 ASR，错字会明显变多；单个 CDN 403 时也没得退。
 */
const resolveUrls = async (musicInfo: LX.Music.MusicInfo): Promise<string[]> => {
  if (musicInfo.source !== 'bili') {
    const url = await getMusicUrl({ musicInfo, isRefresh: true })
    return url ? [url] : []
  }

  const meta = musicInfo.meta as { bvid?: string; cid?: number }
  const bvid = meta.bvid
  if (!bvid) throw new Error('这条 B 站曲目缺少 bvid')
  let cid = meta.cid
  if (!cid) {
    // 和 `core/music/bili.ts` 一致：cid 未预取时懒加载第一个分 P
    const pages = await getVideoPages(bvid, getBiliCookie())
    if (!pages.length) throw new Error('该视频没有可播放的分 P')
    cid = pages[0].cid
    meta.cid = cid
  }
  const stream = await getAudioStream(bvid, cid, getBiliCookie())
  return [stream.url, ...stream.backups]
}

/** 只留当前这一首：下载前把目录里别的东西清掉 */
const clearCacheDir = async (keep?: string) => {
  try {
    const entries = await readDir(CACHE_DIR)
    for (const entry of entries) {
      const full = entry.path || `${CACHE_DIR}/${entry.name}`
      if (full === keep) continue
      await unlink(full).catch(() => {})
    }
  } catch {
    // 目录还不存在，第一次下载时再建
  }
}

/** 单条地址下一次，失败返回原因而不是直接抛，好让调用方换下一条 */
const tryDownload = async (
  url: string,
  target: string,
  source: string,
  onProgress?: (ratio: number) => void
): Promise<{ ok: true; size: number } | { ok: false; reason: string }> => {
  try {
    const job = downloadFile(url, target, {
      headers: headersOf(source),
      progress: (res) => {
        if (res.contentLength > 0) onProgress?.(Math.min(1, res.bytesWritten / res.contentLength))
      },
    })
    const result = await job.promise
    if (result.statusCode && result.statusCode !== 200) {
      await unlink(target).catch(() => {})
      return { ok: false, reason: `HTTP ${result.statusCode}` }
    }
    const size = await sizeOf(target)
    if (size <= 0) {
      await unlink(target).catch(() => {})
      return { ok: false, reason: '下载到的音频是空的' }
    }
    return { ok: true, size }
  } catch (err) {
    await unlink(target).catch(() => {})
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * 解析出可用的本地音频。
 *
 * @param onProgress 只有走「现下」这条路才会回调，参数是 0~1
 */
export const resolveAudio = async (
  musicInfo: LX.Music.MusicInfo,
  onProgress?: (progress: { ratio: number; note?: string }) => void
): Promise<AudioSource> => {
  // 1. 本地音乐：直接读用户选的文件
  if (musicInfo.source === 'local') {
    const filePath = (musicInfo.meta as { filePath?: string }).filePath
    if (filePath && (await sizeOf(filePath)) > 0) {
      onProgress?.({ ratio: 1 })
      return { path: filePath, temporary: false, size: await sizeOf(filePath) }
    }
  }

  // 2. 已经下载过的：歌单里下过的曲目不用再下一遍
  const downloaded = downloadState.tasks.find(
    (item) =>
      String(item.musicInfo.id) === String(musicInfo.id) &&
      item.status === 'completed' &&
      !!item.filePath
  )
  if (downloaded?.filePath) {
    const size = await sizeOf(downloaded.filePath)
    if (size > 0) {
      onProgress?.({ ratio: 1 })
      return { path: downloaded.filePath, temporary: false, size }
    }
  }

  // 3. 现下
  const urls = await resolveUrls(musicInfo)
  if (!urls.length) throw new Error('拿不到播放地址')

  await mkdir(CACHE_DIR).catch(() => {})
  const ext = getFileExtensionFromUrl(urls[0]) || 'mp3'
  const target = `${CACHE_DIR}/${safeName(musicInfo.id)}.${ext}`
  await clearCacheDir(target)

  const cached = await sizeOf(target)
  if (cached > 0) {
    onProgress?.({ ratio: 1 })
    return { path: target, temporary: true, size: cached }
  }

  // B 站直链约 2 分钟失效，主地址 403 时备用地址往往一起过期；
  // 因此每条地址失败后重新取一次直链再试，最多两轮。
  let lastReason = ''
  for (let round = 0; round < 2; round++) {
    const candidates = round === 0 ? urls : await resolveUrls(musicInfo).catch(() => [])
    for (let i = 0; i < candidates.length; i++) {
      if (round > 0 || i > 0) onProgress?.({ ratio: 0, note: '换个线路重试' })
      const result = await tryDownload(
        candidates[i],
        target,
        musicInfo.source,
        (ratio) => onProgress?.({ ratio })
      )
      if (result.ok) {
        onProgress?.({ ratio: 1 })
        return { path: target, temporary: true, size: result.size }
      }
      lastReason = result.reason
    }
    if (!candidates.length) break
  }

  throw new Error(`音频下载失败${lastReason ? `（${lastReason}）` : ''}`)
}

/** 释放临时文件。本地音乐与已下载的文件不能被删，靠 `temporary` 区分 */
export const releaseAudio = async (source: AudioSource | null) => {
  if (!source?.temporary) return
  await unlink(source.path).catch(() => {})
}
