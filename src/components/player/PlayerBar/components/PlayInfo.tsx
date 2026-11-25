import { memo, useCallback, useState } from 'react'
import { View } from 'react-native'
import Status from './Status'
import { createStyle } from '@/utils/tools'
import { COMPONENT_IDS } from '@/config/constant'
import { usePageVisible } from '@/store/common/hook'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { getSP, SP_FONT } from '@/theme/spotify/tokens'

/**
 * 迷你播放条副标题：始终由 Status 渲染，歌词 / 播放状态优先，
 * 两者都为空时才回落到歌手名（13 / 400 / 0.62 透明度）。
 * 这样既符合 Apple Music 的「歌词压在主信息下」观感，也不丢 LX 原有的迷你条歌词能力。
 */
export default memo(({ isHome }: { isHome: boolean }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const musicInfo = usePlayerMusicInfo()
  const [autoUpdate, setAutoUpdate] = useState(true)

  usePageVisible(
    [COMPONENT_IDS.home],
    useCallback(
      (visible) => {
        if (isHome) setAutoUpdate(visible)
      },
      [isHome],
    ),
  )

  const singer = musicInfo.id ? musicInfo.singer : ''

  return (
    <View style={styles.container}>
      <Status
        autoUpdate={autoUpdate}
        fallback={singer}
        fallbackSize={SP_FONT.rowSubtitle}
        fallbackColor={sp.colors.textSecondary}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
    justifyContent: 'center',
    height: '100%',
  },
})
