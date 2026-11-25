package com.lxnx.music.glass

import android.graphics.Canvas

/**
 * 需要从「真实背景」采样的玻璃视图。
 *
 * 背景由 [GlassBackdropHost] 每帧录进一个 RenderNode；实现方负责：
 *  1. 在宿主录制背景期间整帧跳过自己（见 [GlassBackdropHost.isRecording]），
 *     否则玻璃会把自己也录进背景，形成递归；
 *  2. 把「偏移采样背景 + 效果链 + tint + 高光」画到 canvas 上，也就是本接口的方法。
 *
 * [LiquidGlassView] 在自己的 onDraw 里调用 [drawOnBackdrop]；宿主只需要知道树里
 * 有没有玻璃（有没有必要录制背景），所以接口保持这一个绘制入口即可。
 */
interface GlassSampler {

    /**
     * 用宿主刚录好的背景节点，把玻璃画到 [canvas] 上。
     *
     * canvas 已经处于本 View 的局部坐标系（原点 = View 左上角），并且调用方
     * 会保证此时不处于背景录制阶段。
     */
    fun drawOnBackdrop(canvas: Canvas)
}
