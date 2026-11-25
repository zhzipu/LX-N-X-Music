import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { StyleSheet, View, type ViewStyle } from 'react-native'
import { playNext, playPrev, togglePlay } from '@/core/player/player'
import { addListMusics, getListMusics, removeListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import MusicAddModal, { type MusicAddModalType } from '@/components/MusicAddModal'
import { toast } from '@/utils/tools'
import { useIsPlay, usePlayMusicInfo } from '@/store/player/hook'
import { useIsWyLiked } from '@/store/user/hook'
import { handleLikeMusic } from '@/components/OnlineList/listAction'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { scaleSizeW } from '@/utils/pixelRatio'
import GlassIconButton from '@/components/spotify/GlassIconButton'
import GlassOverlay from '@/components/spotify/GlassOverlay'
import ConfiguredGlassSurface from '@/components/spotify/ConfiguredGlassSurface'
import PlayPill from '@/components/spotify/PlayPill'
import PlayModeBtn from './MoreBtn/PlayModeBtn'
import { getSP, SP_SIZE, SP_SPACING } from '@/theme/spotify/tokens'

/** 玻璃圆 / 命中区：与 GlassIconButton 的默认值保持一致（玻璃圆 44、命中 48） */
const CIRCLE_SIZE = 44
const HIT_SIZE = 48
/** 上一首 / 下一首用更小的圆，保证 5 个控件能挤进一行 */
const PREV_NEXT_CIRCLE = 36
const PREV_NEXT_HIT = 40
/** PlayModeBtn 内部（MoreBtn/Btn）自带 marginLeft: 5，这里抵消掉，让字形落在玻璃圆正中 */
const MODE_BTN_COMPENSATE = -scaleSizeW(5)

const hitStyle: ViewStyle = {
  width: HIT_SIZE,
  height: HIT_SIZE,
  alignItems: 'center',
  justifyContent: 'center',
}
const circleStyle: ViewStyle = {
  width: CIRCLE_SIZE,
  height: CIRCLE_SIZE,
  borderRadius: CIRCLE_SIZE / 2,
  alignItems: 'center',
  justifyContent: 'center',
}
const glassStyle: ViewStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}
const modeOffsetStyle: ViewStyle = {
  marginLeft: MODE_BTN_COMPENSATE,
}

/**
 * 玻璃圆槽位：复刻 GlassIconButton 的内部结构（GlassSurface 与上层内容作为 GlassOverlay 的兄弟节点，
 * 否则图标会被糊进玻璃里）。
 *
 * 随机 / 循环按钮必须用 PlayModeBtn —— 它自带模式切换、心动模式等逻辑且不在可改范围内，
 * 而 GlassIconButton 不接受「外部传进来的按钮」，所以这里只借用它的外壳来承载。
 */
const GlassSlot = ({ children, glassEnabled = true, plainBackground }: { children: ReactNode, glassEnabled?: boolean, plainBackground: string }) => {
  if (!glassEnabled) {
    return (
      <View style={hitStyle}>
        <View style={[circleStyle, { backgroundColor: plainBackground }]}>
          {children}
        </View>
      </View>
    )
  }
  return (
    <GlassOverlay style={hitStyle}>
      <View style={circleStyle}>
        <ConfiguredGlassSurface target="modeFavorite" capsuleRadius={CIRCLE_SIZE / 2} pointerEvents="none" style={glassStyle} />
        {children}
      </View>
    </GlassOverlay>
  )
}

/**
 * 控制行（spoti.pw）：居中一行、间距 16 —— 随机 / 循环玻璃圆、播放胶囊、收藏玻璃圆。
 */
export default memo(({ compact = false, glassEnabled = true }: { compact?: boolean, glassEnabled?: boolean }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const isPlay = useIsPlay()
  const playMusicInfo = usePlayMusicInfo()
  const musicInfo = playMusicInfo.musicInfo
    ? 'progress' in playMusicInfo.musicInfo
      ? playMusicInfo.musicInfo.metadata.musicInfo
      : playMusicInfo.musicInfo
    : null
  const isLiked = useIsWyLiked(musicInfo?.source === 'wy' ? musicInfo.meta.songId : '')
  /** 是否已在「我的收藏」里（决定心形实心/空心） */
  const [isCollected, setIsCollected] = useState(false)

  const handleTogglePlay = useCallback(() => {
    togglePlay()
  }, [])

  const handlePrev = useCallback(() => {
    void playPrev()
  }, [])

  const handleNext = useCallback(() => {
    void playNext()
  }, [])

  // 心形：点击 = 收藏/取消收藏；长按 = 选择歌单
  const musicAddRef = useRef<MusicAddModalType>(null)

  const refreshCollected = useCallback(() => {
    if (!musicInfo) {
      setIsCollected(false)
      return
    }
    void getListMusics(LIST_IDS.LOVE)
      .then(list => { setIsCollected(list.some(item => item.id === musicInfo.id)) })
      .catch(() => {})
  }, [musicInfo])

  useEffect(() => {
    refreshCollected()
  }, [refreshCollected])

  // 歌单内容变化时同步（长按加歌单 / 别处增删收藏）
  useEffect(() => {
    const handleUpdate = (ids: string[]) => {
      if (!ids?.includes(LIST_IDS.LOVE)) return
      refreshCollected()
    }
    global.app_event.on('myListMusicUpdate', handleUpdate)
    return () => {
      global.app_event.off('myListMusicUpdate', handleUpdate)
    }
  }, [refreshCollected])

  const handleLike = useCallback(() => {
    if (!musicInfo) return
    if (isCollected) {
      void removeListMusics(LIST_IDS.LOVE, [musicInfo.id])
        .then(() => { setIsCollected(false); toast(t('collect_remove')) })
        .catch(() => {})
    } else {
      void addListMusics(LIST_IDS.LOVE, [musicInfo], 'top')
        .then(() => { setIsCollected(true); toast(t('collect_success')) })
        .catch(() => {})
    }
  }, [musicInfo, isCollected, t])

  const handleLikeLongPress = useCallback(() => {
    if (!musicInfo) return
    musicAddRef.current?.show({
      musicInfo: musicInfo as LX.Music.MusicInfoOnline,
      isMove: false,
      listId: playMusicInfo.listId ?? LIST_IDS.TEMP,
    })
  }, [musicInfo, playMusicInfo.listId])

  return (
    <View style={[styles.row, compact ? styles.rowCompact : null]}>
      <GlassSlot glassEnabled={glassEnabled} plainBackground={sp.colors.surfaceElevated}>
        <View style={modeOffsetStyle}>
          <PlayModeBtn iconSize={SP_SIZE.controlIcon} iconColor={sp.colors.text} />
        </View>
      </GlassSlot>
      <GlassIconButton
        icon="prevMusic"
        glassTarget="skip"
        hitSize={PREV_NEXT_HIT}
        circleSize={PREV_NEXT_CIRCLE}
        size={20}
        onPress={handlePrev}
        accessibilityLabel={t('play_prev')}
        plain={!glassEnabled}
      />
      <PlayPill
        label={isPlay ? t('pause') : t('play')}
        icon={isPlay ? 'pause' : 'play'}
        onPress={handleTogglePlay}
        compact
        dense={compact}
        accessibilityLabel={isPlay ? t('pause') : t('play')}
      />
      <GlassIconButton
        icon="nextMusic"
        glassTarget="skip"
        hitSize={PREV_NEXT_HIT}
        circleSize={PREV_NEXT_CIRCLE}
        size={20}
        onPress={handleNext}
        accessibilityLabel={t('play_next')}
        plain={!glassEnabled}
      />
      <GlassIconButton
        icon={isCollected || isLiked ? 'love-filled' : 'love'}
        glassTarget="modeFavorite"
        color={isCollected || isLiked ? sp.colors.accent : sp.colors.text}
        hitSize={HIT_SIZE}
        circleSize={CIRCLE_SIZE}
        onPress={handleLike}
        onLongPress={handleLikeLongPress}
        accessibilityLabel={t('collect')}
        plain={!glassEnabled}
      />
      <MusicAddModal ref={musicAddRef} />
    </View>
  )
})

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP_SPACING.sm,
    paddingVertical: SP_SPACING.xl,
  },
  rowCompact: {
    // Pad keeps the portrait button surfaces and glyphs; only the gaps and
    // play pill are compact so the row stays centered within its half-screen.
    justifyContent: 'center',
    gap: SP_SPACING.xxs,
    paddingVertical: SP_SPACING.md,
  },
})
