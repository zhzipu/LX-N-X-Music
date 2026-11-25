/** Navigation bridge for the native port of AndroidLiquidGlass-kmp's LiquidBottomTabs. */
import { memo, useCallback, useMemo, useRef } from 'react'
import { Dimensions, StatusBar, View, useWindowDimensions } from 'react-native'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { Navigation } from 'react-native-navigation'
import { GLASS_TABS_SETTINGS_SCREEN } from '@/navigation/screenNames'
import LiquidTabs from './LiquidTabs'
import { useGlassControl, useGlassSettingsReady } from './useGlassControl'

export type HomeTabId = 'home' | 'search' | 'library' | 'menu'
export type BarTabId = HomeTabId | 'settings'
export type HomeTabLabelKey = 'nav_home' | 'nav_music' | 'nav_search' | 'nav_hot' | 'nav_menu'
export const HOME_TABS: Array<{ id: HomeTabId, icon: string, labelKey: HomeTabLabelKey }> = [
  { id: 'home', icon: 'home', labelKey: 'nav_music' },
  { id: 'search', icon: 'search-2', labelKey: 'nav_search' },
  { id: 'library', icon: 'album', labelKey: 'nav_hot' },
  { id: 'menu', icon: 'menu', labelKey: 'nav_menu' },
]
const DOUBLE_TAP_MS = 320

export function useHomeBarInset() {
  const { height } = useWindowDimensions()
  return Math.min(Math.max(Dimensions.get('screen').height - height - (StatusBar.currentHeight ?? 0), 0), 40)
}

export default memo(({ componentId, activeTab, onTabPress }: { componentId: string, activeTab: HomeTabId, onTabPress: (id: HomeTabId) => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const bottomInset = useHomeBarInset()
  const params = useGlassControl('tabs')
  const hydrated = useGlassSettingsReady()
  const openingSettings = useRef(false)
  const menuTap = useRef(0)

  // The preview selection is independent of the four navigation destinations.
  const items = useMemo(() => HOME_TABS.map(tab => ({ id: tab.id, icon: tab.icon, label: t(tab.labelKey) })), [t])
  const activeIndex = Math.max(0, HOME_TABS.findIndex(tab => tab.id === activeTab))
  const select = useCallback((index: number, dragged: boolean) => {
    const tab = HOME_TABS[index]
    if (!tab) return
    if (tab.id === 'menu' && !dragged) {
      const now = Date.now()
      if (now - menuTap.current < DOUBLE_TAP_MS) {
        menuTap.current = 0
        if (openingSettings.current || !hydrated) return
        openingSettings.current = true
        void Navigation.push(componentId, {
          component: {
            name: GLASS_TABS_SETTINGS_SCREEN,
            options: {
              topBar: { visible: false, height: 0, drawBehind: false },
              statusBar: { drawBehind: false, style: 'light', backgroundColor: '#151518' },
              navigationBar: { backgroundColor: '#151518' },
              layout: { componentBackgroundColor: '#151518' },
            },
          },
        }).catch(error => { console.warn('Unable to open glass settings', error) })
          .finally(() => { openingSettings.current = false })
        return
      }
      menuTap.current = now
    } else menuTap.current = 0
    if (activeTab !== tab.id) onTabPress(tab.id)
  }, [activeTab, onTabPress, componentId, hydrated])

  return (
      <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: bottomInset + 8 }]}>
        <LiquidTabs items={items} selectedIndex={activeIndex} params={params} dark={theme.isDark} onSelect={select} />
      </View>
  )
})

const styles = createStyle({
  wrap: { width: '100%', paddingTop: 8, paddingHorizontal: 16 },
})
