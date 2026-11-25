package com.lxnx.music.glass

import android.content.Context
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.RenderNode
import android.os.Build
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewParent
import android.widget.FrameLayout

/**
 * 背景录制宿主：包在 RN 根视图（ReactRootView）外面。
 *
 * 每帧做三件事：
 *  1. 把「除玻璃以外」的整棵子树录进一个 [RenderNode]（`glass-backdrop`）；
 *  2. 这个节点直接作为背景上屏；
 *  3. 再把注册进来的玻璃按顺序补画到背景之上（[GlassSampler.drawOnBackdrop]）。
 *
 * 玻璃在绘制时会以「窗口坐标差」为偏移，从第 1 步的节点里取背景，叠模糊 / 折射 /
 * tint / 高光，于是玻璃背后看到的是**真实界面**，而不是一张固定封面图。
 *
 * ## 为什么玻璃必须由宿主统一绘制，而不是在自己 onDraw 里画
 *
 * 硬件加速下，父容器录制显示列表时并不会重新执行子 View 的 onDraw，而是记录一个
 * 指向子 View 自己的 RenderNode 的引用（DrawRenderNodeOp）。如果玻璃在 onDraw 里
 * 把「背景节点」画进自己的显示列表，而背景节点又引用着整棵视图树（树里包含玻璃），
 * 就会形成 RenderNode 引用环：玻璃 → 背景 → 树 → 玻璃，绘制时无限递归。
 *
 * 所以这里的分工是：
 *  - 玻璃的显示列表保持为空（[LiquidGlassView.onDraw] 有宿主时直接返回）；
 *  - 宿主录完背景后，在**自己的**显示列表里调用玻璃的 [GlassSampler.drawOnBackdrop]，
 *    玻璃的私有节点只被宿主引用，不参与视图树，因此不会成环；
 *  - 玻璃里挂的 RN children 也由 drawOnBackdrop 画（见 LiquidGlassView），
 *    保证它们位于玻璃之上。
 *
 * ## 已知限制
 *
 * 由于背景节点是「整棵树」的引用，玻璃又被统一补画在最后，玻璃会盖住排在它之后的
 * 兄弟视图（例如 TabBar 里玻璃底之后的选中胶囊和图标行）。这是「宿主统一合成」
 * 这一架构的固有取舍；如果某处需要玻璃在下、兄弟在上，需要把兄弟视图放到玻璃之外的
 * 另一层容器里。
 */
class GlassBackdropHost @JvmOverloads constructor(context: Context, private val yogaLayout: Boolean = false) : FrameLayout(context) {

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        if (!yogaLayout) super.onLayout(changed, left, top, right, bottom)
    }

    companion object {
        private const val TAG = "GlassBackdropHost"

        /**
         * 录制深度：>0 表示当前正有宿主在往 RenderNode 里录背景。
         *
         * 用深度而不是 boolean，是为了容忍宿主嵌套（内层录制结束后标志仍然为 true，
         * 直到最外层录制结束）。
         */
        @Volatile
        private var recordingDepth = 0

        /** 玻璃视图在 onDraw / dispatchDraw 里用它判断「这一帧是在录背景」。 */
        @JvmStatic
        fun isRecording(): Boolean = recordingDepth > 0

        /** 排查玻璃位置用：只打一次每块玻璃的可见区域。 */
        private const val DEBUG_GLASS = false
    }

    /**
     * 背景节点。API 29 起才有 RenderNode；低版本为 null，宿主退化成普通 FrameLayout，
     * 玻璃走降级绘制（见 LiquidGlassView.onDraw）。
     */
    private val node: RenderNode? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) RenderNode("glass-backdrop") else null

    /** 复用的可见区域缓存（只在 UI 线程用）。 */
    private val visibleRect = Rect()
    private val loggedGlass = HashSet<String>()

    /** 逐级上溯算位置时用的临时对象（避免绘制期分配）。 */
    private val visibleChainRect = Rect()

    /**
     * 这个 View 在宿主坐标系里是否真的落在屏幕范围内。
     *
     * 为什么要自己算位置、而不是直接用现成 API：
     *  - [View.getGlobalVisibleRect] 只按「布局位置 + 滚动」算，**不乘 translation**；
     *    而 PagerView 是用 translation 摆放页面的，离屏页的玻璃会被判成可见 —— 输入框一旦被
     *    滚进过视野，切到别的页面它还会被钉在屏幕上（这就是之前的「玻璃输入框固定」bug）。
     *  - [ViewGroup.getChildVisibleRect] 虽然会算 translation，但它**逐级按父容器边界裁剪**；
     *    底部浮层里有绝对定位、超出父容器的子 View（父容器高度可能是 0），会被误判成不可见，
     *    结果整条迷你播放条 + Tab 栏直接不画了。
     *
     * 所以这里只做「累加位置」：逐级叠加 left/top 与 translation，减去父容器 scroll，
     * 不做任何裁剪，最后只和宿主自身范围求交。绝对定位溢出父容器的浮层因此不受影响。
     */
    /**
     * 把 [view] 在宿主坐标系里的位置算到 [out]（x, y）。
     *
     * 绘制和可见性判断必须共用这一套：分页器是用 translation 摆放页面的，
     * `getLocationInWindow` 不乘这些矩阵，会在非第一页上算出「整页宽」的偏移，
     * 玻璃/浮层就被画到屏幕外（表现是内容在、但什么都看不见）。
     */
    fun offsetInHost(view: View, out: FloatArray) {
        var offsetX = 0f
        var offsetY = 0f
        var child: View = view
        var parent: ViewParent? = view.parent
        while (parent != null) {
            offsetX += child.left + child.translationX
            offsetY += child.top + child.translationY
            if (parent is GlassBackdropHost) break
            if (parent is ViewGroup) {
                offsetX -= parent.scrollX
                offsetY -= parent.scrollY
            }
            if (parent !is View) break
            child = parent
            parent = parent.parent
        }
        out[0] = offsetX
        out[1] = offsetY
    }

    private val visibilityOffset = FloatArray(2)

    private fun isVisibleInHost(view: View): Boolean {
        if (!view.isShown) return false
        if (view.width <= 0 || view.height <= 0) return false
        offsetInHost(view, visibilityOffset)
        val left = visibilityOffset[0]
        val top = visibilityOffset[1]
        // 和宿主自身范围求交（留 1px 容差，避免边界刚好贴边被丢掉）
        return left + view.width > -1f && top + view.height > -1f && left < width + 1f && top < height + 1f
    }

    private fun ancestorAlphaOf(view: View): Float {
        var alpha = 1f
        var p: ViewParent? = view.parent
        while (p != null) {
            if (p is GlassBackdropHost) break
            if (p is View) alpha *= p.alpha
            p = p.parent
        }
        return alpha
    }

    /**
     * 注册进来的玻璃，按 attach 顺序（≈ 树序）。
     *
     * 由玻璃在 onAttachedToWindow 里注册（O(1)），不做每帧全树遍历：
     * RN 的视图是异步挂载的，深度嵌套的玻璃增删不会触发宿主的 onViewAdded。
     */
    private val glassViews = ArrayList<GlassSampler>(4)

    /**
     * 注册进来的玻璃浮层（[GlassOverlay]）。
     *
     * 浮层里通常是「玻璃底 + 压在上面的图标/文字」，整块不参与背景录制，
     * 背景上屏后再整体画一遍，这样图标才不会被玻璃盖住。
     */
    private val overlays = ArrayList<GlassOverlay>(2)
    private val docks = ArrayList<PortraitDockLayout>(1)
    internal fun registerDock(dock: PortraitDockLayout) { if (!docks.contains(dock)) docks.add(dock) }
    internal fun unregisterDock(dock: PortraitDockLayout) { docks.remove(dock) }

    /** 背景节点；null 表示当前系统版本不支持 RenderNode。 */
    fun backdropNode(): RenderNode? = node

    /** 宿主在窗口里的位置，玻璃用它和自己的位置算偏移。 */
    fun hostLocation(out: IntArray) {
        getLocationInWindow(out)
    }

    /** 供 [LiquidGlassView] 在 attach 时注册自己。 */
    fun registerGlass(glass: GlassSampler) {
        if (glassViews.contains(glass)) return
        glassViews.add(glass)
        // 有玻璃了，下一帧需要开始录背景。
        invalidate()
    }

    /** 供 [LiquidGlassView] 在 detach 时注销自己。 */
    fun unregisterGlass(glass: GlassSampler) {
        if (glassViews.remove(glass)) invalidate()
    }

    /** 供 [GlassOverlay] 在 attach 时登记自己。 */
    fun registerOverlay(overlay: GlassOverlay) {
        if (overlays.contains(overlay)) return
        overlays.add(overlay)
        invalidate()
    }

    /** 供 [GlassOverlay] 在 detach 时注销自己。 */
    fun unregisterOverlay(overlay: GlassOverlay) {
        if (overlays.remove(overlay)) invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        // 兜底：如果宿主的包装晚于玻璃的 attach（RNN 的全局布局包装就是这种情况），
        // 玻璃的 onAttachedToWindow 里还找不到宿主，这里补登记一次。
        collectGlassViews(this)
    }

    private fun collectGlassViews(view: View) {
        if (view is GlassSampler && !glassViews.contains(view)) {
            glassViews.add(view)
        }
        if (view is GlassOverlay && !overlays.contains(view)) {
            overlays.add(view)
        }
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                collectGlassViews(view.getChildAt(i))
            }
        }
    }

    override fun dispatchDraw(canvas: Canvas) {
        val node = this.node
        val w = width
        val h = height
        // API < 29、还没量出尺寸、或者树里没有玻璃：完全走普通绘制，不付录制的成本。
        if (node == null || w <= 0 || h <= 0 || glassViews.isEmpty()) {
            super.dispatchDraw(canvas)
            docks.forEach { it.onCompositedFrame() }
            return
        }

        // ---- 1. 录制背景 ----------------------------------------------------
        // recordingDepth++ 之后，玻璃在 onDraw / dispatchDraw 里会整帧跳过自己，
        // 所以这次 super.dispatchDraw 录下来的只有背景（含所有非玻璃视图）。
        recordingDepth++
        try {
            node.setPosition(0, 0, w, h)
            val recorder = node.beginRecording(w, h)
            try {
                super.dispatchDraw(recorder)
            } finally {
                // 无论子树绘制是否抛异常都要结束录制，否则节点会一直停在录制状态。
                node.endRecording()
            }
        } catch (t: Throwable) {
            // 录制失败不致命：节点保留上一帧内容，玻璃仍能画（只是背景可能是旧的）。
            Log.w(TAG, "背景录制失败，本帧沿用上一帧内容", t)
        } finally {
            recordingDepth--
        }

        // ---- 2. 背景上屏 ----------------------------------------------------
        // 节点里存的是对子树 RenderNode 的引用，子树自身的更新会直接反映出来，
        // 所以只需要把节点画出来，不必再走一次 super.dispatchDraw。
        canvas.drawRenderNode(node)

        // ---- 3. 玻璃补画到背景之上 ------------------------------------------
        // 用下标遍历并每次重新取 size：绘制过程中若有玻璃 detach，不会越界。
        // 注意：浮层里的玻璃也要在这里画。浮层本身在第 4 步才画，所以玻璃一定压在
        // 浮层内容（图标/胶囊）下面，层级是对的；反过来若交给浮层自己画，浮层回放的是
        // 子 View 缓存的显示列表，玻璃的 onDraw 不会执行，采样/模糊就整条链失效了
        // （表现就是玻璃 100% 透明、只剩一条描边）。
        var i = 0
        while (i < glassViews.size) {
            val glass = glassViews[i]
            val view = glass as? View
            // 宿主绕过了子 View 的正常绘制流程，可见性要自己判断：
            //  - isShown：自身/祖先 VISIBLE 且已 attach；
            //  - getGlobalVisibleRect：再裁掉被父容器挡住的玻璃（pager 未激活页、抽屉、
            //    滚动裁剪等）。少了这一步，未激活页里的玻璃会被按窗口坐标画到当前页上
            //    —— 实测搜索页的搜索框会"漂"到首页标题下面。
            if (view != null && isVisibleInHost(view)) {
                if (DEBUG_GLASS) {
                    val key = "${view.javaClass.simpleName}@$visibleRect"
                    if (loggedGlass.add(key)) Log.d(TAG, "draw glass $key alpha=${ancestorAlphaOf(view)}")
                }
                glass.drawOnBackdrop(canvas)
            }
            i++
        }

        // ---- 4. 玻璃浮层（玻璃 + 上层图标）最后整体画 --------------------------
        // 浮层里的内容没有进背景节点，所以这里必须按自己的坐标平移后再画。
        drawOverlays(canvas)
        docks.forEach { it.onCompositedFrame() }
    }

    private fun drawOverlays(canvas: Canvas) {
        if (overlays.isEmpty()) return
        val overlayOffset = FloatArray(2)
        var i = 0
        while (i < overlays.size) {
            val overlay = overlays[i]
            // 嵌套浮层交给最外层画，避免同一块内容被画两遍。
            // 可见性判断和玻璃一致：isShown + getGlobalVisibleRect —— 少了后者，
            // 未激活 pager 页里的浮层（例如搜索页的搜索框）会被按窗口坐标画到当前页上，
            // 表现为屏幕上多一块"重影玻璃"。
            if (!overlay.isNestedInOverlay() && isVisibleInHost(overlay)) {
                offsetInHost(overlay, overlayOffset)
                // 祖先的 alpha（例如抽屉打开时给底栏做的淡出）不会自动生效：
                // 宿主是绕过 View 树直接画浮层的，这里手动乘进一个 layer。
                val alpha = ancestorAlphaOf(overlay).coerceIn(0f, 1f)
                if (alpha > 0.01f) {
                    val save = canvas.save()
                    canvas.translate(overlayOffset[0], overlayOffset[1])
                    val layer = if (alpha < 0.999f) {
                        canvas.saveLayerAlpha(
                            0f, 0f,
                            overlay.width.toFloat(), overlay.height.toFloat(),
                            (alpha * 255f).toInt().coerceIn(0, 255),
                        )
                    } else {
                        -1
                    }
                    overlay.draw(canvas)
                    if (layer >= 0) canvas.restoreToCount(layer)
                    canvas.restoreToCount(save)
                }
            }
            i++
        }
    }
}
