import { hexToRgba, type GlassTabsParams } from './glassTabsParams'
import type { GlassSurfaceProps } from './GlassSurface'

/** Shared by the inspector preview and every configured standalone surface. */
export function glassSurfaceParams(p: GlassTabsParams, capsuleRadius: number): GlassSurfaceProps {
  return {
    borderRadius: p.shape === 'capsule' ? capsuleRadius : p.cornerRadius,
    glassAmount: 0.55,
    tintColor: hexToRgba(p.containerColor, p.containerAlpha),
    blurRadius: p.blurEnabled ? p.blurRadius : 0,
    blurTileMode: p.blurTileMode,
    refractionHeight: p.refractionHeight, refractionAmount: p.refractionAmount,
    depthEffect: p.depthEffect, chromaticAberration: p.chromaticAberration,
    vibrancy: p.vibrancy, colorControlsEnabled: p.colorControlsEnabled,
    brightness: p.brightness, contrast: p.contrast, saturation: p.saturation, opacity: p.opacity,
    highlightStyle: p.highlightKind,
    highlightColor: p.highlightColor,
    highlightWidth: p.highlightWidth, highlightBlurRadius: p.highlightBlur,
    highlightAlpha: p.highlightEnabled && p.highlightWidth > 0 ? p.highlightAlpha : 0,
    highlightIntensity: p.highlightIntensity, highlightAngle: p.highlightAngle, highlightFalloff: p.highlightFalloff,
    shadowRadius: p.shadowEnabled ? p.shadowRadius : 0,
    shadowOffsetX: p.shadowOffsetX, shadowOffsetY: p.shadowOffsetY,
    shadowColor: p.shadowColor, shadowAlpha: p.shadowEnabled ? p.shadowAlpha : 0, shadowBlendMode: p.shadowBlendMode,
    innerShadowEnabled: p.innerShadowEnabled,
    innerShadowRadius: p.innerShadowRadius, innerShadowOffsetX: p.innerShadowOffsetX, innerShadowOffsetY: p.innerShadowOffsetY,
    innerShadowColor: p.innerShadowColor, innerShadowAlpha: p.innerShadowAlpha, innerShadowBlendMode: p.innerShadowBlendMode,
  }
}
