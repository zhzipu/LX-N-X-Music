import { memo, useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { View, BackHandler, StyleSheet, PanResponder } from 'react-native'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import RecPlaylists from './RecPlaylists'
import RecSongs from './RecSongs'
import StylizedModal, { type StylizedSelection, loadStylizedSelection } from './StylizedModal'
import SonglistDetail from '../../../SonglistDetail'
import { type ListInfoItem } from '@/store/songlist/state'
import commonState from '@/store/common/state'
import { NAV_MENUS } from '@/config/constant'
import { useSettingValue } from '@/store/setting/hook'
import { useNavActiveId } from '@/store/common/hook'
import { setNavActiveId } from '@/core/common'
import Chip from '@/components/spotify/Chip'
import { getSP } from '@/theme/spotify/tokens'

/**
 * 按钮命中区 ≥ 44。Chip 不支持 hitSlop，所以视觉高度也取 44，
 * 圆角跟随高度的一半，保持胶囊形。
 */
const CHIP_HIT = { height: 44, borderRadius: 22 }

/**
 * 页签行（spoti.pw 的筛选 chip 行）。
 *
 * 只换表现：每个 chip 的 onPress 与改动前的 TouchableOpacity 一一对应，
 * 选中态靠 Chip 的填充差表达，不再自绘下划线/描边。
 */
const Tabs = ({
  activeTab,
  onTabChange,
  isStylized,
  setIsStylized,
  onOpenModal
}: {
  activeTab: 'songs' | 'playlists'
  onTabChange: (tab: 'songs' | 'playlists') => void
  isStylized: boolean
  setIsStylized: (v: boolean) => void
  onOpenModal: () => void
}) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  return (
    <View style={[styles.tabs, { paddingHorizontal: sp.size.pagePaddingH }]}>
      <View style={styles.tabRow}>
        <Chip
          label="推荐歌曲"
          active={activeTab === 'songs'}
          onPress={() => onTabChange('songs')}
          style={[CHIP_HIT, styles.chipGap]}
        />
        <Chip
          label="推荐歌单"
          active={activeTab === 'playlists'}
          onPress={() => onTabChange('playlists')}
          style={CHIP_HIT}
        />
      </View>
      {activeTab === 'songs'
        ? (
            <View style={[styles.tabRow, styles.tabRowSecond]}>
              <Chip
                label="默认推荐"
                active={!isStylized}
                onPress={() => setIsStylized(false)}
                style={[CHIP_HIT, styles.chipGap]}
              />
              <Chip
                label={isStylized ? '风格化推荐 ▾' : '风格化推荐'}
                active={isStylized}
                onPress={() => {
                  if (!isStylized) setIsStylized(true)
                  else onOpenModal()
                }}
                style={CHIP_HIT}
              />
            </View>
          )
        : null}
    </View>
  )
}

export default memo(() => {
  const [activeTab, setActiveTab] = useState<'songs' | 'playlists'>('songs')
  const [isStylized, setIsStylized] = useState(false)
  const [showStylizedModal, setShowStylizedModal] = useState(false)
  const [stylizedSelection, setStylizedSelection] = useState<StylizedSelection>(null)

  useEffect(() => {
    loadStylizedSelection().then(data => {
      if (data) setStylizedSelection(data)
    })
  }, [])

  const pagerViewRef = useRef<PagerView>(null)
  const [selectedPlaylist, setSelectedPlaylist] = useState<ListInfoItem | null>(null)
  const selectedPlaylistRef = useRef(selectedPlaylist)
  selectedPlaylistRef.current = selectedPlaylist
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const isHomePageScrollEnabled = useSettingValue('common.homePageScroll')
  const navStatus = useSettingValue('common.navStatus')
  const visibleNavs = useMemo(() => {
    return NAV_MENUS.filter(
      menu => menu.id !== 'nav_play_history' && (menu.id === 'nav_search' || menu.id === 'nav_setting' || (navStatus[menu.id] ?? true))
    )
  }, [navStatus])
  const activeNavId = useNavActiveId()

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (!isHomePageScrollEnabled) return false
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5 && Math.abs(gestureState.dx) > 10
      },
      onPanResponderRelease: (evt, gestureState) => {
        const { dx } = gestureState
        const currentIndex = visibleNavs.findIndex(nav => nav.id === activeNavId)
        if (activeTab === 'songs' && dx > 50 && currentIndex > 0) {
          setNavActiveId(visibleNavs[currentIndex - 1].id)
        }
        if (activeTab === 'playlists' && dx < -50 && currentIndex < visibleNavs.length - 1) {
          setNavActiveId(visibleNavs[currentIndex + 1].id)
        }
      },
    })
  ).current

  const handleTabChange = (newTab: 'songs' | 'playlists') => {
    if (activeTab === newTab) return
    setActiveTab(newTab)
    pagerViewRef.current?.setPage(newTab === 'songs' ? 0 : 1)
  }

  const onPageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    const newTab = event.nativeEvent.position === 0 ? 'songs' : 'playlists'
    if (newTab !== activeTab) {
      setActiveTab(newTab)
    }
  }, [activeTab])

  const handleOpenDetail = useCallback((playlistInfo: ListInfoItem) => {
    setSelectedPlaylist(playlistInfo)
  }, [])

  const handleCloseDetail = useCallback(() => {
    setSelectedPlaylist(null)
  }, [])

  useEffect(() => {
    const onBackPress = () => {
      if (selectedPlaylistRef.current) {
        if (commonState.componentIds.length > 1) {
          return false
        }
        setSelectedPlaylist(null)
        return true // 消费事件，防止退出应用
      }
      return false
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => subscription.remove()
  }, [])

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={[styles.container, selectedPlaylist ? styles.hidden : null]} pointerEvents={selectedPlaylist ? 'none' : 'auto'} {...(isHomePageScrollEnabled ? panResponder.panHandlers : {})}>
        <Tabs
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isStylized={isStylized}
          setIsStylized={setIsStylized}
          onOpenModal={() => setShowStylizedModal(true)}
        />
        <PagerView
          ref={pagerViewRef}
          style={{ flex: 1 }}
          initialPage={activeTab === 'songs' ? 0 : 1} // <-- 核心修改在这里
          onPageSelected={onPageSelected}
          scrollEnabled={!isHomePageScrollEnabled}
        >
          <View key="1">
            {(activeTab === 'songs') && <RecSongs isStylized={isStylized} stylizedSelection={stylizedSelection} />}
          </View>
          <View key="2">
            <RecPlaylists onOpenDetail={handleOpenDetail} />
          </View>
        </PagerView>
        <StylizedModal
          visible={showStylizedModal}
          onClose={() => setShowStylizedModal(false)}
          onConfirm={(selection) => {
            setStylizedSelection(selection)
            setShowStylizedModal(false)
            setIsStylized(true)
          }}
        />
      </View>
      {selectedPlaylist && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}>
          <SonglistDetail info={selectedPlaylist} onBack={handleCloseDetail} initialScrollToInfo={null} />
        </View>
      )}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  hidden: {
    opacity: 0,
  },
  tabs: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabRowSecond: {
    paddingTop: 8,
  },
  chipGap: {
    marginRight: 8,
  },
})
