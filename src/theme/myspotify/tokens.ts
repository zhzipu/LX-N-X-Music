/**
 * Myspotify 皮肤设计令牌（类 Apple Music 视觉）。
 *
 * 设计基准：纯黑底 + 专辑封面重度模糊形成的「色雾」，内容以白色文字直接压在色雾上；
 * 没有卡片边框，只有极细发丝分隔线；层级靠字重与透明度而非投影。
 *
 * 单位约定（重要）：
 *  - 本文件里的尺寸 / 字号 / 圆角都是**设计稿原始数值**（以 375×667 为基准）。
 *  - 在 `createStyle()`（`@/utils/tools`）里直接写这些数值即可：createStyle 会自动把
 *    width / height / padding / margin / gap 交给 scaleSizeW|H，把 fontSize / lineHeight /
 *    left / right / top / bottom 交给 setSpText（因此 `global.lx.fontSize` 字体大小设置继续生效）。
 *  - `letterSpacing` **不参与**自动换算（不在 `trasformeProps` 里），需要随字体大小自适应时
 *    自行调用 `setSpText()`；本皮肤的 -0.5 / -0.3 是固定值，直接写死即可。
 *  - 内联样式（不走 createStyle 的对象字面量）需要自己调用 `scaleSizeW` / `scaleSizeH`，
 *    与项目既有习惯保持一致。
 *  - 圆角 `borderRadius` 同样不参与自动换算，按 dp 直接写。
 *
 * 颜色按明暗两套提供，用 `getMS(isDark)` 取；`MS` 是暗色（主推）默认值。
 */

import type { TextStyle } from 'react-native'

export interface MSColors {
  /** 页面底：暗 #000000 / 亮 #FFFFFF */
  bg: string
  /** 内容面、播放条底：暗 #0A0A0A / 亮 #F5F5F7 */
  surface: string
  /** 主色 accent：暗 #FA2D48 / 亮 #D70015 */
  accent: string
  /** 主色按下态：暗 #D81F38 / 亮 #B00012 */
  accentPressed: string
  /** 主色上的文字/图标颜色 */
  onAccent: string
  /** 主文字：暗 #FFFFFF / 亮 #111111 */
  text: string
  /** 次级文字 rgba(255,255,255,0.62) / rgba(0,0,0,0.60) */
  textSecondary: string
  /** 三级文字 rgba(255,255,255,0.38) / rgba(0,0,0,0.38) */
  textTertiary: string
  /** 发丝分隔线 rgba(255,255,255,0.08) / rgba(0,0,0,0.08) */
  divider: string
  /** 交互面（按钮 / 输入框底）rgba(255,255,255,0.10) / rgba(0,0,0,0.06) */
  interactive: string
  /** 交互面按下态 rgba(255,255,255,0.16) / rgba(0,0,0,0.12) */
  interactivePressed: string
  /** 徽章 / 喜欢 */
  badgeLiked: string
  badgeSecondary: string
  badgeTertiary: string
  /** 进度条轨道 rgba(255,255,255,0.22) / rgba(0,0,0,0.16) */
  track: string
  /** 进度条已缓冲段 rgba(255,255,255,0.12) / rgba(0,0,0,0.10) */
  trackBuffered: string
  /** 进度条填充 #FFFFFF / #D70015 */
  trackFill: string
  /** 进度拖拽点 */
  trackThumb: string
  /** 封面模糊背景上的深色蒙层 */
  scrim: string
  /** 柔和阴影色 */
  shadow: string
}

export interface MSRadius {
  /** 卡片 */
  card: number
  /** 列表缩略图 */
  thumb: number
  /** 弹层 */
  sheet: number
  /** 胶囊 */
  pill: number
  /** 播放页封面 */
  cover: number
}

export interface MSSize {
  /** 迷你播放条高 */
  playerBarHeight: number
  /** 迷你播放条封面 */
  playerBarCover: number
  /** 迷你播放条图标 */
  playerBarIcon: number
  /** 迷你播放条播放/上一首图标（较大的一档） */
  playerBarIconLarge: number
  /** 迷你播放条图标之间间距 */
  playerBarIconGap: number
  /** 迷你进度条高度（顶部贴边极细白线） */
  miniProgressHeight: number
  /** 列表缩略图 */
  listThumb: number
  /** 列表行最小高度 */
  listRowHeight: number
  /** 列表分隔线左侧缩进（缩略图宽 + 两侧间距） */
  listDividerInset: number
  /** 发丝线宽 */
  hairline: number
  /** 进度条轨道高 */
  progressTrack: number
  /** 进度拖拽点直径 */
  progressThumb: number
  /** 次按钮高 */
  secondaryButtonHeight: number
  /** 可点区域最小边长（无障碍 tap target） */
  tapArea: number
  /** 播放页控制键图标 */
  controlIcon: number
  /** 播放页模式图标（随机 / 循环） */
  modeIcon: number
  /** 播放页封面边长 = min(屏宽 × coverRatioW, 可用高 × coverRatioH) */
  coverRatioW: number
  coverRatioH: number
  /** 页面水平内边距 */
  pagePaddingH: number
}

export interface MSFont {
  /** 页面大标题 */
  pageTitle: number
  pageTitleWeight: TextStyle['fontWeight']
  pageTitleLetterSpacing: number
  /** 区块标题 */
  sectionTitle: number
  sectionTitleWeight: TextStyle['fontWeight']
  sectionTitleLetterSpacing: number
  /** 列表行标题 */
  rowTitle: number
  rowTitleWeight: TextStyle['fontWeight']
  /** 列表行副标题 */
  rowSubtitle: number
  rowSubtitleWeight: TextStyle['fontWeight']
  /** 时间、说明 */
  caption: number
  captionWeight: TextStyle['fontWeight']
  /** 播放页歌名 */
  playerTitle: number
  playerTitleWeight: TextStyle['fontWeight']
  /** 播放页歌手 */
  playerSinger: number
  playerSingerWeight: TextStyle['fontWeight']
}

export interface MSSpacing {
  xxs: number
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
  xxl: number
}

export interface MSMotion {
  /** 按压缩放目标值 */
  pressScale: number
  /** 按下回弹 spring 参数（useNativeDriver: true） */
  pressSpring: { friction: number; tension: number }
  /** 松开回弹 spring 参数 */
  releaseSpring: { friction: number; tension: number }
  /** 封面进场时长（ms）：opacity 0→1、translateY 12→0 */
  enterDuration: number
  /** 封面进场位移起点（dp） */
  enterTranslateY: number
  /** 整页淡入时长（ms） */
  pageFadeDuration: number
  /** 切歌时模糊背景 / 封面交叉淡入时长（ms） */
  crossFadeDuration: number
  /** 播放/暂停切换的收缩比例（1 → 0.9 → 1） */
  toggleScale: number
  /** 播放/暂停回弹时长（ms） */
  toggleDuration: number
}

/** 暗色（主推）配色 */
export const MS_COLORS_DARK: MSColors = {
  bg: '#000000',
  surface: '#0A0A0A',
  accent: '#FA2D48',
  accentPressed: '#D81F38',
  onAccent: '#FFFFFF',
  text: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.62)',
  textTertiary: 'rgba(255, 255, 255, 0.38)',
  divider: 'rgba(255, 255, 255, 0.08)',
  interactive: 'rgba(255, 255, 255, 0.10)',
  interactivePressed: 'rgba(255, 255, 255, 0.16)',
  badgeLiked: '#FA2D48',
  badgeSecondary: '#6B4EFF',
  badgeTertiary: '#00C2A8',
  track: 'rgba(255, 255, 255, 0.22)',
  trackBuffered: 'rgba(255, 255, 255, 0.12)',
  trackFill: '#FFFFFF',
  trackThumb: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.55)',
  shadow: '#000000',
}

/** 亮色配色 */
export const MS_COLORS_LIGHT: MSColors = {
  bg: '#FFFFFF',
  surface: '#F5F5F7',
  accent: '#D70015',
  accentPressed: '#B00012',
  onAccent: '#FFFFFF',
  text: '#111111',
  textSecondary: 'rgba(17, 17, 17, 0.60)',
  textTertiary: 'rgba(17, 17, 17, 0.38)',
  divider: 'rgba(0, 0, 0, 0.08)',
  interactive: 'rgba(0, 0, 0, 0.06)',
  interactivePressed: 'rgba(0, 0, 0, 0.12)',
  badgeLiked: '#D70015',
  badgeSecondary: '#5B3FE0',
  badgeTertiary: '#00907C',
  track: 'rgba(0, 0, 0, 0.16)',
  trackBuffered: 'rgba(0, 0, 0, 0.10)',
  trackFill: '#D70015',
  trackThumb: '#D70015',
  scrim: 'rgba(255, 255, 255, 0.55)',
  shadow: '#000000',
}

export const MS_RADIUS: MSRadius = {
  card: 12,
  thumb: 8,
  sheet: 16,
  pill: 999,
  cover: 10,
}

export const MS_SIZE: MSSize = {
  playerBarHeight: 64,
  playerBarCover: 48,
  playerBarIcon: 22,
  playerBarIconLarge: 26,
  playerBarIconGap: 20,
  miniProgressHeight: 2,
  listThumb: 52,
  listRowHeight: 70,
  listDividerInset: 68,
  hairline: 1,
  progressTrack: 3,
  progressThumb: 10,
  secondaryButtonHeight: 44,
  tapArea: 44,
  controlIcon: 32,
  modeIcon: 20,
  coverRatioW: 0.85,
  coverRatioH: 0.42,
  pagePaddingH: 16,
}

export const MS_FONT: MSFont = {
  pageTitle: 30,
  pageTitleWeight: '700',
  pageTitleLetterSpacing: -0.5,
  sectionTitle: 22,
  sectionTitleWeight: '700',
  sectionTitleLetterSpacing: -0.3,
  rowTitle: 16,
  rowTitleWeight: '500',
  rowSubtitle: 13,
  rowSubtitleWeight: '400',
  caption: 11,
  captionWeight: '400',
  playerTitle: 22,
  playerTitleWeight: '700',
  playerSinger: 17,
  playerSingerWeight: '400',
}

export const MS_SPACING: MSSpacing = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
}

export const MS_MOTION: MSMotion = {
  pressScale: 0.96,
  pressSpring: { friction: 7, tension: 240 },
  releaseSpring: { friction: 9, tension: 200 },
  enterDuration: 320,
  enterTranslateY: 12,
  pageFadeDuration: 200,
  crossFadeDuration: 400,
  toggleScale: 0.9,
  toggleDuration: 180,
}

export interface MSTokens {
  colors: MSColors
  radius: MSRadius
  size: MSSize
  font: MSFont
  spacing: MSSpacing
  motion: MSMotion
}

export const MS_DARK: MSTokens = {
  colors: MS_COLORS_DARK,
  radius: MS_RADIUS,
  size: MS_SIZE,
  font: MS_FONT,
  spacing: MS_SPACING,
  motion: MS_MOTION,
}

export const MS_LIGHT: MSTokens = {
  colors: MS_COLORS_LIGHT,
  radius: MS_RADIUS,
  size: MS_SIZE,
  font: MS_FONT,
  spacing: MS_SPACING,
  motion: MS_MOTION,
}

const msCache: { dark?: MSTokens; light?: MSTokens } = {}

/**
 * 取指定明暗的设计令牌。同一个明暗值返回同一个对象引用，
 * 便于在 useMemo 依赖里直接使用。
 */
export const getMS = (isDark: boolean): MSTokens => {
  if (isDark) {
    msCache.dark ??= MS_DARK
    return msCache.dark
  }
  msCache.light ??= MS_LIGHT
  return msCache.light
}

/** 暗色令牌（默认导出给需要静态取值的场景，如纯静态的样式常量） */
export const MS: MSTokens = MS_DARK

export default MS
