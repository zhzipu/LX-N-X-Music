package com.lxnx.music.glass

import android.content.Context
import android.graphics.Canvas
import android.view.View
import android.view.ViewParent
import android.widget.FrameLayout

/**
 * 玻璃「浮层」容器。
 *
 * ## 为什么需要它
 *
 * 背景录制宿主会给每块玻璃录一张「身后的界面」再补画玻璃。玻璃本身是纯 [View]，
 * 不能带 children，所以玻璃只能当兄弟节点里的**背景层**（absoluteFill）。
 * 如果同一容器里还有排在玻璃之后的图标 / 选中胶囊，它们会被录进背景节点，
 * 于是玻璃补画上去时，图标就被玻璃盖住（而且是被模糊过的残影）。
 *
 * 解法：把「玻璃 + 压在上面的内容」整块包进这个容器。宿主录制背景时整块跳过，
 * 背景上屏之后再把整块浮层按自己的 z 序画一遍 —— 玻璃在里面先画（从背景节点取样），
 * 图标后画，层级自然正确。
 *
 * ## 用法（RN 侧）
 *
 * ```tsx
 * <GlassOverlay style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
 *   <GlassSurface style={StyleSheet.absoluteFill} borderRadius={31} />
 *   <View>{icons…}</View>
 * </GlassOverlay>
 * ```
 *
 * 不在浮层里的玻璃仍由宿主统一补画；两种模式可以共存。
 */
class GlassOverlay(context: Context) : FrameLayout(context) {

    override fun dispatchDraw(canvas: Canvas) {
        // 宿主正在录背景：整块浮层跳过，它属于前景。
        if (GlassBackdropHost.isRecording()) return
        super.dispatchDraw(canvas)
    }

    /**
     * 空的布局实现，**不要**改成 super.onLayout。
     *
     * RN 的 UIManager 会在每帧用 Yoga 算好的坐标显式 measure/layout 每个子 View
     * （ReactViewGroup 的 onLayout 也是空实现）。但 [FrameLayout.onLayout] 会按
     * gravity + padding 再把子 View 摆一遍，把 Yoga 的 x/y 覆盖掉：padding 只在
     * Yoga 的 shadow node 上生效，原生 View 的 padding 是 0，于是整块内容被摆到
     * 浮层左上角——实测 TabBar 整条左移 16dp、贴到浮层顶部，看起来就是「不居中」。
     */
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        // no-op：子 View 的位置由 RN 负责。
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        ancestorHost()?.registerOverlay(this)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        ancestorHost()?.unregisterOverlay(this)
    }

    /** 本浮层是否嵌在另一个浮层里（嵌套时只由最外层负责绘制）。 */
    fun isNestedInOverlay(): Boolean {
        var p: ViewParent? = parent
        while (p != null) {
            if (p is GlassOverlay) return true
            p = p.parent
        }
        return false
    }

    private fun ancestorHost(): GlassBackdropHost? {
        var p: ViewParent? = parent
        while (p != null) {
            if (p is GlassBackdropHost) return p
            p = p.parent
        }
        return null
    }

    /** 供宿主兜底扫描用：递归找宿主。 */
    internal fun findHost(): GlassBackdropHost? = ancestorHost()

    internal fun rootView(): View = this
}
