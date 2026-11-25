import { memo } from 'react'
import { View } from 'react-native'

import AudioWave from '@/components/player/AudioWave'
import PlayInfo from './components/PlayInfo'
import ControlBtn from './components/ControlBtn'
import { createStyle } from '@/utils/tools'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { getSP, SP_FONT, SP_SPACING } from '@/theme/spotify/tokens'

/**
 * 标题区（spoti.pw）：歌名 24 / 700 纯白居中，歌手 14 / 400、65% 白居中。
 *
 * 原来挂在这一行右侧的播放模式按钮，已按规范挪到下面的控制行（ControlBtn）里。
 */
const PlayerInfo = memo(() => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const playMusicInfo = usePlayMusicInfo()
  const musicInfo = playMusicInfo.musicInfo
    ? 'progress' in playMusicInfo.musicInfo
      ? playMusicInfo.musicInfo.metadata.musicInfo
      : playMusicInfo.musicInfo
    : null

  return (
    <View style={styles.infoText}>
      <Text
        style={styles.title}
        size={SP_FONT.playerTitle}
        color={sp.colors.text}
        numberOfLines={1}
      >
        {musicInfo?.name ?? ''}
      </Text>
      <Text
        style={styles.singer}
        size={SP_FONT.playerSinger}
        color={sp.colors.textSecondary}
        numberOfLines={1}
      >
        {musicInfo?.singer ?? ''}
      </Text>
    </View>
  )
})

/**
 * 底部信息与控制区：铺在纯黑底上，没有卡片底色 / 描边（spoti.pw 的层级靠留白与玻璃圆钮）。
 */
export default memo(({ forceAudioWaveVisible = false, compactControls = false, glassEnabled = true }: { forceAudioWaveVisible?: boolean, compactControls?: boolean, glassEnabled?: boolean }) => {
  return (
    <View style={styles.container} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_player}>
      <PlayerInfo />
      <PlayInfo />
      <ControlBtn compact={compactControls} glassEnabled={glassEnabled} />
      <AudioWave forceVisible={forceAudioWaveVisible} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 0,
    flexDirection: 'column',
    paddingHorizontal: SP_SPACING.xxl,
    paddingTop: SP_SPACING.sm,
    paddingBottom: SP_SPACING.xl,
  },
  infoText: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingBottom: SP_SPACING.md,
  },
  title: {
    fontWeight: SP_FONT.playerTitleWeight,
    textAlign: 'center',
  },
  singer: {
    fontWeight: SP_FONT.playerSingerWeight,
    textAlign: 'center',
    paddingTop: SP_SPACING.xxs,
  },
})
