import {
  init as initLyricPlayer,
  toggleTranslation,
  toggleRoma,
  play,
  pause,
  stop,
  setLyric,
  setPlaybackRate,
} from '@/core/lyric'
import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import {
  onDesktopLyricPositionChange,
  onDesktopLyricLockChange,
  showDesktopLyric,
  onLyricLinePlay,
  showRemoteLyric,
} from '@/core/desktopLyric'
import { updateLyric as updateWidgetLyric, updateProgress as updateWidgetProgress } from '@/utils/nativeModules/musicWidget'
import playerState from '@/store/player/state'
import { updateNowPlayingTitles } from '@/plugins/player/utils'
import { setLastLyric } from '@/core/player/playInfo'
import { state } from '@/plugins/player/playList'

const updateRemoteLyric = async (lrc?: string) => {
  setLastLyric(lrc)
  if (lrc == null) {
    void updateNowPlayingTitles(
      (state.prevDuration || 0) * 1000,
      playerState.musicInfo.name,
      playerState.musicInfo.singer ?? '',
      playerState.musicInfo.album ?? ''
    )
  } else {
    void updateNowPlayingTitles(
      (state.prevDuration || 0) * 1000,
      lrc,
      `${playerState.musicInfo.name}${playerState.musicInfo.singer ? ` - ${playerState.musicInfo.singer}` : ''}`,
      playerState.musicInfo.album ?? ''
    )
  }
}

export default async (setting: LX.AppSetting) => {
  await initLyricPlayer()
  await Promise.all([
    setPlaybackRate(setting['player.playbackRate']),
    toggleTranslation(setting['player.isShowLyricTranslation']),
    toggleRoma(setting['player.isShowLyricRoma']),
  ])

  if (setting['desktopLyric.enable']) {
    showDesktopLyric().catch(() => {
      updateSetting({ 'desktopLyric.enable': false })
    })
  }
  if (setting['player.isShowBluetoothLyric']) {
    showRemoteLyric(true).catch(() => {
      updateSetting({ 'player.isShowBluetoothLyric': false })
    })
  }
  onDesktopLyricPositionChange((position) => {
    updateSetting({
      'desktopLyric.position.x': position.x,
      'desktopLyric.position.y': position.y,
    })
  })
  onDesktopLyricLockChange((isLock) => {
    if (settingState.setting['desktopLyric.isLock'] !== isLock) {
      updateSetting({ 'desktopLyric.isLock': isLock })
    }
  })
  onLyricLinePlay(({ text, extendedLyrics }) => {
    // 推送当前歌词行到桌面小组件（原生桌面歌词事件，原生层推进，比 JS lrc 更可靠）
    void updateWidgetLyric(text ?? '').catch(() => {})
    if (!settingState.setting['player.isShowBluetoothLyric']) return
    if (!text && !state.isPlaying) {
      void updateRemoteLyric()
    } else {
      void updateRemoteLyric(text)
    }
  })

  global.app_event.on('play', play)
  global.app_event.on('pause', pause)
  global.app_event.on('stop', stop)
  global.app_event.on('error', pause)
  global.app_event.on('musicToggled', stop)
  global.app_event.on('lyricUpdated', setLyric)

  // 推送播放进度到桌面小组件进度条（progress 为 0-1 比例，转 0-100 整数）
  global.state_event.on('playProgressChanged', (progressInfo: { progress?: number }) => {
    void updateWidgetProgress((progressInfo.progress ?? 0) * 100).catch(() => {})
  })
}
