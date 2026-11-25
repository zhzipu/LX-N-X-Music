/**
 * 底部 Tabs 液态玻璃参数。
 *
 * 字段、顺序、取值范围都对齐 KMP 项目的 StudioState / InspectorPanel：
 *  - Liquid bottom tabs
 *  - Shape
 *  - Effects
 *  - Highlight
 *  - Outer shadow
 *  - Inner shadow
 *  - Preview background
 *
 * 修改后立即作用到原生 LiquidGlassView，并持久化到 AsyncStorage。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

export type GlassTabsShape = 'capsule' | 'rounded'
export type GlassHighlightKind = 'default' | 'ambient' | 'plain'
export type GlassBlendMode = 'normal' | 'plus' | 'screen' | 'multiply'
export type GlassTileMode = 'clamp' | 'decal' | 'repeat' | 'mirror'
export type GlassPreviewBackground = 'wallpaper' | 'aurora' | 'checker' | 'solid'

export interface GlassTabsParams {
  // Liquid bottom tabs
  tabsSelectedIndex: number
  tabsAccentColor: string
  containerColor: string
  containerAlpha: number

  // Shape
  shape: GlassTabsShape
  cornerRadius: number

  // Effects
  vibrancy: boolean
  colorControlsEnabled: boolean
  brightness: number
  contrast: number
  saturation: number
  blurEnabled: boolean
  blurRadius: number
  blurTileMode: GlassTileMode
  refractionHeight: number
  refractionAmount: number
  depthEffect: boolean
  chromaticAberration: boolean
  opacity: number

  // Highlight
  highlightEnabled: boolean
  highlightKind: GlassHighlightKind
  highlightColor: string
  highlightWidth: number
  highlightBlur: number
  highlightAlpha: number
  highlightAngle: number
  highlightFalloff: number
  highlightIntensity: number

  // Outer shadow
  shadowEnabled: boolean
  shadowRadius: number
  shadowOffsetX: number
  shadowOffsetY: number
  shadowAlpha: number
  shadowColor: string
  shadowBlendMode: GlassBlendMode

  // Inner shadow
  innerShadowEnabled: boolean
  innerShadowRadius: number
  innerShadowOffsetX: number
  innerShadowOffsetY: number
  innerShadowAlpha: number
  innerShadowColor: string
  innerShadowBlendMode: GlassBlendMode

  // Preview background
  previewBackground: GlassPreviewBackground

  // 选中胶囊（KMP 内部固定行为；保留可调，但不属于 Studio 的公开字段）
  pillAlpha: number
  pillLensEnabled: boolean
  pillLensHeight: number
  pillLensAmount: number
  pillLensChromatic: boolean
}

/** 2026-11-18 用户当前底栏配置；首次使用与恢复默认共用。 */
export const DEFAULT_GLASS_TABS_PARAMS: GlassTabsParams = {
  tabsSelectedIndex: 0,
  tabsAccentColor: '#FFFFFF',
  containerColor: '#0A0A0A',
  containerAlpha: 0.4,

  shape: 'capsule',
  cornerRadius: 24,

  vibrancy: true,
  colorControlsEnabled: false,
  brightness: 0,
  contrast: 1,
  saturation: 1.5,
  blurEnabled: true,
  blurRadius: 10,
  blurTileMode: 'clamp',
  refractionHeight: 20,
  refractionAmount: 28,
  depthEffect: true,
  chromaticAberration: false,
  opacity: 1,

  highlightEnabled: true,
  highlightKind: 'default',
  highlightColor: '#FFFFFF',
  highlightWidth: 0.5,
  highlightBlur: 0.25,
  highlightAlpha: 1,
  highlightAngle: 45,
  highlightFalloff: 1,
  highlightIntensity: 0.38,

  shadowEnabled: true,
  shadowRadius: 16,
  shadowOffsetX: 0,
  shadowOffsetY: 3,
  shadowAlpha: 0.35,
  shadowColor: '#000000',
  shadowBlendMode: 'normal',

  innerShadowEnabled: false,
  innerShadowRadius: 8,
  innerShadowOffsetX: 0,
  innerShadowOffsetY: 8,
  innerShadowAlpha: 0.25,
  innerShadowColor: '#000000',
  innerShadowBlendMode: 'normal',

  previewBackground: 'aurora',

  pillAlpha: 0.1,
  pillLensEnabled: true,
  pillLensHeight: 10,
  pillLensAmount: 14,
  pillLensChromatic: true,
}

const STORAGE_KEY = 'lxnx.glassTabsParams.v4'

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(Number.isFinite(value) ? value : min, min), max)

const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

const enumOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T => (allowed.includes(value as T) ? (value as T) : fallback)

/** 合并旧版/缺字段的存储值，避免升级后 NaN 或 undefined 传给原生 */
export const normalizeGlassTabsParams = (raw: unknown): GlassTabsParams => {
  const source = raw && typeof raw === 'object' ? (raw as Partial<GlassTabsParams>) : {}
  const d = DEFAULT_GLASS_TABS_PARAMS
  return {
    tabsSelectedIndex: Math.round(
      clamp(source.tabsSelectedIndex ?? d.tabsSelectedIndex, 0, 3),
    ),
    tabsAccentColor: isHexColor(source.tabsAccentColor)
      ? source.tabsAccentColor
      : d.tabsAccentColor,
    containerColor: isHexColor(source.containerColor) ? source.containerColor : d.containerColor,
    containerAlpha: clamp(source.containerAlpha ?? d.containerAlpha, 0, 1),

    shape: source.shape === 'rounded' ? 'rounded' : 'capsule',
    cornerRadius: clamp(source.cornerRadius ?? d.cornerRadius, 0, 80),

    vibrancy: source.vibrancy ?? d.vibrancy,
    colorControlsEnabled: source.colorControlsEnabled ?? d.colorControlsEnabled,
    brightness: clamp(source.brightness ?? d.brightness, -1, 1),
    contrast: clamp(source.contrast ?? d.contrast, 0, 2),
    saturation: clamp(source.saturation ?? d.saturation, 0, 3),
    blurEnabled: source.blurEnabled ?? d.blurEnabled,
    blurRadius: clamp(source.blurRadius ?? d.blurRadius, 0, 48),
    blurTileMode: enumOf(source.blurTileMode, ['clamp', 'decal', 'repeat', 'mirror'] as const, d.blurTileMode),
    refractionHeight: clamp(source.refractionHeight ?? d.refractionHeight, 0, 48),
    refractionAmount: clamp(source.refractionAmount ?? d.refractionAmount, 0, 64),
    depthEffect: source.depthEffect ?? d.depthEffect,
    chromaticAberration: source.chromaticAberration ?? d.chromaticAberration,
    opacity: clamp(source.opacity ?? d.opacity, 0, 1),

    highlightEnabled: source.highlightEnabled ?? d.highlightEnabled,
    highlightKind: enumOf(source.highlightKind, ['default', 'ambient', 'plain'] as const, d.highlightKind),
    highlightColor: isHexColor(source.highlightColor) ? source.highlightColor : d.highlightColor,
    highlightWidth: clamp(source.highlightWidth ?? d.highlightWidth, 0, 4),
    highlightBlur: clamp(source.highlightBlur ?? d.highlightBlur, 0, 8),
    highlightAlpha: clamp(source.highlightAlpha ?? d.highlightAlpha, 0, 1),
    highlightAngle: clamp(source.highlightAngle ?? d.highlightAngle, 0, 360),
    highlightFalloff: clamp(source.highlightFalloff ?? d.highlightFalloff, 0, 4),
    highlightIntensity: clamp(source.highlightIntensity ?? d.highlightIntensity, 0, 1),

    shadowEnabled: source.shadowEnabled ?? d.shadowEnabled,
    shadowRadius: clamp(source.shadowRadius ?? d.shadowRadius, 0, 64),
    shadowOffsetX: clamp(source.shadowOffsetX ?? d.shadowOffsetX, -32, 32),
    shadowOffsetY: clamp(source.shadowOffsetY ?? d.shadowOffsetY, -32, 32),
    shadowAlpha: clamp(source.shadowAlpha ?? d.shadowAlpha, 0, 1),
    shadowColor: isHexColor(source.shadowColor) ? source.shadowColor : d.shadowColor,
    shadowBlendMode: enumOf(source.shadowBlendMode, ['normal', 'plus', 'screen', 'multiply'] as const, d.shadowBlendMode),

    innerShadowEnabled: source.innerShadowEnabled ?? d.innerShadowEnabled,
    innerShadowRadius: clamp(source.innerShadowRadius ?? d.innerShadowRadius, 0, 64),
    innerShadowOffsetX: clamp(source.innerShadowOffsetX ?? d.innerShadowOffsetX, -32, 32),
    innerShadowOffsetY: clamp(source.innerShadowOffsetY ?? d.innerShadowOffsetY, -32, 32),
    innerShadowAlpha: clamp(source.innerShadowAlpha ?? d.innerShadowAlpha, 0, 1),
    innerShadowColor: isHexColor(source.innerShadowColor) ? source.innerShadowColor : d.innerShadowColor,
    innerShadowBlendMode: enumOf(source.innerShadowBlendMode, ['normal', 'plus', 'screen', 'multiply'] as const, d.innerShadowBlendMode),

    previewBackground: enumOf(source.previewBackground, ['wallpaper', 'aurora', 'checker', 'solid'] as const, d.previewBackground),

    pillAlpha: clamp(source.pillAlpha ?? d.pillAlpha, 0, 1),
    pillLensEnabled: source.pillLensEnabled ?? d.pillLensEnabled,
    pillLensHeight: clamp(source.pillLensHeight ?? d.pillLensHeight, 0, 32),
    pillLensAmount: clamp(source.pillLensAmount ?? d.pillLensAmount, 0, 40),
    pillLensChromatic: source.pillLensChromatic ?? d.pillLensChromatic,
  }
}

export const loadGlassTabsParams = async (): Promise<GlassTabsParams> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_GLASS_TABS_PARAMS
    return normalizeGlassTabsParams(JSON.parse(raw))
  } catch {
    return DEFAULT_GLASS_TABS_PARAMS
  }
}

export const saveGlassTabsParams = async (params: GlassTabsParams): Promise<void> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(params))
  } catch {
    // 持久化失败不影响当前预览
  }
}

/** #RRGGBB + alpha → rgba()，供 RN 样式和原生颜色解析共用 */
export const hexToRgba = (hex: string, alpha: number): string => {
  const value = isHexColor(hex) ? hex : '#FFFFFF'
  const r = parseInt(value.slice(1, 3), 16)
  const g = parseInt(value.slice(3, 5), 16)
  const b = parseInt(value.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(4)})`
}
