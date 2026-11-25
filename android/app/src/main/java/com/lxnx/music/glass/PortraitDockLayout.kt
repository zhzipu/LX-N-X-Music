package com.lxnx.music.glass

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.DecelerateInterpolator
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup
import kotlin.math.abs

/**
 * Shared home scroll controller for the phone window and the home pane on Pad.
 * Yoga owns layout. The dock's player slot is empty when Pad hides the mini player.
 * The second dock slot always carries the bottom tabs.
 */
class PortraitDockLayout(context: Context) : ReactViewGroup(context) {
    private val dock get() = getChildAt(1) as? ViewGroup
    private var animator: ValueAnimator? = null
    private var preparing = false
    private var restoring = false
    private var progress = 0f
    private var collapsed = false
    private var secondary = false
    private var activeTab: String? = null
    var menuOpen = false
    var bottomInset = 0f
    private var host: GlassBackdropHost? = null
    private val slop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
    private var tracking = false
    private var vertical = false
    private var downX = 0f
    private var pivotY = 0f
    private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener { placeDock() }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        var ancestor = parent
        while (ancestor != null && ancestor !is GlassBackdropHost) ancestor = ancestor.parent
        host = ancestor as? GlassBackdropHost
        host?.registerDock(this)
        viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
        animator?.removeAllListeners()
        animator?.cancel()
        animator = null
        preparing = false
        restoring = false
        progress = if (collapsed) 1f else 0f
        host?.unregisterDock(this)
        host = null
        super.onDetachedFromWindow()
    }

    fun setSecondaryPage(value: Boolean) {
        if (secondary == value) return
        secondary = value
        tracking = false
        moveTo(value)
    }

    fun setActiveTab(value: String?) {
        if (activeTab == value) return
        activeTab = value
        // Run after the React prop batch so secondaryPage is already current.
        post {
            if (!secondary && !menuOpen) {
                tracking = false
                moveTo(false)
            }
        }
    }

    // Observe before a ScrollView/PagerView can intercept. Never consume the gesture.
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val bar = dock
                tracking = !menuOpen && !secondary && bar != null &&
                    event.y < bar.top + (bar.getChildAt(0)?.translationY ?: 0f)
                vertical = false
                downX = event.x
                pivotY = event.y
            }
            MotionEvent.ACTION_MOVE -> if (tracking) {
                val dy = event.y - pivotY
                if (!vertical && abs(event.x - downX) > slop && abs(event.x - downX) > abs(dy)) {
                    tracking = false
                } else if (abs(dy) > slop) {
                    vertical = true
                    moveTo(dy < 0f)
                }
                // Keep the local extremum so reversing does not require retracing the swipe.
                if (vertical) pivotY = if (collapsed) minOf(pivotY, event.y) else maxOf(pivotY, event.y)
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_POINTER_DOWN -> tracking = false
        }
        return super.dispatchTouchEvent(event)
    }

    private fun moveTo(hide: Boolean) {
        if (collapsed == hide) return
        collapsed = hide
        animator?.removeAllListeners()
        animator?.cancel()
        preparing = false
        restoring = false
        val end = if (hide) 1f else 0f
        val tabsHeight = dock?.getChildAt(1)?.height ?: 0
        // Detaching for RNN navigation clears isLaidOut. Yoga may reuse the
        // unchanged bounds on return, leaving that flag false even though the
        // dock is measured and visible. Use actual travel geometry instead.
        if (tabsHeight <= 0 || progress == end) {
            animator = null
            progress = end
            placeDock()
            host?.invalidate()
            return
        }
        animator = ValueAnimator.ofFloat(progress, end).also { motion ->
            motion.duration = (210 * abs(end - progress)).toLong().coerceAtLeast(1)
            motion.interpolator = DecelerateInterpolator()
            motion.addUpdateListener {
                progress = it.animatedValue as Float
                placeDock()
                host?.invalidate()
            }
            motion.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    animator = null
                    restoring = true
                    placeDock()
                    host?.invalidate()
                }
            })
        }
        preparing = true
        if (host == null) onCompositedFrame() else host?.invalidate()
    }

    // Called after both controls have drawn. Preparing/restore each survive one
    // complete composition, rather than guessing whether RN or a timer has finished.
    internal fun onCompositedFrame() {
        if (preparing) {
            preparing = false
            animator?.start()
        } else if (restoring) {
            restoring = false
            host?.postInvalidateOnAnimation()
        }
    }

    private fun placeDock() {
        val bar = dock ?: return
        val tabs = bar.getChildAt(1) ?: return
        val travel = tabs.height.toFloat()
        bar.getChildAt(0)?.translationY = (travel - bottomInset).coerceAtLeast(0f) * progress
        tabs.translationY = travel * progress
        tabs.visibility = if (collapsed && progress == 1f) View.INVISIBLE else View.VISIBLE
    }

    companion object {
        private fun owner(view: View): PortraitDockLayout? {
            var child = view
            var parent = view.parent
            while (parent is View && parent !is GlassBackdropHost) {
                if (parent is PortraitDockLayout) return if (child === parent.dock) parent else null
                child = parent
                parent = child.parent
            }
            return null
        }
        fun usesFrost(view: View): Boolean = owner(view)?.let { it.animator != null || it.restoring } ?: false
        fun usesLiquid(view: View): Boolean = owner(view)?.let { it.preparing || it.animator == null } ?: true
    }
}

internal class PortraitDockLayoutManager : ViewGroupManager<PortraitDockLayout>() {
    override fun getName() = "PortraitDockLayout"
    override fun createViewInstance(context: ThemedReactContext) = PortraitDockLayout(context)
    @ReactProp(name = "secondaryPage")
    fun setSecondary(view: PortraitDockLayout, value: Boolean) = view.setSecondaryPage(value)
    @ReactProp(name = "activeTab")
    fun setActiveTab(view: PortraitDockLayout, value: String?) = view.setActiveTab(value)
    @ReactProp(name = "menuOpen")
    fun setMenu(view: PortraitDockLayout, value: Boolean) { view.menuOpen = value }
    @ReactProp(name = "bottomInset")
    fun setInset(view: PortraitDockLayout, dp: Float) { view.bottomInset = dp * view.resources.displayMetrics.density }
}
