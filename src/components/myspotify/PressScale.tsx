import { memo, useCallback, useRef, type ReactNode } from 'react'
import { Animated, Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { MS_MOTION } from '@/theme/myspotify/tokens'

export interface PressScaleProps {
  children: ReactNode
  /** 点击回调 */
  onPress?: () => void
  /** 长按回调 */
  onLongPress?: () => void
  /** 布局 / 外观样式，作用在外层可点区域上（含 padding / 尺寸），缩放只作用在内层 */
  style?: StyleProp<ViewStyle>
  /** 按下时的缩放目标值，默认取自设计令牌 0.96 */
  scaleTo?: number
  /** 禁用后不响应手势、不播放动效 */
  disabled?: boolean
  /** 命中区域扩展 */
  hitSlop?: number
  /** 无障碍标签 */
  accessibilityLabel?: string
}

/**
 * Apple 手感的按压回弹容器。
 *
 * 外层 `Pressable` 负责命中区域与布局（拿到调用方的 style），
 * 内层 `Animated.View` 只负责 `transform: scale`，因此带背景色的按钮
 * 缩放时背景不会跟着变形，且 `useNativeDriver: true` 全程走 native 线程。
 */
const PressScale = ({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = MS_MOTION.pressScale,
  disabled = false,
  hitSlop,
  accessibilityLabel,
}: PressScaleProps) => {
  const scale = useRef(new Animated.Value(1)).current

  const animateTo = useCallback(
    (toValue: number, spring: { friction: number; tension: number }) => {
      Animated.spring(scale, {
        toValue,
        ...spring,
        useNativeDriver: true,
      }).start()
    },
    [scale],
  )

  const handlePressIn = useCallback(() => {
    animateTo(scaleTo, MS_MOTION.pressSpring)
  }, [animateTo, scaleTo])

  const handlePressOut = useCallback(() => {
    animateTo(1, MS_MOTION.releaseSpring)
  }, [animateTo])

  const animatedStyle = { transform: [{ scale }] }

  return (
    <Pressable
      style={style}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  )
}

export default memo(PressScale)
