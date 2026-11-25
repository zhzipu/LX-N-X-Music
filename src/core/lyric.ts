import {
  play as lrcPlay,
  setLyric as lrcSetLyric,
  setOffset as lrcSetOffset,
  setLyricSpeed as lrcSetLyricSpeed,
  pause as lrcPause,
  setPlaybackRate as lrcSetPlaybackRate,
  toggleTranslation as lrcToggleTranslation,
  toggleRoma as lrcToggleRoma,
  init as lrcInit,
} from '@/plugins/lyric'
import {
  playDesktopLyric,
  setDesktopLyric,
  pauseDesktopLyric,
  setDesktopLyricPlaybackRate,
  toggleDesktopLyricTranslation,
  toggleDesktopLyricRoma,
} from '@/core/desktopLyric'
import { getPosition } from '@/plugins/player'
import playerState from '@/store/player/state'
import {
  bakeLyricTime,
  getLyricOffset,
  getLyricOffsetLimit,
  initLyricAdjust,
  resolveLyric,
  setLyricOffset,
} from '@/core/lyricAdjust'
// import settingState from '@/store/setting/state'

/** 解析器自带的提前量（与 plugins/lyric.ts 的 BASE_OFFSET 一致），算偏移时要带上 */
const LRC_BASE_OFFSET = 100
/** 偏移精度：0.1s */
const OFFSET_STEP = 100

/** 当前歌曲时长（毫秒），拿不到就返回 0 由调用方兜底 */
const getDurationMs = (): number => {
  // 本地曲目没有 interval，只有在线音源带「mm:ss」格式的时长
  const interval = (playerState.musicInfo as { interval?: string | null }).interval
  if (!interval) return 0
  const parts = interval.split(':')
  if (parts.length < 2) return 0
  const minute = Number(parts[0])
  const second = Number(parts[1])
  if (!Number.isFinite(minute) || !Number.isFinite(second)) return 0
  return (minute * 60 + second) * 1000
}

/**
 * init lyric
 */
export const init = async () => {
  return lrcInit()
}

/**
 * 上一次真正塞进解析器的那份歌词（内容 + 偏移 + 倍速）。
 *
 * 同一份歌词会被反复触发设置：识别完成既会广播 lyricUpdated、又会显式重建一次；
 * 切歌时本地已有的歌词会先装一遍、音源歌词请求回来还会再触发一遍。每次都重建列表
 * 会让歌词闪一下、滚动位置回到开头，所以内容没变就直接跳过。
 */
let lastAppliedLyric = ''

const buildLyricKey = (lyric: string, tlrc: string, rlrc: string, offsetMs: number, speed: number) =>
  `${speed}|${offsetMs}|${lyric}\u0001${tlrc}\u0001${rlrc}`

/**
 * set lyric
 * @param lyric lyric str
 * @param translation lyric translation
 * @param romalrc lyric roma
 * @param offsetMs 时间偏移（毫秒，正数=歌词延后）
 * @param speed 歌词倍速（1=原速，只影响歌词时间轴）
 */
const handleSetLyric = async (
  lyric: string,
  translation = '',
  romalrc = '',
  offsetMs = 0,
  speed = 1
) => {
  const key = buildLyricKey(lyric, translation, romalrc, offsetMs, speed)
  if (key === lastAppliedLyric) return
  // 解析器自己按「位置 × 倍速 + 提前量 - 偏移」找行，歌词文本保持原始时间轴；
  // 桌面歌词由原生自行解析，得把偏移与倍速改写进时间轴，否则两边会对不上
  lrcSetLyricSpeed(speed)
  lrcSetOffset(offsetMs)
  lrcSetLyric(lyric, translation, romalrc)
  await setDesktopLyric(
    bakeLyricTime(lyric, speed, offsetMs),
    bakeLyricTime(translation, speed, offsetMs),
    bakeLyricTime(romalrc, speed, offsetMs)
  )
  // 成功之后才记账：中途抛错时下次还得重来（否则「没换上」会被误判成「已换上」）
  lastAppliedLyric = key
}

/**
 * play lyric
 * @param time play time
 */
export const handlePlay = (time: number) => {
  lrcPlay(time)
  void playDesktopLyric(time)
}

/**
 * pause lyric
 */
export const pause = () => {
  lrcPause()
  void pauseDesktopLyric()
}

/**
 * stop lyric
 */
export const stop = () => {
  void handleSetLyric('')
}

/**
 * set playback rate
 * @param playbackRate playback rate
 */
export const setPlaybackRate = async (playbackRate: number) => {
  lrcSetPlaybackRate(playbackRate)
  await setDesktopLyricPlaybackRate(playbackRate)
  if (playerState.isPlay) {
    setTimeout(() => {
      void getPosition().then((position) => {
        handlePlay(position * 1000)
      })
    })
  }
}

/**
 * toggle show translation
 * @param isShowTranslation is show translation
 */
export const toggleTranslation = async (isShowTranslation: boolean) => {
  lrcToggleTranslation(isShowTranslation)
  await toggleDesktopLyricTranslation(isShowTranslation)
  if (playerState.isPlay) play()
}

/**
 * toggle show roma lyric
 * @param isShowLyricRoma is show roma lyric
 */
export const toggleRoma = async (isShowLyricRoma: boolean) => {
  lrcToggleRoma(isShowLyricRoma)
  await toggleDesktopLyricRoma(isShowLyricRoma)
  if (playerState.isPlay) play()
}

export const play = () => {
  void getPosition().then((position) => {
    handlePlay(position * 1000)
  })
}

export const setLyric = async () => {
  const musicInfo = playerState.musicInfo
  if (!musicInfo.id) return
  // 覆盖表（手动匹配 / 自动识别生成的歌词）优先级最高，必须确保它已经读出来：
  // 冷启动时它是异步读盘的，若此时还是空的，识别过的歌词就会被音源歌词盖掉。
  await initLyricAdjust()
  // 手动匹配的歌词优先于音源自带的歌词，偏移与倍速在这里一并交给解析器
  const { lyric, tlrc, rlrc, offset, speed } = resolveLyric(musicInfo)
  if (lyric) await handleSetLyric(lyric, tlrc, rlrc, offset, speed)

  if (playerState.isPlay) play()
}

/**
 * 把「已落盘的偏移 + 倍速 + 指定的播放位置」落到解析器上：只重设时间基准，不重新解析歌词，
 * 所以歌词列表不会重建、滚动位置不会被打断。
 */
const applyOffsetAt = (position: number) => {
  const musicInfo = playerState.musicInfo
  if (!musicInfo.id) return
  const { lyric, tlrc, rlrc, offset, speed } = resolveLyric(musicInfo)
  lrcSetLyricSpeed(speed)
  lrcSetOffset(offset)
  const time = position * 1000
  if (playerState.isPlay) {
    handlePlay(time)
  } else {
    // 暂停中：只把当前行对到新偏移上，不能让解析器按墙钟继续往前推进
    lrcPlay(time)
    lrcPause()
  }
  if (lyric) {
    // 桌面歌词由原生自行解析时间轴，偏移与倍速要直接改写进歌词文本
    void setDesktopLyric(
      bakeLyricTime(lyric, speed, offset),
      bakeLyricTime(tlrc, speed, offset),
      bakeLyricTime(rlrc, speed, offset)
    )
  }
}

/**
 * 「调节歌词」模式下实时刷新偏移：偏移本身需要调用方先落盘，这里只负责让它生效。
 *
 * 偏移不是立刻生效的——要先读回当前播放位置再 play，解析器才会按新偏移重算行号。
 * 所以这里提供一个「已经落到解析器上」的回调，调用方应等它触发后再恢复自动跟随。
 */
export const refreshLyricOffset = (onApplied?: () => void) => {
  if (!playerState.musicInfo.id) {
    onApplied?.()
    return
  }
  void getPosition()
    .then((position) => {
      applyOffsetAt(position)
    })
    .catch(() => {})
    .finally(() => {
      onApplied?.()
    })
}

/**
 * 按「时间轴横线上的那一刻」重设偏移：让 anchorTime 成为当前播放时刻该唱的时间。
 *
 * 位置由播放器实时读取，而不是用「当前行起始时间」近似——后者在行中间对齐时会差出
 * 最多一整行，于是对齐完当前行是下一行，列表一跟随即刻跳回去。
 * 解析器的歌词时间是 `播放位置 × 倍速 + 提前量 - 偏移`，所以反解就是：
 *   offset = 位置 × 倍速 + 提前量 - anchorTime
 * 倍速为 1 时与原来的公式完全一致。
 */
export const setLyricOffsetByAnchor = (anchorTime: number, onApplied?: (offset: number) => void) => {
  const musicInfo = playerState.musicInfo
  const id = musicInfo.id
  if (!id) {
    onApplied?.(0)
    return
  }
  const speed = resolveLyric(musicInfo).speed
  void getPosition()
    .then((position) => {
      const raw = position * 1000 * speed + LRC_BASE_OFFSET - anchorTime
      // 倍速不为 1 时偏移会很大（见 getLyricOffsetLimit），上限按倍速与时长放宽
      const limit = getLyricOffsetLimit(speed, getDurationMs())
      const next = Math.max(
        -limit,
        Math.min(limit, Math.round(raw / OFFSET_STEP) * OFFSET_STEP)
      )
      setLyricOffset(id, next)
      applyOffsetAt(position)
      onApplied?.(next)
    })
    .catch(() => {
      onApplied?.(getLyricOffset(id))
    })
}
