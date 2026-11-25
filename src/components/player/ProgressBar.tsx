import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, PanResponder, type StyleProp, type TextStyle } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { scaleSizeW, scaleSizeH } from '@/utils/pixelRatio'
import { useDrag } from '@/utils/hooks'
import { Icon } from '@/components/common/Icon'
// import { AppColors } from '@/theme'

/**
 * 进度条。
 *
 * 默认外观完全沿用主题派生色（下载管理器、横屏播放页等既有调用方不传新 props 时行为不变）；
 * Myspotify 皮肤（播放详情竖屏）通过 color 类 props 覆盖成「白色细线 + 10px 白色圆点」。
 */
export interface ProgressBarProps {
  progress: number
  duration: number
  buffered: number
  /** 轨道底色，默认取主题 c-primary-light-300-alpha-800 */
  trackColor?: string
  /** 缓冲进度色，默认取主题 c-primary-light-400-alpha-700 */
  bufferedColor?: string
  /** 已播放进度与拖拽点颜色，默认暗色主题取 c-font、亮色取 c-primary */
  barColor?: string
  /** 拖拽点直径（dp），不传则按内容高度推导 */
  thumbSize?: number
}

const DefaultBar = memo(({ color }: { color?: string }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        ...styles.progressBar,
        backgroundColor: color ?? theme['c-primary-light-300-alpha-800'],
        position: 'absolute',
        width: '100%',
        left: 0,
        top: 0,
      }}
    ></View>
  )
})

const BufferedBar = memo(({ progress, color }: { progress: number, color?: string }) => {
  // console.log(bufferedProgress)
  const theme = useTheme()
  return (
    <View
      style={{
        ...styles.progressBar,
        backgroundColor: color ?? theme['c-primary-light-400-alpha-700'],
        position: 'absolute',
        width: `${progress * 100}%`,
        left: 0,
        top: 0,
      }}
    ></View>
  )
})

const PreassBar = memo(
  ({
    onDragState,
    setDragProgress,
    onSetProgress,
  }: {
    onDragState: (drag: boolean) => void
    setDragProgress: (progress: number) => void
    onSetProgress: (progress: number) => void
  }) => {
    const { onLayout, onDragStart, onDragEnd, onDragCancel, onDrag } = useDrag(
      onSetProgress,
      onDragState,
      setDragProgress
    )
    // const handlePress = useCallback((event: GestureResponderEvent) => {
    //   onPress(event.nativeEvent.locationX)
    // }, [onPress])

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (evt, gestureState) => true,
        onMoveShouldSetPanResponderCapture: (evt, gestureState) => true,

        // onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (evt, gestureState) => {
          onDrag(gestureState.dx)
        },
        onPanResponderGrant: (evt, gestureState) => {
          // console.log(evt.nativeEvent.locationX, gestureState)
          onDragStart(gestureState.dx, evt.nativeEvent.locationX)
        },
        onPanResponderRelease: () => {
          onDragEnd()
        },
        // Keep seeking gestures from being taken over by the wide player's page swipe.
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: onDragCancel,
      })
    ).current

    return <View onLayout={onLayout} style={styles.pressBar} {...panResponder.panHandlers} />
  }
)

const Progress = ({
  progress,
  duration,
  buffered,
  trackColor,
  bufferedColor,
  barColor,
  thumbSize,
}: ProgressBarProps) => {
  // const { progress: bufferProgress } = usePlayTimeBuffer()
  const theme = useTheme()
  const [draging, setDraging] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  // console.log(progress)
  const progressStr: `${number}%` = `${progress * 100}%`

  const activeColor = barColor ?? (theme.isDark ? theme['c-font'] : theme['c-primary'])
  const dotSize = thumbSize != null ? scaleSizeW(thumbSize) : progressDotSize

  const progressDotStyle = useMemo<StyleProp<TextStyle>>(() => {
    return {
      width: dotSize,
      position: 'absolute',
      right: -dotSize / 2,
      top: -(dotSize - progressHeightSize) / 2,
      textShadowColor: 'rgba(0, 0, 0, 0.35)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    }
  }, [dotSize])

  const durationRef = useRef(duration)
  useEffect(() => {
    durationRef.current = duration
  }, [duration])
  const onSetProgress = useCallback((progress: number) => {
    global.app_event.setProgress(progress * durationRef.current)
  }, [])
  return (
    <View style={styles.progress}>
      <View>
        <DefaultBar color={trackColor} />
        <BufferedBar progress={buffered} color={bufferedColor} />
        {draging ? (
          <>
            <View
              style={{
                ...styles.progressBar,
                backgroundColor: activeColor,
                width: progressStr,
                position: 'absolute',
                left: 0,
                top: 0,
              }}
            />
            <View
              style={{
                ...styles.progressBar,
                backgroundColor: activeColor,
                width: `${dragProgress * 100}%`,
                position: 'absolute',
                left: 0,
                top: 0,
              }}
            >
              <Icon
                name="full_stop"
                color={activeColor}
                rawSize={dotSize}
                style={progressDotStyle}
              />
            </View>
          </>
        ) : (
          <View
            style={{
              ...styles.progressBar,
              backgroundColor: activeColor,
              width: progressStr,
              position: 'absolute',
              left: 0,
              top: 0,
            }}
          >
            <Icon
              name="full_stop"
              color={activeColor}
              rawSize={dotSize}
              style={progressDotStyle}
            />
          </View>
        )}
      </View>
      <PreassBar
        onDragState={setDraging}
        setDragProgress={setDragProgress}
        onSetProgress={onSetProgress}
      />
      {/* <View style={{ ...styles.progressBar, height: '100%', width: progressStr }}><Pressable style={styles.progressDot}></Pressable></View> */}
    </View>
  )
}

const progressContentPadding = 10
const progressHeight = 3.6
const progressContentHeight = progressContentPadding * 2 + progressHeight
const progressHeightSize = scaleSizeH(progressHeight)
let progressDotSize = scaleSizeW(progressContentHeight * 0.8)
const styles = createStyle({
  progress: {
    width: '100%',
    height: progressContentHeight,
    // backgroundColor: 'rgba(0,0,0,0.5)',
    paddingTop: progressContentPadding,
    paddingBottom: progressContentPadding,
    zIndex: 1,
  },
  progressBar: {
    height: progressHeight,
    borderRadius: 4,
  },
  pressBar: {
    position: 'absolute',
    // backgroundColor: 'rgba(0,0,0,0.5)',
    left: 0,
    top: 0,
    height: progressContentHeight,
    paddingTop: progressContentPadding,
    paddingBottom: progressContentPadding,
    width: '100%',
    zIndex: 6,
  },
})

export default Progress
