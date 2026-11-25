/*
 * Android View port of AndroidLiquidGlass-kmp's LiquidBottomTabs / DampedDragAnimation.
 * Upstream Copyright 2025 Kyant, licensed under Apache-2.0.
 * See doc/liquid-tabs.md for the layer mapping and validation procedure.
 */
package com.lxnx.music.glass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RadialGradient
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.Choreographer
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.facebook.react.uimanager.events.NativeGestureUtil
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.math.sign

/** Owns the entire composite, so the lens samples tinted icons as well as the page. */
class LiquidTabsView(context: Context) : ViewGroup(context), GlassSampler, Choreographer.FrameCallback {
    private val density = resources.displayMetrics.density
    private val base = LiquidGlassView(context).apply { matchReferenceOptics = true }
    private val tabs = LiquidGlassView(context).apply {
        matchReferenceOptics = true
        setGlassAmount(1f)
        setBorderRadiusDp(28f)
        setBlurRadiusDp(8f)
        setDepthEffect(false)
        setChromaticAberration(false)
        setHighlightWidthDp(0.5f)
        setHighlightBlurDp(0.25f)
    }
    private val lens = LiquidGlassView(context).apply {
        matchReferenceOptics = true
        setGlassAmount(1f)
        setBorderRadiusDp(28f)
        setBlurRadiusDp(0f)
        setVibrancy(false)
        setDepthEffect(false)
        setHighlightWidthDp(0.5f)
        setHighlightBlurDp(0.25f)
    }
    private var combined: RenderNode? = null
    private val offset = FloatArray(2)
    private val tintPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val lightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clip = Path()
    private var params: ReadableMap? = null
    private var accentColor = Color.rgb(0, 145, 255)
    private var dark = true
    private var selected = 0
    private var initialized = false
    private var host: GlassBackdropHost? = null
    private var framePending = false
    private var lastFrame = 0L
    private var holding = false
    private var releaseWhenSettled = false
    private var pointerId = -1
    private var downX = 0f
    private var downY = 0f
    private var startIndex = 0f
    private var dragged = false
    private val slop = ViewConfiguration.get(context).scaledTouchSlop
    private val position = LiquidTabSpring(0f, 1f, 1000f)
    private val press = LiquidTabSpring(0f, 1f, 1000f)
    private val stretchX = LiquidTabSpring(1f, 0.6f, 250f)
    private val stretchY = LiquidTabSpring(1f, 0.7f, 250f)
    private val velocity = LiquidTabSpring(0f, 0.5f, 300f)
    private val panel = LiquidTabSpring(0f, 1f, 300f)
    private val light = LiquidTabSpring(0f, 0.5f, 300f)
    private val springs = arrayOf(position, press, stretchX, stretchY, velocity, panel, light)
    private val slot: Float get() = ((width - 8f * density) / childCount.coerceAtLeast(1)).coerceAtLeast(1f)
    private val lastIndex: Int get() = (childCount - 1).coerceAtLeast(0)
    private val rtl: Boolean get() = layoutDirection == LAYOUT_DIRECTION_RTL

    init {
        clipChildren = false
        clipToPadding = false
        setWillNotDraw(false)
    }

    fun setDark(value: Boolean) { dark = value; redraw() }

    fun setSelectedIndex(value: Int) {
        val index = value.coerceAtLeast(0)
        if (!initialized) {
            initialized = true
            selected = index
            position.snap(index.toFloat())
        } else if (selected != index) {
            selected = index
            if (!holding) animateSelection(index)
        }
        redraw()
    }

    fun setGlassParams(value: ReadableMap?) {
        params = value
        accentColor = color("tabsAccentColor", Color.rgb(0, 145, 255))
        base.apply {
            setGlassAmount(1f)
            setBorderRadiusDp(if (string("shape", "capsule") == "capsule") 32f else number("cornerRadius", 24f))
            setTintColor(containerColor())
            setVibrancy(bool("vibrancy", true))
            setColorControls(bool("colorControlsEnabled", false), number("brightness", 0f), number("contrast", 1f), number("saturation", 1.5f))
            setGlassOpacity(number("opacity", 1f))
            setBlurRadiusDp(if (bool("blurEnabled", true)) number("blurRadius", 8f) else 0f)
            setBlurTileMode(string("blurTileMode", "clamp"))
            setRefractionHeightDp(number("refractionHeight", 24f))
            setRefractionAmountDp(number("refractionAmount", 24f))
            setDepthEffect(bool("depthEffect", false))
            setChromaticAberration(bool("chromaticAberration", false))
            setHighlightStyle(string("highlightKind", "default"))
            setHighlightColor(color("highlightColor", Color.WHITE))
            setHighlightWidthDp(number("highlightWidth", 0.5f))
            setHighlightBlurDp(number("highlightBlur", 0.25f))
            setHighlightAlpha(if (bool("highlightEnabled", true) && number("highlightWidth", 0.5f) > 0f) number("highlightAlpha", 1f) else 0f)
            setHighlightAngle(number("highlightAngle", 45f))
            setHighlightFalloff(number("highlightFalloff", 1f))
            setHighlightIntensity(number("highlightIntensity", 0.38f))
            setShadow(number("shadowRadius", 24f), number("shadowOffsetX", 0f), number("shadowOffsetY", 4f), color("shadowColor", Color.BLACK), if (bool("shadowEnabled", true)) number("shadowAlpha", 0.1f) else 0f)
            setShadowBlendMode(string("shadowBlendMode", "normal"))
            setInnerShadowRadiusDp(if (bool("innerShadowEnabled", false)) number("innerShadowRadius", 8f) else 0f)
            setInnerShadowOffsetXDp(number("innerShadowOffsetX", 0f))
            setInnerShadowOffsetYDp(number("innerShadowOffsetY", 8f))
            setInnerShadowColor(color("innerShadowColor", Color.BLACK))
            setInnerShadowAlpha(number("innerShadowAlpha", 0.25f))
            setInnerShadowBlendMode(string("innerShadowBlendMode", "normal"))
        }
        tabs.setTintColor(containerColor())
        tintPaint.colorFilter = PorterDuffColorFilter(accentColor, PorterDuff.Mode.SRC_IN)
        redraw()
    }

    private fun number(key: String, fallback: Float): Float = params?.let { if (it.hasKey(key) && !it.isNull(key)) it.getDouble(key).toFloat() else fallback } ?: fallback
    private fun bool(key: String, fallback: Boolean): Boolean = params?.let { if (it.hasKey(key) && !it.isNull(key)) it.getBoolean(key) else fallback } ?: fallback
    private fun string(key: String, fallback: String): String = params?.let { if (it.hasKey(key) && !it.isNull(key)) it.getString(key) else fallback } ?: fallback
    private fun color(key: String, fallback: Int): Int = try { Color.parseColor(string(key, "")) } catch (_: IllegalArgumentException) { fallback }
    private fun containerColor(): Int = withAlpha(color("containerColor", Color.rgb(18, 18, 18)), number("containerAlpha", 0.4f))
    private fun withAlpha(color: Int, alpha: Float): Int = (color and 0x00ffffff) or ((alpha.coerceIn(0f, 1f) * 255f).roundToInt() shl 24)

    // Yoga lays out the original accessible RN tab children. No duplicate accessible tree.
    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) { redraw() }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        var ancestor = parent
        while (ancestor != null && ancestor !is GlassBackdropHost) ancestor = ancestor.parent
        host = ancestor as? GlassBackdropHost
        host?.registerGlass(this)
        redraw()
    }

    override fun onDetachedFromWindow() {
        host?.unregisterGlass(this)
        host = null
        Choreographer.getInstance().removeFrameCallback(this)
        framePending = false
        lastFrame = 0L
        holding = false
        pointerId = -1
        releaseWhenSettled = false
        position.snap(selected.toFloat())
        press.snap(0f)
        stretchX.snap(1f)
        stretchY.snap(1f)
        velocity.snap(0f)
        panel.snap(0f)
        light.snap(0f)
        combined?.discardDisplayList()
        super.onDetachedFromWindow()
    }

    override fun draw(canvas: Canvas) {
        if (host?.backdropNode() != null) return // keep the host's background acyclic
        super.draw(canvas)
    }

    override fun dispatchDraw(canvas: Canvas) {
        if (GlassBackdropHost.isRecording()) return
        renderTabs(canvas, null, 0f, 0f)
    }

    override fun drawOnBackdrop(canvas: Canvas) {
        val owner = host ?: return
        owner.offsetInHost(this, offset)
        var opacity = alpha
        var ancestor = parent
        while (ancestor is View && ancestor !== owner) {
            opacity *= ancestor.alpha
            ancestor = ancestor.parent
        }
        if (opacity <= 0f) return
        val save = canvas.save()
        canvas.translate(offset[0], offset[1])
        // Bounds include the 78dp pressed lens and its shadow.
        val margin = 48f * density
        val layer = if (opacity < 1f) canvas.saveLayerAlpha(-margin, -margin, width + margin, height + margin, (opacity * 255).toInt()) else -1
        val backdrop = owner.backdropNode()
        if (backdrop != null && PortraitDockLayout.usesFrost(this)) {
            base.drawFrost(canvas, backdrop, width, height, offset[0], offset[1])
            val index = selected.coerceIn(0, lastIndex)
            val left = 4f * density + (if (rtl) lastIndex - index else index) * slot
            val top = (height - 56f * density) / 2f
            lightPaint.shader = null
            lightPaint.color = withAlpha(if (dark) Color.WHITE else Color.BLACK, number("pillAlpha", 0.1f))
            canvas.drawRoundRect(left, top, left + slot, top + 56f * density, 28f * density, 28f * density, lightPaint)
            drawItems(canvas, 1f, false)
            val selectedClip = canvas.save()
            canvas.clipRect(left, top, left + slot, top + 56f * density)
            drawItems(canvas, 1f, true)
            canvas.restoreToCount(selectedClip)
        }
        if (PortraitDockLayout.usesLiquid(this)) {
            renderTabs(canvas, backdrop, offset[0], offset[1])
        }
        if (layer >= 0) canvas.restoreToCount(layer)
        canvas.restoreToCount(save)
    }

    private fun drawItems(canvas: Canvas, scale: Float, tinted: Boolean) {
        val layer = if (tinted) canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), tintPaint) else -1
        for (i in 0 until childCount) {
            val child = getChildAt(i)
            if (child.visibility != VISIBLE) continue
            val save = canvas.save()
            canvas.scale(scale, scale, child.left + child.width / 2f, child.top + child.height / 2f)
            drawChild(canvas, child, drawingTime)
            canvas.restoreToCount(save)
        }
        if (layer >= 0) canvas.restoreToCount(layer)
    }

    private fun renderTabs(canvas: Canvas, backdrop: RenderNode?, x: Float, y: Float) {
        if (width <= 0 || height <= 0 || childCount == 0) return
        val progress = press.value.coerceIn(0f, 1f)
        val panelX = 4f * density * sign(panel.value) * (1f - (1f - (abs(panel.value) / width).coerceIn(0f, 1f)).let { it * it * it })
        val logicalIndex = position.value.coerceIn(0f, lastIndex.toFloat())
        val pillX = 4f * density + (if (rtl) lastIndex - logicalIndex else logicalIndex) * slot + panelX
        val pillY = (height - 56f * density) / 2f
        val barScale = 1f + 16f * density / width * progress
        val save = canvas.save()
        canvas.translate(panelX, 0f)
        canvas.scale(barScale, barScale, width / 2f, height / 2f)
        base.renderSurface(canvas, backdrop, width, height, x + panelX, y, barScale, barScale)
        canvas.restoreToCount(save)
        drawInteractiveLight(canvas, pillX + slot / 2f)
        val contentSave = canvas.save()
        canvas.translate(panelX, 0f)
        drawItems(canvas, 1f, false)
        canvas.restoreToCount(contentSave)

        // The hidden 56dp row is captured with tinted/enlarged icons, then combined with
        // the unmodified page. The foreground lens sees that row, not just the page.
        var source: RenderNode? = null
        if (Build.VERSION.SDK_INT >= 29 && backdrop != null && canvas.isHardwareAccelerated) {
            val margin = (48f * density).roundToInt()
            val node = combined ?: RenderNode("liquid-tabs-combined").also { combined = it }
            node.setPosition(-margin, -margin, width + margin, height + margin)
            val recorder = node.beginRecording(width + margin * 2, height + margin * 2)
            try {
                recorder.translate(margin.toFloat(), margin.toFloat())
                recorder.save()
                recorder.translate(-x, -y)
                recorder.drawRenderNode(backdrop)
                recorder.restore()
                recorder.save()
                recorder.translate(panelX, pillY)
                tabs.setRefractionHeightDp(24f * progress)
                tabs.setRefractionAmountDp(24f * progress)
                tabs.setHighlightAlpha(progress)
                tabs.renderSurface(recorder, backdrop, width, (56f * density).roundToInt(), x + panelX, y + pillY)
                recorder.restore()
                drawInteractiveLight(recorder, pillX + slot / 2f)
                recorder.translate(panelX, 0f)
                drawItems(recorder, 1f + 0.2f * progress, true)
            } finally { node.endRecording() }
            source = node
        }

        val lensSave = canvas.save()
        canvas.translate(pillX, pillY)
        val v = velocity.value / 10f
        val sx = stretchX.value / (1f - (v * 0.75f).coerceIn(-0.2f, 0.2f))
        val sy = stretchY.value * (1f - (v * 0.25f).coerceIn(-0.2f, 0.2f))
        canvas.scale(sx, sy, slot / 2f, 28f * density)
        val opticalProgress = if (bool("pillLensEnabled", true)) progress else 0f
        lens.setRefractionHeightDp(number("pillLensHeight", 10f) * opticalProgress)
        lens.setRefractionAmountDp(number("pillLensAmount", 14f) * opticalProgress)
        lens.setChromaticAberration(bool("pillLensChromatic", true))
        lens.setHighlightAlpha(progress)
        lens.setShadow(24f, 0f, 4f, Color.BLACK, 0.1f * progress)
        lens.setInnerShadow(8f * progress, 0f, 8f * progress, withAlpha(Color.BLACK, 0.15f * progress))
        lens.setTintColor(Color.TRANSPARENT)
        lens.renderSurface(canvas, source, slot.roundToInt(), (56f * density).roundToInt(), pillX, pillY, sx, sy)
        lightPaint.shader = null
        lightPaint.color = withAlpha(if (dark) Color.WHITE else Color.BLACK, number("pillAlpha", 0.1f) * (1f - progress))
        canvas.drawRoundRect(0f, 0f, slot, 56f * density, 28f * density, 28f * density, lightPaint)
        lightPaint.color = withAlpha(Color.BLACK, 0.03f * progress)
        canvas.drawRoundRect(0f, 0f, slot, 56f * density, 28f * density, 28f * density, lightPaint)
        canvas.restoreToCount(lensSave)
    }

    private fun drawInteractiveLight(canvas: Canvas, center: Float) {
        val amount = light.value.coerceIn(0f, 1f)
        if (amount < 0.001f) return
        val save = canvas.save()
        clip.rewind()
        clip.addRoundRect(0f, 0f, width.toFloat(), height.toFloat(), height / 2f, height / 2f, Path.Direction.CW)
        canvas.clipPath(clip)
        lightPaint.color = withAlpha(Color.WHITE, 0.08f * amount)
        lightPaint.xfermode = android.graphics.PorterDuffXfermode(PorterDuff.Mode.ADD)
        canvas.drawPaint(lightPaint)
        lightPaint.shader = RadialGradient(center, height / 2f, height * 1.5f, intArrayOf(withAlpha(Color.WHITE, 0.15f * amount), Color.TRANSPARENT), floatArrayOf(0.5f, 1f), Shader.TileMode.CLAMP)
        lightPaint.alpha = 255
        canvas.drawPaint(lightPaint)
        lightPaint.shader = null
        lightPaint.xfermode = null
        canvas.restoreToCount(save)
    }

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean = true

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (childCount == 0 || !isEnabled) return false
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                NativeGestureUtil.notifyNativeGestureStarted(this, event)
                pointerId = event.getPointerId(0)
                downX = event.x
                downY = event.y
                startIndex = hitIndex(downX).toFloat()
                dragged = false
                holding = true
                releaseWhenSettled = false
                position.target = startIndex
                pressIn()
                light.target = 1f
                parent?.requestDisallowInterceptTouchEvent(true)
            }
            MotionEvent.ACTION_MOVE -> {
                val pointer = event.findPointerIndex(pointerId)
                if (pointer < 0) { cancelGesture(); return true }
                val dx = event.getX(pointer) - downX
                if (abs(dx) > slop || abs(event.getY(pointer) - downY) > slop) dragged = true
                if (dragged) {
                    position.target = (startIndex + dx / slot * if (rtl) -1f else 1f).coerceIn(0f, lastIndex.toFloat())
                    panel.snap(dx)
                }
            }
            MotionEvent.ACTION_UP -> {
                if (pointerId < 0) return false
                NativeGestureUtil.notifyNativeGestureEnded(this, event)
                val index = if (dragged) position.target.roundToInt().coerceIn(0, lastIndex) else hitIndex(event.x)
                selected = index
                holding = false
                pointerId = -1
                position.target = index.toFloat()
                releaseWhenSettled = true
                panel.target = 0f
                light.target = 0f
                performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                val payload = Arguments.createMap().apply { putInt("index", index); putBoolean("dragged", dragged) }
                (context as? ReactContext)?.getJSModule(RCTEventEmitter::class.java)?.receiveEvent(id, "topTabSelect", payload)
                parent?.requestDisallowInterceptTouchEvent(false)
            }
            MotionEvent.ACTION_CANCEL -> {
                NativeGestureUtil.notifyNativeGestureEnded(this, event)
                cancelGesture()
            }
            MotionEvent.ACTION_POINTER_UP -> if (event.getPointerId(event.actionIndex) == pointerId) {
                NativeGestureUtil.notifyNativeGestureEnded(this, event)
                cancelGesture()
            }
        }
        animateFrame()
        return true
    }

    private fun hitIndex(x: Float): Int {
        val index = ((x - 4f * density) / slot).toInt().coerceIn(0, lastIndex)
        return if (rtl) lastIndex - index else index
    }

    private fun cancelGesture() {
        holding = false
        pointerId = -1
        position.target = selected.coerceIn(0, lastIndex).toFloat()
        releaseWhenSettled = true
        panel.target = 0f
        light.target = 0f
        parent?.requestDisallowInterceptTouchEvent(false)
        animateFrame()
    }

    private fun pressIn() { press.target = 1f; stretchX.target = 78f / 56f; stretchY.target = 78f / 56f }
    private fun animateSelection(index: Int) {
        position.target = index.toFloat()
        pressIn()
        releaseWhenSettled = true
        animateFrame()
    }

    private fun redraw() { invalidate(); host?.invalidate() }
    private fun animateFrame() {
        if (framePending || !isAttachedToWindow) return
        framePending = true
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun doFrame(frameTimeNanos: Long) {
        framePending = false
        val dt = if (lastFrame == 0L) 1f / 60f else ((frameTimeNanos - lastFrame) / 1_000_000_000f).coerceIn(0f, 0.064f)
        lastFrame = frameTimeNanos
        position.step(dt)
        velocity.target = if (holding && dragged) position.velocity / lastIndex.coerceAtLeast(1) else 0f
        if (!holding && releaseWhenSettled && abs(position.value - position.target) < lastIndex.coerceAtLeast(1) * 0.025f) {
            releaseWhenSettled = false
            press.target = 0f
            stretchX.target = 1f
            stretchY.target = 1f
        }
        for (spring in springs) if (spring !== position) spring.step(dt)
        redraw()
        if (springs.any { !it.settled } || releaseWhenSettled) animateFrame() else lastFrame = 0L
    }
}

