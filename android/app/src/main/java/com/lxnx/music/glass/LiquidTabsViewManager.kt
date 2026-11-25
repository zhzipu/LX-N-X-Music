package com.lxnx.music.glass

import com.facebook.react.bridge.ReadableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewGroupManager
import com.facebook.react.uimanager.annotations.ReactProp

class LiquidTabsViewManager : ViewGroupManager<LiquidTabsView>() {
    override fun getName() = "LiquidTabsView"
    override fun createViewInstance(context: ThemedReactContext) = LiquidTabsView(context)
    @ReactProp(name = "selectedIndex", defaultInt = 0)
    fun setSelectedIndex(view: LiquidTabsView, value: Int) = view.setSelectedIndex(value)
    @ReactProp(name = "glassParams")
    fun setGlassParams(view: LiquidTabsView, value: ReadableMap?) = view.setGlassParams(value)
    @ReactProp(name = "dark", defaultBoolean = true)
    fun setDark(view: LiquidTabsView, value: Boolean) = view.setDark(value)
    override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> =
        mutableMapOf("topTabSelect" to mapOf("registrationName" to "onTabSelect"))
}

/** A preview inside an RN Modal needs a backdrop in that Modal's own window. */
class GlassBackdropViewManager : ViewGroupManager<GlassBackdropHost>() {
    override fun getName() = "GlassBackdropView"
    override fun createViewInstance(context: ThemedReactContext) = GlassBackdropHost(context, yogaLayout = true)
}
