/**
 * Play 胶囊（spoti.pw 的 SGRActionRow 主按钮）。
 *
 * 高 48、最小宽 148、圆角 h/2；白底 + 深色字（15 / Semibold）。
 * 按下缩到 0.94，与页头其它按钮同一个手感。
 */

import { memo, useRef } from 'react'
import { Animated, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

export interface PlayPillProps {
  label: string
  /** 图标名，默认 play */
  icon?: string
  onPress?: () => void
  /** 换掉白底（例如「随机播放」用玻璃） */
  variant?: 'solid' | 'glass'
  /** 紧凑版：最小宽 148 → 112（播放页要和上一首/下一首挤一行时用） */
  compact?: boolean
  /** 窄播放器栏使用更小的高度和最小宽度，给屏幕中缝留出空隙 */
  dense?: boolean
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

const PlayPill = ({ label, icon = 'play', onPress, variant = 'solid', compact = false, dense = false, style, accessibilityLabel }: PlayPillProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const scale = useRef(new Animated.Value(1)).current

  const solid = variant === 'solid'
  const bg = solid ? sp.colors.playButtonBg : sp.glass.fillStrong
  const fg = solid ? sp.colors.playButtonIcon : sp.colors.text

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          Animated.spring(scale, { toValue: 0.94, friction: 7, tension: 260, useNativeDriver: true }).start()
        }}
        onPressOut={() => {
          Animated.spring(scale, { toValue: 1, friction: 9, tension: 200, useNativeDriver: true }).start()
        }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={[styles.pill, compact ? styles.pillCompact : null, dense ? styles.pillDense : null, { backgroundColor: bg }]}
      >
        <Icon name={icon} size={20} color={fg} />
        <View style={styles.gap} />
        <Text size={15} style={{ color: fg, fontWeight: '600' }} allowFontScaling={false}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

const styles = createStyle({
  pill: {
    height: 48,
    minWidth: 148,
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: {
    width: 8,
  },
  pillCompact: {
    minWidth: 112,
  },
  pillDense: {
    height: 44,
    minWidth: 96,
    borderRadius: 22,
    paddingLeft: 12,
    paddingRight: 14,
  },
})

export default memo(PlayPill)
