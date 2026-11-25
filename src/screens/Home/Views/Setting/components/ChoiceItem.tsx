import { Pressable } from 'react-native'
import type { CheckBoxProps } from '@/components/common/CheckBox'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

/** Compact single-choice control for language, quality and display preferences. */
export default ({ check, label, onChange, disabled, marginRight = 8 }: CheckBoxProps) => {
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)
  const color = check ? colors.onAccent : colors.text
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: check, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => { if (!check) onChange(true) }}
      style={({ pressed }) => [styles.option, {
        marginRight,
        backgroundColor: check ? colors.accent : pressed ? colors.interactivePressed : colors.interactive,
        opacity: disabled ? 0.45 : 1,
      }]}
    >
      <Icon name={check ? 'checkbox-marked' : 'checkbox-blank-outline'} size={16} color={color} />
      <Text size={14} color={color} style={styles.label}>{label}</Text>
    </Pressable>
  )
}

const styles = createStyle({
  option: { minHeight: 44, maxWidth: '100%', flexShrink: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  label: { marginLeft: 8, flexShrink: 1, fontWeight: '500' },
})
