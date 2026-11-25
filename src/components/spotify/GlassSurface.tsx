/**
 * 液态玻璃表面（渐进增强版）。
 *
 * 优先使用原生 `LiquidGlassView`（Kotlin + RuntimeShader，API 33+ 才有真折射）；
 * 以下情况自动降级为 RN 侧绘制的伪玻璃：
 *  - 非安卓平台
 *  - 原生组件未注册（原生模块还没接入 / 构建失败）
 *  - 系统版本低于 API 33（RuntimeShader 不可用）
 *
 * 降级路径用的是与原生同一套视觉语言：半透明填充 + 上亮下暗描边 + 深色 tint，
 * 所以在老设备上观感不会突变，只是少了折射与色散。
 */

import { memo, useMemo, type ReactNode } from 'react'
import { Platform, StyleSheet, View, requireNativeComponent, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import type { GlassBlendMode, GlassTileMode } from './glassTabsParams'

/** RuntimeShader 从 Android 13（API 33）开始提供 */
export const RUNTIME_SHADER_MIN_API = 33

interface NativeGlassProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  borderRadius: number
  glassAmount: number
  tintColor: string
  highlightColor: string
  highlightStyle?: 'ambient' | 'default' | 'plain'
  highlightWidth?: number
  highlightBlurRadius?: number
  highlightAlpha?: number
  highlightIntensity?: number
  highlightAngle?: number
  highlightFalloff?: number
  shadowRadius?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowColor?: string
  shadowAlpha?: number
  shadowBlendMode?: GlassBlendMode
  blurTileMode?: GlassTileMode
  vibrancy?: boolean
  innerShadowEnabled?: boolean
  innerShadowRadius?: number
  innerShadowOffsetX?: number
  innerShadowOffsetY?: number
  innerShadowAlpha?: number
  innerShadowColor?: string
  innerShadowBlendMode?: GlassBlendMode
  srcUri?: string
  /** 折射带宽（dp），不传走原生默认 */
  refractionHeight?: number
  /** 折射位移量（dp） */
  refractionAmount?: number
  /** 模糊半径（dp） */
  blurRadius?: number
  /** 是否启用折射的 depthEffect（上游 lens(depthEffect)） */
  depthEffect?: boolean
  /** 是否启用色散（上游 lens(chromaticAberration)） */
  chromaticAberration?: boolean
  /** 上游 colorControls：亮度/对比度/饱和度 */
  colorControlsEnabled?: boolean
  brightness?: number
  contrast?: number
  saturation?: number
  /** 上游 opacity：只影响玻璃采样层 */
  opacity?: number
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
}

/** 原生组件不存在时 requireNativeComponent 会抛错，这里做一次性探测而不是每次渲染都试 */
let nativeGlass: React.ComponentType<NativeGlassProps> | null = null
let nativeGlassProbed = false

const probeNativeGlass = (): React.ComponentType<NativeGlassProps> | null => {
  if (nativeGlassProbed) return nativeGlass
  nativeGlassProbed = true
  if (Platform.OS !== 'android') return null
  try {
    nativeGlass = requireNativeComponent<NativeGlassProps>('LiquidGlassView')
  } catch {
    // 原生模块未注册时降级，不影响其它功能
    nativeGlass = null
  }
  return nativeGlass
}

/** 当前设备是否具备跑真液态玻璃的条件 */
export const canUseRuntimeGlass = () => {
  if (Platform.OS !== 'android') return false
  return typeof Platform.Version === 'number' && Platform.Version >= RUNTIME_SHADER_MIN_API
}

export interface GlassSurfaceProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  /** 圆角（dp），未指定时用令牌默认值 */
  borderRadius?: number
  /** 玻璃强度 0~1，越大越通透 */
  glassAmount?: number
  /** 背景图 URL；原生折射需要真实背景才能算折射位移 */
  srcUri?: string
  /** 折射带宽（dp）：越大，边缘「弯曲」的区域越宽 */
  refractionHeight?: number
  /** 折射位移量（dp）：越大，边缘内容被推得越狠 */
  refractionAmount?: number
  /** 模糊半径（dp）：折射要看得见，模糊得压小 */
  blurRadius?: number
  /** 是否启用折射的 depthEffect；默认沿用原生 true */
  depthEffect?: boolean
  /** 是否启用色散；默认沿用原生 true */
  chromaticAberration?: boolean
  /** 上游 colorControls（亮度/对比度/饱和度）；默认关闭 */
  colorControlsEnabled?: boolean
  brightness?: number
  contrast?: number
  saturation?: number
  /** 上游 opacity；默认沿用原生 1 */
  opacity?: number
  /** 玻璃 tint 覆盖值；默认用主题玻璃 tint */
  tintColor?: string
  /** 原生高光描边颜色；默认用主题玻璃描边，传 transparent 可关闭 */
  highlightColor?: string
  /** 高光样式：ambient = Studio Ambient（固定宽度 + 模糊描边） */
  highlightStyle?: 'ambient' | 'default' | 'plain'
  /** 高光宽度（dp） */
  highlightWidth?: number
  /** 高光模糊（dp） */
  highlightBlurRadius?: number
  highlightAlpha?: number
  highlightIntensity?: number
  highlightAngle?: number
  highlightFalloff?: number
  /** Studio Shadow */
  shadowRadius?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
  shadowColor?: string
  shadowAlpha?: number
  shadowBlendMode?: GlassBlendMode
  blurTileMode?: GlassTileMode
  vibrancy?: boolean
  innerShadowEnabled?: boolean
  innerShadowRadius?: number
  innerShadowOffsetX?: number
  innerShadowOffsetY?: number
  innerShadowAlpha?: number
  innerShadowColor?: string
  innerShadowBlendMode?: GlassBlendMode
  /** 强制使用降级实现（便于对比调试） */
  forceFallback?: boolean
  /** 透传触摸拦截；玻璃层通常要 pointerEvents="none" 让下层可点 */
  pointerEvents?: 'none' | 'auto' | 'box-none' | 'box-only'
}

const GlassSurface = memo(({
  children,
  style,
  borderRadius,
  glassAmount = 0.5,
  srcUri,
  refractionHeight,
  refractionAmount,
  blurRadius,
  depthEffect,
  chromaticAberration,
  colorControlsEnabled,
  brightness,
  contrast,
  saturation,
  opacity,
  tintColor,
  highlightColor,
  highlightStyle,
  highlightWidth,
  highlightBlurRadius,
  highlightAlpha,
  highlightIntensity,
  highlightAngle,
  highlightFalloff,
  shadowRadius,
  shadowOffsetX,
  shadowOffsetY,
  shadowColor,
  shadowAlpha,
  shadowBlendMode,
  blurTileMode,
  vibrancy,
  innerShadowEnabled,
  innerShadowRadius,
  innerShadowOffsetX,
  innerShadowOffsetY,
  innerShadowAlpha,
  innerShadowColor,
  innerShadowBlendMode,
  forceFallback = false,
  pointerEvents,
}: GlassSurfaceProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const Native = forceFallback ? null : probeNativeGlass()
  const useNative = !!Native && canUseRuntimeGlass()

  const radius = borderRadius ?? sp.glass.radius

  const nativeStyle = useMemo(() => [
    style,
    {
      borderRadius: radius,
      // 边框宽度交给原生绘制，这里给 0 避免 RN 再画一层
      borderWidth: 0,
    },
  ], [style, radius])

  if (useNative) {
    return (
      <Native
        style={nativeStyle as StyleProp<ViewStyle>}
        borderRadius={radius}
        glassAmount={glassAmount}
        tintColor={tintColor ?? sp.glass.tint}
        highlightColor={highlightColor ?? sp.glass.strokeTop}
        highlightStyle={highlightStyle}
        highlightWidth={highlightWidth}
        highlightBlurRadius={highlightBlurRadius}
        highlightAlpha={highlightAlpha}
        highlightIntensity={highlightIntensity}
        highlightAngle={highlightAngle}
        highlightFalloff={highlightFalloff}
        shadowRadius={shadowRadius}
        shadowOffsetX={shadowOffsetX}
        shadowOffsetY={shadowOffsetY}
        shadowColor={shadowColor}
        shadowAlpha={shadowAlpha}
        shadowBlendMode={shadowBlendMode}
        blurTileMode={blurTileMode}
        vibrancy={vibrancy}
        innerShadowEnabled={innerShadowEnabled}
        innerShadowRadius={innerShadowRadius}
        innerShadowOffsetX={innerShadowOffsetX}
        innerShadowOffsetY={innerShadowOffsetY}
        innerShadowAlpha={innerShadowAlpha}
        innerShadowColor={innerShadowColor}
        innerShadowBlendMode={innerShadowBlendMode}
        srcUri={srcUri}
        refractionHeight={refractionHeight}
        refractionAmount={refractionAmount}
        blurRadius={blurRadius}
        depthEffect={depthEffect}
        chromaticAberration={chromaticAberration}
        colorControlsEnabled={colorControlsEnabled}
        brightness={brightness}
        contrast={contrast}
        saturation={saturation}
        opacity={opacity}
        pointerEvents={pointerEvents}
      >
        {children}
      </Native>
    )
  }

  // 降级：纯 RN 玻璃
  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        {
          borderRadius: radius,
          backgroundColor: tintColor ?? sp.glass.fill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: highlightAlpha === 0 ? 'transparent' : highlightColor ?? sp.glass.stroke,
          borderTopColor: highlightAlpha === 0 ? 'transparent' : highlightColor ?? sp.glass.strokeTop,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {tintColor === undefined ? <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: sp.glass.tint }]}
      /> : null}
      {children}
    </View>
  )
})

export default memo(GlassSurface)
