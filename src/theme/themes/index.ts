import { getUserTheme, saveUserTheme } from '@/utils/data'
import themes from '@/theme/themes/themes'
import settingState from '@/store/setting/state'
import settingActions from '@/store/setting/action'
import themeState from '@/store/theme/state'
import { isUrl } from '@/utils'
import { privateStorageDirectoryPath } from '@/utils/fs'
import { type ImageSourcePropType } from 'react-native'

export const BG_IMAGES = {
  'china_ink.jpg': require('./images/china_ink.jpg') as ImageSourcePropType,
  'jqbg.jpg': require('./images/jqbg.jpg') as ImageSourcePropType,
  'landingMoon.png': require('./images/landingMoon2.png') as ImageSourcePropType,
  'myzcbg.jpg': require('./images/myzcbg.jpg') as ImageSourcePropType,
  'xnkl.png': require('./images/xnkl.png') as ImageSourcePropType,
} as const

let userThemes: LX.Theme[]
export const getAllThemes = async () => {
  userThemes ??= await getUserTheme()
  return {
    themes,
    userThemes,
    dataPath: privateStorageDirectoryPath + '/theme_images',
  }
}

export const saveTheme = async (theme: LX.Theme) => {
  const targetTheme = userThemes.find((t) => t.id === theme.id)
  if (targetTheme) Object.assign(targetTheme, theme)
  else userThemes.push(theme)
  await saveUserTheme(userThemes)
}

export const removeTheme = async (id: string) => {
  const index = userThemes.findIndex((t) => t.id === id)
  if (index < 0) return
  userThemes.splice(index, 1)
  await saveUserTheme(userThemes)
}

export type LocalTheme = (typeof themes)[number]
type ColorsKey = keyof LX.Theme['config']['themeColors']
type ExtInfoKey = keyof LX.Theme['config']['extInfo']
const varColorRxp = /^var\((.+)\)$/
export const buildActiveThemeColors = (theme: LX.Theme): LX.ActiveTheme => {
  let bgImg: ImageSourcePropType | undefined
  if (theme.isCustom) {
    if (theme.config.extInfo['bg-image']) {
      theme.config.extInfo['bg-image'] = isUrl(theme.config.extInfo['bg-image'])
        ? theme.config.extInfo['bg-image']
        : `${privateStorageDirectoryPath}/theme_images/${theme.config.extInfo['bg-image']}`
    }
  } else {
    const extInfo = (theme as LocalTheme).config.extInfo
    if (extInfo['bg-image']) {
      bgImg = BG_IMAGES[extInfo['bg-image']]
    }
  }

  theme.config.extInfo = { ...theme.config.extInfo }

  for (const [k, v] of Object.entries(theme.config.extInfo) as Array<
    [ExtInfoKey, LX.Theme['config']['extInfo'][ExtInfoKey]]
  >) {
    if (!v.startsWith('var(')) continue
    theme.config.extInfo[k] = theme.config.themeColors[v.replace(varColorRxp, '$1') as ColorsKey]
  }

  const activeTheme: LX.ActiveTheme = {
    id: theme.id,
    name: theme.name,
    isDark: theme.isDark,
    ...theme.config.themeColors,
    ...theme.config.extInfo,
    'c-font': theme.config.themeColors['c-850'],
    'c-font-label': theme.config.themeColors['c-450'],
    'c-primary-font': theme.config.themeColors['c-primary'],
    'c-primary-font-hover': theme.config.themeColors['c-primary-alpha-300'],
    'c-primary-font-active': theme.config.themeColors['c-primary-dark-100-alpha-200'],
    'c-primary-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-primary-background-hover': theme.config.themeColors['c-primary-light-300-alpha-800'],
    'c-primary-background-active': theme.config.themeColors['c-primary-light-100-alpha-800'],
    'c-primary-input-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-button-font': theme.config.themeColors['c-primary-alpha-100'],
    'c-button-font-selected': theme.config.themeColors['c-primary-dark-100-alpha-100'],
    'c-button-background': theme.config.themeColors['c-primary-light-400-alpha-700'],
    'c-button-background-selected': theme.config.themeColors['c-primary-alpha-600'],
    'c-button-background-hover': theme.config.themeColors['c-primary-light-300-alpha-600'],
    'c-button-background-active': theme.config.themeColors['c-primary-light-100-alpha-600'],
    'c-list-header-border-bottom': theme.config.themeColors['c-primary-alpha-900'],
    'c-content-background': theme.config.themeColors['c-primary-light-1000'],
    'c-border-background': theme.config.themeColors['c-primary-light-100-alpha-700'],
    'c-liked': theme.config.extInfo['c-liked']!,
    'bg-image': bgImg,
  };

  // 如果是黑暗主题，我们覆盖掉 'c-primary-font-active'
  if (theme.isDark) {
    activeTheme['c-primary-font-active'] = activeTheme['c-000']; // 使用纯白色 (rgb(255,255,255))
  }

  return activeTheme as const;
}

// const copyTheme = (theme: LX.Theme): LX.Theme => {
//   return {
//     ...theme,
//     config: {
//       ...theme.config,
//       extInfo: { ...theme.config.extInfo },
//       themeColors: { ...theme.config.themeColors },
//     },
//   }
// }
// 内置主题 = 13 套配色方案（配色来自 TachiyomiX，见 createThemes.js）。
// 每套方案在 themes.ts 里有两个调色板变体：`<配色id>_light` / `<配色id>_dark`。
// 外观设置按「配色方案」收敛成 13 项，实际用哪个变体由明暗模式决定：
//   「跟随系统」开 → 系统亮暗；关 → 「暗色模式」开关（theme.darkMode）。
export const DEFAULT_THEME = 'tachiyomi'

/** 去掉明暗后缀取配色方案 id；用户自定义主题这类没有后缀的 id 原样返回 */
export const getThemeSchemeId = (themeId: string) => themeId.replace(/_(light|dark)$/, '')

/** 全部内置配色方案 id，顺序即外观设置里的列表顺序 */
export const THEME_SCHEME_IDS: string[] = [
  ...new Set(themes.map((theme) => getThemeSchemeId(theme.id))),
]

/** 由配色方案 id + 明暗解析出 themes.ts 里的实际主题 id；没有对应变体时原样返回（自定义主题） */
export const resolveThemeId = (schemeId: string, isDark: boolean) => {
  const targetId = `${getThemeSchemeId(schemeId)}_${isDark ? 'dark' : 'light'}`
  return themes.some((theme) => theme.id == targetId) ? targetId : schemeId
}

/** 该 id 是否是内置配色方案（内置 id 只有 13 个，都不带明暗后缀） */
export const isBuiltinSchemeId = (schemeId: string) =>
  themes.some((theme) => theme.id == resolveThemeId(schemeId, false))

// type IDS = LocalTheme['id']
export const getTheme = async () => {
  const isAutoTheme = settingState.setting['common.isAutoTheme']
  const storedId = settingState.setting['theme.id']
  let schemeId = getThemeSchemeId(storedId)

  // 旧版本把明暗写进了 id（`xxx_light` / `xxx_dark`），先把设置规范化：
  // 只留配色方案 id，并把明暗迁到「暗色模式」开关上，避免升级后外观反转。
  // 用户自定义主题不受影响（它们的 id 不在内置方案里）。
  if (storedId !== schemeId && isBuiltinSchemeId(schemeId)) {
    settingActions.updateSetting({
      'theme.id': schemeId,
      ...(/_dark$/.test(storedId) && !isAutoTheme ? { 'theme.darkMode': true } : {}),
    })
  }

  // 实际生效的明暗：「跟随系统」开启时取系统值，否则由「暗色模式」开关决定
  const isDark = isAutoTheme
    ? themeState.shouldUseDarkColors
    : settingState.setting['theme.darkMode']

  let theme = themes.find((theme) => theme.id == resolveThemeId(schemeId, isDark)) as
    | LX.Theme
    | undefined

  if (!theme) {
    // 不是内置配色方案，可能是用户自定义主题（不参与明暗自动切换）
    userThemes = await getUserTheme()
    const userTheme = userThemes.find((theme) => theme.id == storedId)
    if (userTheme) return userTheme

    // 设置里存的可能是已被移除的旧主题 id，落回默认配色并持久化
    schemeId = DEFAULT_THEME
    theme = themes.find((theme) => theme.id == resolveThemeId(schemeId, isDark)) as LX.Theme
    settingActions.updateSetting({ 'theme.id': schemeId })
  }

  // 对外统一暴露配色方案 id（不含明暗后缀），当前明暗看 isDark
  return { ...theme, id: schemeId } as LX.Theme
}
