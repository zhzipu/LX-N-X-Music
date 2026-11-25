import { getUserTheme, saveUserTheme } from '@/utils/data'
import themes from '@/theme/themes/themes'
import settingState from '@/store/setting/state'
import settingActions from '@/store/setting/action'
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
/**
 * 主题可以在 extInfo 里精确覆盖的派生色键（键集合定义见 src/types/theme.d.ts）。
 * 只在对应主题的 extInfo 里确实写了该键时才覆盖。
 */
const EXT_OVERRIDE_KEYS = [
  'c-content-background',
  'c-border-background',
  'c-font',
  'c-font-label',
  'c-button-background',
  'c-button-font',
  'c-primary-font-active',
  'c-list-header-border-bottom',
  // 语义面/占位符：新皮肤需要把「主色派生的有色面」换成中性灰，
  // 否则纯黑皮肤上会出现一块块暗红（输入框底、抽屉顶部、选中态）。
  'c-primary-input-background',
  'c-primary-dark-100-alpha-600',
  'c-primary-light-700-alpha-500',
  'c-primary-background-hover',
  'c-primary-dark-100-alpha-300',
] as const
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

  // 派生色之上再允许主题「精确覆盖」：
  // themes.ts 的 extInfo 里写了上面的同名键时，以 extInfo 为准（例如 myspotify 皮肤把
  // c-content-background 固定为 #0A0A0A、c-border-background 固定为 0.08 白的发丝线）。
  // 没写的主题完全不受影响。
  for (const key of EXT_OVERRIDE_KEYS) {
    const value = theme.config.extInfo[key]
    if (value != null) activeTheme[key] = value
  }

  // 如果是黑暗主题，我们覆盖掉 'c-primary-font-active'
  // 但主题若在 extInfo 里显式声明了该颜色，则尊重主题配置
  // （c-000 在暗色主题下是中灰，直接拿来当激活文字对比度不足，所以新皮肤显式给了纯白）
  if (theme.isDark && !theme.config.extInfo['c-primary-font-active']) {
    activeTheme['c-primary-font-active'] = activeTheme['c-000'];
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
// 内置主题 = 14 套配色方案（配色来自 TachiyomiX，见 createThemes.js；另有 myspotify 皮肤）。
// 每套方案在 themes.ts 里有两个调色板变体：`<配色id>_light` / `<配色id>_dark`。
// 外观设置按「配色方案」收敛成 14 项，实际用哪个变体由明暗模式决定：
//   「跟随系统」开 → 系统亮暗；关 → 「暗色模式」开关（theme.darkMode）。
export const DEFAULT_THEME = 'myspotify'

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

/** 该 id 是否是内置配色方案（内置 id 只有 14 个，都不带明暗后缀） */
export const isBuiltinSchemeId = (schemeId: string) =>
  themes.some((theme) => theme.id == resolveThemeId(schemeId, false))

/**
 * 外观设置已删除、只剩默认皮肤，用户要求把「绿色 / 红色」的强调色统一改成白色。
 *
 * 做法是按色相判断而不是按 key 名：红色系（0~22 / 320~360）和绿色系（80~170）
 * 且饱和度足够的颜色，替换成中性色（暗色皮肤→白，浅色皮肤→近黑），保留原 alpha；
 * 蓝、紫、灰阶等其它颜色不动，避免把图标底色之类的也一起洗白。
 */
const ACCENT_HUE_RANGES: Array<[number, number]> = [[0, 22], [320, 360], [80, 170]]

const parseRgbColor = (input: string) => {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
    input.trim(),
  )
  if (!m) return null
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] == null ? 1 : Number(m[4]),
  }
}

const toHueSat = (r: number, g: number, b: number) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  const sat = max === 0 ? 0 : d / max
  if (d === 0) return { hue: 0, sat }
  let hue: number
  if (max === rn) hue = ((gn - bn) / d) % 6
  else if (max === gn) hue = (bn - rn) / d + 2
  else hue = (rn - gn) / d + 4
  hue *= 60
  if (hue < 0) hue += 360
  return { hue, sat }
}

const neutralizeAccentColor = (color: string, isDark: boolean): string => {
  const rgb = parseRgbColor(color)
  if (!rgb) return color
  const { hue, sat } = toHueSat(rgb.r, rgb.g, rgb.b)
  if (sat < 0.35) return color
  if (!ACCENT_HUE_RANGES.some(([from, to]) => hue >= from && hue <= to)) return color
  const [r, g, b] = isDark ? [255, 255, 255] : [17, 17, 17]
  return `rgba(${r}, ${g}, ${b}, ${Math.round(rgb.a * 100) / 100})`
}

const applyNeutralAccents = (theme: LX.Theme): LX.Theme => {
  const colors = theme.config.themeColors as unknown as Record<string, string>
  const next: Record<string, string> = {}
  for (const key of Object.keys(colors)) {
    next[key] = neutralizeAccentColor(String(colors[key]), theme.isDark)
  }
  return {
    ...theme,
    config: { ...theme.config, themeColors: next as unknown as LX.Theme['config']['themeColors'] },
  }
}

// type IDS = LocalTheme['id']
export const getTheme = async () => {
  const storedId = settingState.setting['theme.id']

  // 外观只保留默认一套：忽略历史持久化的其它配色方案 / 自定义主题。
  // 「跟随系统」与「暗色模式」设置已删除，这里固定用暗色外观，
  // 并把旧的持久化值纠正过来，避免老用户升级后仍是亮色。
  if (storedId !== DEFAULT_THEME) {
    settingActions.updateSetting({ 'theme.id': DEFAULT_THEME })
  }
  if (settingState.setting['common.isAutoTheme'] || !settingState.setting['theme.darkMode']) {
    settingActions.updateSetting({ 'common.isAutoTheme': false, 'theme.darkMode': true })
  }
  const schemeId = DEFAULT_THEME
  const isDark = true

  const theme = themes.find((theme) => theme.id == resolveThemeId(schemeId, isDark)) as LX.Theme

  // 对外统一暴露配色方案 id（不含明暗后缀），当前明暗看 isDark
  // 最后再把红/绿强调色统一洗成白色（外观设置已删除，只剩一种样式）
  return applyNeutralAccents({ ...theme, id: schemeId } as LX.Theme)
}
