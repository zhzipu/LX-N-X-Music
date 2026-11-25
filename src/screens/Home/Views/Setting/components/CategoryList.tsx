import { Pressable, StyleSheet, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { SETTING_GROUPS, SETTING_META, type SettingScreenIds } from '../catalog'

interface Props {
  activeId?: SettingScreenIds
  compact?: boolean
  onChangeId: (id: SettingScreenIds) => void
}

export default ({ activeId, compact = false, onChangeId }: Props) => {
  const t = useI18n()
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)

  return (
    <View>
      {SETTING_GROUPS.map(group => (
        <View key={group.title} style={styles.group}>
          <Text accessibilityRole="header" size={12} color={colors.textSecondary} style={styles.groupTitle}>
            {t(group.title)}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            {group.screens.map((id, index) => {
              const meta = SETTING_META[id]
              const active = activeId === id
              return (
                <View key={id}>
                  {index > 0 && <View style={[styles.divider, compact && styles.compactDivider, { backgroundColor: colors.divider }]} />}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(`setting_${id}`)}
                    accessibilityHint={t(meta.description)}
                    accessibilityState={{ selected: active }}
                    onPress={() => onChangeId(id)}
                    style={({ pressed }) => [
                      styles.row,
                      compact && styles.compactRow,
                      { backgroundColor: pressed ? colors.interactivePressed : active ? colors.chipBg : 'transparent' },
                    ]}
                  >
                    <View style={[styles.icon, compact && styles.compactIcon, { backgroundColor: colors.interactive }]}>
                      <Icon name={meta.icon} size={compact ? 17 : 20} color={colors.text} />
                    </View>
                    <View style={styles.labels}>
                      <Text size={15} color={colors.text} style={styles.label}>{t(`setting_${id}`)}</Text>
                      {!compact && <Text size={12} color={colors.textSecondary} style={styles.description}>{t(meta.description)}</Text>}
                    </View>
                    <Icon name="chevron-right" size={12} color={active ? colors.text : colors.textTertiary} />
                  </Pressable>
                </View>
              )
            })}
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = createStyle({
  group: { marginBottom: 24 },
  groupTitle: { marginLeft: 4, marginBottom: 10, fontWeight: '600', letterSpacing: 0.6 },
  card: { borderRadius: 18, overflow: 'hidden' },
  row: { minHeight: 78, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 16 },
  compactRow: { minHeight: 56, paddingHorizontal: 12, paddingVertical: 10 },
  icon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 14, flexShrink: 0 },
  compactIcon: { width: 32, height: 32, borderRadius: 10, marginRight: 10 },
  labels: { flex: 1, minWidth: 0, paddingRight: 12 },
  label: { fontWeight: '600' },
  description: { marginTop: 5, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 70, marginRight: 16 },
  compactDivider: { marginLeft: 54, marginRight: 12 },
})
