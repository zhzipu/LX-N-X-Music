import { useEffect, useState } from 'react'
import Lyric, { type Lines } from 'lrc-file-parser'
// import { getStore, subscribe } from '@/store'
import { updateLyric as updateWidgetLyric } from '@/utils/nativeModules/musicWidget'
export type Line = Lines[number]
type PlayHook = (line: number, text: string) => void
type SetLyricHook = (lines: Lines) => void

/** 解析器自带的默认偏移（毫秒）：让歌词行比实际播放时刻提前 100ms 切换 */
const BASE_OFFSET = 100

const lrcTools = {
  isInited: false,
  lrc: null as Lyric | null,
  currentLineData: { line: 0, text: '' },
  currentLines: [] as Lines,
  playHooks: [] as PlayHook[],
  setLyricHooks: [] as SetLyricHook[],
  isPlay: false,
  isShowTranslation: false,
  isShowRoma: false,
  lyricText: '',
  translationText: '' as string | null | undefined,
  romaText: '' as string | null | undefined,
  /** 用户设置的歌词时间偏移（毫秒，正数=歌词延后） */
  offsetMs: 0,
  /** 歌词倍速：只缩放歌词时间轴，不影响音频 */
  speed: 1,
  /** 音频播放速率（设置里的倍速播放） */
  audioRate: 1,
  /** 上次写给解析器的速率，相同时不重复设置 */
  appliedRate: 1,
  init() {
    if (this.isInited) return
    this.isInited = true
    this.lrc = new Lyric({
      onPlay: this.onPlay.bind(this),
      onSetLyric: this.onSetLyric.bind(this),
      // 偏移与倍速都在 play() 里换算进位置，解析器自身不再带偏移
      offset: 0,
    })
  },
  /**
   * 把「音频速率 × 歌词倍速」落到解析器上。
   *
   * 解析器内部按 wall clock 推进：`已播墙钟 * 速率`，而音频位置按音频速率增长，
   * 所以要让歌词跟着音频走、再叠加歌词倍速，速率得取 audioRate * speed。
   *
   * setPlaybackRate 在播放中会用它自己的时钟重放一次（相位会偏），这里临时把 isPlay
   * 置 false，只让它改速率；随后 play() 会按真实播放位置重新起播。
   */
  applyRate() {
    const lrc = this.lrc
    if (!lrc) return
    const rate = this.audioRate * this.speed
    if (Math.abs(rate - this.appliedRate) < 1e-6) return
    this.appliedRate = rate
    const wasPlaying = lrc.isPlay
    lrc.isPlay = false
    lrc.setPlaybackRate(rate)
    lrc.isPlay = wasPlaying
  },
  onPlay(line: number, text: string) {
    this.currentLineData.line = line
    // console.log(line)
    this.currentLineData.text = text
    for (const hook of this.playHooks) hook(line, text)
    // 推送当前歌词行到桌面小组件，触发向上滚动动画
    void updateWidgetLyric(text).catch(() => {})
  },
  onSetLyric(lines: Lines) {
    this.currentLines = lines
    this.currentLineData.line = 0
    this.currentLineData.text = ''
    for (const hook of this.playHooks) hook(-1, '')
    for (const hook of this.setLyricHooks) hook(lines)
    // 歌词重置（切歌或清空）时，同步清空桌面小组件歌词区
    void updateWidgetLyric('').catch(() => {})
  },
  addPlayHook(hook: PlayHook) {
    this.playHooks.push(hook)
    hook(this.currentLineData.line, this.currentLineData.text)
  },
  removePlayHook(hook: PlayHook) {
    this.playHooks.splice(this.playHooks.indexOf(hook), 1)
  },
  addSetLyricHook(hook: SetLyricHook) {
    this.setLyricHooks.push(hook)
    hook(this.currentLines)
  },
  removeSetLyricHook(hook: SetLyricHook) {
    this.setLyricHooks.splice(this.setLyricHooks.indexOf(hook), 1)
  },
  setLyric() {
    const extendedLyrics = [] as string[]
    if (this.isShowTranslation && this.translationText) extendedLyrics.push(this.translationText)
    if (this.isShowRoma && this.romaText) extendedLyrics.push(this.romaText)
    this.lrc!.setLyric(this.lyricText, extendedLyrics)
  },
}

export const init = async () => {
  lrcTools.init()
}

export const setLyric = (lyric: string, translation?: string, romalrc?: string) => {
  lrcTools.isPlay = false
  lrcTools.lyricText = lyric
  lrcTools.translationText = translation
  lrcTools.romaText = romalrc
  lrcTools.setLyric()
}
export const setPlaybackRate = (playbackRate: number) => {
  lrcTools.audioRate = playbackRate
  lrcTools.applyRate()
}
/**
 * 设置歌词时间偏移（毫秒，正数表示歌词延后显示）。
 * 偏移在 play() 里和倍速一起换算进位置，改完需要重新 play 一次才生效
 * （见 core/lyric 的 refreshLyricOffset）。
 */
export const setOffset = (offsetMs: number) => {
  lrcTools.offsetMs = offsetMs
}
/**
 * 设置歌词倍速（1 = 原速，只影响歌词时间轴，不影响音频）。
 * 倍速同时决定解析器的推进速率，改完同样要重新 play 一次。
 */
export const setLyricSpeed = (speed: number) => {
  lrcTools.speed = speed
  lrcTools.applyRate()
}
export const toggleTranslation = (isShow: boolean) => {
  lrcTools.isShowTranslation = isShow
  if (!lrcTools.lyricText) return
  lrcTools.setLyric()
}
export const toggleRoma = (isShow: boolean) => {
  lrcTools.isShowRoma = isShow
  if (!lrcTools.lyricText) return
  lrcTools.setLyric()
}
export const play = (time: number) => {
  // console.log(time)
  lrcTools.isPlay = true
  if (!lrcTools.lrc) return
  lrcTools.applyRate()
  // 倍速把「播放位置」换算成「歌词时间」：位置 * 倍速 + 提前量 - 偏移。
  // 换算放在这里而不是改歌词文本，切换倍速时歌词列表不用重建、滚动位置不会被打断。
  lrcTools.lrc.play(time * lrcTools.speed + BASE_OFFSET - lrcTools.offsetMs)
}
export const pause = () => {
  // console.log('pause')
  lrcTools.isPlay = false
  lrcTools.lrc!.pause()
}

// on lyric play hook
export const useLrcPlay = (autoUpdate = true) => {
  const [lrcInfo, setLrcInfo] = useState(lrcTools.currentLineData)
  useEffect(() => {
    if (!autoUpdate) return
    const setLrcCallback: SetLyricHook = () => {
      setLrcInfo({ line: 0, text: '' })
    }
    const playCallback: PlayHook = (line, text) => {
      setLrcInfo({ line, text })
    }
    lrcTools.addSetLyricHook(setLrcCallback)
    lrcTools.addPlayHook(playCallback)
    setLrcInfo(lrcTools.currentLineData)
    return () => {
      lrcTools.removeSetLyricHook(setLrcCallback)
      lrcTools.removePlayHook(playCallback)
    }
  }, [autoUpdate])

  return lrcInfo
}

// on lyric set hook
export const useLrcSet = () => {
  const [lines, setLines] = useState<Lines>(lrcTools.currentLines)
  useEffect(() => {
    const callback = (lines: Lines) => {
      setLines(lines)
    }
    lrcTools.addSetLyricHook(callback)
    return () => {
      lrcTools.removeSetLyricHook(callback)
    }
  }, [])

  return lines
}
