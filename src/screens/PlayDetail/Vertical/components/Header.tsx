import { memo, useRef, useCallback, useMemo } from 'react'
import { View, StyleSheet, TouchableOpacity } from 'react-native'
import { pop, navigations } from '@/navigation'
import { useTheme } from '@/store/theme/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import Text from '@/components/common/Text'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import commonState from '@/store/common/state'
import SettingPopup, { type SettingPopupType } from '../../components/SettingPopup'
import { useStatusbarHeight } from '@/store/common/hook'
import Marquee from './Marquee'
import StatusBar from '@/components/common/StatusBar'
import GlassIconButton from '@/components/spotify/GlassIconButton'
import { SP_SIZE, SP_SPACING } from '@/theme/spotify/tokens'

/**
 * 页头内容高：玻璃圆钮的命中区是 48（GlassIconButton 默认值），
 * 比原来的 42 高一点，避免玻璃圆被压扁 / 溢出。
 */
export const HEADER_HEIGHT = Math.max(scaleSizeH(_HEADER_HEIGHT), SP_SIZE.playButton)

/** 图标字体里没有 spoti.pw 的 `back` / `more-2`，用最接近的两个字形 */
const BACK_ICON = 'chevron-left'
const MORE_ICON = 'dots-vertical'

const Title = () => {
  const theme = useTheme()
  const playMusicInfo = usePlayMusicInfo()
  const musicInfo = playMusicInfo.musicInfo ? ('progress' in playMusicInfo.musicInfo ? playMusicInfo.musicInfo.metadata.musicInfo : playMusicInfo.musicInfo) : null

  const handleArtistPress = useCallback((artist: { id: string | number, name: string }) => {
    if (!musicInfo || !artist.id) return
    // B 站音源：进 UP 主主页
    if (musicInfo.source === 'bili') {
      navigations.pushArtistDetailScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!, { id: String(artist.id), name: artist.name, source: 'bili' })
      return
    }
    if (musicInfo.source !== 'wy') return
    navigations.pushArtistDetailScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!, { id: String(artist.id), name: artist.name })
  }, [musicInfo])

  const handleAlbumPress = useCallback(() => {
    if (!musicInfo || musicInfo.source !== 'wy' || !(musicInfo.meta as any).albumId) return
    navigations.pushAlbumDetailScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!, { id: String((musicInfo.meta as any).albumId), name: musicInfo.meta.albumName, source: musicInfo.source })
  }, [musicInfo])

  const singerRender = useMemo(() => {
    if (!musicInfo) return null
    const albumName = musicInfo.meta?.albumName
    const albumId = (musicInfo.meta as any)?.albumId

    if (!musicInfo.artists?.length || musicInfo.source == 'local') {
      return (
        <View style={styles.singerContainer}>
          <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
            {musicInfo.singer}
          </Text>
          {albumName ? (
            <TouchableOpacity style={{ flexShrink: 1 }} onPress={handleAlbumPress} disabled={musicInfo.source !== 'wy' || !albumId}>
              <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
                {` · ${albumName}`}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )
    }

    return (
      <View style={styles.singerContainer}>
        {musicInfo.artists.map((artist, index) => (
          <TouchableOpacity key={artist.id || index} onPress={() => handleArtistPress(artist)}>
            <Text style={styles.singerText} size={11} color={theme['c-font-label']}>
              {artist.name}
              {(musicInfo.artists?.length ?? 0) > 0 && index < (musicInfo.artists?.length ?? 0) - 1 ? ' / ' : ''}
            </Text>
          </TouchableOpacity>
        ))}
        {albumName ? (
          <TouchableOpacity style={{ flexShrink: 1 }} onPress={handleAlbumPress} disabled={musicInfo.source !== 'wy' || !albumId}>
            <Text numberOfLines={1} size={11} color={theme['c-font-label']}>
              {` · ${albumName}`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    )
  }, [musicInfo, theme, handleArtistPress, handleAlbumPress])

  return (
    <View style={styles.titleContent}>
      {musicInfo ? (
        <>
          <Marquee style={styles.title} size={13} color={theme['c-font-label']}>
            {musicInfo.name}
            {musicInfo.alias ? <Text color={theme['c-font-label']}> ({musicInfo.alias})</Text> : null}
          </Marquee>
          {singerRender}
        </>
      ) : null}
    </View>
  )
}


export default memo(() => {
  const popupRef = useRef<SettingPopupType>(null)
  const statusBarHeight = useStatusbarHeight()
  const back = () => {
    void pop(commonState.componentIds[commonState.componentIds.length - 1]?.id!)
  }
  const showSetting = () => {
    popupRef.current?.show()
  }
  return (
    <View
      style={{ height: HEADER_HEIGHT + statusBarHeight, paddingTop: statusBarHeight }}
      nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_header}
    >
      <StatusBar />
      <View style={styles.container}>
        {/* spoti.pw 页头：左上返回、右上更多，都是 44 玻璃圆（GlassIconButton 内部已包 GlassOverlay） */}
        <GlassIconButton glassTarget="header" icon={BACK_ICON} onPress={back} accessibilityLabel="返回" />
        <Title />
        <GlassIconButton glassTarget="header" icon={MORE_ICON} onPress={showSetting} accessibilityLabel="更多" />
      </View>
      <SettingPopup ref={popupRef} direction="vertical" />
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: SP_SPACING.xxs,
  },
  titleContent: {
    flex: 1,
    paddingHorizontal: 5,
    // alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    // flex: 1,
    // textAlign: 'center',
  },
  singerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  singerText: {
    paddingRight: 2,
  },
})
