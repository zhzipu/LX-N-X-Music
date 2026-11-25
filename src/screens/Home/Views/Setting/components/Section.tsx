import { View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

interface Props {
  title: string
  description?: string
  children: React.ReactNode
}

export default ({ title, description, children }: Props) => {
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)
  return (
    <View>
      <View style={styles.heading}>
        <Text accessibilityRole="header" size={24} color={colors.text} style={styles.title}>{title}</Text>
        {description ? <Text size={13} color={colors.textSecondary} style={styles.description}>{description}</Text> : null}
      </View>
      {children}
    </View>
  )
}

const styles = createStyle({
  heading: { paddingTop: 8, marginBottom: 24 },
  title: { fontWeight: '700', letterSpacing: -0.4 },
  description: { marginTop: 8, lineHeight: 20 },
})
