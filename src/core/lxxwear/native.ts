import { NativeModules, NativeEventEmitter, type EmitterSubscription } from 'react-native'

/**
 * 手机端局域网服务的原生桥（android/app/src/main/java/com/lxnx/music/lanserver）。
 * 原生只负责「把文件发出去」，歌单从哪来、文件怎么下载都放 JS 里做。
 */

export interface LanSong {
  id: string
  name: string
  artist: string
  album?: string
  duration?: number
  /** 落盘后缀，手表据此决定存成 .mp3 还是 .flac */
  ext?: string
  /**
   * 歌词版本指纹（手机端歌词调整后的内容 + 偏移）。
   * 手表本地已有的歌词若与它不一致，才会重新拉一次；空/缺省表示「不用管」。
   */
  lyricRevision?: string
}

/** 清单里的一个歌单分组：手表端左侧那页按这个分组列出歌单。 */
export interface LanPlaylistGroup {
  /** 手机端歌单的稳定标识（本地列表 id / 网易云歌单 id） */
  id: string
  name: string
  /** 该歌单的曲目 id，顺序就是歌单顺序 */
  songIds: string[]
}

export interface LanManifest {
  playlistId: string
  playlistName: string
  revision: string
  quality: string
  songs: LanSong[]
  /** 勾选的歌单及各自的曲目。同一首歌出现在多个歌单里会各记一份。 */
  playlists: LanPlaylistGroup[]
}

export interface LanStartOptions {
  name: string
  token: string
  port?: number
}

export interface LanStartResult {
  port: number
  ip: string | null
  name: string
}

export interface LanSongInfo {
  id: string
  name: string
  state: number
  size: number
  error?: string
}

export interface LanInfo {
  running: boolean
  port: number
  ip: string | null
  name: string
  revision: string
  quality: string
  playlistName: string
  songs: LanSongInfo[]
}

export const LAN_SONG_IDLE = 0
export const LAN_SONG_PENDING = 1
export const LAN_SONG_READY = 2
export const LAN_SONG_FAILED = 3
/** 手表端本地已有这首歌的文件，这一轮不需要手机准备 */
export const LAN_SONG_SKIPPED = 4

const module = NativeModules.LanServer as any

export const isLanServerAvailable = (): boolean => !!module

export const startLanServer = async (
  manifest: LanManifest,
  options: LanStartOptions
): Promise<LanStartResult> => {
  return module.start(JSON.stringify(manifest), JSON.stringify(options))
}

export const stopLanServer = async (): Promise<void> => {
  if (!module) return
  await module.stop()
}

export const setLanManifest = async (manifest: LanManifest, reset = true): Promise<void> => {
  await module.setManifest(JSON.stringify(manifest), reset)
}

export const markLanSongReady = async (
  id: string,
  audioPath: string,
  ext: string,
  size: number,
  lyric: string | null,
  coverPath: string | null
): Promise<void> => {
  await module.setReady(id, audioPath, ext, size, lyric ?? '', coverPath ?? '')
}

export const markLanSongFailed = async (id: string, message: string): Promise<void> => {
  await module.setFailed(id, message)
}

/**
 * 只更新某首歌的歌词，不动它的音频状态。
 * 手机端调过歌词之后用它把调整后的版本推给原生的缓存，手表来取时就是新的。
 */
export const markLanSongLyric = async (id: string, lyric: string | null): Promise<void> => {
  await module.setLyric(id, lyric ?? '')
}

/**
 * 把某首歌退回「未准备」：界面上点「重试」时先清掉原生那边的失败标记，
 * 否则手表再来要这首歌，服务端直接回 failed，根本不会重新触发 prepare。
 */
export const resetLanSong = async (id: string): Promise<void> => {
  await module.resetSong(id)
}

export const getLanInfo = async (): Promise<LanInfo> => module.getInfo()

let emitter: NativeEventEmitter | null = null
const getEmitter = (): NativeEventEmitter | null => {
  if (!module) return null
  if (!emitter) emitter = new NativeEventEmitter(module)
  return emitter
}

/** 手表请求某首歌时触发（原生抛上来的事件），参数 { id } */
export const onLanPrepare = (handler: (id: string) => void): EmitterSubscription | null => {
  return getEmitter()?.addListener('LXXWearPrepare', (event: { id: string }) => {
    if (event?.id) handler(event.id)
  }) ?? null
}

/** 音频传输进度，参数 { id, done, total } */
export const onLanProgress = (
  handler: (event: { id: string; done: number; total: number }) => void
): EmitterSubscription | null => {
  return getEmitter()?.addListener('LXXWearProgress', handler) ?? null
}

/** 手表说这一首它本地已经有了，参数 { id } */
export const onLanSkip = (handler: (id: string) => void): EmitterSubscription | null => {
  return getEmitter()?.addListener('LXXWearSkip', (event: { id: string }) => {
    if (event?.id) handler(event.id)
  }) ?? null
}

/** 手表一轮同步结束的统计 */
export interface LanFinishEvent {
  total: number
  downloaded: number
  skipped: number
  removed: number
  cancelled: boolean
  message: string
}

export const onLanFinish = (
  handler: (event: LanFinishEvent) => void
): EmitterSubscription | null => {
  return getEmitter()?.addListener('LXXWearFinish', handler) ?? null
}
