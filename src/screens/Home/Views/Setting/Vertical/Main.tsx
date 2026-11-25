import { useRef } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import Main from '../Main'
import CategoryList from '../components/CategoryList'
import type { SettingScreenIds } from '../catalog'

interface Props {
  activeId: SettingScreenIds | null
  onChangeId: (id: SettingScreenIds) => void
  onBack: () => void
}

export default ({ activeId, onChangeId, onBack }: Props) => {
  const t = useI18n()
  const { isDark } = useTheme()
  const { colors } = getSP(isDark)
  const overviewOffset = useRef(0)

  return (
    <View style={styles.container}>
      {activeId ? (
        <>
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('setting_back_overview')}
              onPress={onBack}
              style={({ pressed }) => [styles.back, { backgroundColor: pressed ? colors.interactivePressed : colors.surface }]}
            >
              <Icon name="chevron-left" size={14} color={colors.text} />
              <Text size={13} color={colors.text} style={styles.backLabel}>{t('setting_all')}</Text>
            </Pressable>
          </View>
          <ScrollView key={activeId} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.detail}>
            <Main id={activeId} />
          </ScrollView>
        </>
      ) : (
        <ScrollView
          key="overview"
          contentContainerStyle={styles.content}
          contentOffset={{ x: 0, y: overviewOffset.current }}
          onScroll={({ nativeEvent }) => { overviewOffset.current = nativeEvent.contentOffset.y }}
          scrollEventThrottle={32}
        >
          <Text size={13} color={colors.textSecondary} style={styles.intro}>{t('setting_overview_hint')}</Text>
          <CategoryList onChangeId={onChangeId} />
        </ScrollView>
      )}
    </View>
  )
}

const styles = createStyle({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT + 24 },
  detail: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT + 24 },
  intro: { lineHeight: 20, marginBottom: 24 },
  toolbar: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8, alignItems: 'flex-start' },
  back: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderRadius: 22 },
  backLabel: { marginLeft: 8, fontWeight: '500' },
})
