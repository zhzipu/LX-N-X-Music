import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, Easing, PanResponder, StatusBar, View, requireNativeComponent, type LayoutChangeEvent, type ViewProps } from 'react-native'
import { usePlayMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { useWindowSize } from '@/utils/hooks'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import idlePlayerCover from '@/resources/images/milky-music-icon.png'
import Pic from '@/screens/PlayDetail/Vertical/Pic'
import Player from '@/screens/PlayDetail/Vertical/Player'
import Lyric from '@/screens/PlayDetail/Vertical/Lyric'
import MiniLyric from '@/screens/PlayDetail/components/MiniLyric'
import VerticalHome from './Vertical'
import { createStyle } from '@/utils/tools'
import { getSP, SP_RADIUS, SP_SPACING } from '@/theme/spotify/tokens'
import GlassIconButton from '@/components/spotify/GlassIconButton'
import SettingPopup, { type SettingPopupType } from '@/screens/PlayDetail/components/SettingPopup'
import PageScrim from '@/components/spotify/PageScrim'
import { useStatusbarHeight } from '@/store/common/hook'
import CommonStatusBar from '@/components/common/StatusBar'
import commonState from '@/store/common/state'
import { foldPage } from '@/navigation/foldPage'

const AnimatedTrack = Animated.createAnimatedComponent(requireNativeComponent<ViewProps & { pageProgress: number }>('WidePaneTrack'))
const COVER_TOP_PADDING = 24

const WidePlayerPane = ({ componentId, paneWidth, showInlineLyrics, onBack, onShowLyrics }: { componentId: string, paneWidth: number, showInlineLyrics: boolean, onBack: () => void, onShowLyrics: () => void }) => {
  const statusbarHeight = useStatusbarHeight()
  const [paneHeight, setPaneHeight] = useState(0)
  const [controlsHeight, setControlsHeight] = useState(0)
  // The wide player extends behind Android's translucent status bar. Keep the
  // controls below it even when SizeView reports a zero inset in edge-to-edge mode.
  const headerTop = Math.max(statusbarHeight, StatusBar.currentHeight ?? 0) + SP_SPACING.sm
  const coverMaxHeight = paneHeight > 0 && controlsHeight > 0
    ? Math.max(0, paneHeight - headerTop - controlsHeight - paneWidth * 0.03 - COVER_TOP_PADDING)
    : undefined
  const standbyCoverSize = Math.max(1, Math.min(paneWidth * 0.72, coverMaxHeight ?? paneWidth * 0.72, 320))
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const playMusicInfo = usePlayMusicInfo()
  const hasMusic = Boolean(playMusicInfo.musicInfo?.id)
  const settingRef = useRef<SettingPopupType>(null)
  return (
    <View style={[styles.playerPane, { paddingTop: headerTop }]} onLayout={({ nativeEvent }) => setPaneHeight(nativeEvent.layout.height)}>
      <View style={[styles.playerHeader, { top: headerTop }]}>
        <GlassIconButton glassTarget="header" icon="chevron-left" onPress={onBack} accessibilityLabel="返回" />
        <View style={styles.headerGap} />
        <GlassIconButton
          glassTarget="header"
          icon="dots-vertical"
          onPress={() => settingRef.current?.show()}
          accessibilityLabel="更多"
        />
      </View>
      {hasMusic ? <Pic componentId={componentId} maxWidth={paneWidth} maxHeight={coverMaxHeight} topPadding={COVER_TOP_PADDING} onPress={onShowLyrics} /> : (
        <View style={styles.standby}>
          <Image
            url={idlePlayerCover}
            style={{ width: standbyCoverSize, height: standbyCoverSize, borderRadius: SP_RADIUS.cover }}
          />
          <Text size={18} color={sp.colors.textSecondary}>播放器待命</Text>
        </View>
      )}
      <View onLayout={({ nativeEvent }) => setControlsHeight(nativeEvent.layout.height)}>
        {showInlineLyrics && hasMusic && (
          <View style={styles.inlineLyrics}>
            <MiniLyric onPress={onShowLyrics} />
          </View>
        )}
        <Player forceAudioWaveVisible compactControls />
      </View>
      <SettingPopup ref={settingRef} direction="vertical" glassEnabled={false} />
    </View>
  )
}

/** A two-pane viewport over one continuous home | player | lyrics rail. */
export default ({ componentId }: { componentId: string }) => {
  const { width } = useWindowSize()
  const [viewportWidth, setViewportWidth] = useState(width)
  const [showLyrics, setShowLyrics] = useState(() => foldPage.current !== 'home')
  const progress = useRef(new Animated.Value(showLyrics ? 1 : 0)).current
  const targetRef = useRef(showLyrics)
  const startProgressRef = useRef(0)
  const paneWidth = Math.max(1, viewportWidth / 2)

  const onLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    if (layout.width > 0) setViewportWidth(layout.width)
  }, [])

  const animateTo = useCallback((next: boolean) => {
    if (!next) foldPage.current = 'home'
    else if (foldPage.current === 'home') foldPage.current = 'player'
    targetRef.current = next
    setShowLyrics(next)
    progress.stopAnimation(value => {
      Animated.timing(progress, {
        toValue: next ? 1 : 0,
        duration: Math.max(100, 420 * Math.abs((next ? 1 : 0) - value)),
        easing: Easing.out(Easing.cubic),
        // The native track commits a View translation and invalidates the glass
        // compositor together. All three panes, including home overlays, follow.
        useNativeDriver: false,
      }).start()
    })
  }, [progress])

  const swipeResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      gesture.numberActiveTouches === 1 &&
      Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35
    ),
    onPanResponderGrant: () => {
      progress.stopAnimation(value => { startProgressRef.current = value })
    },
    onPanResponderMove: (_, gesture) => {
      const next = Math.min(1, Math.max(0, startProgressRef.current - gesture.dx / paneWidth))
      progress.setValue(next)
    },
    onPanResponderRelease: (_, gesture) => {
      const current = startProgressRef.current - gesture.dx / paneWidth
      const next = gesture.dx < -48 || gesture.vx < -0.45
        ? true
        : gesture.dx > 48 || gesture.vx > 0.45
          ? false
          : current >= 0.5
      animateTo(next)
    },
    onPanResponderTerminate: () => animateTo(targetRef.current),
  }), [animateTo, paneWidth, progress])

  useEffect(() => {
    const handle = (visible: boolean) => animateTo(visible)
    global.app_event.on('setWidePlayerLyrics', handle)
    return () => {
      global.app_event.off('setWidePlayerLyrics', handle)
      progress.stopAnimation()
    }
  }, [animateTo, progress])

  useEffect(() => {
    const handleBack = () => {
      const topId = commonState.componentIds[commonState.componentIds.length - 1]?.id
      if (!showLyrics || (topId && topId !== componentId)) return false
      animateTo(false)
      return true
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBack)
    return () => subscription.remove()
  }, [animateTo, componentId, showLyrics])

  return (
    <View style={styles.container} onLayout={onLayout}>
      <CommonStatusBar />
      <PageScrim />
      <AnimatedTrack pageProgress={progress} style={[styles.track, { width: paneWidth * 3 }]}>
        <View
          collapsable={false}
          style={[styles.pane, { width: paneWidth }]}
          pointerEvents={showLyrics ? 'none' : 'auto'}
          importantForAccessibility={showLyrics ? 'no-hide-descendants' : 'auto'}
        >
          <VerticalHome
            componentId={componentId}
            active={!showLyrics}
            hideMiniPlayer
            hideMiniAudioWave
            hidePageScrim
          />
          <View pointerEvents="none" style={styles.homePlayerDivider}>
            <View style={styles.dividerLine} />
          </View>
        </View>
        <View collapsable={false} style={[styles.pane, { width: paneWidth }]} {...swipeResponder.panHandlers}>
          <WidePlayerPane
            componentId={componentId}
            paneWidth={paneWidth}
            showInlineLyrics={!showLyrics}
            onBack={() => animateTo(false)}
            onShowLyrics={() => animateTo(true)}
          />
        </View>
        <View
          collapsable={false}
          style={[styles.pane, { width: paneWidth }]}
          pointerEvents={showLyrics ? 'auto' : 'none'}
          importantForAccessibility={showLyrics ? 'auto' : 'no-hide-descendants'}
          {...swipeResponder.panHandlers}
        >
          <Lyric />
        </View>
      </AnimatedTrack>
    </View>
  )
}

const styles = createStyle({
  container: { flex: 1, overflow: 'hidden' },
  track: { height: '100%', flexDirection: 'row' },
  pane: { height: '100%', overflow: 'hidden' },
  playerPane: { flex: 1, justifyContent: 'center', paddingHorizontal: SP_SPACING.md, borderWidth: 0 },
  playerHeader: { position: 'absolute', left: SP_SPACING.md, right: SP_SPACING.md, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', zIndex: 2, elevation: 2 },
  headerGap: { flex: 1 },
  inlineLyrics: { marginHorizontal: '10%', alignItems: 'flex-start' },
  standby: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP_SPACING.lg },
  homePlayerDivider: { position: 'absolute', top: '8%', bottom: '8%', right: 0, width: 2, zIndex: 30, elevation: 30 },
  dividerLine: { flex: 1, width: 2, backgroundColor: 'rgba(255,255,255,0.32)' },
})
