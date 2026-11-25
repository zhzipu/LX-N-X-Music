package com.lxnx.music.glass

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.RuntimeShader
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.LruCache
import android.view.View
import android.view.ViewParent
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

/**
 * 真实背景液态玻璃（纯 Android View，无 Compose）。
 *
 * 渲染流程（API 29+ 且找到 [GlassBackdropHost] 时）：
 *  1. 宿主把「除玻璃以外的整棵界面」录进一个 RenderNode，并直接把它当背景上屏；
 *  2. 宿主随后把本 View 的 [drawOnBackdrop] 补画到背景之上（本 View 自己的显示列表
 *     保持为空，否则会和背景节点形成 RenderNode 引用环，见 [GlassBackdropHost] 的注释）；
 *  3. 本 View 计算 `本 View 窗口坐标 - 宿主窗口坐标` 的偏移 `dx/dy`，在自己的
 *     [glassNode] 里把宿主的背景节点平移 `-dx/-dy` 后画下来——这样玻璃区域里的
 *     背景像素就和屏幕上本 View 底下看到的一致；
 *  4. 节点四周留 `pad` 的余量（模糊半径 / 折射高度），给模糊和折射提供取样来源；
 *  5. 挂 RenderEffect 链：模糊在内、AGSL 折射在外（API 33+）；
 *  6. 裁剪到圆角矩形后画节点，再叠 tint、描边高光。
 *
 * 降级顺序（每一级都不能崩）：
 *  - 找不到宿主 / API < 29 / 没有 RenderNode：半透明 tint + 位图兜底 + 1dp 上亮下暗描边；
 *  - API < 31：不挂任何 RenderEffect（背景是清晰的，只有 tint 和描边）；
 *  - API < 33：不挂 AGSL 折射与 AGSL 高光，高光换成 LinearGradient 描边；
 *  - 任何一次 AGSL / RenderEffect 构造抛异常：把 [GlassCapabilities] 里对应开关永久置 false。
 *
 * 折射 / 高光的 AGSL 源码来自 io.github.kyant0:backdrop（Apache-2.0，见
 * [GlassShaderLib]），视觉参数对齐上游实现。
 */
class LiquidGlassView(context: Context) : View(context), GlassSampler {

    // Tabs uses the upstream optical constants. Keep existing standalone surfaces compatible.
    internal var matchReferenceOptics = false
    private var ambientShader: RuntimeShader? = null
    private var referenceHighlightNode: RenderNode? = null
    private var referenceShadowNode: RenderNode? = null
    private var samplingScaleX = 1f
    private var samplingScaleY = 1f
    private var frostNode: RenderNode? = null
    private var frostBlurPx = -1f
    private val frostStroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }

    // The proxy is an independent display list owned by the compositor, never a child
    // of the sampled backdrop. Text, artwork and hit targets keep their original views.
    internal fun drawFrost(canvas: Canvas, backdrop: RenderNode, w: Int, h: Int, x: Float, y: Float) {
        val radius = radiusPx().coerceAtMost(min(w, h) / 2f)
        val blur = (blurRadiusDp ?: BLUR_RADIUS_DP).coerceIn(4f, 24f) * resources.displayMetrics.density
        val pad = ceil(blur * 2f).toInt()
        val node = frostNode ?: RenderNode("dock-frost").also { frostNode = it }
        node.setPosition(-pad, -pad, w + pad, h + pad)
        val recording = node.beginRecording()
        try {
            recording.translate(pad - x, pad - y)
            recording.drawRenderNode(backdrop)
        } finally {
            node.endRecording()
        }
        if (Build.VERSION.SDK_INT >= 31 && blur != frostBlurPx) {
            node.setRenderEffect(RenderEffect.createBlurEffect(blur, blur, Shader.TileMode.CLAMP))
            frostBlurPx = blur
        }
        node.alpha = glassOpacity
        buildShapePath(w, h, radius)
        drawOuterShadow(canvas, w, h, radius)
        val save = canvas.save()
        canvas.clipPath(shapePath)
        canvas.drawRenderNode(node)
        canvas.restoreToCount(save)
        drawTint(canvas, w, h, radius, glassAmount)
        val strokeWidth = (highlightWidthDp ?: 1f) * resources.displayMetrics.density
        if (strokeWidth > 0f && highlightAlpha > 0f) {
            frostStroke.strokeWidth = strokeWidth
            frostStroke.color = highlightColor
            frostStroke.alpha = (Color.alpha(highlightColor) * highlightAlpha *
                if (matchReferenceOptics) highlightIntensity else 1f).toInt().coerceIn(0, 255)
            val inset = strokeWidth / 2f
            canvas.drawRoundRect(inset, inset, w - inset, h - inset,
                (radius - inset).coerceAtLeast(0f), (radius - inset).coerceAtLeast(0f), frostStroke)
        }
    }

    /** Render into a caller-owned layer without attaching this helper View to the RN tree. */
    internal fun renderSurface(canvas: Canvas, backdrop: RenderNode?, w: Int, h: Int, x: Float, y: Float, scaleX: Float = 1f, scaleY: Float = 1f) {
        if (w <= 0 || h <= 0) return
        samplingScaleX = scaleX
        samplingScaleY = scaleY
        if (backdrop != null && Build.VERSION.SDK_INT >= 29 && canvas.isHardwareAccelerated) {
            drawSampledGlass(canvas, backdrop, w, h, x, y)
        } else {
            drawFallback(canvas, w, h)
        }
    }

    companion object {
        private const val TAG = "LiquidGlassView"

        /** 背景模糊半径（dp）。它同时是 padding 的基准：pad 至少要盖住模糊半径。 */
        private const val BLUR_RADIUS_DP = 8f

    /** 诊断开关：打印玻璃实际走的绘制路径（仅调试时打开） */
    private const val DEBUG_PATH = false

        /** 折射带宽度 / 边缘位移量（dp），再乘以 glassAmount。 */
        private const val REFRACTION_DP = 24f

        /** 色散强度（乘以 glassAmount）。着色器里要采样 7 次，性能很贵，默认保持很小。 */
        private const val CHROMATIC_ABERRATION = 0.15f

        /** 折射方向额外朝中心拉一点，模拟透镜厚度。 */
        private const val DEPTH_EFFECT = 0.25f

        /** 高光光照方向：45°，单位弧度。 */
        private const val HIGHLIGHT_ANGLE_RAD = 0.7853982f

        /** 高光衰减：越大边缘越锐。 */
        private const val HIGHLIGHT_FALLOFF = 1f

        /** srcUri 位图兜底时的饱和度增益，沿用旧行为。 */
        private const val SATURATION = 1.35f

        private val ioExecutor = Executors.newSingleThreadExecutor { r ->
            Thread(r, "liquid-glass-io").apply { isDaemon = true }
        }

        private val mainHandler = Handler(Looper.getMainLooper())

        private val bitmapCache = LruCache<String, Bitmap>(8)
    }

    // ------------------------------------------------------------------ props

    private var borderRadiusDp: Float = 0f
    private var glassAmount: Float = 0.5f
    private var tintColor: Int = Color.WHITE
    /** JS 可选的折射/模糊覆盖值（dp）；null = 用默认常量 */
    private var refractionHeightDp: Float? = null
    private var refractionAmountDp: Float? = null
    private var blurRadiusDp: Float? = null
    /** 是否额外把折射方向朝中心拉（上游 lens 的 depthEffect）。默认开，Studio 预设可关。 */
    private var depthEffectEnabled: Boolean = true
    /** 是否使用带色散的折射着色器（上游 chromaticAberration）。默认开，Studio 预设可关。 */
    private var chromaticAberrationEnabled: Boolean = true
    /** 上游 colorControls：可选的颜色矩阵（亮度/对比度/饱和度），默认关闭。 */
    private var colorControlsEnabled: Boolean = false
    private var vibrancyEnabled: Boolean = true
    private var blurTileMode: Shader.TileMode = Shader.TileMode.CLAMP
    private var colorBrightness: Float = 0f
    private var colorContrast: Float = 1f
    private var colorSaturation: Float = 1f
    /** 上游 opacity：只作用于采样出来的玻璃，不影响 RN 容器/图标。 */
    private var glassOpacity: Float = 1f
    private var highlightColor: Int = Color.WHITE
    /** plain = Studio 的 Plain 高光：纯色描边 + blur，不叠强度。 */
    private var highlightPlain: Boolean = false
    private var highlightAngleRad: Float = HIGHLIGHT_ANGLE_RAD
    private var highlightFalloff: Float = HIGHLIGHT_FALLOFF
    private var shadowBlendMode: PorterDuff.Mode = PorterDuff.Mode.SRC_OVER
    /** ambient = Studio 的 Ambient 高光：固定宽度描边 + 模糊，不再用方向性 shader。 */
    private var highlightAmbient: Boolean = false
    private var highlightWidthDp: Float? = null
    private var highlightBlurDp: Float? = null
    private var highlightAlpha: Float = 1f
    private var highlightIntensity: Float = 1f
    /** Studio Shadow：画在玻璃采样层之后、玻璃外形之外；玻璃本体盖住内部。 */
    private var shadowRadiusPx: Float = 0f
    private var shadowDxPx: Float = 0f
    private var shadowDyPx: Float = 0f
    private var shadowColor: Int = Color.BLACK
    private var shadowAlpha: Float = 1f
    private var srcUri: String? = null

    // ------------------------------------------------------------ srcUri 兜底

    private var bitmap: Bitmap? = null
    private var loadToken = 0

    // -------------------------------------------------------------- 渲染资源

    /** 玻璃自己的节点：背景采样 + 效果链都挂在它上面。API < 29 时一直为 null。 */
    private var glassNode: RenderNode? = null

    /** 内阴影用的离屏节点（默认关闭）。 */
    private var innerShadowNode: RenderNode? = null

    private var refractionShader: RuntimeShader? = null
    /** 当前缓存的折射 shader 是否带色散；null 表示还没有缓存。 */
    private var refractionShaderDispersion: Boolean? = null
    private var highlightShader: RuntimeShader? = null

    private var cachedEffect: RenderEffect? = null
    private var cachedEffectKey: Long = Long.MIN_VALUE

    // 复用对象，避免每帧分配
    private val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    /** 对齐上游 demo 的 vibrancy()：饱和度 ×1.5 的 color filter，作为效果链最内层 */
    private val vibrancyFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(1.5f) })
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        colorFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(SATURATION) })
    }
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        // 高光要「加亮」而不是覆盖，用 ADD 叠上去。
        xfermode = PorterDuffXfermode(PorterDuff.Mode.ADD)
    }
    private val legacyStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shadowFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    /** 画在玻璃外部的 Studio Shadow */
    private val outerShadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    /** 容器色 / ambient 高光 */
    private val surfacePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val ambientHighlightPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val clearPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR)
    }

    private val shapePath = Path()
    private val shapeRect = RectF()
    private val hostOffset = FloatArray(2)

    // -------------------------------------------------------------- 内阴影参数

    private var hasInnerShadow = false
    private var innerShadowRadiusPx = 0f
    private var innerShadowDx = 0f
    private var innerShadowDy = 0f
    private var innerShadowColor = Color.BLACK
    private var innerShadowAlpha = 1f
    private var innerShadowRgb = Color.BLACK
    private var innerShadowBlendMode: PorterDuff.Mode = PorterDuff.Mode.SRC_OVER

    init {
        // View 默认 WILL_NOT_DRAW，重写 onDraw 后必须显式打开。
        setWillNotDraw(false)
    }

    // ---------------------------------------------------------------- setters

    override fun invalidate() {
        super.invalidate()
        // Hosted glass deliberately has an empty display list (see draw()).
        // Invalidating only this View won't re-record the host's manually drawn
        // composite. Request that redraw too, including for isolated previews.
        ancestorHost()?.invalidate()
    }

    /** 圆角半径，dp。 */
    fun setBorderRadiusDp(value: Float) {
        if (borderRadiusDp == value) return
        borderRadiusDp = value
        invalidate()
    }

    /** 玻璃强度 0..1。 */
    fun setGlassAmount(value: Float) {
        val clamped = value.coerceIn(0f, 1f)
        if (glassAmount == clamped) return
        glassAmount = clamped
        invalidate()
    }

    fun setTintColor(value: Int) {
        if (tintColor == value) return
        tintColor = value
        invalidate()
    }

    /** 折射带宽（dp）。不传则按 REFRACTION_DP × glassAmount（保持旧行为）。 */
    fun setRefractionHeightDp(value: Float) {
        val v = if (value.isNaN() || value < 0f) null else value
        if (refractionHeightDp == v) return
        refractionHeightDp = v
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 折射位移量（dp）。不传则按 REFRACTION_DP × glassAmount。 */
    fun setRefractionAmountDp(value: Float) {
        val v = if (value.isNaN() || value < 0f) null else value
        if (refractionAmountDp == v) return
        refractionAmountDp = v
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 模糊半径（dp）。不传则用默认 BLUR_RADIUS_DP。 */
    fun setBlurRadiusDp(value: Float) {
        val v = if (value.isNaN() || value < 0f) null else value
        if (blurRadiusDp == v) return
        blurRadiusDp = v
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 上游 lens(depthEffect)。关闭后折射只做边缘位移，不再把方向朝中心拉。 */
    fun setDepthEffect(value: Boolean) {
        if (depthEffectEnabled == value) return
        depthEffectEnabled = value
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 上游 lens(chromaticAberration)。关闭后改用无色散的折射着色器。 */
    fun setChromaticAberration(value: Boolean) {
        if (chromaticAberrationEnabled == value) return
        chromaticAberrationEnabled = value
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 上游 colorControls。关闭时保持只有 vibrancy 的旧行为。 */
    fun setColorControls(enabled: Boolean, brightness: Float, contrast: Float, saturation: Float) {
        if (colorControlsEnabled == enabled &&
            colorBrightness == brightness &&
            colorContrast == contrast &&
            colorSaturation == saturation
        ) {
            return
        }
        colorControlsEnabled = enabled
        colorBrightness = brightness
        colorContrast = contrast
        colorSaturation = saturation
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    fun setVibrancy(enabled: Boolean) {
        if (vibrancyEnabled == enabled) return
        vibrancyEnabled = enabled
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    fun setBlurTileMode(mode: String?) {
        val value = when (mode) {
            "decal" -> Shader.TileMode.DECAL
            "repeat" -> Shader.TileMode.REPEAT
            "mirror" -> Shader.TileMode.MIRROR
            else -> Shader.TileMode.CLAMP
        }
        if (blurTileMode == value) return
        blurTileMode = value
        cachedEffectKey = Long.MIN_VALUE
        invalidate()
    }

    /** 上游 opacity(alpha)，0..1，只影响玻璃采样层。 */
    fun setGlassOpacity(value: Float) {
        val clamped = value.coerceIn(0f, 1f)
        if (glassOpacity == clamped) return
        glassOpacity = clamped
        invalidate()
    }

    // RN 的 props 会分多次 set；manager 需要读取其余字段来组合 colorControls。
    internal val colorControlsEnabledForProps: Boolean get() = colorControlsEnabled
    internal val colorBrightnessForProps: Float get() = colorBrightness
    internal val colorContrastForProps: Float get() = colorContrast
    internal val colorSaturationForProps: Float get() = colorSaturation

    fun setHighlightColor(value: Int) {
        if (highlightColor == value) return
        highlightColor = value
        invalidate()
    }

    /** Studio 高光样式：ambient = Ambient，plain = Plain，其它 = Default。 */
    fun setHighlightStyle(style: String?) {
        val ambient = style == "ambient"
        val plain = style == "plain"
        if (highlightAmbient == ambient && highlightPlain == plain) return
        highlightAmbient = ambient
        highlightPlain = plain
        invalidate()
    }

    fun setHighlightAngle(angleDeg: Float) {
        val rad = Math.toRadians(angleDeg.toDouble()).toFloat()
        if (highlightAngleRad == rad) return
        highlightAngleRad = rad
        invalidate()
    }

    fun setHighlightFalloff(falloff: Float) {
        if (highlightFalloff == falloff) return
        highlightFalloff = falloff
        invalidate()
    }

    fun setHighlightWidthDp(value: Float) {
        highlightWidthDp = if (value > 0f) value else null
        invalidate()
    }

    fun setHighlightBlurDp(value: Float) {
        highlightBlurDp = if (value >= 0f) value else null
        invalidate()
    }

    fun setHighlightAlpha(value: Float) {
        highlightAlpha = value.coerceIn(0f, 1f)
        invalidate()
    }

    fun setHighlightIntensity(value: Float) {
        highlightIntensity = value.coerceIn(0f, 1f)
        invalidate()
    }

    /** Studio Shadow；radius <= 0 关闭。 */
    fun setShadow(radiusDp: Float, offsetXDp: Float, offsetYDp: Float, color: Int, alpha: Float) {
        val density = resources.displayMetrics.density
        shadowRadiusPx = max(0f, radiusDp * density)
        shadowDxPx = offsetXDp * density
        shadowDyPx = offsetYDp * density
        shadowColor = color
        shadowAlpha = alpha.coerceIn(0f, 1f)
        invalidate()
    }

    // RN 的 props 是分开 set 的，这里拆成单个 setter。
    fun setShadowRadiusDp(radiusDp: Float) {
        shadowRadiusPx = max(0f, radiusDp * resources.displayMetrics.density)
        invalidate()
    }

    fun setShadowOffsetXDp(offsetXDp: Float) {
        shadowDxPx = offsetXDp * resources.displayMetrics.density
        invalidate()
    }

    fun setShadowOffsetYDp(offsetYDp: Float) {
        shadowDyPx = offsetYDp * resources.displayMetrics.density
        invalidate()
    }

    fun setShadowColor(color: Int) {
        shadowColor = color
        invalidate()
    }

    fun setShadowBlendMode(mode: String?) {
        val value = when (mode) {
            "plus" -> PorterDuff.Mode.ADD
            "screen" -> PorterDuff.Mode.SCREEN
            "multiply" -> PorterDuff.Mode.MULTIPLY
            else -> PorterDuff.Mode.SRC_OVER
        }
        if (shadowBlendMode == value) return
        shadowBlendMode = value
        invalidate()
    }

    fun setShadowAlpha(alpha: Float) {
        shadowAlpha = alpha.coerceIn(0f, 1f)
        invalidate()
    }

    /**
     * 背景图兜底（旧行为）：仅在没有宿主 / 系统版本过低时使用。
     * 有宿主时真实背景采样优先级更高，这个位图不会被画出来。
     */
    fun setSrcUri(value: String?) {
        if (srcUri == value) return
        srcUri = value
        loadBitmap(value)
    }

    /**
     * 可选内阴影（对应上游的 InnerShadow）。未调用时不做任何事。
     *
     * @param radiusDp 阴影模糊半径，dp；<=0 视为关闭
     * @param offsetXDp 阴影偏移 X，dp
     * @param offsetYDp 阴影偏移 Y，dp
     */
    fun setInnerShadow(radiusDp: Float, offsetXDp: Float, offsetYDp: Float, color: Int) {
        val density = resources.displayMetrics.density
        innerShadowRadiusPx = max(0f, radiusDp * density)
        innerShadowDx = offsetXDp * density
        innerShadowDy = offsetYDp * density
        innerShadowColor = color
        innerShadowRgb = color
        innerShadowAlpha = Color.alpha(color) / 255f
        hasInnerShadow = innerShadowRadiusPx > 0f
        invalidate()
    }

    fun setInnerShadowRadiusDp(radiusDp: Float) {
        innerShadowRadiusPx = max(0f, radiusDp * resources.displayMetrics.density)
        hasInnerShadow = innerShadowRadiusPx > 0f
        invalidate()
    }

    fun setInnerShadowOffsetXDp(offsetXDp: Float) {
        innerShadowDx = offsetXDp * resources.displayMetrics.density
        invalidate()
    }

    fun setInnerShadowOffsetYDp(offsetYDp: Float) {
        innerShadowDy = offsetYDp * resources.displayMetrics.density
        invalidate()
    }

    fun setInnerShadowAlpha(alpha: Float) {
        innerShadowAlpha = alpha.coerceIn(0f, 1f)
        innerShadowColor = Color.argb(
            (innerShadowAlpha * 255f).toInt().coerceIn(0, 255),
            Color.red(innerShadowRgb),
            Color.green(innerShadowRgb),
            Color.blue(innerShadowRgb),
        )
        invalidate()
    }

    fun setInnerShadowColor(color: Int) {
        innerShadowRgb = color
        innerShadowColor = Color.argb(
            (innerShadowAlpha * 255f).toInt().coerceIn(0, 255),
            Color.red(color),
            Color.green(color),
            Color.blue(color),
        )
        invalidate()
    }

    fun setInnerShadowBlendMode(mode: String?) {
        val value = when (mode) {
            "plus" -> PorterDuff.Mode.ADD
            "screen" -> PorterDuff.Mode.SCREEN
            "multiply" -> PorterDuff.Mode.MULTIPLY
            else -> PorterDuff.Mode.SRC_OVER
        }
        if (innerShadowBlendMode == value) return
        innerShadowBlendMode = value
        invalidate()
    }

    // -------------------------------------------------------------- lifecycle

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        // 尺寸变了，节点内容与效果链的几何参数都要重算；下一帧 onDraw 里会自动重建。
        cachedEffectKey = Long.MIN_VALUE
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // 向最近的背景宿主登记自己：宿主每帧录背景 + 统一绘制玻璃（含浮层里的玻璃）。
        // 注意：浮层里的玻璃也必须在宿主登记。之前这里对浮层直接 return，导致宿主
        // 的 glassViews 里没有它们，玻璃只能靠浮层回放显示列表来画 —— 命中缓存时
        // onDraw 不执行，采样/模糊整条链失效，看起来就是 100% 透明、只剩描边。
        val host = ancestorHost()
        host?.registerGlass(this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        // detach 时父链还在，仍然能找到宿主。
        ancestorHost()?.unregisterGlass(this)
        loadToken++
    }

    // ---------------------------------------------------------------- drawing

    /**
     * 有宿主时玻璃一律由宿主补画（见 [GlassBackdropHost.dispatchDraw]），
     * 自己的显示列表必须保持为空。
     *
     * 这里连 [View.draw] 一起拦掉：浮层里的玻璃是通过父容器的 drawChild 回放
     * 显示列表来画的，如果不拦，命中缓存时 onDraw 根本不会执行，采样/模糊整条链
     * 就失效了（表现为玻璃全透明、只剩描边）。拦掉后任何一次重录都是空列表。
     */
    override fun draw(canvas: Canvas) {
        val host = ancestorHost()
        if (host != null && host.backdropNode() != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return
        }
        super.draw(canvas)
    }

    override fun onDraw(canvas: Canvas) {
        // 宿主正在录制背景：整帧跳过自己，别把自己录进背景。
        if (GlassBackdropHost.isRecording()) return
        if (width <= 0 || height <= 0) return

        val host = ancestorHost()
        val hostReady = host != null && host.backdropNode() != null &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
        if (DEBUG_PATH) {
            Log.w(TAG, "onDraw overlay=${isInsideOverlay()} host=$hostReady size=${width}x${height}")
        }

        if (isInsideOverlay()) {
            // 浮层里的玻璃：canvas 已经在自己的坐标原点，就地采样背景并绘制，
            // 这样浮层里的图标/文字才会画在玻璃之上（层级正确）。
            if (hostReady) drawInPlace(canvas)
            else drawFallback(canvas, width, height)
            return
        }

        // 非浮层里的玻璃由宿主统一补画：这里必须保持空显示列表，
        // 否则会形成「玻璃 → 背景节点 → 视图树 → 玻璃」的 RenderNode 引用环。
        if (hostReady) return

        // 没有宿主（例如 RN Modal 的独立窗口）或 API < 29：走旧的兜底绘制。
        drawFallback(canvas, width, height)
    }

    override fun dispatchDraw(canvas: Canvas) {
        // 录制背景时连 children 一起跳过：玻璃上的内容属于前景，不属于背景。
        if (GlassBackdropHost.isRecording()) return
        // children 正常绘制：非浮层玻璃的 children 会由 drawOnBackdrop 再画一次，
        // 但那时 canvas 在宿主坐标系里，二者不冲突（见 drawOnBackdrop）。
        super.dispatchDraw(canvas)
    }

    /** 是否位于 [GlassOverlay] 里（浮层内的玻璃自己画，宿主不再补画）。 */
    private fun isInsideOverlay(): Boolean {
        var p: ViewParent? = parent
        while (p != null) {
            if (p is GlassOverlay) return true
            p = p.parent
        }
        return false
    }

    /** 浮层内就地绘制：canvas 原点已经是本 View 左上角，不再平移。 */
    private fun drawInPlace(canvas: Canvas) {
        val host = ancestorHost() ?: return
        val backdrop = host.backdropNode() ?: return
        host.offsetInHost(this, hostOffset)
        val dx = hostOffset[0].toInt()
        val dy = hostOffset[1].toInt()
        if (DEBUG_PATH) Log.w(TAG, "drawInPlace size=${width}x${height} dx=$dx dy=$dy")
        drawSampledGlass(canvas, backdrop, width, height, dx.toFloat(), dy.toFloat())
    }

    /**
     * 玻璃的绘制入口，由 [GlassBackdropHost] 在背景节点之后调用。
     *
     * 宿主把玻璃统一补画在自己的坐标系里，所以这里先按「窗口坐标差」把 canvas
     * 平移到玻璃位置，再画采样、tint、高光，最后画玻璃里挂的 RN children。
     */
    override fun drawOnBackdrop(canvas: Canvas) {
        val w = width
        val h = height
        if (w <= 0 || h <= 0) return

        val host = ancestorHost()
        val backdrop = host?.backdropNode()
        if (DEBUG_PATH) Log.w(TAG, "drawOnBackdrop size=${w}x$h host=${host != null} backdrop=${backdrop != null}")
        if (host == null || backdrop == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (DEBUG_PATH) Log.w(TAG, "drawOnBackdrop -> drawFallback")
            drawFallback(canvas, w, h)
            super.dispatchDraw(canvas)
            return
        }

        // 偏移：用宿主提供的矩阵感知累加（含 translation / scroll）。
        // 不能用 getLocationInWindow 相减：分页器是用 translation 摆放页面的，
        // 那个 API 不乘这些矩阵，非第一页会被算成「整页宽」，玻璃就画到屏幕外了。
        host.offsetInHost(this, hostOffset)
        val dx = hostOffset[0]
        val dy = hostOffset[1]

        val save = canvas.save()
        canvas.translate(dx, dy)
        // 宿主是绕过 View 树直接补画的，祖先的 alpha（例如底栏 Animated.View 的淡出）
        // 不会自动生效，这里手动乘进一个 layer，抽屉打开/关闭时玻璃才能跟着淡出淡入。
        val alpha = ancestorAlpha()
        val layer = if (alpha < 0.999f) {
            canvas.saveLayerAlpha(0f, 0f, w.toFloat(), h.toFloat(), (alpha * 255f).toInt().coerceIn(0, 255))
        } else {
            -1
        }
        if (PortraitDockLayout.usesFrost(this)) drawFrost(canvas, backdrop, w, h, dx, dy)
        if (PortraitDockLayout.usesLiquid(this)) drawSampledGlass(canvas, backdrop, w, h, dx, dy)
        // 玻璃里挂的 RN children 画在玻璃之上（它们不在背景节点里）。
        super.dispatchDraw(canvas)
        if (layer >= 0) canvas.restoreToCount(layer)
        canvas.restoreToCount(save)
    }

    /** 祖先链上所有 View 的 alpha 乘积（到宿主为止）。 */
    private fun ancestorAlpha(): Float {
        var alpha = 1f
        var p: ViewParent? = parent
        while (p != null) {
            if (p is GlassBackdropHost) break
            if (p is View) alpha *= p.alpha
            p = p.parent
        }
        return alpha
    }

    /** 真实背景采样：偏移取样 + 模糊/折射 + 裁剪 + tint + 高光。 */
    private fun drawSampledGlass(
        canvas: Canvas,
        backdrop: RenderNode,
        w: Int,
        h: Int,
        dx: Float,
        dy: Float
    ) {
        val density = resources.displayMetrics.density
        val amount = glassAmount.coerceIn(0f, 1f)
        val radius = radiusPx().coerceAtMost(min(w, h) / 2f)

        // ---- padding ------------------------------------------------------
        // pad 至少覆盖模糊半径，否则模糊会把节点边缘的透明区混进来；
        // 折射带（refractionHeight）也需要节点外有那么多像素可取样，所以取两者较大值。
        // 小视图上再钳到自身一半，避免节点无谓地变大。
        // 注意：JS 显式传了折射参数时**不再乘 glassAmount** —— 否则想调透明就会连带
        // 削弱折射（之前「有折射但看不见」就是这个原因之一）；没传时保持旧行为。
        val blurPx = (blurRadiusDp ?: BLUR_RADIUS_DP) * density
        val refractionHeightPx = refractionHeightDp?.let { it * density }
            ?: (REFRACTION_DP * density * amount)
        val refractionAmountPx = refractionAmountDp?.let { it * density }
            ?: (REFRACTION_DP * density * amount)
        val pad = max(blurPx, refractionHeightPx).coerceAtMost(max(min(w, h) / 2f, 1f))
        val padPx = ceil(pad).toInt()
        val padF = padPx.toFloat()

        // ---- 录制玻璃节点 ------------------------------------------------
        // 节点尺寸 = 视图 + 四周 pad；节点放在 (-pad,-pad)，
        // 录制内容平移 (-dx + pad, -dy + pad)，于是视图左上角正好落在节点的 (pad,pad)。
        val nodeW = w + padPx * 2
        val nodeH = h + padPx * 2
        val node = ensureGlassNode()
        node.setPosition(-padPx, -padPx, -padPx + nodeW, -padPx + nodeH)
        val recorder = node.beginRecording(nodeW, nodeH)
        try {
            recorder.translate(padF, padF)
            // Same inverse transform as Backdrop's InverseLayerScope: growing the
            // glass changes its silhouette, not the size of everything behind it.
            recorder.scale(1f / samplingScaleX, 1f / samplingScaleY, w / 2f, h / 2f)
            recorder.translate(-dx, -dy)
            recorder.drawRenderNode(backdrop)
        } finally {
            node.endRecording()
        }

        // ---- 效果链 ------------------------------------------------------
        applyEffect(
            node, nodeW, nodeH, w, h, padF, radius, amount,
            blurPx, refractionHeightPx, refractionAmountPx,
        )

        // ---- Studio Shadow ------------------------------------------------
        // 先画在玻璃下方；随后玻璃本体盖住内部，只留下外圈的柔和投影。
        drawOuterShadow(canvas, w, h, radius)

        // ---- 上屏 --------------------------------------------------------
        // 一定要裁剪：节点比视图大一圈，不裁剪会把 padding 里的模糊/折射画到圆角外面。
        buildShapePath(w, h, radius)
        val save = canvas.save()
        canvas.clipPath(shapePath)
        // 上游 opacity：只把采样出来的玻璃按 opacity 混合，tint/容器/描边仍然完整。
        val opacityLayer = if (glassOpacity < 0.999f) {
            canvas.saveLayerAlpha(0f, 0f, w.toFloat(), h.toFloat(), (glassOpacity * 255f).toInt().coerceIn(0, 255))
        } else {
            -1
        }
        canvas.drawRenderNode(node)
        if (opacityLayer >= 0) canvas.restoreToCount(opacityLayer)
        canvas.restoreToCount(save)

        // ---- tint --------------------------------------------------------
        // alpha = tintColor 的 alpha × glassAmount，保持原有语义。
        drawTint(canvas, w, h, radius, amount)

        // ---- 高光 --------------------------------------------------------
        drawHighlight(canvas, w, h, radius, density)

        // ---- 可选内阴影 --------------------------------------------------
        drawInnerShadow(canvas, w, h, radius)
    }

    /** tint 层。 */
    private fun drawTint(canvas: Canvas, w: Int, h: Int, radius: Float, amount: Float) {
        tintPaint.color = tintColor
        tintPaint.alpha = (Color.alpha(tintColor) * amount).toInt().coerceIn(0, 255)
        canvas.drawRoundRect(0f, 0f, w.toFloat(), h.toFloat(), radius, radius, tintPaint)
    }

    /** Studio Shadow：玻璃外形外的柔和投影。 */
    private fun drawOuterShadow(canvas: Canvas, w: Int, h: Int, radius: Float) {
        if (shadowRadiusPx <= 0f || shadowAlpha <= 0f) return
        if (matchReferenceOptics && Build.VERSION.SDK_INT >= 31 && canvas.isHardwareAccelerated) {
            val pad = ceil(shadowRadiusPx * 2f + max(kotlin.math.abs(shadowDxPx), kotlin.math.abs(shadowDyPx))).toInt()
            val node = referenceShadowNode ?: RenderNode("tabs-shadow").also { referenceShadowNode = it }
            node.setPosition(-pad, -pad, w + pad, h + pad)
            val recorder = node.beginRecording(w + 2 * pad, h + 2 * pad)
            try {
                recorder.translate(pad + shadowDxPx, pad + shadowDyPx)
                outerShadowPaint.maskFilter = null
                outerShadowPaint.xfermode = null
                outerShadowPaint.color = shadowColor
                outerShadowPaint.alpha = (Color.alpha(shadowColor) * shadowAlpha).toInt().coerceIn(0, 255)
                recorder.drawRoundRect(0f, 0f, w.toFloat(), h.toFloat(), radius, radius, outerShadowPaint)
            } finally { node.endRecording() }
            node.setRenderEffect(RenderEffect.createBlurEffect(shadowRadiusPx, shadowRadiusPx, Shader.TileMode.DECAL))
            val save = canvas.save()
            buildShapePath(w, h, radius)
            canvas.clipOutPath(shapePath)
            val blendPaint = Paint().apply { xfermode = PorterDuffXfermode(shadowBlendMode) }
            val layer = canvas.saveLayer(-pad.toFloat(), -pad.toFloat(), (w + pad).toFloat(), (h + pad).toFloat(), blendPaint)
            canvas.drawRenderNode(node)
            canvas.restoreToCount(layer)
            canvas.restoreToCount(save)
            return
        }
        outerShadowPaint.color = shadowColor
        outerShadowPaint.alpha =
            (Color.alpha(shadowColor) * shadowAlpha).toInt().coerceIn(0, 255)
        outerShadowPaint.xfermode = if (shadowBlendMode == PorterDuff.Mode.SRC_OVER) {
            null
        } else {
            PorterDuffXfermode(shadowBlendMode)
        }
        outerShadowPaint.maskFilter =
            BlurMaskFilter(shadowRadiusPx, BlurMaskFilter.Blur.NORMAL)
        canvas.drawRoundRect(
            shadowDxPx, shadowDyPx,
            shadowDxPx + w, shadowDyPx + h,
            radius, radius, outerShadowPaint
        )
    }

    /** Studio Ambient / Plain 高光：固定宽度描边 + 模糊，不带方向性渐变。 */
    private fun drawAmbientHighlight(
        canvas: Canvas,
        w: Int,
        h: Int,
        radius: Float,
        density: Float,
        intensity: Float,
    ) {
        val widthDp = highlightWidthDp ?: 1f
        if (widthDp <= 0f || highlightAlpha <= 0f || intensity <= 0f) return
        // 以轮廓为中轴画双倍宽度，再裁掉外侧一半，最终只留内圈 widthDp。
        val strokeWidth = ceil(widthDp * density).coerceAtLeast(1f) * 2f
        ambientHighlightPaint.color = highlightColor
        ambientHighlightPaint.alpha =
            (Color.alpha(highlightColor) * highlightAlpha * intensity)
                .toInt().coerceIn(0, 255)
        ambientHighlightPaint.strokeWidth = strokeWidth
        ambientHighlightPaint.xfermode = null
        ambientHighlightPaint.maskFilter = highlightBlurDp?.let {
            if (it > 0f) BlurMaskFilter(it * density, BlurMaskFilter.Blur.NORMAL) else null
        }
        buildShapePath(w, h, radius)
        val save = canvas.save()
        canvas.clipPath(shapePath)
        canvas.drawRoundRect(0f, 0f, w.toFloat(), h.toFloat(), radius, radius, ambientHighlightPaint)
        canvas.restoreToCount(save)
    }

    // ------------------------------------------------------------- RenderEffect

    /**
     * 生成并挂上效果链。链的顺序：模糊（内）→ 折射（外）。
     *
     * `createChainEffect(outer, inner)` 的第一个参数是先作用于结果的「外层」效果，
     * 所以折射要放在第一个参数：先按模糊结果算折射位移，再整体输出。
     */
    private fun applyEffect(
        node: RenderNode,
        nodeW: Int,
        nodeH: Int,
        contentW: Int,
        contentH: Int,
        pad: Float,
        radius: Float,
        amount: Float,
        blurPx: Float,
        refractionHeightPx: Float,
        refractionAmountPx: Float
    ) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            // API < 31 没有 RenderEffect：不挂效果，只留 tint + 描边。
            return
        }

        val effect = buildEffect(
            nodeW, nodeH, contentW, contentH, pad, radius, amount,
            blurPx, refractionHeightPx, refractionAmountPx,
        )
        if (DEBUG_PATH) Log.w(TAG, "applyEffect effect=${effect != null} caps.re=${GlassCapabilities.renderEffects} amount=$amount refract=$refractionHeightPx/$refractionAmountPx blur=$blurPx")
        try {
            node.setRenderEffect(effect)
        } catch (t: Throwable) {
            Log.w(TAG, "setRenderEffect 失败，永久关闭 RenderEffect", t)
            GlassCapabilities.renderEffects = false
            try {
                node.setRenderEffect(null)
            } catch (ignored: Throwable) {
            }
        }
    }

    private fun buildEffect(
        nodeW: Int,
        nodeH: Int,
        contentW: Int,
        contentH: Int,
        pad: Float,
        radius: Float,
        amount: Float,
        blurPx: Float,
        refractionHeightPx: Float,
        refractionAmountPx: Float
    ): RenderEffect? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !GlassCapabilities.renderEffects) {
            return null
        }

        // 参数没变就复用上一帧的效果对象，避免每帧重新编译着色器 / 重建效果树。
        var key = nodeW.toLong()
        key = key * 31 + nodeH
        key = key * 31 + contentW
        key = key * 31 + contentH
        key = key * 31 + pad.toLong()
        key = key * 31 + radius.toLong()
        key = key * 31 + (amount * 1000f).toLong()
        key = key * 31 + (blurPx * 100f).toLong()
        key = key * 31 + (refractionHeightPx * 100f).toLong()
        key = key * 31 + (refractionAmountPx * 100f).toLong()
        key = key * 31 + (if (depthEffectEnabled) 1 else 0)
        key = key * 31 + (if (chromaticAberrationEnabled) 1 else 0)
        key = key * 31 + (if (colorControlsEnabled) 1 else 0)
        key = key * 31 + (colorBrightness * 1000f).toLong()
        key = key * 31 + (colorContrast * 1000f).toLong()
        key = key * 31 + (colorSaturation * 1000f).toLong()
        key = key * 31 + (if (vibrancyEnabled) 1 else 0)
        key = key * 31 + blurTileMode.ordinal
        key = key * 31 + (if (matchReferenceOptics) 1 else 0)
        if (key == cachedEffectKey) return cachedEffect

        var effect: RenderEffect? = null
        try {
            // 最内层：vibrancy（饱和度 ×1.5），对齐上游 demo 里 `vibrancy()` 的
            // colorControlsColorFilter(saturation = 1.5f)，让透出来的背景更有"料"。
            if (vibrancyEnabled) {
                try {
                    effect = RenderEffect.createColorFilterEffect(vibrancyFilter)
                } catch (t: Throwable) {
                    Log.w(TAG, "vibrancy 不可用，跳过", t)
                }
            }
            // 下一层：colorControls（亮度/对比度/饱和度），对应上游 colorControls(...)。
            if (colorControlsEnabled) {
                try {
                    val filter = colorControlsFilter()
                    effect = if (effect != null) {
                        RenderEffect.createColorFilterEffect(filter, effect)
                    } else {
                        RenderEffect.createColorFilterEffect(filter)
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "colorControls 不可用，跳过", t)
                }
            }
            // 内层：模糊；blur=0 时完全跳过。TileMode 与 Studio 的 blurEdgeTreatment 对齐。
            if (blurPx > 0f) {
                effect = if (effect != null) {
                    RenderEffect.createBlurEffect(blurPx, blurPx, effect, blurTileMode)
                } else {
                    RenderEffect.createBlurEffect(blurPx, blurPx, blurTileMode)
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "BlurEffect 不可用，永久关闭 RenderEffect", t)
            GlassCapabilities.renderEffects = false
            cachedEffect = null
            cachedEffectKey = key
            return null
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            amount > 0f &&
            refractionHeightPx > 0f &&
            refractionAmountPx > 0f &&
            GlassCapabilities.runtimeShaders
        ) {
            val shader = ensureRefractionShader(chromaticAberrationEnabled)
            if (shader != null) {
                try {
                    // 注意：size 用的是「内容尺寸」而不是节点尺寸（节点含四周 pad）。
                    // 着色器内部按 centeredCoord = coord + offset - size/2 计算，
                    // 内容和 pad 一起平移后，视图区域在节点里的中心是 (pad + w/2, pad + h/2)，
                    // 所以 size=内容尺寸、offset=-pad 才能让 SDF 与玻璃轮廓严丝合缝；
                    // 若把 size 换成节点尺寸，SDF 的边会整体外扩 pad，折射带位置就错了。
                    shader.setFloatUniform("size", contentW.toFloat(), contentH.toFloat())
                    shader.setFloatUniform("offset", -pad, -pad)
                    shader.setFloatUniform("cornerRadii", radius, radius, radius, radius)
                    shader.setFloatUniform("refractionHeight", refractionHeightPx)
                    // 负数：边缘像素朝中心方向位移（放大边缘内容），与上游 lens 一致。
                    shader.setFloatUniform("refractionAmount", -refractionAmountPx)
                    shader.setFloatUniform("depthEffect", if (depthEffectEnabled) { if (matchReferenceOptics) 1f else DEPTH_EFFECT } else 0f)
                    if (chromaticAberrationEnabled) {
                        shader.setFloatUniform("chromaticAberration", if (matchReferenceOptics) 1f else CHROMATIC_ABERRATION * amount)
                    }

                    val refraction = RenderEffect.createRuntimeShaderEffect(shader, "content")
                    // 外层：折射（inner 是模糊）；没有内层时直接用折射。
                    effect = if (effect != null) {
                        RenderEffect.createChainEffect(refraction, effect)
                    } else {
                        refraction
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "折射效果构造失败，永久关闭 AGSL 折射", t)
                    GlassCapabilities.runtimeShaders = false
                }
            }
        }

        cachedEffect = effect
        cachedEffectKey = key
        return effect
    }

    private fun colorControlsFilter(): ColorMatrixColorFilter {
        val invSat = 1f - colorSaturation
        val r = 0.213f * invSat
        val g = 0.715f * invSat
        val b = 0.072f * invSat
        val c = colorContrast
        val t = (0.5f - c * 0.5f + colorBrightness) * 255f
        val s = colorSaturation
        val cr = c * r
        val cg = c * g
        val cb = c * b
        val cs = c * s
        return ColorMatrixColorFilter(
            ColorMatrix(
                floatArrayOf(
                    cr + cs, cg, cb, 0f, t,
                    cr, cg + cs, cb, 0f, t,
                    cr, cg, cb + cs, 0f, t,
                    0f, 0f, 0f, 1f, 0f
                )
            )
        )
    }

    private fun ensureRefractionShader(dispersion: Boolean): RuntimeShader? {        refractionShader?.let {
            if (refractionShaderDispersion == dispersion) return it
        }
        return try {
            val source = if (dispersion) {
                GlassShaderLib.ROUNDED_RECT_REFRACTION_DISPERSION
            } else {
                GlassShaderLib.ROUNDED_RECT_REFRACTION
            }
            RuntimeShader(source).also {
                refractionShader = it
                refractionShaderDispersion = dispersion
            }
        } catch (t: Throwable) {
            Log.w(TAG, "AGSL 编译失败，永久关闭 AGSL 折射", t)
            GlassCapabilities.runtimeShaders = false
            refractionShader = null
            refractionShaderDispersion = null
            null
        }
    }

    // ------------------------------------------------------------------ 高光

    /**
     * 描边高光。
     *
     * API 33+：AGSL 高光 + 描边。描边宽度取 `ceil(1dp) * 2`（以轮廓为中轴），
     * 再用 clipPath 把外侧一半裁掉，最终只留 1dp 的内圈；maskFilter 做 0.5dp 柔化。
     * API < 33：退化成上亮下暗的 1dp LinearGradient 描边。
     */
    private fun drawHighlight(canvas: Canvas, w: Int, h: Int, radius: Float, density: Float) {
        if (matchReferenceOptics && Build.VERSION.SDK_INT >= 33 && canvas.isHardwareAccelerated) {
            drawReferenceHighlight(canvas, w, h, radius, density)
            return
        }
        if (highlightAmbient) {
            drawAmbientHighlight(canvas, w, h, radius, density, highlightIntensity)
            return
        }
        if (highlightPlain) {
            drawAmbientHighlight(canvas, w, h, radius, density, 1f)
            return
        }
        val widthDp = highlightWidthDp ?: 1f
        if (widthDp <= 0f || highlightAlpha <= 0f) return
        val strokeWidth = ceil(widthDp * density).coerceAtLeast(1f) * 2f
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && GlassCapabilities.highlightShader) {
            val shader = ensureHighlightShader()
            if (shader != null) {
                try {
                    shader.setFloatUniform("size", w.toFloat(), h.toFloat())
                    shader.setFloatUniform("cornerRadii", radius, radius, radius, radius)
                    // layout(color) uniform 只能用 setColorUniform。
                    shader.setColorUniform("color", highlightColor)
                    shader.setFloatUniform("angle", highlightAngleRad)
                    shader.setFloatUniform("falloff", highlightFalloff)

                    highlightPaint.shader = shader
                    highlightPaint.strokeWidth = strokeWidth
                    highlightPaint.alpha = (highlightAlpha * 255f).toInt().coerceIn(0, 255)
                    highlightPaint.maskFilter = BlurMaskFilter(
                        (highlightBlurDp ?: 0.5f) * density,
                        BlurMaskFilter.Blur.NORMAL,
                    )

                    buildShapePath(w, h, radius)
                    val save = canvas.save()
                    // 裁到玻璃轮廓：描边以轮廓为中轴，外侧那一半被裁掉。
                    canvas.clipPath(shapePath)
                    canvas.drawRoundRect(
                        0f, 0f, w.toFloat(), h.toFloat(), radius, radius, highlightPaint
                    )
                    canvas.restoreToCount(save)
                    return
                } catch (t: Throwable) {
                    Log.w(TAG, "高光着色器不可用，永久退化为渐变描边", t)
                    GlassCapabilities.highlightShader = false
                }
            }
        }
        drawGradientStroke(canvas, w, h, radius, density)
    }

    private fun ensureHighlightShader(): RuntimeShader? {
        highlightShader?.let { return it }
        return try {
            RuntimeShader(GlassShaderLib.DEFAULT_HIGHLIGHT).also { highlightShader = it }
        } catch (t: Throwable) {
            Log.w(TAG, "高光 AGSL 编译失败，永久退化为渐变描边", t)
            GlassCapabilities.highlightShader = false
            null
        }
    }

    private fun drawReferenceHighlight(canvas: Canvas, w: Int, h: Int, radius: Float, density: Float) {
        if (highlightAlpha <= 0f || Color.alpha(highlightColor) == 0) return
        val stroke = ceil(min((highlightWidthDp ?: 0.5f) * density, min(w, h) / 2f)) * 2f
        if (stroke <= 0f) return
        val blur = (highlightBlurDp ?: 0.25f) * density
        val pad = ceil(blur * 2f).toInt() + 1
        val node = referenceHighlightNode ?: RenderNode("tabs-highlight").also { referenceHighlightNode = it }
        val shader = when {
            highlightPlain -> null
            highlightAmbient -> ambientShader ?: RuntimeShader(GlassShaderLib.AMBIENT_HIGHLIGHT).also { ambientShader = it }
            else -> ensureHighlightShader()
        }
        shader?.apply {
            setFloatUniform("size", w.toFloat(), h.toFloat())
            setFloatUniform("cornerRadii", radius, radius, radius, radius)
            setFloatUniform("angle", if (highlightAmbient) HIGHLIGHT_ANGLE_RAD else highlightAngleRad)
            setFloatUniform("falloff", if (highlightAmbient) 1f else highlightFalloff)
            if (!highlightAmbient) setColorUniform("color", highlightColor or (0xff shl 24))
        }
        highlightPaint.shader = shader
        highlightPaint.xfermode = null
        highlightPaint.maskFilter = null
        highlightPaint.strokeWidth = stroke
        highlightPaint.color = highlightColor
        highlightPaint.alpha = 255
        node.setPosition(-pad, -pad, w + pad, h + pad)
        val recorder = node.beginRecording(w + 2 * pad, h + 2 * pad)
        try {
            recorder.translate(pad.toFloat(), pad.toFloat())
            buildShapePath(w, h, radius)
            recorder.clipPath(shapePath)
            recorder.drawRoundRect(0f, 0f, w.toFloat(), h.toFloat(), radius, radius, highlightPaint)
        } finally { node.endRecording() }
        node.setRenderEffect(if (blur > 0f) RenderEffect.createBlurEffect(blur, blur, Shader.TileMode.DECAL) else null)
        val paint = Paint().apply {
            // The ambient shader itself defines its black/white intensity, as upstream.
            alpha = (highlightAlpha * 255f).toInt().coerceIn(0, 255)
            xfermode = PorterDuffXfermode(if (highlightAmbient) PorterDuff.Mode.SRC_OVER else PorterDuff.Mode.ADD)
        }
        val layer = canvas.saveLayer(-pad.toFloat(), -pad.toFloat(), (w + pad).toFloat(), (h + pad).toFloat(), paint)
        canvas.drawRenderNode(node)
        canvas.restoreToCount(layer)
    }

    /** 老设备 / AGSL 不可用时的描边：上亮下暗的 1dp 线性渐变。 */
    private fun drawGradientStroke(canvas: Canvas, w: Int, h: Int, radius: Float, density: Float) {
        val strokeWidth = max(1f, density)
        legacyStrokePaint.strokeWidth = strokeWidth
        legacyStrokePaint.shader = LinearGradient(
            0f, 0f, 0f, h.toFloat(),
            intArrayOf(
                highlightColor,
                Color.argb(
                    0,
                    Color.red(highlightColor),
                    Color.green(highlightColor),
                    Color.blue(highlightColor)
                )
            ),
            null,
            Shader.TileMode.CLAMP
        )
        canvas.drawRoundRect(
            strokeWidth / 2f,
            strokeWidth / 2f,
            w - strokeWidth / 2f,
            h - strokeWidth / 2f,
            radius,
            radius,
            legacyStrokePaint
        )
    }

    // --------------------------------------------------------------- 内阴影

    /**
     * 可选内阴影（对应上游 InnerShadow），默认关闭，API 31+ 才做。
     *
     * 做法：在离屏节点里先用阴影色填满轮廓，再平移 offset 后用 CLEAR 挖掉内部，
     * 只剩偏移方向的一圈；给节点挂 DECAL 模糊，然后裁回玻璃形状内画上去。
     */
    private fun drawInnerShadow(canvas: Canvas, w: Int, h: Int, radius: Float) {
        if (!hasInnerShadow) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !GlassCapabilities.renderEffects) return

        val padPx = ceil(innerShadowRadiusPx).toInt().coerceAtLeast(1)
        val nodeW = w + padPx * 2
        val nodeH = h + padPx * 2
        val node = innerShadowNode ?: RenderNode("liquid-glass-inner-shadow").also {
            innerShadowNode = it
        }
        try {
            node.setPosition(-padPx, -padPx, -padPx + nodeW, -padPx + nodeH)
            val recorder = node.beginRecording(nodeW, nodeH)
            try {
                recorder.translate(padPx.toFloat(), padPx.toFloat())
                shadowFillPaint.color = innerShadowColor
                shadowFillPaint.style = Paint.Style.FILL
                recorder.drawRoundRect(
                    0f, 0f, w.toFloat(), h.toFloat(), radius, radius, shadowFillPaint
                )
                // 遮住内部，只在偏移方向留下阴影带
                recorder.save()
                recorder.translate(innerShadowDx, innerShadowDy)
                recorder.drawRoundRect(
                    0f, 0f, w.toFloat(), h.toFloat(), radius, radius, clearPaint
                )
                recorder.restore()
            } finally {
                node.endRecording()
            }
            node.setRenderEffect(
                RenderEffect.createBlurEffect(
                    innerShadowRadiusPx, innerShadowRadiusPx, Shader.TileMode.DECAL
                )
            )
        } catch (t: Throwable) {
            Log.w(TAG, "内阴影构造失败，关闭内阴影", t)
            hasInnerShadow = false
            return
        }

        buildShapePath(w, h, radius)
        val save = canvas.save()
        canvas.clipPath(shapePath)
        if (innerShadowBlendMode == PorterDuff.Mode.SRC_OVER) {
            canvas.drawRenderNode(node)
        } else {
            val layer = canvas.saveLayer(
                0f, 0f, w.toFloat(), h.toFloat(),
                Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    xfermode = PorterDuffXfermode(innerShadowBlendMode)
                },
            )
            canvas.drawRenderNode(node)
            canvas.restoreToCount(layer)
        }
        canvas.restoreToCount(save)
    }

    // ------------------------------------------------------------------ 兜底

    /**
     * 降级路径：半透明 tint + 1dp 上亮下暗描边；
     * 如果 RN 侧还传了 srcUri，则把它当背景图（居中裁剪）画在 tint 下面。
     *
     * 只在「没有宿主 / API < 29」时走到这里，属于旧行为兜底。
     */
    private fun drawFallback(canvas: Canvas, w: Int, h: Int) {
        val amount = glassAmount.coerceIn(0f, 1f)
        val radius = radiusPx().coerceAtMost(min(w, h) / 2f)

        bitmap?.let { bmp ->
            if (!bmp.isRecycled) {
                buildShapePath(w, h, radius)
                val save = canvas.save()
                canvas.clipPath(shapePath)
                // 居中裁剪铺满
                val scale = max(w / bmp.width.toFloat(), h / bmp.height.toFloat())
                val dw = bmp.width * scale
                val dh = bmp.height * scale
                shapeRect.set(
                    (w - dw) / 2f,
                    (h - dh) / 2f,
                    (w + dw) / 2f,
                    (h + dh) / 2f
                )
                canvas.drawBitmap(bmp, null, shapeRect, bitmapPaint)
                canvas.restoreToCount(save)
            }
        }

        drawTint(canvas, w, h, radius, amount)
        drawGradientStroke(canvas, w, h, radius, resources.displayMetrics.density)
    }

    // ----------------------------------------------------------------- helpers

    private fun radiusPx(): Float =
        if (borderRadiusDp > 0f) borderRadiusDp * resources.displayMetrics.density else 0f

    private fun buildShapePath(w: Int, h: Int, radius: Float) {
        shapeRect.set(0f, 0f, w.toFloat(), h.toFloat())
        shapePath.rewind()
        shapePath.addRoundRect(shapeRect, radius, radius, Path.Direction.CW)
    }

    private fun ensureGlassNode(): RenderNode {
        glassNode?.let { return it }
        return RenderNode("liquid-glass").also { glassNode = it }
    }

    /** 向上找最近的背景宿主。 */
    private fun ancestorHost(): GlassBackdropHost? {
        var p: ViewParent? = parent
        while (p != null) {
            if (p is GlassBackdropHost) return p
            p = p.parent
        }
        return null
    }

    // ------------------------------------------------------------ srcUri 加载

    private fun loadBitmap(uri: String?) {
        val token = ++loadToken
        val target = uri
        if (target.isNullOrEmpty()) {
            bitmap = null
            invalidate()
            return
        }

        bitmapCache.get(target)?.let { cached ->
            bitmap = cached
            invalidate()
            return
        }

        ioExecutor.execute {
            val loaded = try {
                fetchBitmap(target)
            } catch (e: Exception) {
                Log.w(TAG, "failed to load backdrop: $target", e)
                null
            }
            mainHandler.post {
                if (token != loadToken) return@post
                if (loaded != null) {
                    bitmapCache.put(target, loaded)
                    bitmap = loaded
                    invalidate()
                }
            }
        }
    }

    private fun fetchBitmap(uri: String): Bitmap? {
        val lower = uri.lowercase()
        val stream: InputStream? = when {
            lower.startsWith("http://") || lower.startsWith("https://") -> {
                val connection = (URL(uri).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 10_000
                    readTimeout = 15_000
                    instanceFollowRedirects = true
                }
                if (connection.responseCode !in 200..299) return null
                connection.inputStream
            }

            lower.startsWith("file://") -> java.io.FileInputStream(Uri.parse(uri).path)
            lower.startsWith("content://") -> context.contentResolver.openInputStream(Uri.parse(uri))
            else -> java.io.FileInputStream(uri)
        }
        return stream?.use { BitmapFactory.decodeStream(it) }
    }
}
