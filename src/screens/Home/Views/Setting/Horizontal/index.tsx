import { ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import CategoryList from '../components/CategoryList'
import Main from '../Main'
import type { SettingScreenIds } from '../catalog'

interface Props {
  activeId: SettingScreenIds
  onChangeId: (id: SettingScreenIds) => void
}

export default ({ activeId, onChangeId }: Props) => {
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)
  return (
    <View style={styles.container}>
      <ScrollView style={[styles.nav, { borderRightColor: colors.divider }]} contentContainerStyle={styles.navContent}>
        <CategoryList compact activeId={activeId} onChangeId={onChangeId} />
      </ScrollView>
      <ScrollView key={activeId} style={styles.main} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.mainContent}>
        <View style={styles.detail}>
          <Main id={activeId} />
        </View>
      </ScrollView>
    </View>
  )
}

const styles = createStyle({
  container: { flex: 1, flexDirection: 'row' },
  nav: { width: 240, flexGrow: 0, flexShrink: 0, borderRightWidth: StyleSheet.hairlineWidth },
  navContent: { padding: 16, paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT + 24 },
  main: { flex: 1 },
  mainContent: { padding: 24, paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT + 24, alignItems: 'center' },
  detail: { width: '100%', maxWidth: 720 },
})
