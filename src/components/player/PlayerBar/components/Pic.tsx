import { StyleSheet, TouchableOpacity } from 'react-native'
import { navigations } from '@/navigation'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { scaleSizeH } from '@/utils/pixelRatio'
import commonState from '@/store/common/state'
import playerState from '@/store/player/state'
import { LIST_IDS, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import Image from '@/components/common/Image'
import idlePlayerCover from '@/resources/images/milky-music-icon.png'
import { useCallback, useRef } from 'react'
import { setLoadErrorPicUrl, setMusicInfo } from '@/core/player/playInfo'
import { SP_SIZE } from '@/theme/spotify/tokens'

/** 迷你播放条封面：spoti.pw 是 40dp 全圆（之前是 48 圆角 8） */
const PIC_SIZE = scaleSizeH(SP_SIZE.playerBarCover)

const styles = StyleSheet.create({
  image: {
    width: PIC_SIZE,
    height: PIC_SIZE,
    borderRadius: PIC_SIZE / 2,
  },
})

export default ({ isHome }: { isHome: boolean }) => {
  const musicInfo = usePlayerMusicInfo()
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
    if (!isHome) return
    const listId = playerState.playMusicInfo.listId
    if (!listId || listId == LIST_IDS.DOWNLOAD) return
    global.app_event.jumpListPosition()
  }

  const handleError = useCallback((url: string | number) => {
    setLoadErrorPicUrl(url as string)
    setMusicInfo({
      pic: null,
    })
  }, [])

  return (
    <TouchableOpacity onLongPress={handleLongPress} onPress={handlePress} activeOpacity={0.7}>
      <Image
        url={musicInfo.pic || idlePlayerCover}
        nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pic}
        style={styles.image}
        onError={handleError}
      />
    </TouchableOpacity>
  )
}
