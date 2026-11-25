import { TrackSelectionAnchor } from '@/components/TrackSelection'
import { memo, useCallback, useMemo, useRef, useState } from 'react'
import { PanResponder, StyleSheet, View, TouchableOpacity, Animated, type LayoutChangeEvent } from 'react-native'
import { useKeyboard } from '@/utils/hooks'
import Pic from './components/Pic'
import Title from './components/Title'
import PlayInfo from './components/PlayInfo'
import ControlBtn from './components/ControlBtn'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import PlayerPlaylist, { PlayerPlaylistType } from '@/components/player/PlayerPlaylist.tsx'
import playerState from '@/store/player/state'
import { LIST_IDS } from '@/config/constant'
import PressScale from '@/components/myspotify/PressScale'
import { MS_SIZE } from '@/theme/myspotify/tokens'
import { getSP, SP_SIZE, SP_SPACING } from '@/theme/spotify/tokens'
import ConfiguredGlassSurface from '@/components/spotify/ConfiguredGlassSurface'
import GlassOverlay from '@/components/spotify/GlassOverlay'
import MiniProgressBar from './components/MiniProgressBar'
import PlayModeButton from '@/components/player/PlayModeButton'
import AudioWave from '@/components/player/AudioWave'
import { useBottomBarMotion, DETAIL_PLAYER_BAR_HIDE_OFFSET } from '@/utils/hooks'
import { setCurrentMusicCollected } from './collection'

/** 迷你条的胶囊圆角：高 56 → 半径 24（spoti.pw 的 56 高 / r24 卡片） */
const MINI_PLAYER_RADIUS = 24

/** 列表按钮命中区域：与播放键一致的 46 */
const MENU_TAP_AREA = MS_SIZE.playerBarIconLarge + MS_SIZE.playerBarIconGap

export default memo(({ componentId, isHome = false, hideAudioWave = false, autoHideOnScroll = false }: { componentId: string, isHome?: boolean, hideAudioWave?: boolean, autoHideOnScroll?: boolean }) => {
  const { keyboardShown } = useKeyboard()
  const theme = useTheme()
  const longPressedRef = useRef(false)
  const playlistRef = useRef<PlayerPlaylistType>(null)
  const [titleBottom, setTitleBottom] = useState<number | null>(null)
  const [track, setTrack] = useState<{ x: number, y: number, width: number } | null>(null)
  const bottomMotion = useBottomBarMotion({ listen: autoHideOnScroll, offset: DETAIL_PLAYER_BAR_HIDE_OFFSET })
  // Both containers around Title span the full capsule height and start at its top.
  const onTitleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setTitleBottom(layout.y + layout.height)
  }, [])
  const onTrackLayout = useCallback(({ nativeEvent: { layout: { x, y, width } } }: LayoutChangeEvent) => {
    setTrack(prev => prev?.x === x && prev.y === y && prev.width === width ? prev : { x, y, width })
  }, [])

  const handleLongPress = useCallback(() => {
    longPressedRef.current = true
    const listId = playerState.playMusicInfo.listId
    if (!listId || listId == LIST_IDS.DOWNLOAD) return
    global.app_event.jumpListPosition()
  }, [])

  const handleNavigate = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false
      return
    }
    const currentComponentId = commonState.componentIds[commonState.componentIds.length - 1]?.id!
    navigations.pushPlayDetailScreen(currentComponentId)
  }

  const handleShowPlaylist = useCallback(() => {
    playlistRef.current?.show()
  }, [])

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy, numberActiveTouches }) => (
        numberActiveTouches === 1 && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.5
      ),
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.abs(dy) < 50 || Math.abs(dy) <= Math.abs(dx) * 1.5) return
        void setCurrentMusicCollected(dy > 0).catch(() => { toast('收藏操作失败，请重试') })
      },
    }),
  ).current

  const containerStyle = useMemo(() => {
    return styles.container
  }, [])

  /**
   * 按压反馈：与底部 Tab 栏的气泡同一套手感 —— 按下胶囊轻微鼓起、叠一层外扩光晕，
   * 松手 spring 弹回。触摸事件挂在容器上，不抢 panResponder 的滑动判定。
   */
  const press = useRef(new Animated.Value(0)).current
  const springPress = useCallback((to: number) => {
    Animated.spring(press, {
      toValue: to,
      friction: 7,
      tension: 220,
      useNativeDriver: true,
    }).start()
  }, [press])
  const pressScaleStyle = useMemo(() => ({
    transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
  }), [press])
  const glowStyle = useMemo(() => ({
    opacity: press.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }),
    transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
  }), [press])

  const playerComponent = useMemo(
    () => (
      <Animated.View style={autoHideOnScroll ? { transform: [{ translateY: bottomMotion.translateY }] } : undefined}>
        <TrackSelectionAnchor />
        <GlassOverlay>
          <Animated.View
          style={[containerStyle, pressScaleStyle]}
          {...panResponder.panHandlers}
          onTouchStart={() => { springPress(1) }}
          onTouchEnd={() => { springPress(0) }}
          onTouchCancel={() => { springPress(0) }}
        >
          <ConfiguredGlassSurface
            target="miniPlayer"
            capsuleRadius={999}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          {/* 按压光晕：与 Tab 气泡同款，按下时向外扩一圈淡白光 */}
          <Animated.View pointerEvents="none" style={[styles.pressGlow, glowStyle]} />
          {!hideAudioWave && track && titleBottom !== null && track.y > titleBottom && (
            <View pointerEvents="none" accessible={false} style={{
              position: 'absolute', left: track.x, width: track.width, top: titleBottom,
              height: track.y - titleBottom, overflow: 'hidden',
            }}>
              <AudioWave miniScreenId={componentId} height={track.y - titleBottom} />
            </View>
          )}

          <TouchableOpacity style={styles.left} onPress={handleNavigate} onLongPress={handleLongPress} activeOpacity={0.7}>
            <Pic isHome={isHome} />
            <View style={styles.center}>
              <Title isHome={isHome} onLayout={onTitleLayout} />
              <PlayInfo isHome={isHome} />
            </View>
          </TouchableOpacity>
          <View style={styles.right}>
            <ControlBtn />
            {/* 最右侧改为播放模式切换；长按仍可打开播放队列 */}
            <PlayModeButton
              style={styles.menuBtn}
              size={MS_SIZE.playerBarIcon}
              color={getSP(theme.isDark).colors.text}
              onLongPress={handleShowPlaylist}
            />
          </View>
          {/* 进度线贴胶囊底部内侧（左右缩 24、圆头），不再是一条通栏分割线 */}
          <MiniProgressBar onLayout={onTrackLayout} />
          </Animated.View>
        </GlassOverlay>
      </Animated.View>
    ),
    [containerStyle, pressScaleStyle, glowStyle, springPress, theme, isHome, handleShowPlaylist, panResponder.panHandlers,
      componentId, track, titleBottom, onTitleLayout, onTrackLayout, hideAudioWave, autoHideOnScroll, bottomMotion.translateY],
  )

  return (
    <>
      {keyboardShown ? null : playerComponent}
      <PlayerPlaylist ref={playlistRef} />
    </>
  )
})

const styles = createStyle({
  container: {
    height: SP_SIZE.playerBarHeight,
    flexDirection: 'row',
    alignItems: 'center',
    // spoti.pw 的迷你条：左右 16、离 Tab 栏 8、r=24 的悬浮玻璃胶囊
    marginHorizontal: SP_SIZE.pagePaddingH,
    marginBottom: SP_SPACING.sm,
    borderRadius: MINI_PLAYER_RADIUS,
    paddingLeft: SP_SPACING.md,
    paddingRight: SP_SPACING.xs,
  },
  left: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
  },
  center: {
    flexDirection: 'column',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: SP_SPACING.md,
    height: '100%',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: SP_SPACING.xxs,
  },
  menuBtn: {
    width: MENU_TAP_AREA,
    height: MENU_TAP_AREA,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: MINI_PLAYER_RADIUS,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
  },
})
