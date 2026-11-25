/**
 * 设置滑杆（iOS 观感）：
 *  - 已完成轨道用 sp.colors.trackFill（纯白），未完成用 sp.colors.track，拇指纯白；
 *  - @react-native-community/slider 4.5 只暴露颜色（trackHeight / 拇指尺寸是平台固定值），
 *    所以这里用令牌统一颜色 + 40 的行高，轨道实际粗细由系统渲染。
 */

import { memo } from 'react'

import Slider, { type SliderProps } from '@react-native-community/slider'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

export type { SliderProps }

export default memo(
  ({
    value,
    minimumValue,
    maximumValue,
    onSlidingStart,
    onSlidingComplete,
    onValueChange,
    step,
  }: SliderProps) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)

    return (
      <Slider
        value={value}
        style={styles.slider}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        minimumTrackTintColor={sp.colors.trackFill}
        maximumTrackTintColor={sp.colors.track}
        thumbTintColor={sp.colors.trackThumb}
        onSlidingStart={onSlidingStart}
        onSlidingComplete={onSlidingComplete}
        onValueChange={onValueChange}
        step={step}
      />
    )
  }
)

const styles = createStyle({
  slider: {
    flexShrink: 0,
    flexGrow: 1,
    maxWidth: 300,
    height: 40,
  },
})
