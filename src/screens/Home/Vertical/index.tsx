import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, BackHandler, View, requireNativeComponent, type ViewProps } from 'react-native'
import Content from './Content'
import { PAGER_NAV_IDS } from './Main'
import PlayerBar from '@/components/player/PlayerBar'
import GlassTabBar, { type HomeTabId, useHomeBarInset } from '@/components/spotify/GlassTabBar'
import PageScrim from '@/components/spotify/PageScrim'
import commonState from '@/store/common/state'
import { useNavActiveId } from '@/store/common/hook'
import { setNavActiveId } from '@/core/common'
import { useSettingValue } from '@/store/setting/hook'
import { NAV_MENUS, type NAV_ID_Type } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { useMusicDetailOpen } from '@/screens/Home/Views/Music/detailState'
import { useDetailDockOpen } from '../detailDockState'
import { TrackSelectionAnchor } from '@/components/TrackSelection'

const PortraitDockLayout = requireNativeComponent<ViewProps & {
  secondaryPage?: boolean
  menuOpen?: boolean
  bottomInset?: number
  activeTab?: string
}>('PortraitDockLayout')

/**
 * tab 与 navActiveId 的映射关系。
 *
 * 这里刻意不重构 Main 里的 PagerView：翻页仍由 navActiveId 驱动，
 * 只在外面加一层「tab ↔ nav」翻译。风险最小，也不会破坏各页面的懒挂载逻辑。
 *
 * - home    → 每日推荐
 * - search  → 搜索
 * - library → 我的歌单
 * - create  → 歌单
 */
/** 只有页面 tab 有对应 nav；「菜单」格是打开左侧栏的动作，不在这里 */
const TAB_TO_NAV: Partial<Record<HomeTabId, NAV_ID_Type>> = {
  home: 'nav_music',
  search: 'nav_search',
  library: 'nav_hot',
  menu: 'nav_menu',
}

/** 由当前 navActiveId 反推高亮的 tab；不在映射内的一律归到 home */
const navToTab = (id: NAV_ID_Type): HomeTabId => {
  if (id === 'nav_music') return 'home'
  if (id === 'nav_search') return 'search'
  if (id === 'nav_hot') return 'library'
  // 三个固定页之外的页面（歌单/排行榜/设置/菜单…）都归到第四个 tab
  return 'menu'
}

/** 与 Main.tsx 内同名函数保持一致的可见性规则 */
const isMenuVisible = (id: NAV_ID_Type, navStatus: Partial<Record<NAV_ID_Type, boolean>>) => (
  id !== 'nav_play_history' && (id === 'nav_search' || id === 'nav_setting' || (navStatus[id] ?? true))
)

export default ({ componentId, active = true, hideMiniPlayer = false, hideBottomNavigation = false, hideMiniAudioWave = false, hidePageScrim = false }: { componentId: string, active?: boolean, hideMiniPlayer?: boolean, hideBottomNavigation?: boolean, hideMiniAudioWave?: boolean, hidePageScrim?: boolean }) => {
  const activeNavId = useNavActiveId()
  const navStatus = useSettingValue('common.navStatus')
  const musicDetailOpen = useMusicDetailOpen()
  const detailDockOpen = useDetailDockOpen()
  const secondaryPageOpen = musicDetailOpen || detailDockOpen || !PAGER_NAV_IDS.includes(activeNavId)
  const bottomInset = useHomeBarInset()
  const activeTab = useMemo(() => navToTab(activeNavId), [activeNavId])

  /**
   * 底部浮层（迷你播放条 + Tab 栏）是 Content 之上的绝对定位层，抽屉的遮罩盖不住它，
   * 所以抽屉可见时把它淡出并禁用触摸。订阅 changeMenuVisible 即可拿到开/关两个方向
   * （Content 里还补了 onDrawerOpen/onDrawerClose，点遮罩、侧滑关闭也会广播）。
   * 用 Animated.timing 从当前值过渡，快速开合会自然反向，不会把状态做死。
   */
  const bottomBarOpacity = useRef(new Animated.Value(1)).current
  const [menuVisible, setMenuVisible] = useState(false)

  useEffect(() => {
    const handleMenuVisible = (visible: boolean) => {
      setMenuVisible(visible)
      Animated.timing(bottomBarOpacity, {
        toValue: visible ? 0 : 1,
        duration: 150,
        // 必须走 JS 驱动：底栏是原生玻璃浮层，宿主读的是 View.alpha；
        // native driver 只改 RenderNode 的 alpha，view.alpha 仍是 1，淡出不会生效。
        useNativeDriver: false,
      }).start()
    }
    global.app_event.on('changeMenuVisible', handleMenuVisible)

    return () => {
      global.app_event.off('changeMenuVisible', handleMenuVisible)
    }
  }, [bottomBarOpacity])

  /** 目标 nav 可能被用户在「侧边栏显示项」里关掉，关掉时回退到第一个可见项，避免 PagerView 找不到页 */
  const handleTabPress = useCallback(
    (tab: HomeTabId) => {
      // 第四个 tab 固定去菜单页（不参与分页器的可见页兜底）
      if (tab === 'menu') {
        setNavActiveId('nav_menu')
        return
      }
      let target = TAB_TO_NAV[tab]
      if (!target) return
      const visible = NAV_MENUS.filter(menu => isMenuVisible(menu.id, navStatus))
      if (!visible.some(menu => menu.id === target)) {
        const fallback = visible[0]?.id
        if (!fallback) return
        target = fallback
      }
      if (target === commonState.navActiveId) return
      setNavActiveId(target)
    },
    [navStatus],
  )

  /**
   * 菜单里进入的页面按「独立页面」处理：系统返回键先回到菜单页。
   * 菜单页本身是一级 Tab，交给 Home 的双击返回退出逻辑处理。
   * 这些页面本身是盖在分页器上的整页视图（不是 Modal），所以返回逻辑要自己接管，
   * 否则按返回会直接退出 App。
   */
  useEffect(() => {
    const onBackPress = () => {
      if (!active) return false
      // 只有 Home 在最上层时才接管返回：播放页/详情页压在上面时要把返回留给它们
      const topId = commonState.componentIds[commonState.componentIds.length - 1]?.id
      if (topId && topId !== componentId) return false
      if (!PAGER_NAV_IDS.includes(activeNavId)) {
        setNavActiveId('nav_menu')
        return true
      }
      return false
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => {
      subscription.remove()
    }
  }, [active, activeNavId, componentId])
  return (
    <PortraitDockLayout style={styles.container} secondaryPage={secondaryPageOpen} menuOpen={menuVisible} bottomInset={bottomInset} activeTab={activeNavId}>
      <View collapsable={false} style={styles.content}>
        {!hidePageScrim && <PageScrim />}
        <Content />
      </View>
      <Animated.View
        collapsable={false}
        style={[styles.bottomOverlay, { opacity: bottomBarOpacity }]}
        pointerEvents="box-none"
        importantForAccessibility={menuVisible ? 'no-hide-descendants' : 'auto'}
      >
        <View collapsable={false} pointerEvents="box-none">
          {!hideMiniPlayer && <View style={styles.barsGap} />}
          {!hideMiniPlayer && <PlayerBar componentId={componentId} isHome hideAudioWave={hideMiniAudioWave} />}
          {hideMiniPlayer && <TrackSelectionAnchor />}
        </View>
        <View collapsable={false} pointerEvents="box-none">
          {!hideBottomNavigation && <GlassTabBar componentId={componentId} activeTab={activeTab} onTabPress={handleTabPress} />}
        </View>
      </Animated.View>
    </PortraitDockLayout>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  barsGap: {
    height: 8,
  },
  /** 底部浮层：不占布局高度，盖在列表上方；box-none 让空白处的触摸穿透到列表 */
  bottomOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
  },
})
