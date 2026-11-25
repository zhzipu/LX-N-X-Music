import { memo } from 'react'
import { View } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { getSP } from '@/theme/spotify/tokens'

export default memo(({ title, children }: { title: string; children: React.ReactNode }) => {
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)
  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text accessibilityRole="header" size={13} color={colors.textSecondary} style={styles.title}>{title}</Text>
      {children}
    </View>
  )
})

const styles = createStyle({
  container: { marginBottom: 16, padding: 16, borderRadius: 18 },
  title: { marginBottom: 12, fontWeight: '600', lineHeight: 20 },
})
