package com.lxnx.music.glass

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/** Registers the liquid glass view with React Native. */
class LiquidGlassViewPackage : ReactPackage {

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = listOf(LiquidGlassViewManager(), GlassOverlayManager(), LiquidTabsViewManager(), GlassBackdropViewManager(), PortraitDockLayoutManager(), WidePaneTrackManager())

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = emptyList()
}
