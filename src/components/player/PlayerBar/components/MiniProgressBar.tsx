import { memo, useRef, useEffect } from 'react'
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native'
import { useProgress } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getMS, MS_SIZE } from '@/theme/myspotify/tokens'

/**
 * 迷你播放条进度。
 *
 * spoti.pw 的迷你条本身没有进度线，所以这里做成「贴胶囊底部内侧」的一条极细线：
 * 左右各缩 24 避开圆角、圆头、轨道 22% 白 / 填充纯白。
 * 之前它是钉在 top:0 的通栏直线，看起来像一条把底栏和列表切开的分割线。
 */
const MiniProgressBar = ({ onLayout }: { onLayout: (event: LayoutChangeEvent) => void }) => {
  const theme = useTheme()
  const ms = getMS(theme.isDark)
  const { progress } = useProgress()
  const progressAnim = useRef(new Animated.Value(progress)).current
  // 记录动画当前值，避免读 Animated.Value 的私有字段
  const lastProgressRef = useRef(progress)

  useEffect(() => {
    const isJump = Math.abs(progress - lastProgressRef.current) > 0.05
    lastProgressRef.current = progress

    Animated.timing(progressAnim, {
      toValue: progress,
      duration: isJump ? 200 : 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start()
  }, [progress, progressAnim])

  const progressStyle = {
    width: progressAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['0%', '100%'],
    }),
    backgroundColor: ms.colors.trackFill,
  }

  return (
    <View onLayout={onLayout} style={[styles.track, { backgroundColor: ms.colors.track }]}>
      <Animated.View style={[styles.progress, progressStyle]} />
    </View>
  )
}

const styles = createStyle({
  track: {
    position: 'absolute',
    bottom: 6,
    left: 24,
    right: 24,
    height: MS_SIZE.miniProgressHeight,
    borderRadius: MS_SIZE.miniProgressHeight / 2,
    overflow: 'hidden',
  },
  progress: {
    height: '100%',
    borderRadius: MS_SIZE.miniProgressHeight / 2,
  },
})

export default memo(MiniProgressBar)
