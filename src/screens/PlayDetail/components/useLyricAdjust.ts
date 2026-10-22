import { useCallback, useEffect, useRef, useState } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { BackHandler } from 'react-native'
import type { Lines } from 'lrc-file-parser'

import { refreshLyricOffset, setLyricOffsetByAnchor } from '@/core/lyric'
import {
  MAX_LYRIC_SPEED,
  MIN_LYRIC_SPEED,
  getLyricOffset,
  getLyricSpeed,
  normalizeLyricSpeed,
  setLyricOffset,
  setLyricSpeed,
} from '@/core/lyricAdjust'
import playerState from '@/store/player/state'
import { toast } from '@/utils/tools'

/** 时间轴（那条横线）在可视区里的位置，与 handleScrollToActive 的 viewPosition 保持一致 */
export const LYRIC_ANCHOR_RATIO = 0.42
/** 松手到按松手位置对齐的间隔：惯性已在列表层关掉，这里只留一帧余量 */
const DRAG_SETTLE_DELAY = 30
/**
 * 对齐后这一小段时间内不许自动跟随接管滚动。
 *
 * 偏移一改，解析器的当前行会一次跨好几行（用户可能拖了十几行才对齐）。而列表本来就停在
 * 用户放好的位置上，此时若再让自动跟随「滚动到新行」，FlatList 只能用平均行高估算目标位置，
 * 估偏了就会滚到别处——表现出来就是「对齐好的歌词又跳回去了」。
 *
 * 标记是一次性的（由歌词组件在换行时消费掉），这里只是兜底：万一偏移落下去之后行号没变
 * （对齐结果恰好仍是当前行），标记不能一直挂着，否则会误吞下一次正常换行。
 */
const FOLLOW_QUIET_AFTER_APPLY = 600

type ScrollInfo = NativeSyntheticEvent<NativeScrollEvent>['nativeEvent']
interface LayoutInfo {
  spaceHeight: number
  lineHeights: number[]
}

export interface LyricAdjustOptions {
  getLyricLines: () => Lines
  getScrollInfo: () => ScrollInfo | null
  getLayoutInfo: () => LayoutInfo
  /** 恢复自动跟随：清掉暂停滚动的状态与定时器 */
  resumeFollow: () => void
}

/** 锚点（时间轴横线）上对应的歌词行，以及按行高插值出来的精确时间 */
interface AnchorResult {
  index: number
  time: number | null
}
const EMPTY_ANCHOR: AnchorResult = { index: -1, time: null }

/**
 * 解析时间轴横线上落在哪一行、以及这一行内部的具体时间点。
 *
 * 只按整行算的话，一次拖动最少也要跳一行（通常 2~5 秒），根本没法对到 0.1 秒；
 * 这里拿横线在本行内的高度比例，在「本行时间 → 下一行时间」之间做线性插值，
 * 于是拖动就是连续的，再按 100ms 吸附。
 */
const resolveAnchor = (
  scrollInfo: ScrollInfo | null,
  layoutInfo: LayoutInfo,
  lines: Lines
): AnchorResult => {
  const heights = layoutInfo.lineHeights
  if (!scrollInfo || !heights.length || !lines.length) return EMPTY_ANCHOR
  const anchor =
    scrollInfo.contentOffset.y + scrollInfo.layoutMeasurement.height * LYRIC_ANCHOR_RATIO
  let top = layoutInfo.spaceHeight
  for (let i = 0; i < heights.length; i += 1) {
    const height = heights[i] ?? 0
    const lineTop = top
    top += height
    if (top >= anchor) {
      const line = lines[i]
      if (!line) return EMPTY_ANCHOR
      const start = line.time
      const next = lines[i + 1]?.time
      if (!height || next == null || next <= start) return { index: i, time: start }
      const ratio = Math.max(0, Math.min(1, (anchor - lineTop) / height))
      return { index: i, time: start + (next - start) * ratio }
    }
  }
  const last = heights.length - 1
  return { index: last, time: lines[last]?.time ?? null }
}

/**
 * 「调节歌词」模式：歌词照常跟着播放滚，用户拖动后按松手位置重新对齐时间，
 * 偏移实时生效并落盘，不重建歌词列表（重建会让列表跳回顶部）。
 */
export const useLyricAdjust = (options: LyricAdjustOptions) => {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const [isAdjusting, setIsAdjusting] = useState(false)
  const [offset, setOffset] = useState(0)
  /** 歌词倍速（1 = 原速），只缩放歌词时间轴，不动音频 */
  const [speed, setSpeed] = useState(1)
  /** 时间轴横线上当前压着的那一行，用于加深该行颜色；-1 表示还没算出来 */
  const [anchorLine, setAnchorLine] = useState(-1)
  const anchorLineRef = useRef(-1)
  const isAdjustingRef = useRef(false)
  const offsetRef = useRef(0)
  const speedRef = useRef(1)
  /** 进入调节模式时的偏移 / 倍速，「取消」要用它们回滚 */
  const originOffsetRef = useRef(0)
  const originSpeedRef = useRef(1)
  /** 本次拖动是否已经算过对齐：同一个位置只算一次，否则松手事件重复触发会把偏移叠两次 */
  const appliedRef = useRef(false)
  /** 对齐刚完成：下一次行号变化是偏移造成的，不能让自动跟随去滚 */
  const skipFollowRef = useRef(false)
  const skipFollowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearDragTimer = () => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current)
      dragTimerRef.current = null
    }
  }
  const clearSkipFollow = () => {
    skipFollowRef.current = false
    if (skipFollowTimerRef.current) {
      clearTimeout(skipFollowTimerRef.current)
      skipFollowTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearDragTimer()
      clearSkipFollow()
    }
  }, [])

  /**
   * 标记「接下来这一次行号变化是程序改出来的」：歌词组件在换行时会跳过自动跟随滚动。
   * 兜底定时器负责清掉，避免标记一直挂着吞掉下一次正常换行。
   */
  const markSkipFollow = useCallback(() => {
    clearSkipFollow()
    skipFollowRef.current = true
    skipFollowTimerRef.current = setTimeout(clearSkipFollow, FOLLOW_QUIET_AFTER_APPLY)
  }, [])

  const applyAnchorLine = useCallback((index: number) => {
    if (anchorLineRef.current === index) return
    anchorLineRef.current = index
    setAnchorLine(index)
  }, [])

  /** 拖动 / 跟随滚动时刷新「压在时间轴上的是哪一行」，只在换行时才触发重渲染 */
  const updateAnchor = useCallback(() => {
    if (!isAdjustingRef.current) return
    const { getScrollInfo, getLayoutInfo, getLyricLines } = optionsRef.current
    applyAnchorLine(resolveAnchor(getScrollInfo(), getLayoutInfo(), getLyricLines()).index)
  }, [applyAnchorLine])

  /**
   * 歌词组件在换行时调用：返回 true 表示这次换行是「对齐造成的」，列表已经在正确位置，
   * 不要做自动跟随滚动。标记只消费一次。
   */
  const consumeSkipFollow = useCallback(() => {
    if (!skipFollowRef.current) return false
    clearSkipFollow()
    return true
  }, [])

  /**
   * 把松手位置上的那个时间点当作「此刻该唱的时间」，反推出新的偏移。
   *
   * 偏移按播放器真实位置反解（setLyricOffsetByAnchor），不依赖「当前行起始时间」。
   * 反解完再恢复自动跟随：那之前 line 还是旧值，播放一推进就会把列表拉回旧位置。
   * 恢复跟随的同时还要跳过一次跟随滚动，见 FOLLOW_QUIET_AFTER_APPLY。
   */
  const applyAnchor = useCallback(() => {
    const id = playerState.musicInfo.id
    if (!id || !isAdjustingRef.current) return
    // 同一次拖动只算一次，否则松手事件重复触发会把偏移叠两次
    if (appliedRef.current) return
    appliedRef.current = true
    const { getLyricLines, getScrollInfo, getLayoutInfo, resumeFollow } = optionsRef.current
    const lines = getLyricLines()
    const anchor = resolveAnchor(getScrollInfo(), getLayoutInfo(), lines)
    if (!lines.length || anchor.time == null) {
      // 算不出锚点（空歌词 / 最后一行的末尾）时也要让刚改的偏移生效，否则拖着不动
      refreshLyricOffset(() => {
        if (isAdjustingRef.current) resumeFollow()
      })
      return
    }
    // 偏移按播放器的真实位置反推（见 core/lyric 的 setLyricOffsetByAnchor），
    // 不用「当前行起始时间」近似——行中间对齐时那会差出一整行
    setLyricOffsetByAnchor(anchor.time, (next) => {
      if (!isAdjustingRef.current) return
      offsetRef.current = next
      setOffset(next)
      // 新偏移已经落到解析器上，当前行换成了锚点行；列表本来就在用户放好的位置，
      // 这一次行号跳变不能让它再滚一次
      markSkipFollow()
      resumeFollow()
    })
  }, [markSkipFollow])

  const start = useCallback(() => {
    const id = playerState.musicInfo.id
    if (!id) {
      toast('当前没有正在播放的歌曲')
      return
    }
    if (!optionsRef.current.getLyricLines().length) {
      toast('当前歌曲没有歌词，请先匹配歌词')
      return
    }
    const current = getLyricOffset(id)
    const currentSpeed = getLyricSpeed(id)
    offsetRef.current = current
    originOffsetRef.current = current
    speedRef.current = currentSpeed
    originSpeedRef.current = currentSpeed
    setOffset(current)
    setSpeed(currentSpeed)
    appliedRef.current = false
    clearSkipFollow()
    isAdjustingRef.current = true
    setIsAdjusting(true)
    optionsRef.current.resumeFollow()
    anchorLineRef.current = -1
    updateAnchor()
  }, [updateAnchor])

  const stop = useCallback(() => {
    clearDragTimer()
    clearSkipFollow()
    appliedRef.current = false
    isAdjustingRef.current = false
    setIsAdjusting(false)
    anchorLineRef.current = -1
    setAnchorLine(-1)
    optionsRef.current.resumeFollow()
  }, [])

  /** 重置：回到没有偏移、原速的状态，仍留在调节模式里；此时应该跟着滚回默认对齐的位置 */
  const reset = useCallback(() => {
    const id = playerState.musicInfo.id
    if (!id) return
    offsetRef.current = 0
    speedRef.current = 1
    setOffset(0)
    setSpeed(1)
    setLyricOffset(id, 0)
    setLyricSpeed(id, 1)
    appliedRef.current = false
    clearSkipFollow()
    // 和 applyAnchor 同理：偏移归零也要等解析器重算完再恢复跟随，否则会先滚回旧行再滚回来
    refreshLyricOffset(() => {
      if (isAdjustingRef.current) optionsRef.current.resumeFollow()
    })
  }, [])

  /**
   * 调歌词倍速：只缩放歌词时间轴，音频不受影响。
   *
   * 倍速会把整条时间轴按 `歌词时间 = 播放位置 × 倍速 + 常量` 重排，之前对齐好的偏移
   * 会跟着漂，所以改完立刻按「时间轴横线上压着的那一句」重新对齐一次，
   * 让用户已经对好的那句继续停在当前播放位置上，后面的行按新倍速走。
   */
  const changeSpeed = useCallback((delta: number) => {
    const id = playerState.musicInfo.id
    if (!id || !isAdjustingRef.current) return
    const current = speedRef.current
    const next = normalizeLyricSpeed(current + delta)
    if (next === current) {
      toast(
        delta > 0
          ? `歌词倍速最大 ${MAX_LYRIC_SPEED.toFixed(1)}x`
          : `歌词倍速最小 ${MIN_LYRIC_SPEED.toFixed(1)}x`
      )
      return
    }
    speedRef.current = next
    setSpeed(next)
    setLyricSpeed(id, next)
    // 同一次调节里可以反复点点 +/−，每次都要按当前横线位置重算偏移
    appliedRef.current = false
    applyAnchor()
  }, [applyAnchor])

  /**
   * 取消：本次调节的所有改动都不保留，偏移与倍速回滚到进入模式时的值并退出。
   *
   * 拖动过程中偏移是实时落盘的（否则听感对不上），所以这里必须把原值写回去；
   * 回滚完再退出，歌词会跟着滚回原来的对齐位置。
   */
  const cancel = useCallback(() => {
    clearDragTimer()
    appliedRef.current = false
    const origin = originOffsetRef.current
    const originSpeed = originSpeedRef.current
    const id = playerState.musicInfo.id
    const speedChanged = speedRef.current !== originSpeed
    if (speedChanged) {
      speedRef.current = originSpeed
      setSpeed(originSpeed)
      if (id) setLyricSpeed(id, originSpeed)
    }
    if (offsetRef.current !== origin || speedChanged) {
      offsetRef.current = origin
      setOffset(origin)
      if (id) {
        setLyricOffset(id, origin)
        refreshLyricOffset()
      }
    }
    stop()
  }, [stop])

  /**
   * 调节模式里按系统返回键 = 点「取消」：丢弃本次改动并退出调节模式，而不是把播放页关掉。
   * 返回 true 拦掉默认的返回行为。
   */
  useEffect(() => {
    if (!isAdjusting) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      cancel()
      return true
    })
    return () => subscription.remove()
  }, [isAdjusting, cancel])

  const handleDragBegin = useCallback(() => {
    appliedRef.current = false
    clearDragTimer()
  }, [])

  const handleDragEnd = useCallback(() => {
    if (!isAdjustingRef.current) return
    clearDragTimer()
    dragTimerRef.current = setTimeout(() => {
      dragTimerRef.current = null
      applyAnchor()
    }, DRAG_SETTLE_DELAY)
  }, [applyAnchor])

  return {
    isAdjusting,
    offset,
    /** 歌词倍速（1 = 原速） */
    speed,
    /** 时间轴横线上压着的行号（调节模式下用它替代播放行做高亮） */
    anchorLine,
    start,
    stop,
    cancel,
    reset,
    changeSpeed,
    updateAnchor,
    /** 对齐刚完成时，歌词组件用它在换行时跳过自动跟随 */
    consumeSkipFollow,
    handleDragBegin,
    handleDragEnd,
  }
}
