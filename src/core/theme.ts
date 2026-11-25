import themeActions from '@/store/theme/action'
import { getTheme } from '@/theme/themes'
import { updateSetting } from './common'
import themeState from '@/store/theme/state'
import { updateWidgetTheme } from '@/utils/nativeModules/musicWidget'

export const setShouldUseDarkColors = (shouldUseDarkColors: boolean) => {
  themeActions.setShouldUseDarkColors(shouldUseDarkColors)
}

/** Sync the theme widget's black-and-white palette. */
const syncWidgetTheme = (isDark: boolean) => {
  void updateWidgetTheme(isDark).catch(() => {})
}

export const applyTheme = (theme: LX.Theme) => {
  themeActions.setTheme(theme)
  // setTheme 之后 themeState.theme 才是算好派生色的 ActiveTheme
  syncWidgetTheme(themeState.theme.isDark)
}

export const setTheme = (id: string) => {
  updateSetting({ 'theme.id': id })
  void getTheme().then((theme) => {
    // 配色 id 不变但明暗变了（如同一方案的亮/暗变体）也要重新应用
    if (theme.id == themeState.theme.id && theme.isDark == themeState.theme.isDark) return
    applyTheme(theme)
  })
}
