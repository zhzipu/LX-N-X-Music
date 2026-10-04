//! 此文件由本脚本维护；修改配色后执行 npm run build:theme 重新生成 themes.ts
//!
//! 配色方案来源：TachiyomiX（Mihon fork）
//!   app/src/main/java/eu/kanade/presentation/theme/colorscheme/*ColorScheme.kt
//! 每套方案取 M3 colorScheme 的 primary / onBackground / background / secondary / tertiary / error，
//! 各生成一个浅色调色板与一个深色调色板（id 后缀 _light / _dark）。
//! 对外只暴露 13 个「配色方案」（id 不带后缀）：外观设置里每套方案只占一项，
//! 实际用哪个调色板由明暗模式决定（「跟随系统」或「暗色模式」开关）——
//! 见 src/theme/themes/index.ts 的 resolveThemeId()。id 后缀是内部实现，不要写进设置。
//! 注：TachiyomiX 的 Monet（动态取色）依赖 Android 12+ Material You，RN 侧无法实现，故未收录。

const fs = require('fs')
const path = require('path')
const { createThemeColors } = require('./utils')

// [id, 简中名, 繁中名, 英文名, { light, dark }]
const schemes = [
  // Default
  ['tachiyomi', '默认', '預設', 'Default',
    { light: { primary: '#0058CA', font: '#1B1B1F', background: '#FEFBFF', secondary: '#0058CA', tertiary: '#006E1B', error: '#BA1A1A' },
      dark:  { primary: '#B0C6FF', font: '#E3E2E6', background: '#1B1B1F', secondary: '#B0C6FF', tertiary: '#7ADC77', error: '#FFB4AB' } },
  ],
  // Catppuccin
  ['catppuccin', 'Catppuccin', 'Catppuccin', 'Catppuccin',
    { light: { primary: '#8839EF', font: '#4C4F69', background: '#E6E9EF', secondary: '#7287FD', tertiary: '#40A02B', error: '#D20F39' },
      dark:  { primary: '#CBA6F7', font: '#CDD6F4', background: '#181825', secondary: '#B4BEFE', tertiary: '#A6E3A1', error: '#F38BA8' } },
  ],
  // Green Apple
  ['greenapple', '青苹果', '青蘋果', 'Green Apple',
    { light: { primary: '#005927', font: '#181D18', background: '#F6FBF2', secondary: '#005927', tertiary: '#9D0012', error: '#BA1A1A' },
      dark:  { primary: '#7ADB8F', font: '#DFE4DB', background: '#0F1510', secondary: '#7ADB8F', tertiary: '#FFB3AC', error: '#FFB4AB' } },
  ],
  // Lavender
  ['lavender', '薰衣草', '薰衣草', 'Lavender',
    { light: { primary: '#6D41C8', font: '#1D1A22', background: '#EDE2FF', secondary: '#7B46AF', tertiary: '#EDE2FF', error: '#BA1A1A' },
      dark:  { primary: '#A177FF', font: '#E7E0EC', background: '#111129', secondary: '#A177FF', tertiary: '#CDBDFF', error: '#FFB4AB' } },
  ],
  // Midnight Dusk
  ['midnightdusk', '午夜幽暗', '黃昏', 'Midnight Dusk',
    { light: { primary: '#BB0054', font: '#1C1B1F', background: '#FFFBFF', secondary: '#BB0054', tertiary: '#006638', error: '' },
      dark:  { primary: '#F02475', font: '#E5E1E5', background: '#16151D', secondary: '#F02475', tertiary: '#55971C', error: '' } },
  ],
  // Nord
  ['nord', 'Nord', '北風', 'Nord',
    { light: { primary: '#5E81AC', font: '#2E3440', background: '#ECEFF4', secondary: '#81A1C1', tertiary: '#88C0D0', error: '' },
      dark:  { primary: '#88C0D0', font: '#ECEFF4', background: '#2E3440', secondary: '#81A1C1', tertiary: '#5E81AC', error: '' } },
  ],
  // Strawberry Daiquiri
  ['strawberry', '草莓黛绮莉', '草莓黛綺莉', 'Strawberry Daiquiri',
    { light: { primary: '#A10833', font: '#261819', background: '#FAFAFA', secondary: '#A10833', tertiary: '#5F441D', error: '#BA1A1A' },
      dark:  { primary: '#FFB2B8', font: '#F7DCDD', background: '#201A1A', secondary: '#ED4A65', tertiary: '#E8C08E', error: '#FFB4AB' } },
  ],
  // Tako
  ['tako', 'Tako', '章魚', 'Tako',
    { light: { primary: '#66577E', font: '#1B1B22', background: '#F7F5FF', secondary: '#66577E', tertiary: '#F3B375', error: '' },
      dark:  { primary: '#F3B375', font: '#E3E0F2', background: '#21212E', secondary: '#F3B375', tertiary: '#66577E', error: '' } },
  ],
  // Teal & Turquoise
  ['teal', '青绿', '綠松色', 'Teal & Turquoise',
    { light: { primary: '#008080', font: '#050505', background: '#FAFAFA', secondary: '#008080', tertiary: '#FF7F7F', error: '' },
      dark:  { primary: '#40E0D0', font: '#DFDEDA', background: '#202125', secondary: '#40E0D0', tertiary: '#BF1F2F', error: '' } },
  ],
  // Tidal Wave
  ['tidalwave', '浪潮', '潮浪', 'Tidal Wave',
    { light: { primary: '#006780', font: '#001C3B', background: '#FDFBFF', secondary: '#006780', tertiary: '#92F7BC', error: '' },
      dark:  { primary: '#5ED4FC', font: '#D5E3FF', background: '#001C3B', secondary: '#5ED4FC', tertiary: '#92F7BC', error: '' } },
  ],
  // Yin & Yang
  ['yinyang', '阴阳', '陰陽', 'Yin & Yang',
    { light: { primary: '#000000', font: '#222222', background: '#FDFDFD', secondary: '#000000', tertiary: '#FFFFFF', error: '' },
      dark:  { primary: '#FFFFFF', font: '#E6E6E6', background: '#1E1E1E', secondary: '#FFFFFF', tertiary: '#000000', error: '' } },
  ],
  // Yotsuba
  ['yotsuba', '四叶草', '四葉', 'Yotsuba',
    { light: { primary: '#AE3200', font: '#211A18', background: '#FCFCFC', secondary: '#AE3200', tertiary: '#6B5E2F', error: '' },
      dark:  { primary: '#FFB59D', font: '#EDE0DD', background: '#211A18', secondary: '#FFB59D', tertiary: '#D7C68D', error: '' } },
  ],
  // Monochrome
  ['monochrome', '单色', '單色', 'Monochrome',
    { light: { primary: '#000000', font: '#000000', background: '#FFFFFF', secondary: '#000000', tertiary: '#888888', error: '#000000' },
      dark:  { primary: '#FFFFFF', font: '#FFFFFF', background: '#000000', secondary: '#FFFFFF', tertiary: '#777777', error: '#FFFFFF' } },
  ],
]

const hex2rgb = (hex) => {
  if (!hex) return null
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

const defaultThemes = schemes.flatMap(([id, zh, tw, en, colors]) =>
  ['light', 'dark'].map((mode) => {
    const c = colors[mode]
    const isDark = mode === 'dark'
    return {
      id: `${id}_${mode}`,
      name: `${zh} · ${isDark ? '深色' : '浅色'}`,
      isDark,
      config: {
        primary: hex2rgb(c.primary),
        font: hex2rgb(c.font),
        'c-app-background': isDark ? 'rgba(0, 0, 0, 0)' : 'var(c-primary-light-600-alpha-700)',
        'c-main-background': c.background,
        'bg-image': '',
        'bg-image-position': 'center',
        'bg-image-size': 'cover',

        'c-badge-primary': c.secondary,
        'c-badge-secondary': c.tertiary,
        'c-badge-tertiary': 'var(c-primary)',
        'c-liked': c.error || '#ef4444',
      },
    }
  }),
)

const themes = defaultThemes.map(({ config: { primary, font, ...extInfo }, ...themeInfo }) => {
  return {
    ...themeInfo,
    isCustom: false,
    config: {
      themeColors: createThemeColors(primary, font, themeInfo.isDark),
      extInfo,
    },
  }
})

fs.writeFileSync(
  path.join(__dirname, 'themes.ts'),
  `//! 此文件由 createThemes.js 生成\n\nexport default ${JSON.stringify(themes, null, 2)} as const`,
)
