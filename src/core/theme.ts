import themeActions from '@/store/theme/action'
import { getTheme } from '@/theme/themes'
import { updateSetting } from './common'
import themeState from '@/store/theme/state'

export const setShouldUseDarkColors = (shouldUseDarkColors: boolean) => {
  themeActions.setShouldUseDarkColors(shouldUseDarkColors)
}

export const applyTheme = (theme: LX.Theme) => {
  themeActions.setTheme(theme)
}

export const setTheme = (id: string) => {
  updateSetting({ 'theme.id': id })
  void getTheme().then((theme) => {
    // 配色 id 不变但明暗变了（如同一方案的亮/暗变体）也要重新应用
    if (theme.id == themeState.theme.id && theme.isDark == themeState.theme.isDark) return
    applyTheme(theme)
  })
}
