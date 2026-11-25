/**
 * spoti.pw 皮肤设计令牌。
 *
 * 视觉语言取自 `D:\code\spoti.pw-main`（iOS 26 Liquid Glass 版的 Spotify 重制）：
 *  - AMOLED 纯黑底（#000000），层级靠「白色低透明度填充」而不是边框；
 *  - 文字永远是白 / 65% 白 / 40% 白，不随封面变色；
 *  - 强调色 #37F200（spoti.pw 的 SGRAccent 默认值）；
 *  - 圆角体系：卡片 16 / 封面 12 / 缩略图 8 / 玻璃圆 44 / 胶囊 h/2；
 *  - 玻璃：白色 16% 实心回退、26% 醒目、14% 玻璃膜，高光描边「上亮下暗」。
 *
 * 单位约定：本文件数值均为 375×667 设计稿原始值。
 *  - width/height/padding/margin/gap 走 createStyle 时自动交给 scaleSize；
 *  - fontSize/lineHeight 自动交给 setSpText（跟随全局字号设置）；
 *  - borderRadius / letterSpacing **不**自动换算，按 dp 直写。
 */

import type { TextStyle } from 'react-native'

/**
 * Liquid Glass 玻璃层定义。
 *
 * 项目没有 BlurView，玻璃靠三件事拼出来：
 *  1) 下层是**已经模糊的封面图**（Image 的 blurRadius），所以透过面板看到的是糊的；
 *  2) 面板本身是低不透明度白色填充 + 深色 tint，形成「磨砂」而不是「透明」；
 *  3) 1px 高光描边 + 顶部更亮的高光线，模拟玻璃厚度切面的折光。
 *
 * 描边方向很关键：Liquid Glass 的边界是「上亮下暗」，
 * 所以 strokeTop 比 stroke 亮，底部用 shadow 压住，才有鼓起的感觉。
 */
export interface SPGlass {
  /** 面板填充：暗色上叠白 (0.08)，亮色上叠黑 (0.05) */
  fill: string
  /** 强调玻璃（弹层、悬浮条）：不透明度更高 */
  fillStrong: string
  /** 深色 tint：让玻璃在浅色封面上也不至于糊成一片 */
  tint: string
  /** 通用描边 */
  stroke: string
  /** 顶部高光描边（比 stroke 亮，制造切面折光） */
  strokeTop: string
  /** 外阴影 */
  shadow: string
  /** 面板圆角 */
  radius: number
  /** 面板背后封面的模糊半径（Image blurRadius） */
  blurRadius: number
}

export interface SPColors {
  /** 页面底 #121212 */
  bg: string
  /** 卡片 / 列表底 #181818 */
  surface: string
  /** 抬高一层：迷你条、弹层、输入框 #242424 */
  surfaceElevated: string
  /** 悬浮 tab bar 底 rgba(18,18,18,0.96) */
  tabBar: string
  /** 主色 Spotify 绿 #1DB954 */
  accent: string
  /** 主色按下 #1AA34A */
  accentPressed: string
  /** 主色上的文字/图标（黑） */
  onAccent: string
  /** 主文字 #FFFFFF */
  text: string
  /** 次级文字 #B3B3B3 */
  textSecondary: string
  /** 三级文字 #6A6A6A */
  textTertiary: string
  /** 发丝分隔线 rgba(255,255,255,0.08) */
  divider: string
  /** 交互面 rgba(255,255,255,0.10) */
  interactive: string
  /** 交互面按下 rgba(255,255,255,0.18) */
  interactivePressed: string
  /** chip 未选中底 #2A2A2A */
  chipBg: string
  /** chip 选中底（= accent） */
  chipActiveBg: string
  /** chip 选中文字（= onAccent） */
  chipActiveText: string
  /** 进度条轨道 rgba(255,255,255,0.24) */
  track: string
  /** 已缓冲段 rgba(255,255,255,0.14) */
  trackBuffered: string
  /** 进度填充 #FFFFFF */
  trackFill: string
  /** 进度拖拽点 */
  trackThumb: string
  /** 封面压暗层 */
  scrim: string
  /** 播放按钮底（播放页大圆钮为白底黑图标） */
  playButtonBg: string
  /** 播放按钮图标色 */
  playButtonIcon: string
}

/** 搜索页分类卡配色（Spotify 招牌的四色块） */
export interface SPCategoryColors {
  music: string
  podcast: string
  audiobook: string
  live: string
}

export interface SPRadius {
  /** 小卡片 / 列表缩略图 8 */
  card: number
  /** 横滑大图卡 8 */
  tile: number
  /** 分类卡 / 弹层 16 */
  sheet: number
  /** 胶囊（chip / 按钮）500 */
  pill: number
  /** 播放页封面 12 */
  cover: number
}

export interface SPSize {
  /** 底部 tab bar 内容高（不含安全区） */
  tabBarHeight: number
  /** tab 图标 */
  tabIcon: number
  /** 迷你播放条高 */
  playerBarHeight: number
  /** 迷你条封面 */
  playerBarCover: number
  /** 迷你条图标 */
  playerBarIcon: number
  /** 迷你条播放图标 */
  playerBarPlayIcon: number
  /** 迷你条顶部进度线高 */
  miniProgressHeight: number
  /** chip 高 */
  chipHeight: number
  /** chip 水平内边距 */
  chipPaddingH: number
  /** 横滑卡片宽 */
  tileWidth: number
  /** 横滑卡片封面高（= 宽） */
  tileCover: number
  /** 区块标题与卡片间距 */
  sectionGap: number
  /** 分类卡高 */
  categoryCardHeight: number
  /** 搜索框高 */
  searchBoxHeight: number
  /** 列表缩略图 */
  listThumb: number
  /** 列表行高 */
  listRowHeight: number
  /** 发丝线宽 */
  hairline: number
  /** 播放页进度条高 */
  progressTrack: number
  /** 播放页进度点 */
  progressThumb: number
  /** 播放页主控制键（圆钮直径） */
  playButton: number
  /** 播放页次要控制键 */
  controlIcon: number
  /** 播放页模式键 */
  modeIcon: number
  /** 播放页封面占屏宽比例 */
  coverRatioW: number
  /** 播放页封面占可用高比例 */
  coverRatioH: number
  /** 页面水平内边距 */
  pagePaddingH: number
}

export interface SPFont {
  /** 页面大标题（搜索页「搜索」） */
  pageTitle: number
  pageTitleWeight: TextStyle['fontWeight']
  pageTitleLetterSpacing: number
  /** 区块标题（猜你喜欢） */
  sectionTitle: number
  sectionTitleWeight: TextStyle['fontWeight']
  sectionTitleLetterSpacing: number
  /** 卡片标题 */
  tileTitle: number
  tileTitleWeight: TextStyle['fontWeight']
  /** 卡片副标题 */
  tileSubtitle: number
  tileSubtitleWeight: TextStyle['fontWeight']
  /** chip */
  chip: number
  chipWeight: TextStyle['fontWeight']
  /** 列表行标题 */
  rowTitle: number
  rowTitleWeight: TextStyle['fontWeight']
  /** 列表行副标题 */
  rowSubtitle: number
  rowSubtitleWeight: TextStyle['fontWeight']
  /** tab 文字 */
  tabLabel: number
  tabLabelWeight: TextStyle['fontWeight']
  /** 播放页歌名 */
  playerTitle: number
  playerTitleWeight: TextStyle['fontWeight']
  /** 播放页歌手 */
  playerSinger: number
  playerSingerWeight: TextStyle['fontWeight']
  /** 播放页单行歌词 */
  lyric: number
  lyricWeight: TextStyle['fontWeight']
  /** 时间、说明 */
  caption: number
  captionWeight: TextStyle['fontWeight']
}

export interface SPSpacing {
  xxs: number
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

export interface SPMotion {
  /** 按压缩放 */
  pressScale: number
  pressSpring: { friction: number; tension: number }
  releaseSpring: { friction: number; tension: number }
  /** tab 图标切换的缩放反馈 */
  tabPressScale: number
  /** 封面进场时长 */
  enterDuration: number
  enterTranslateY: number
  /** 切歌交叉淡入 */
  crossFadeDuration: number
  /** 弹层上滑时长 */
  sheetDuration: number
  /** 播放/暂停白色圆钮按下时的收缩比例 */
  toggleScale: number
  /** 播放/暂停回弹时长（ms） */
  toggleDuration: number
}

export const SP_COLORS_DARK: SPColors = {
  // spoti.pw：AMOLED 纯黑底，卡片靠「白色低透明度填充」分层，不画边框
  bg: '#000000',
  surface: 'rgba(255, 255, 255, 0.06)',
  surfaceElevated: 'rgba(255, 255, 255, 0.10)',
  tabBar: 'rgba(255, 255, 255, 0.08)',
  // 强调色取自 spoti.pw 的 SGRAccent 默认值
  accent: '#FFFFFF',
  accentPressed: '#E6E6E6',
  onAccent: '#000000',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.65)',
  textTertiary: 'rgba(255, 255, 255, 0.40)',
  divider: 'rgba(255, 255, 255, 0.12)',
  interactive: 'rgba(255, 255, 255, 0.10)',
  interactivePressed: 'rgba(255, 255, 255, 0.18)',
  chipBg: 'rgba(255, 255, 255, 0.16)',
  chipActiveBg: 'rgba(255, 255, 255, 0.26)',
  chipActiveText: '#FFFFFF',
  track: 'rgba(255, 255, 255, 0.24)',
  trackBuffered: 'rgba(255, 255, 255, 0.14)',
  trackFill: '#FFFFFF',
  trackThumb: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.45)',
  playButtonBg: '#FFFFFF',
  playButtonIcon: '#000000',
}

/** 亮色：Spotify 官方没有亮色主题，这里按「浅灰底 + 深字 + 同款绿」推导，仅保证可读性 */
export const SP_COLORS_LIGHT: SPColors = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  surfaceElevated: '#EBEBEB',
  tabBar: 'rgba(255, 255, 255, 0.96)',
  accent: '#111111',
  accentPressed: '#000000',
  onAccent: '#FFFFFF',
  text: '#111111',
  textSecondary: 'rgba(17, 17, 17, 0.60)',
  textTertiary: 'rgba(17, 17, 17, 0.38)',
  divider: 'rgba(0, 0, 0, 0.08)',
  interactive: 'rgba(0, 0, 0, 0.06)',
  interactivePressed: 'rgba(0, 0, 0, 0.12)',
  chipBg: '#EDEDED',
  chipActiveBg: '#169C46',
  chipActiveText: '#FFFFFF',
  track: 'rgba(0, 0, 0, 0.16)',
  trackBuffered: 'rgba(0, 0, 0, 0.10)',
  trackFill: '#111111',
  trackThumb: '#111111',
  scrim: 'rgba(255, 255, 255, 0.50)',
  playButtonBg: '#111111',
  playButtonIcon: '#FFFFFF',
}

export const SP_CATEGORY_DARK: SPCategoryColors = {
  music: '#E8115B',
  podcast: '#006450',
  audiobook: '#3259B4',
  live: '#8C1EC7',
}

export const SP_CATEGORY_LIGHT: SPCategoryColors = {
  music: '#D4105A',
  podcast: '#005C46',
  audiobook: '#2C4FA0',
  live: '#7C1BAF',
}

export const SP_GLASS_DARK: SPGlass = {
  // 对应 spoti.pw 的「实心回退 / 醒目玻璃 / 玻璃膜」三层
  fill: 'rgba(255, 255, 255, 0.16)',
  fillStrong: 'rgba(255, 255, 255, 0.26)',
  tint: 'rgba(0, 0, 0, 0.38)',
  stroke: 'rgba(255, 255, 255, 0.18)',
  strokeTop: 'rgba(255, 255, 255, 0.42)',
  shadow: 'rgba(0, 0, 0, 0.45)',
  radius: 24,
  blurRadius: 24,
}

export const SP_GLASS_LIGHT: SPGlass = {
  fill: 'rgba(255, 255, 255, 0.55)',
  fillStrong: 'rgba(255, 255, 255, 0.72)',
  tint: 'rgba(246, 246, 248, 0.50)',
  stroke: 'rgba(255, 255, 255, 0.65)',
  strokeTop: 'rgba(255, 255, 255, 0.95)',
  shadow: 'rgba(0, 0, 0, 0.16)',
  radius: 22,
  blurRadius: 24,
}

export const SP_RADIUS: SPRadius = {
  card: 16,
  tile: 8,
  sheet: 28,
  pill: 500,
  cover: 12,
}

export const SP_SIZE: SPSize = {
  tabBarHeight: 62,
  tabIcon: 24,
  playerBarHeight: 56,
  playerBarCover: 40,
  playerBarIcon: 22,
  playerBarPlayIcon: 24,
  miniProgressHeight: 2,
  chipHeight: 32,
  chipPaddingH: 14,
  tileWidth: 149,
  tileCover: 149,
  sectionGap: 12,
  categoryCardHeight: 108,
  searchBoxHeight: 48,
  listThumb: 48,
  listRowHeight: 64,
  hairline: 1,
  progressTrack: 4,
  progressThumb: 12,
  playButton: 48,
  controlIcon: 24,
  modeIcon: 20,
  coverRatioW: 0.88,
  coverRatioH: 0.46,
  pagePaddingH: 16,
}

export const SP_FONT: SPFont = {
  pageTitle: 34,
  pageTitleWeight: '700',
  pageTitleLetterSpacing: -0.8,
  sectionTitle: 22,
  sectionTitleWeight: '700',
  sectionTitleLetterSpacing: -0.5,
  tileTitle: 14,
  tileTitleWeight: '600',
  tileSubtitle: 12,
  tileSubtitleWeight: '400',
  chip: 13,
  chipWeight: '600',
  rowTitle: 15,
  rowTitleWeight: '500',
  rowSubtitle: 12,
  rowSubtitleWeight: '400',
  tabLabel: 10,
  tabLabelWeight: '400',
  playerTitle: 24,
  playerTitleWeight: '700',
  playerSinger: 14,
  playerSingerWeight: '400',
  lyric: 30,
  lyricWeight: '700',
  caption: 13,
  captionWeight: '400',
}

export const SP_SPACING: SPSpacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
}

export const SP_MOTION: SPMotion = {
  pressScale: 0.96,
  pressSpring: { friction: 7, tension: 240 },
  releaseSpring: { friction: 9, tension: 200 },
  tabPressScale: 0.9,
  enterDuration: 300,
  enterTranslateY: 10,
  crossFadeDuration: 400,
  sheetDuration: 260,
  toggleScale: 0.94,
  toggleDuration: 160,
}

export interface SPTokens {
  colors: SPColors
  category: SPCategoryColors
  glass: SPGlass
  radius: SPRadius
  size: SPSize
  font: SPFont
  spacing: SPSpacing
  motion: SPMotion
}

export const SP_DARK: SPTokens = {
  colors: SP_COLORS_DARK,
  category: SP_CATEGORY_DARK,
  glass: SP_GLASS_DARK,
  radius: SP_RADIUS,
  size: SP_SIZE,
  font: SP_FONT,
  spacing: SP_SPACING,
  motion: SP_MOTION,
}

export const SP_LIGHT: SPTokens = {
  colors: SP_COLORS_LIGHT,
  category: SP_CATEGORY_LIGHT,
  glass: SP_GLASS_LIGHT,
  radius: SP_RADIUS,
  size: SP_SIZE,
  font: SP_FONT,
  spacing: SP_SPACING,
  motion: SP_MOTION,
}

const spCache: { dark?: SPTokens; light?: SPTokens } = {}

/** 取指定明暗的设计令牌；同一明暗返回同一引用，便于放进 useMemo 依赖 */
export const getSP = (isDark: boolean): SPTokens => {
  if (isDark) {
    spCache.dark ??= SP_DARK
    return spCache.dark
  }
  spCache.light ??= SP_LIGHT
  return spCache.light
}

export const SP: SPTokens = SP_DARK

export default SP
