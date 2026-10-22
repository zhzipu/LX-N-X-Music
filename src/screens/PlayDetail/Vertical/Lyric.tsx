import { memo, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  View,
  FlatList,
  type FlatListProps,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent, TouchableOpacity,
  PanResponder,
} from 'react-native'
// import { useLayout } from '@/utils/hooks'
import { type Line, useLrcPlay, useLrcSet } from '@/plugins/lyric'
import { createStyle } from '@/utils/tools'
import { updateSetting } from '@/core/common'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { AnimatedColorText } from '@/components/common/Text'
import Text from '@/components/common/Text'
import { setSpText } from '@/utils/pixelRatio'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { scrollTo } from '@/utils/scroll'
import LyricMenu, { type LyricMenuType } from '../components/LyricMenu'
import LyricAdjustBar from '../components/LyricAdjustBar'
import { LYRIC_ANCHOR_RATIO, useLyricAdjust } from '../components/useLyricAdjust'
// import { screenkeepAwake } from '@/utils/nativeModules/utils'
// import { log } from '@/utils/log'
// import { toast } from '@/utils/tools'

type FlatListType = FlatListProps<Line>

// const useLock = () => {
//   const showCommentRef = useRef(false)

//   useEffect(() => {
//     let appstateListener = AppState.addEventListener('change', (state) => {
//       switch (state) {
//         case 'active':
//           if (showLyricRef.current && !showCommentRef.current) screenkeepAwake()
//           break
//         case 'background':
//           screenUnkeepAwake()
//           break
//       }
//     })
//     return () => {
//       appstateListener.remove()
//     }
//   }, [])
//   useEffect(() => {
//     let listener: ReturnType<typeof onNavigationComponentDidDisappearEvent>
//     showCommentRef.current = !!componentIds.comment
//     if (showCommentRef.current) {
//       if (showLyricRef.current) screenUnkeepAwake()
//       listener = onNavigationComponentDidDisappearEvent(componentIds.comment as string, () => {
//         if (showLyricRef.current && AppState.currentState == 'active') screenkeepAwake()
//       })
//     }

//     const rm = global.state_event.on('componentIdsUpdated', (ids) => {

//     })

//     return () => {
//       if (listener) listener.remove()
//     }
//   }, [])
// }

interface LineProps {
  line: Line
  lineNum: number
  activeLine: number
  onLayout: (lineNum: number, height: number, width: number) => void
  onPress: (index: number) => void;
  onLongPress: () => void;
}
const LrcLine = memo(
  ({ line, lineNum, activeLine, onLayout, onPress, onLongPress }: LineProps) => {
    const theme = useTheme()
    const lrcFontSize = useSettingValue('playDetail.vertical.style.lrcFontSize')
    const textAlign = useSettingValue('playDetail.style.align')
    const size = lrcFontSize / 10
    const lineHeight = setSpText(size) * 1.3

    const colors = useMemo(() => {
      const active = activeLine == lineNum
      return active
        ? ([theme.isDark ? theme['c-font'] : theme['c-primary-font-active'], theme['c-primary-alpha-200'], 1] as const)
        : ([theme['c-450'], theme['c-400'], 0.8] as const)
    }, [activeLine, lineNum, theme])

    const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
      onLayout(lineNum, nativeEvent.layout.height, nativeEvent.layout.width)
    }

    const handlePress = useCallback(() => {
      onPress(lineNum);
    }, [onPress, lineNum]);

    // textBreakStrategy="simple" 用于解决某些设备上字体被截断的问题
    // https://stackoverflow.com/a/72822360
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={handlePress} onLongPress={onLongPress}>
        <View style={styles.line} onLayout={handleLayout}>
          <AnimatedColorText
            style={{
              ...styles.lineText,
              textAlign,
              lineHeight,
            }}
            textBreakStrategy="simple"
            color={colors[0]}
            opacity={colors[2]}
            size={size}
          >
            {line.text}
          </AnimatedColorText>
          {line.extendedLyrics.map((lrc, index) => {
            return (
              <AnimatedColorText
                style={{
                  ...styles.lineTranslationText,
                  textAlign,
                  lineHeight: lineHeight * 0.8,
                }}
                textBreakStrategy="simple"
                key={index}
                color={colors[1]}
                opacity={colors[2]}
                size={size * 0.8}
              >
                {lrc}
              </AnimatedColorText>
            )
          })}
        </View>
      </TouchableOpacity>
    )
  },
  (prevProps, nextProps) => {
    return (
      prevProps.line === nextProps.line &&
      prevProps.activeLine != nextProps.lineNum &&
      nextProps.activeLine != nextProps.lineNum &&
      prevProps.onPress === nextProps.onPress &&
      prevProps.onLongPress === nextProps.onLongPress
    )
  }
)
const wait = async () => new Promise((resolve) => setTimeout(resolve, 100))

export default () => {
  const lyricLines = useLrcSet()
  const { line } = useLrcPlay()
  const theme = useTheme()
  const flatListRef = useRef<FlatList>(null)
  const isPauseScrollRef = useRef(true)
  const scrollTimoutRef = useRef<NodeJS.Timeout | null>(null)
  const delayScrollTimeout = useRef<NodeJS.Timeout | null>(null)
  const lineRef = useRef({ line: 0, prevLine: 0 })
  const isFirstSetLrc = useRef(true)
  const scrollInfoRef = useRef<NativeSyntheticEvent<NativeScrollEvent>['nativeEvent'] | null>(null)
  const listLayoutInfoRef = useRef<{ spaceHeight: number; lineHeights: number[] }>({
    spaceHeight: 0,
    lineHeights: [],
  })
  const scrollCancelRef = useRef<(() => void) | null>(null)
  const isShowLyricProgressSetting = settingState.setting['playDetail.isShowLyricProgressSetting']

  const initialDistanceRef = useRef(0)
  const initialFontSizeRef = useRef(0)
  const lyricMenuRef = useRef<LyricMenuType>(null)

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
    onPanResponderGrant: (evt) => {
      if (evt.nativeEvent.touches.length === 2) {
        const dx = evt.nativeEvent.touches[0].pageX - evt.nativeEvent.touches[1].pageX
        const dy = evt.nativeEvent.touches[0].pageY - evt.nativeEvent.touches[1].pageY
        initialDistanceRef.current = Math.sqrt(dx * dx + dy * dy)
        initialFontSizeRef.current = settingState.setting['playDetail.vertical.style.lrcFontSize']
      }
    },
    onPanResponderMove: (evt) => {
      if (evt.nativeEvent.touches.length === 2 && initialDistanceRef.current > 0) {
        const dx = evt.nativeEvent.touches[0].pageX - evt.nativeEvent.touches[1].pageX
        const dy = evt.nativeEvent.touches[0].pageY - evt.nativeEvent.touches[1].pageY
        const distance = Math.sqrt(dx * dx + dy * dy)

        const scale = distance / initialDistanceRef.current
        let newSize = Math.round((initialFontSizeRef.current * scale) / 2) * 2
        newSize = Math.max(100, Math.min(newSize, 300)) // ensure within bounds

        if (settingState.setting['playDetail.vertical.style.lrcFontSize'] !== newSize) {
          updateSetting({ 'playDetail.vertical.style.lrcFontSize': newSize })
        }
      }
    },
    onPanResponderRelease: () => {
      initialDistanceRef.current = 0
    },
    onPanResponderTerminate: () => {
      initialDistanceRef.current = 0
    }
  }), [])

  // useLock()
  // const [imgUrl, setImgUrl] = useState(null)
  // const theme = useGetter('common', 'theme')
  // const { onLayout, ...layout } = useLayout()

  // useEffect(() => {
  //   const url = playMusicInfo ? playMusicInfo.musicInfo.img : null
  //   if (imgUrl == url) return
  //   setImgUrl(url)
  //
  // }, [playMusicInfo])

  // const imgWidth = useMemo(() => layout.width * 0.75, [layout.width])
  const handleScrollToActive = (index = lineRef.current.line) => {
    if (index < 0) return
    if (flatListRef.current) {
      // console.log('handleScrollToActive', index)
      if (scrollInfoRef.current && lineRef.current.line - lineRef.current.prevLine == 1) {
        let offset = listLayoutInfoRef.current.spaceHeight
        for (let line = 0; line < index; line++) {
          offset += listLayoutInfoRef.current.lineHeights[line]
        }
        offset += (listLayoutInfoRef.current.lineHeights[line] ?? 0) / 2
        try {
          scrollCancelRef.current = scrollTo(
            flatListRef.current,
            scrollInfoRef.current,
            offset - scrollInfoRef.current.layoutMeasurement.height * 0.42,
            600,
            () => {
              scrollCancelRef.current = null
            }
          )
        } catch { }
      } else {
        if (scrollCancelRef.current) {
          scrollCancelRef.current()
          scrollCancelRef.current = null
        }
        try {
          flatListRef.current.scrollToIndex({
            index,
            animated: true,
            viewPosition: 0.42,
          })
        } catch { }
      }
    }
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollInfoRef.current = nativeEvent
    // 调节模式下时间轴横线压着哪一行要跟着滚动实时更新
    adjustRef.current.updateAnchor()
    // if (isPauseScrollRef.current) {
    //   playLineRef.current?.updateScrollInfo(nativeEvent)
    // }
  }

  /** 恢复自动跟随：清掉暂停滚动的状态与定时器 */
  const handleResumeFollow = useCallback(() => {
    if (scrollTimoutRef.current) {
      clearTimeout(scrollTimoutRef.current)
      scrollTimoutRef.current = null
    }
    if (delayScrollTimeout.current) {
      clearTimeout(delayScrollTimeout.current)
      delayScrollTimeout.current = null
    }
    if (scrollCancelRef.current) {
      scrollCancelRef.current()
      scrollCancelRef.current = null
    }
    isPauseScrollRef.current = false
  }, [])

  const adjust = useLyricAdjust({
    getLyricLines: () => lyricLines,
    getScrollInfo: () => scrollInfoRef.current,
    getLayoutInfo: () => listLayoutInfoRef.current,
    resumeFollow: handleResumeFollow,
  })
  const adjustRef = useRef(adjust)
  adjustRef.current = adjust

  const handleScrollBeginDrag = () => {
    adjust.handleDragBegin()
    isPauseScrollRef.current = true
    // playLineRef.current?.setVisible(true)
    if (delayScrollTimeout.current) {
      clearTimeout(delayScrollTimeout.current)
      delayScrollTimeout.current = null
    }
    if (scrollTimoutRef.current) {
      clearTimeout(scrollTimoutRef.current)
      scrollTimoutRef.current = null
    }
    if (scrollCancelRef.current) {
      scrollCancelRef.current()
      scrollCancelRef.current = null
    }
  }

  const onScrollEndDrag = () => {
    // 调节模式下松手就按当前位置重新对齐，不再等 3 秒
    if (adjust.isAdjusting) {
      // 取消惯性：停在松手位置（Android 上 scrollTo 会 abortAnimation，打断残余 fling）
      const offsetY = scrollInfoRef.current?.contentOffset.y
      if (typeof offsetY === 'number') {
        flatListRef.current?.scrollToOffset({ offset: offsetY, animated: false })
      }
      adjust.handleDragEnd()
      return
    }
    if (!isPauseScrollRef.current) return
    if (scrollTimoutRef.current) clearTimeout(scrollTimoutRef.current)
    scrollTimoutRef.current = setTimeout(() => {
      // playLineRef.current?.setVisible(false)
      scrollTimoutRef.current = null
      isPauseScrollRef.current = false
      if (!playerState.isPlay) return
      handleScrollToActive()
    }, 3000)
  }

  useEffect(() => {
    return () => {
      if (delayScrollTimeout.current) {
        clearTimeout(delayScrollTimeout.current)
        delayScrollTimeout.current = null
      }
      if (scrollTimoutRef.current) {
        clearTimeout(scrollTimoutRef.current)
        scrollTimoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    // linesRef.current = lyricLines
    listLayoutInfoRef.current.lineHeights = []
    lineRef.current.prevLine = 0
    lineRef.current.line = 0
    if (!flatListRef.current) return
    flatListRef.current.scrollToOffset({
      offset: 0,
      animated: false,
    })
    if (!lyricLines.length) return
    // playLineRef.current?.updateLyricLines(lyricLines)
    requestAnimationFrame(() => {
      if (isFirstSetLrc.current) {
        isFirstSetLrc.current = false
        setTimeout(() => {
          isPauseScrollRef.current = false
          handleScrollToActive()
        }, 100)
      } else {
        if (delayScrollTimeout.current) clearTimeout(delayScrollTimeout.current)
        delayScrollTimeout.current = setTimeout(() => {
          handleScrollToActive(0)
        }, 100)
      }
    })
  }, [lyricLines])

  // 换了歌词（切歌、重新匹配）就退出调节模式，避免按钮和实际歌词错位
  useEffect(() => {
    if (adjustRef.current.isAdjusting) adjustRef.current.stop()
  }, [lyricLines])

  useEffect(() => {
    if (line < 0) return
    lineRef.current.prevLine = lineRef.current.line
    lineRef.current.line = line
    if (!flatListRef.current || isPauseScrollRef.current) return

    // 调节模式里对齐刚生效时，行号是偏移改出来的（可能一次跨好几行）。
    // 列表本来就停在用户松手的位置上，这时候再让自动跟随「滚到当前行」，
    // FlatList 会按估算的行位置滚一次，滚偏了就等于把对齐好的歌词又推回去。
    if (adjustRef.current.isAdjusting && adjustRef.current.consumeSkipFollow()) {
      if (delayScrollTimeout.current) {
        clearTimeout(delayScrollTimeout.current)
        delayScrollTimeout.current = null
      }
      return
    }

    if (line - lineRef.current.prevLine != 1) {
      handleScrollToActive()
      return
    }

    delayScrollTimeout.current = setTimeout(() => {
      delayScrollTimeout.current = null
      handleScrollToActive()
    }, 600)
  }, [line])

  // useEffect(() => {
  //   requestAnimationFrame(() => {
  //     playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
  //     playLineRef.current?.updateLyricLines(lyricLines)
  //   })
  // }, [isShowLyricProgressSetting])

  const handleScrollToIndexFailed: FlatListType['onScrollToIndexFailed'] = (info) => {
    void wait().then(() => {
      handleScrollToActive(info.index)
    })
  }

  const handleLineLayout = useCallback<LineProps['onLayout']>((lineNum, height) => {
    listLayoutInfoRef.current.lineHeights[lineNum] = height
    // playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
  }, [])

  const handleSpaceLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    listLayoutInfoRef.current.spaceHeight = nativeEvent.layout.height
    // playLineRef.current?.updateLayoutInfo(listLayoutInfoRef.current)
  }, [])

  // const handlePlayLine = useCallback((time: number) => {
  //   playLineRef.current?.setVisible(false)
  //   global.app_event.setProgress(time)
  // }, [])

  const handleLinePress = useCallback((index: number) => {
    if (!isShowLyricProgressSetting) return;
    // 调节模式下点击歌词行会跳转播放，和拖动手势打架，直接忽略
    if (adjustRef.current.isAdjusting) return;
    // 清除可能存在的滚动暂停定时器
    if (scrollTimoutRef.current) {
      clearTimeout(scrollTimoutRef.current);
      scrollTimoutRef.current = null;
    }
    if (scrollCancelRef.current) {
      scrollCancelRef.current();
      scrollCancelRef.current = null;
    }
    // 允许列表滚动
    isPauseScrollRef.current = false;
    // 跳转播放（歌词时间轴是原始的，要补上偏移，再按倍速换算回播放位置）
    const line = lyricLines[index];
    if (line) {
      const { offset: offsetMs, speed } = adjustRef.current;
      global.app_event.setProgress(Math.max(0, line.time + offsetMs) / speed / 1000);
    }
    // 滚动到点击的行
    handleScrollToActive(index);
  }, [isShowLyricProgressSetting, lyricLines]);

  const handleLineLongPress = useCallback(() => {
    if (adjustRef.current.isAdjusting) return
    lyricMenuRef.current?.show()
  }, [])

  // 调节模式下「正在播放的行」以时间轴横线压住的那一行为准，而不是播放器给的真实行号
  const displayLine = adjust.isAdjusting && adjust.anchorLine >= 0 ? adjust.anchorLine : line

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => {
    return <LrcLine line={item} lineNum={index} activeLine={displayLine} onLayout={handleLineLayout} onPress={handleLinePress} onLongPress={handleLineLongPress} />; // 传入 onPress
  };
  const getkey: FlatListType['keyExtractor'] = (item, index) => `${index}${item.text}`

  const spaceComponent = useMemo(
    () => <View style={styles.space} onLayout={handleSpaceLayout}></View>,
    [handleSpaceLayout]
  )

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <FlatList
        data={lyricLines}
        renderItem={renderItem}
        keyExtractor={getkey}
        style={{ flex: 1 }}
        ref={flatListRef}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={spaceComponent}
        ListFooterComponent={spaceComponent}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        fadingEdgeLength={100}
        initialNumToRender={Math.max(line + 10, 10)}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        onScroll={handleScroll}
        // 调节模式下关掉惯性，松手即停，方便对到 0.1s
        decelerationRate={adjust.isAdjusting ? 0 : 'normal'}
      />
      {/* 时间轴横线：压在这条线上的歌词就是「此刻正在播放」的那一句 */}
      {adjust.isAdjusting ? (
        <View
          pointerEvents="none"
          style={{ ...styles.anchorLine, backgroundColor: theme['c-primary-alpha-400'] }}
        />
      ) : null}
      {/* 没有歌词时也要能长按呼出「匹配歌词」，否则 B 站这类自带无歌词的曲目没有入口 */}
      {lyricLines.length ? null : (
        <TouchableOpacity
          style={styles.emptyBox}
          activeOpacity={0.7}
          delayLongPress={350}
          onLongPress={handleLineLongPress}
        >
          <Text size={13} color={theme['c-400']}>暂无歌词</Text>
          <Text size={11} color={theme['c-450']} style={styles.emptyTip}>长按匹配歌词</Text>
        </TouchableOpacity>
      )}
      <LyricMenu ref={lyricMenuRef} onAdjust={adjust.start} />
      <LyricAdjustBar
        visible={adjust.isAdjusting}
        offset={adjust.offset}
        speed={adjust.speed}
        onSpeedChange={adjust.changeSpeed}
        onReset={adjust.reset}
        onCancel={adjust.cancel}
        onConfirm={adjust.stop}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
    paddingLeft: 20,
    paddingRight: 20,
    // backgroundColor: 'rgba(0,0,0,0.1)',
  },
  space: {
    paddingTop: '100%',
  },
  anchorLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: `${LYRIC_ANCHOR_RATIO * 100}%`,
    // 高度走 scaleSizeH，1 在部分机型上会被取整成 0，用 2 保证一定看得见
    height: 2,
    borderRadius: 1,
  },
  emptyBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTip: {
    paddingTop: 6,
  },
  line: {
    paddingTop: 10,
    paddingBottom: 10,
    // opacity: 0,
  },
  lineText: {
    textAlign: 'center',
    // fontSize: 16,
    // lineHeight: 20,
    // paddingTop: 5,
    // paddingBottom: 5,
    // opacity: 0,
  },
  lineTranslationText: {
    textAlign: 'center',
    // fontSize: 13,
    // lineHeight: 17,
    paddingTop: 5,
    // paddingBottom: 5,
  },
})
