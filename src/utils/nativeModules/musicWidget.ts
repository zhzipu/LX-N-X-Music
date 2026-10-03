import { NativeModules, NativeEventEmitter } from 'react-native'

const { MusicWidgetModule } = NativeModules

const widgetEmitter = new NativeEventEmitter(MusicWidgetModule)

/**
 * Update the home screen widget with current playback info
 */
export const updateWidget = async (
    title: string,
    artist: string,
    isPlaying: boolean,
    artworkUrl?: string,
): Promise<void> => {
    return MusicWidgetModule.updateWidget(title, artist, isPlaying, artworkUrl ?? '')
}

/**
 * 推送当前歌词行到桌面小组件，触发向上滚动动画
 * @param lyric 当前行歌词文本（纯文本，无时间标签）。传空串清空显示。
 */
export const updateLyric = async (lyric: string): Promise<void> => {
    return MusicWidgetModule.updateLyric(lyric ?? '')
}

/**
 * 推送播放进度到小组件进度条
 * @param progress 进度 0-100 整数（播放比例 * 100）
 */
export const updateProgress = async (progress: number): Promise<void> => {
    return MusicWidgetModule.updateProgress(Math.round(progress))
}

/**
 * Listen for widget button press events
 */
export const onWidgetPlayPause = (callback: () => void) => {
    return widgetEmitter.addListener('widget-play-pause', callback)
}

export const onWidgetPrev = (callback: () => void) => {
    return widgetEmitter.addListener('widget-prev', callback)
}

export const onWidgetNext = (callback: () => void) => {
    return widgetEmitter.addListener('widget-next', callback)
}
