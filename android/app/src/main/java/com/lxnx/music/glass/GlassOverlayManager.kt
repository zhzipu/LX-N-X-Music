package com.lxnx.music.glass

import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager

/**
 * 把 [GlassOverlay] 暴露给 React Native。
 *
 * JS 侧：`requireNativeComponent('GlassOverlay')`，用法同普通 ViewGroup。
 */
class GlassOverlayManager : ViewGroupManager<GlassOverlay>() {

    override fun getName(): String = NAME

    override fun createViewInstance(reactContext: ThemedReactContext): GlassOverlay =
        GlassOverlay(reactContext)

    companion object {
        const val NAME = "GlassOverlay"
    }
}
