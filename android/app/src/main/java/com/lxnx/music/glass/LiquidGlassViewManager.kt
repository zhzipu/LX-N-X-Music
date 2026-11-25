package com.lxnx.music.glass

import android.graphics.Color
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp
import kotlin.math.roundToInt

/**
 * Bridges [LiquidGlassView] to React Native.
 *
 * JS side: `requireNativeComponent('LiquidGlassView')`.
 */
class LiquidGlassViewManager : SimpleViewManager<LiquidGlassView>() {

    override fun getName(): String = NAME

    override fun createViewInstance(context: ThemedReactContext): LiquidGlassView =
        LiquidGlassView(context)

    /** Corner radius of the glass shape, in dp. */
    @ReactProp(name = "borderRadius")
    fun setBorderRadius(view: LiquidGlassView, borderRadius: Int) {
        view.setBorderRadiusDp(borderRadius.toFloat())
    }

    /** Strength of the glass effect, 0..1. */
    @ReactProp(name = "glassAmount", defaultFloat = 0.5f)
    fun setGlassAmount(view: LiquidGlassView, glassAmount: Float) {
        view.setGlassAmount(glassAmount)
    }

    /** Tint colour of the glass; 支持 `#RGB` / `#RRGGBB` / `#AARRGGBB` / `rgb()` / `rgba()`。 */
    @ReactProp(name = "tintColor")
    fun setTintColor(view: LiquidGlassView, tintColor: String?) {
        view.setTintColor(parseColor(tintColor, Color.WHITE))
    }

    /** Specular highlight colour; 颜色格式同 `tintColor`。 */
    @ReactProp(name = "highlightColor")
    fun setHighlightColor(view: LiquidGlassView, highlightColor: String?) {
        view.setHighlightColor(parseColor(highlightColor, Color.WHITE))
    }

    /** 高光样式：ambient = Studio 的 Ambient（固定宽度 + 模糊），其它 = 默认方向性高光。 */
    @ReactProp(name = "highlightStyle")
    fun setHighlightStyle(view: LiquidGlassView, style: String?) {
        view.setHighlightStyle(style)
    }

    @ReactProp(name = "highlightWidth", defaultFloat = -1f)
    fun setHighlightWidth(view: LiquidGlassView, width: Float) {
        view.setHighlightWidthDp(width)
    }

    @ReactProp(name = "highlightBlurRadius", defaultFloat = -1f)
    fun setHighlightBlurRadius(view: LiquidGlassView, blur: Float) {
        view.setHighlightBlurDp(blur)
    }

    @ReactProp(name = "highlightAlpha", defaultFloat = 1f)
    fun setHighlightAlpha(view: LiquidGlassView, alpha: Float) {
        view.setHighlightAlpha(alpha)
    }

    @ReactProp(name = "highlightIntensity", defaultFloat = 1f)
    fun setHighlightIntensity(view: LiquidGlassView, intensity: Float) {
        view.setHighlightIntensity(intensity)
    }

    @ReactProp(name = "highlightAngle", defaultFloat = 45f)
    fun setHighlightAngle(view: LiquidGlassView, angle: Float) {
        view.setHighlightAngle(angle)
    }

    @ReactProp(name = "highlightFalloff", defaultFloat = 1f)
    fun setHighlightFalloff(view: LiquidGlassView, falloff: Float) {
        view.setHighlightFalloff(falloff)
    }

    @ReactProp(name = "vibrancy", defaultBoolean = true)
    fun setVibrancy(view: LiquidGlassView, enabled: Boolean) {
        view.setVibrancy(enabled)
    }

    @ReactProp(name = "blurTileMode")
    fun setBlurTileMode(view: LiquidGlassView, mode: String?) {
        view.setBlurTileMode(mode)
    }

    @ReactProp(name = "shadowRadius", defaultFloat = -1f)
    fun setShadowRadius(view: LiquidGlassView, radius: Float) {
        view.setShadowRadiusDp(radius)
    }

    @ReactProp(name = "shadowOffsetX", defaultFloat = 0f)
    fun setShadowOffsetX(view: LiquidGlassView, offsetX: Float) {
        view.setShadowOffsetXDp(offsetX)
    }

    @ReactProp(name = "shadowOffsetY", defaultFloat = 0f)
    fun setShadowOffsetY(view: LiquidGlassView, offsetY: Float) {
        view.setShadowOffsetYDp(offsetY)
    }

    @ReactProp(name = "shadowColor")
    fun setShadowColor(view: LiquidGlassView, color: String?) {
        view.setShadowColor(parseColor(color, Color.BLACK))
    }

    @ReactProp(name = "shadowAlpha", defaultFloat = 1f)
    fun setShadowAlpha(view: LiquidGlassView, alpha: Float) {
        view.setShadowAlpha(alpha)
    }

    @ReactProp(name = "shadowBlendMode")
    fun setShadowBlendMode(view: LiquidGlassView, mode: String?) {
        view.setShadowBlendMode(mode)
    }

    @ReactProp(name = "innerShadowEnabled", defaultBoolean = false)
    fun setInnerShadowEnabled(view: LiquidGlassView, enabled: Boolean) {
        // innerShadowRadius=0 时已经关闭；这里只接收 prop，避免 RN 的未知属性告警。
    }

    @ReactProp(name = "innerShadowRadius", defaultFloat = -1f)
    fun setInnerShadowRadius(view: LiquidGlassView, radius: Float) {
        view.setInnerShadowRadiusDp(radius)
    }

    @ReactProp(name = "innerShadowOffsetX", defaultFloat = 0f)
    fun setInnerShadowOffsetX(view: LiquidGlassView, offsetX: Float) {
        view.setInnerShadowOffsetXDp(offsetX)
    }

    @ReactProp(name = "innerShadowOffsetY", defaultFloat = 0f)
    fun setInnerShadowOffsetY(view: LiquidGlassView, offsetY: Float) {
        view.setInnerShadowOffsetYDp(offsetY)
    }

    @ReactProp(name = "innerShadowAlpha", defaultFloat = 1f)
    fun setInnerShadowAlpha(view: LiquidGlassView, alpha: Float) {
        view.setInnerShadowAlpha(alpha)
    }

    @ReactProp(name = "innerShadowColor")
    fun setInnerShadowColor(view: LiquidGlassView, color: String?) {
        view.setInnerShadowColor(parseColor(color, Color.BLACK))
    }

    @ReactProp(name = "innerShadowBlendMode")
    fun setInnerShadowBlendMode(view: LiquidGlassView, mode: String?) {
        view.setInnerShadowBlendMode(mode)
    }

    /** Background image URL used as the refraction source; may be empty. */
    @ReactProp(name = "srcUri")
    fun setSrcUri(view: LiquidGlassView, srcUri: String?) {
        view.setSrcUri(srcUri)
    }

    /** 折射带宽（dp）。-1 / 不传 = 用默认 REFRACTION_DP × glassAmount。 */
    @ReactProp(name = "refractionHeight", defaultFloat = -1f)
    fun setRefractionHeight(view: LiquidGlassView, refractionHeight: Float) {
        view.setRefractionHeightDp(refractionHeight)
    }

    /** 折射位移量（dp）。-1 / 不传 = 用默认值。 */
    @ReactProp(name = "refractionAmount", defaultFloat = -1f)
    fun setRefractionAmount(view: LiquidGlassView, refractionAmount: Float) {
        view.setRefractionAmountDp(refractionAmount)
    }

    /** 模糊半径（dp）。-1 / 不传 = 用默认 BLUR_RADIUS_DP。 */
    @ReactProp(name = "blurRadius", defaultFloat = -1f)
    fun setBlurRadius(view: LiquidGlassView, blurRadius: Float) {
        view.setBlurRadiusDp(blurRadius)
    }

    /** 是否启用上游 lens 的 depthEffect（折射方向朝中心拉）。 */
    @ReactProp(name = "depthEffect", defaultBoolean = true)
    fun setDepthEffect(view: LiquidGlassView, depthEffect: Boolean) {
        view.setDepthEffect(depthEffect)
    }

    /** 是否使用带色散的折射着色器（上游 chromaticAberration）。 */
    @ReactProp(name = "chromaticAberration", defaultBoolean = true)
    fun setChromaticAberration(view: LiquidGlassView, chromaticAberration: Boolean) {
        view.setChromaticAberration(chromaticAberration)
    }

    /** 上游 colorControls：亮度/对比度/饱和度；enabled=false 时保持旧行为。 */
    @ReactProp(name = "colorControlsEnabled", defaultBoolean = false)
    fun setColorControlsEnabled(view: LiquidGlassView, enabled: Boolean) {
        view.setColorControls(enabled, view.colorBrightnessForProps, view.colorContrastForProps, view.colorSaturationForProps)
    }

    @ReactProp(name = "brightness", defaultFloat = 0f)
    fun setBrightness(view: LiquidGlassView, brightness: Float) {
        view.setColorControls(view.colorControlsEnabledForProps, brightness, view.colorContrastForProps, view.colorSaturationForProps)
    }

    @ReactProp(name = "contrast", defaultFloat = 1f)
    fun setContrast(view: LiquidGlassView, contrast: Float) {
        view.setColorControls(view.colorControlsEnabledForProps, view.colorBrightnessForProps, contrast, view.colorSaturationForProps)
    }

    @ReactProp(name = "saturation", defaultFloat = 1f)
    fun setSaturation(view: LiquidGlassView, saturation: Float) {
        view.setColorControls(view.colorControlsEnabledForProps, view.colorBrightnessForProps, view.colorContrastForProps, saturation)
    }

    /** 上游 opacity(alpha)：只影响玻璃采样层。 */
    @ReactProp(name = "opacity", defaultFloat = 1f)
    fun setGlassOpacityProp(view: LiquidGlassView, opacity: Float) {
        view.setGlassOpacity(opacity)
    }

    /**
     * 解析 RN 传过来的颜色。
     *
     * 设计令牌里用的是 CSS 写法（`rgba(0, 0, 0, 0.28)`、`rgba(255, 255, 255, 0.42)`），
     * 而 [Color.parseColor] 只认 `#RGB` / `#RRGGBB` / `#AARRGGBB` 和少量颜色名，
     * 直接交给它会抛 IllegalArgumentException 并回退成不透明白色——玻璃就成了一块白板：
     * tint 变成 55% 不透明白、高光描边变成纯白粗边。所以这里先自己解析 rgb()/rgba()。
     */
    private fun parseColor(value: String?, fallback: Int): Int {
        if (value.isNullOrEmpty()) return fallback
        val text = value.trim()
        if (text.isEmpty()) return fallback
        if (text.equals("transparent", ignoreCase = true)) return Color.TRANSPARENT

        CSS_RGB.matchEntire(text)?.let { match ->
            val r = match.groupValues[1].toFloatOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@let
            val g = match.groupValues[2].toFloatOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@let
            val b = match.groupValues[3].toFloatOrNull()?.roundToInt()?.coerceIn(0, 255) ?: return@let
            val alphaText = match.groupValues[4]
            // CSS 的 alpha 是 0..1；也接受有人直接写 0..255。
            val alpha = if (alphaText.isEmpty()) {
                255
            } else {
                val a = alphaText.toFloatOrNull() ?: 1f
                (if (a <= 1f) a * 255f else a).roundToInt().coerceIn(0, 255)
            }
            return Color.argb(alpha, r, g, b)
        }

        return try {
            Color.parseColor(text)
        } catch (e: IllegalArgumentException) {
            fallback
        }
    }

    companion object {
        const val NAME = "LiquidGlassView"

        /** 匹配 `rgb(r, g, b)` / `rgba(r, g, b, a)`，分量允许小数。 */
        private val CSS_RGB = Regex(
            "rgba?\\s*\\(\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*,\\s*([0-9.]+)\\s*(?:,\\s*([0-9.]+)\\s*)?\\)",
            RegexOption.IGNORE_CASE
        )
    }
}
