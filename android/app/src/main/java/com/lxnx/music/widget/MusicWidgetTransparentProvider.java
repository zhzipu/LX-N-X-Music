package com.lxnx.music.widget;

/**
 * 透明样式小组件：背景完全透明，文字/图标纯白，直接压在壁纸或桌面组件叠层上。
 * 布局：res/layout/widget_music_4x1_transparent.xml
 * 注册：AndroidManifest.xml -> res/xml/widget_music_info_transparent.xml
 *
 * 逻辑全部在 BaseMusicWidgetProvider，样式由布局决定，这里不需要重写任何方法。
 */
public class MusicWidgetTransparentProvider extends BaseMusicWidgetProvider {
}
