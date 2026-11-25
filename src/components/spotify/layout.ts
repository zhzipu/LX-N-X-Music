/**
 * Home 底部浮层（迷你播放条 + Tab 栏）在屏幕上占用的高度（dp）。
 *
 * 内容区现在铺到屏幕最底部，播放条 / Tab 栏是绝对定位的浮层（position: absolute），
 * 所以每个列表都要在 contentContainerStyle 里留出这段 padding，最后一项才能滚到
 * 浮层上方，而不是被玻璃挡住。
 *
 * 组成（与 components/spotify/GlassTabBar.tsx、components/player/PlayerBar/index.tsx 保持一致）：
 *   Tab 栏：paddingTop 8 + 胶囊高 64 + paddingBottom 8
 *   迷你播放条：高 56 + 与 Tab 栏的间距 8
 *   系统底部安全区：最多 40（TabBar 里 getBottomInset() 的上限）
 */
export const HOME_BOTTOM_OVERLAY_HEIGHT = 8 + 64 + 8 + 56 + 8 + 40
