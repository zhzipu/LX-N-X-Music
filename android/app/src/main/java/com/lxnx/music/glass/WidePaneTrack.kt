package com.lxnx.music.glass

import android.content.Context
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.views.view.ReactViewGroup

/** One rail: home | player | lyrics. Its viewport spans exactly two panes. */
class WidePaneTrack(context: Context) : ReactViewGroup(context) {
    private var progress = 0f
    private var host: GlassBackdropHost? = null

    fun setPageProgress(value: Float) {
        progress = value.coerceIn(0f, 1f)
        placeTrack()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        placeTrack()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        var ancestor = parent
        while (ancestor != null && ancestor !is GlassBackdropHost) ancestor = ancestor.parent
        host = ancestor as? GlassBackdropHost
        placeTrack()
    }

    override fun onDetachedFromWindow() {
        host = null
        super.onDetachedFromWindow()
    }

    private fun placeTrack() {
        // Use a real View translation and repaint the compositor in the same frame.
        // The home pane contains native glass overlays; merely animating a cached
        // RenderNode can otherwise leave them at their old screen coordinates.
        translationX = -width / 3f * progress
        host?.invalidate()
    }
}

class WidePaneTrackManager : ViewGroupManager<WidePaneTrack>() {
    override fun getName() = "WidePaneTrack"
    override fun createViewInstance(context: ThemedReactContext) = WidePaneTrack(context)
    @ReactProp(name = "pageProgress", defaultFloat = 0f)
    fun setPageProgress(view: WidePaneTrack, value: Float) = view.setPageProgress(value)
}
