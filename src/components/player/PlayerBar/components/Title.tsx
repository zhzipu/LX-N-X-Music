import { TouchableOpacity, type LayoutChangeEvent } from 'react-native'
import { navigations } from '@/navigation'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import commonState from '@/store/common/state'
import playerState from '@/store/player/state'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import { createStyle, formatMusicName } from '@/utils/tools'
import { useRef } from 'react'
import { getSP, SP_FONT } from '@/theme/spotify/tokens'

/** 迷你播放条歌名：16 / 500，单行省略 */
export default ({ isHome, onLayout }: { isHome: boolean, onLayout: (event: LayoutChangeEvent) => void }) => {
  const musicInfo = usePlayerMusicInfo()
  const downloadFileName = useSettingValue('download.fileName')
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const longPressedRef = useRef(false)

  const handlePress = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false
      return
    }
    navigations.pushPlayDetailScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!)
  }

  const handleLongPress = () => {
    longPressedRef.current = true
    const listId = playerState.playMusicInfo.listId
    if (!listId || listId == LIST_IDS.DOWNLOAD) return
    global.app_event.jumpListPosition()
  }

  const title = musicInfo.id
    ? musicInfo.singer
      ? formatMusicName(downloadFileName, musicInfo.name, musicInfo.singer)
      : musicInfo.name
    : ''

  return (
    <TouchableOpacity
      onLayout={onLayout}
      style={styles.container}
      onLongPress={handleLongPress}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Text style={styles.title} color={sp.colors.text} size={SP_FONT.rowTitle} numberOfLines={1}>
        {title}
      </Text>
    </TouchableOpacity>
  )
}

const styles = createStyle({
  container: {
    width: '100%',
  },
  title: {
    fontWeight: SP_FONT.rowTitleWeight,
  },
})
