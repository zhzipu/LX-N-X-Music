import {memo, useState, useRef, useMemo, useEffect, useCallback} from 'react'
import { View, StyleSheet, AppState, Animated, Easing, Image as RNImage } from 'react-native'

import Header from './components/Header'
// import Aside from './components/Aside'
// import Main from './components/Main'
import MiniLyric from '../components/MiniLyric';
import Player from './Player'
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import Pic from './Pic'
import Lyric from './Lyric'
import { screenkeepAwake, screenUnkeepAwake } from '@/utils/nativeModules/utils'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { MS_MOTION } from '@/theme/myspotify/tokens'
import PageScrim from '@/components/spotify/PageScrim'
import { usePlayMusicInfo, usePlayerMusicInfo } from '@/store/player/hook'
import { foldPage } from '@/navigation/foldPage'
import { getImageHeaders, normalizeImageUri } from '@/components/common/Image'

const idlePlayerCover = require('@/resources/images/milky-music-icon.png')

const LyricPage = ({ activeIndex }: { activeIndex: number }) => {
  const initedRef = useRef(false)
  const lyric = useMemo(() => <Lyric />, [])
  switch (activeIndex) {
    // case 3:
    case 1:
      if (!initedRef.current) initedRef.current = true
      return lyric
    default:
      return initedRef.current ? lyric : null
  }
  // return activeIndex == 0 || activeIndex == 1 ? setting : null
}

// global.iskeep = false
export default memo(({ componentId, initialPage }: { componentId: string, initialPage: 0 | 1 }) => {
  const [pageIndex, setPageIndex] = useState<number>(initialPage)
  const pagerViewRef = useRef<PagerView>(null);
  const showLyricRef = useRef(initialPage === 1)
  const pageOpacity = useRef(new Animated.Value(0)).current
  const theme = useTheme()
  const playMusicInfo = usePlayMusicInfo()
  const playerMusicInfo = usePlayerMusicInfo()
  const [failedBackdropUrl, setFailedBackdropUrl] = useState<string | null>(null)
  const backdropUrl = playerMusicInfo.pic || (playMusicInfo.musicInfo as LX.Music.MusicInfo | undefined)?.meta?.picUrl

  const onPageSelected = ({ nativeEvent }: PagerViewOnPageSelectedEvent) => {
    setPageIndex(nativeEvent.position)
    showLyricRef.current = nativeEvent.position == 1
    foldPage.current = showLyricRef.current ? 'lyrics' : 'player'
    if (showLyricRef.current) {
      screenkeepAwake()
    } else {
      screenUnkeepAwake()
    }
  }

  const handleSwitchToLyricPage = useCallback(() => {
    pagerViewRef.current?.setPage(1);
  }, []);

  // 整页 200ms 淡入
  useEffect(() => {
    const animation = Animated.timing(pageOpacity, {
      toValue: 1,
      duration: MS_MOTION.pageFadeDuration,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [pageOpacity])

  useEffect(() => {
    let appstateListener = AppState.addEventListener('change', (state) => {
      switch (state) {
        case 'active':
          if (showLyricRef.current && !commonState.componentIds.comment) screenkeepAwake()
          break
        case 'background':
          screenUnkeepAwake()
          break
      }
    })

    const handleComponentIdsChange = (ids: CommonState['componentIds']) => {
      if (ids.comment) screenUnkeepAwake()
      else if (AppState.currentState == 'active') screenkeepAwake()
    }

    global.state_event.on('componentIdsUpdated', handleComponentIdsChange)

    return () => {
      global.state_event.off('componentIdsUpdated', handleComponentIdsChange)
      appstateListener.remove()
      screenUnkeepAwake()
    }
  }, [])

  // 页面底改为透明：统一由全局「模糊封面动态底 + PageScrim」承担，不再铺整页纯黑。
  // 遮罩必须是页面容器的第一个子节点（压在内容下面、背景上面）。
  return (
    <Animated.View style={[styles.page, { opacity: pageOpacity }]}>
      {/* 整屏虚化封面：spoti.pw 的 now-playing 背景就是封面本身，模糊后压暗 */}
      <View style={styles.backdrop} pointerEvents="none">
        <RNImage
          source={backdropUrl && backdropUrl !== failedBackdropUrl
            ? { uri: normalizeImageUri(backdropUrl), headers: getImageHeaders(backdropUrl) }
            : idlePlayerCover}
          defaultSource={idlePlayerCover}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          blurRadius={36}
          onError={() => { if (backdropUrl) setFailedBackdropUrl(backdropUrl) }}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.55)' }]} />
      </View>
      <PageScrim />
      <Header />
      <View style={styles.container}>
        <PagerView
          initialPage={initialPage}
          onPageSelected={onPageSelected}
          // onPageScrollStateChanged={onPageScrollStateChanged}
          style={styles.pagerView}
          ref={pagerViewRef}
        >
          <View collapsable={false}>
            <View collapsable={false} style={styles.picPageContainer}>
              <Pic componentId={componentId} />
              <MiniLyric
                onPress={handleSwitchToLyricPage}
                style={styles.miniLyricContainer}
              />
            </View>
          </View>
          <View collapsable={false}>
            <LyricPage activeIndex={pageIndex} />
          </View>
        </PagerView>
        {/* <View style={styles.pageIndicator} nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pageIndicator}>
          <View style={{ ...styles.pageIndicatorItem, backgroundColor: pageIndex == 0 ? theme['c-primary-light-100-alpha-700'] : theme['c-primary-alpha-900'] }}></View>
          <View style={{ ...styles.pageIndicatorItem, backgroundColor: pageIndex == 1 ? theme['c-primary-light-100-alpha-700'] : theme['c-primary-alpha-900'] }}></View>
        </View> */}
        <Player />
      </View>
    </Animated.View>
  )
})

const styles = createStyle({
  page: {
    flex: 1,
    flexDirection: 'column',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  pagerView: {
    flex: 1,
  },
  picPageContainer: {
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  miniLyricContainer: {
    position: 'absolute',
    bottom: '3%',
    left: '10%',
    right: '10%',
    alignItems: 'flex-start',
  },
  // pageIndicator: {
  //   flex: 0,
  //   flexDirection: 'row',
  //   justifyContent: 'center',
  //   paddingTop: 10,
  //   // backgroundColor: 'rgba(0,0,0,0.1)',
  // },
  // pageIndicatorItem: {
  //   height: 3,
  //   width: '5%',
  //   marginLeft: 2,
  //   marginRight: 2,
  //   borderRadius: 2,
  // },
})
