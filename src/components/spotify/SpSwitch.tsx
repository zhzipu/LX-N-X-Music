/**
 * spoti.pw 风格开关（自绘，不用原生 Switch）。
 *
 * 为什么不用 RN 的 Switch：强调色改成白色之后，原生 Android Switch 的滑块被画在白色轨道**下面**，
 * 只露出一小块黑色月牙（不同 OEM 的绘制顺序还不一样）。自绘轨道 + 滑块，层级和颜色都可控：
 *  - 关：轨道 20% 白，滑块纯白，靠左
 *  - 开：轨道 = 强调色（现在是白），滑块 = onAccent（深色），靠右
 */

import { memo, useEffect, useRef } from 'react'
import { Animated, Pressable, StyleSheet, View } from 'react-native'

export interface SpSwitchProps {
  value: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  /** 轨道开启色，默认白色 */
  activeColor?: string
  /** 滑块在开启时的颜色，默认深色 */
  activeThumbColor?: string
  /** 轨道关闭色 */
  inactiveColor?: string
}

const TRACK_WIDTH = 52
const TRACK_HEIGHT = 32
const THUMB = 26
const PADDING = (TRACK_HEIGHT - THUMB) / 2

const SpSwitch = ({
  value,
  onChange,
  disabled = false,
  activeColor = '#FFFFFF',
  activeThumbColor = '#111111',
  inactiveColor = 'rgba(255,255,255,0.20)',
}: SpSwitchProps) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      friction: 9,
      tension: 200,
      useNativeDriver: false,
    }).start()
  }, [value, anim])

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRACK_WIDTH - THUMB - PADDING * 2],
  })
  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveColor, activeColor],
  })
  const thumbColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#FFFFFF', activeThumbColor],
  })

  return (
    <Pressable
      onPress={() => { if (!disabled) onChange(!value) }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
    >
      <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
        <Animated.View
          style={[
            styles.thumb,
            { backgroundColor: thumbColor, transform: [{ translateX }] },
          ]}
        />
      </Animated.View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    padding: PADDING,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
  },
})

export default memo(SpSwitch)
