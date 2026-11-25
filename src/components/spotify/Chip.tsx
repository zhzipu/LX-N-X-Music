/**
 * 胶囊 chip（spoti.pw 把筛选 chip 保留在系统玻璃上的做法）。
 *
 * 高 32、圆角 h/2；未选中是 16% 白填充，选中 26% 白 + 纯白文字。
 * 不做描边 —— spoti.pw 的卡片/胶囊层级只靠填充差区分。
 */

import { memo } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

export interface ChipProps {
  label: string
  icon?: string
  active?: boolean
  onPress?: () => void
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
}

const Chip = ({ label, icon, active = false, onPress, style, accessibilityLabel }: ChipProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const bg = active ? sp.colors.chipActiveBg : sp.colors.chipBg
  const fg = active ? sp.colors.chipActiveText : sp.colors.textSecondary

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.chip, { backgroundColor: bg }, style]}
    >
      {icon
        ? (
            <View style={styles.icon}>
              {icon.startsWith('svg:')
                ? <SvgIcon name={icon.slice(4)} size={14} color={fg} />
                : <Icon name={icon} size={14} color={fg} />}
            </View>
          )
        : null}
      <Text size={sp.font.chip} numberOfLines={1} style={{ color: fg, fontWeight: sp.font.chipWeight }}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = createStyle({
  chip: {
    height: 32,
    borderRadius: 16,
    paddingLeft: 14,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default memo(Chip)
