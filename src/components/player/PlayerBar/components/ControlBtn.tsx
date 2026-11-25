import { memo, useCallback } from 'react'
import { Icon } from '@/components/common/Icon'
import { useIsPlay } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { playNext, playPrev, togglePlay } from '@/core/player/player'
import { createStyle } from '@/utils/tools'
import { useHorizontalMode } from '@/utils/hooks'
import PressScale from '@/components/myspotify/PressScale'
import { getSP, SP_SIZE } from '@/theme/spotify/tokens'

/** 图标 26，命中区域 = 26 + 20 = 46（间隙即设计稿要求的 20） */
const BTN_SIZE = SP_SIZE.playerBarPlayIcon
const TAP_AREA = 46

const handlePlayPrev = () => {
  void playPrev()
}
const handlePlayNext = () => {
  void playNext()
}

const PlayPrevBtn = () => {
  const theme = useTheme()
  return (
    <PressScale style={styles.cotrolBtn} onPress={handlePlayPrev} accessibilityLabel="prev">
      <Icon name="prevMusic" color={getSP(theme.isDark).colors.text} size={BTN_SIZE} />
    </PressScale>
  )
}

const PlayNextBtn = () => {
  const theme = useTheme()
  return (
    <PressScale style={styles.cotrolBtn} onPress={handlePlayNext} accessibilityLabel="next">
      <Icon name="nextMusic" color={getSP(theme.isDark).colors.text} size={BTN_SIZE} />
    </PressScale>
  )
}

const TogglePlayBtn = () => {
  const isPlay = useIsPlay()
  const theme = useTheme()
  const handleTogglePlay = useCallback(() => {
    togglePlay()
  }, [])

  return (
    <PressScale style={styles.cotrolBtn} onPress={handleTogglePlay} accessibilityLabel="play/pause">
      <Icon name={isPlay ? 'pause' : 'play'} color={getSP(theme.isDark).colors.text} size={BTN_SIZE} />
    </PressScale>
  )
}

export default memo(() => {
  const isHorizontalMode = useHorizontalMode()
  return (
    <>
      {/* 横屏下多显示一个「上一首」，保持既有行为 */}
      {isHorizontalMode ? <PlayPrevBtn /> : null}
      <TogglePlayBtn />
      <PlayNextBtn />
    </>
  )
})

const styles = createStyle({
  cotrolBtn: {
    width: TAP_AREA,
    height: TAP_AREA,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
