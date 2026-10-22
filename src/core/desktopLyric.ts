import {
  hideDesktopLyricView,
  showDesktopLyricView,
  setSendLyricTextEvent,
  setLyric,
  play,
  pause,
  setPlaybackRate,
  toggleTranslation,
  toggleRoma,
  toggleLock,
  setColor,
  setAlpha,
  setTextSize,
  setShowToggleAnima,
  setSingleLine,
  setPosition,
  setMaxLineNum,
  setWidth,
  setLyricTextPosition,
  checkOverlayPermission,
  openOverlayPermissionActivity,
  onPositionChange,
  onLockChange,
} from '@/utils/nativeModules/lyricDesktop'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { tranditionalize } from '@/utils/simplify-chinese-main'
import { getPosition } from '@/plugins/player'
import { windowSizeTools } from "@/utils/windowSizeTools.ts";
import { updateSetting } from "@/core/common.ts";
import { bakeLyricTime, resolveLyric } from '@/core/lyricAdjust'
export { onLyricLinePlay } from '@/utils/nativeModules/lyricDesktop'

/**
 * 桌面/蓝牙歌词由原生自己解析时间轴，所以偏移与倍速都要直接改写进 `[mm:ss]`，
 * 不能只依赖 JS 侧 lrc 解析器的 offset / 速率。
 */
const getLyricTexts = () => {
  const { lyric, tlrc, rlrc, offset, speed } = resolveLyric(playerState.musicInfo)
  return {
    lrc: bakeLyricTime(lyric, speed, offset),
    tlrc: bakeLyricTime(tlrc, speed, offset),
    rlrc: bakeLyricTime(rlrc, speed, offset),
  }
}

export const showDesktopLyric = async () => {
  const setting = settingState.setting

  let positionX = setting['desktopLyric.position.x'];
  let positionY = setting['desktopLyric.position.y'];

  // 如果歌词位置是初始的 (0,0)，则自动计算并设置为顶部居中
  if (positionX === 0 && positionY === 0) {
    const { width: screenWidth, height: screenHeight } = windowSizeTools.getSize();
    const lyricWidthPercent = 100;
    const lyricWidth = screenWidth;

    // 计算居中的 x 坐标
    positionX = (screenWidth - lyricWidth) / 2;
    positionY = screenHeight * 0.15;

    updateSetting({
      'desktopLyric.position.x': positionX,
      'desktopLyric.position.y': positionY,
    });
  }

  await showDesktopLyricView({
    isShowToggleAnima: setting['desktopLyric.showToggleAnima'],
    isSingleLine: setting['desktopLyric.isSingleLine'],
    isLock: setting['desktopLyric.isLock'],
    unplayColor: setting['desktopLyric.style.lyricUnplayColor'],
    playedColor: setting['desktopLyric.style.lyricPlayedColor'],
    shadowColor: setting['desktopLyric.style.lyricShadowColor'],
    opacity: setting['desktopLyric.style.opacity'],
    textSize: setting['desktopLyric.style.fontSize'],
    width: 100,
    maxLineNum: setting['desktopLyric.maxLineNum'],
    positionX: setting['desktopLyric.position.x'],
    positionY: setting['desktopLyric.position.y'],
    textPositionX: setting['desktopLyric.textPosition.x'],
    textPositionY: setting['desktopLyric.textPosition.y'],
  })
  let { lrc, tlrc, rlrc } = getLyricTexts()
  if (setting['player.isS2t']) {
    lrc = tranditionalize(lrc)
    tlrc = tranditionalize(tlrc)
  }
  await setLyric(lrc, tlrc, rlrc)
  if (playerState.isPlay && !global.lx.gettingUrlId) {
    void getPosition().then((position) => {
      void play(position * 1000)
    })
  }
}

export const hideDesktopLyric = async () => {
  return hideDesktopLyricView()
}

export const playDesktopLyric = play
export const pauseDesktopLyric = pause
export const setDesktopLyric = setLyric
export const setDesktopLyricPlaybackRate = setPlaybackRate
export const toggleDesktopLyricTranslation = toggleTranslation
export const toggleDesktopLyricRoma = toggleRoma
export const toggleDesktopLyricLock = toggleLock
export const setDesktopLyricColor = async (
  unplayColor: string | null,
  playedColor: string | null,
  shadowColor: string | null
) => {
  return setColor(
    unplayColor ?? settingState.setting['desktopLyric.style.lyricUnplayColor'],
    playedColor ?? settingState.setting['desktopLyric.style.lyricPlayedColor'],
    shadowColor ?? settingState.setting['desktopLyric.style.lyricShadowColor']
  )
}
export const setDesktopLyricAlpha = setAlpha
export const setDesktopLyricTextSize = setTextSize
export const setShowDesktopLyricToggleAnima = setShowToggleAnima
export const setDesktopLyricSingleLine = setSingleLine
export const setDesktopLyricPosition = setPosition
export const setDesktopLyricMaxLineNum = setMaxLineNum
export const setDesktopLyricWidth = setWidth
export const setDesktopLyricTextPosition = async (
  x: LX.AppSetting['desktopLyric.textPosition.x'] | null,
  y: LX.AppSetting['desktopLyric.textPosition.y'] | null
) => {
  return setLyricTextPosition(
    x ?? settingState.setting['desktopLyric.textPosition.x'],
    y ?? settingState.setting['desktopLyric.textPosition.y']
  )
}
export const checkDesktopLyricOverlayPermission = checkOverlayPermission
export const openDesktopLyricOverlayPermissionActivity = openOverlayPermissionActivity
export const onDesktopLyricPositionChange = onPositionChange
export const onDesktopLyricLockChange = onLockChange

export const showRemoteLyric = async (isSend: boolean) => {
  await setSendLyricTextEvent(isSend)
  if (isSend) {
    let { lrc, tlrc, rlrc } = getLyricTexts()
    if (settingState.setting['player.isS2t']) {
      lrc = tranditionalize(lrc)
      tlrc = tranditionalize(tlrc)
    }
    await setLyric(lrc, tlrc, rlrc)
    if (playerState.isPlay && !global.lx.gettingUrlId) {
      void getPosition().then((position) => {
        void play(position * 1000)
      })
    }
  }
}
