import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import {Keyboard, View} from 'react-native'
import Search from '../Views/Search'
import SongList from '../Views/SongList'
import Leaderboard from '../Views/Leaderboard'
import Setting from '../Views/Setting'
import commonState, { type InitState as CommonState } from '@/store/common/state'
import { createStyle } from '@/utils/tools'
import PagerView, {
  type PageScrollStateChangedNativeEvent,
  type PagerViewOnPageSelectedEvent,
} from 'react-native-pager-view'
import { setNavActiveId } from '@/core/common'
import settingState from '@/store/setting/state'
import DailyRec from '../Views/DailyRec'
import MyMusic from '../Views/MyMusic'
import FollowedArtists from '../Views/FollowedArtists'
import SubscribedAlbums from '../Views/SubscribedAlbums';
import {NAV_MENUS, type NAV_ID_Type} from "@/config/constant.ts";
import {useSettingValue} from "@/store/setting/hook.ts";
import PlayHistory from '../Views/PlayHistory'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import OneDrive from '../Views/OneDrive'
import Bilibili from '../Views/Bilibili'
import LxxWear from '../Views/LxxWear'
import MenuPage from '../Views/MenuPage'
import Music from '../Views/Music'
import Hot from '../Views/Hot'

const hideKeys = ['list.isShowAlbumName', 'list.isShowInterval', 'theme.fontShadow'] as Readonly<
  Array<keyof LX.AppSetting>
>

const SearchPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_search')
  const component = useMemo(() => <Search />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_search') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}
const SongListPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_songlist')
  const component = useMemo(() => <SongList />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_songlist') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
  // return activeId == 1 || activeId == 0  ? SongList : null
}
const PlayHistoryOverlay = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_play_history')
  const component = useMemo(() => <PlayHistory />, [])
  const theme = useTheme()
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      requestAnimationFrame(() => {
        setVisible(id == 'nav_play_history')
      })
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])

  return visible ? (
    <View style={styles.historyOverlay}>
      {component}
    </View>
  ) : null
}

/**
 * 分页器里只放底部 Tab 的三个固定页：每日推荐 / 搜索 / 我的歌单。
 * 其余页面（歌单、排行榜、关注歌手、OneDrive、B 站、手表、设置、菜单…）
 * 一律通过底部第四个 tab 的「菜单」进入，作为覆盖层盖在分页器上，
 * 这样左右滑动永远只在三页之间走。
 */
export const PAGER_NAV_IDS: NAV_ID_Type[] = ['nav_music', 'nav_search', 'nav_hot', 'nav_menu']

const isMenuVisible = (id: NAV_ID_Type) => PAGER_NAV_IDS.includes(id)
const LeaderboardPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_top')
  const component = useMemo(() => <Leaderboard />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_top') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const DailyRecPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_daily_rec')
  const component = useMemo(() => <DailyRec />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_daily_rec') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const MyMusicPage = () => {
    const [visible, setVisible] = useState(commonState.navActiveId == 'nav_my_playlist')
    const component = useMemo(() => <MyMusic />, [])
    useEffect(() => {
        let currentId: CommonState['navActiveId'] = commonState.navActiveId
          const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
            currentId = id
              if (id == 'nav_my_playlist') {
                requestAnimationFrame(() => {
                    setVisible(true)
                  })
              }
          }
        const handleHide = () => {
            if (currentId != 'nav_setting') return
            setVisible(false)
          }
        const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
            if (keys.some((k) => hideKeys.includes(k))) handleHide()
          }
        global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
        global.state_event.on('themeUpdated', handleHide)
        global.state_event.on('languageChanged', handleHide)
        global.state_event.on('configUpdated', handleConfigUpdated)

        return () => {
            global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
            global.state_event.off('themeUpdated', handleHide)
            global.state_event.off('languageChanged', handleHide)
            global.state_event.off('configUpdated', handleConfigUpdated)
          }
      }, [])

  return visible ? component : null
}

const FollowedArtistsPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_followed_artists')
  const component = useMemo(() => <FollowedArtists />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_followed_artists') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const SubscribedAlbumsPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_subscribed_albums');
  const component = useMemo(() => <SubscribedAlbums />, []);
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId;
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id;
      if (id == 'nav_subscribed_albums') {
        requestAnimationFrame(() => {
          setVisible(true);
        });
      }
    };
    const handleHide = () => {
      if (currentId != 'nav_setting') return;
      setVisible(false);
    };
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.on('configUpdated', handleConfigUpdated)
    }
  }, []);
  return visible ? component : null;
};

const OneDrivePage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_onedrive')
  const component = useMemo(() => <OneDrive />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_onedrive') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const BilibiliPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_bilibili')
  const component = useMemo(() => <Bilibili />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_bilibili') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_setting') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const LxxWearPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_lxxwear')
  const component = useMemo(() => <LxxWear />, [])
  useEffect(() => {
    let currentId: CommonState['navActiveId'] = commonState.navActiveId
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      currentId = id
      if (id == 'nav_lxxwear') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    const handleHide = () => {
      if (currentId != 'nav_lxxwear') return
      setVisible(false)
    }
    const handleConfigUpdated = (keys: Array<keyof LX.AppSetting>) => {
      if (keys.some((k) => hideKeys.includes(k))) handleHide()
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)
    global.state_event.on('themeUpdated', handleHide)
    global.state_event.on('languageChanged', handleHide)
    global.state_event.on('configUpdated', handleConfigUpdated)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
      global.state_event.off('themeUpdated', handleHide)
      global.state_event.off('languageChanged', handleHide)
      global.state_event.off('configUpdated', handleConfigUpdated)
    }
  }, [])

  return visible ? component : null
}

const SettingPage = () => {
  const [visible, setVisible] = useState(commonState.navActiveId == 'nav_setting')
  const component = useMemo(() => <Setting />, [])
  useEffect(() => {
    const handleNavIdUpdate = (id: CommonState['navActiveId']) => {
      if (id == 'nav_setting') {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavIdUpdate)

    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavIdUpdate)
    }
  }, [])
  return visible ? component : null
}

const Main = () => {
  const pagerViewRef = useRef<ComponentRef<typeof PagerView>>(null);
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const [activeNavId, setActiveNavIdState] = useState(commonState.navActiveId)
  const navStatus = useSettingValue('common.navStatus'); // 获取菜单显示状态

  // 分页顺序必须和底部 Tab 顺序一致（每日推荐 → 搜索 → 我的歌单），
  // 不能直接沿用 NAV_MENUS 的顺序（那里搜索排在最前，会导致首页落在中间页、滑动顺序错乱）。
  const visibleNavs = useMemo(
    () => PAGER_NAV_IDS
      .map(id => NAV_MENUS.find(menu => menu.id === id))
      .filter((menu): menu is (typeof NAV_MENUS)[number] => !!menu),
    [],
  );

  const { viewMap, indexMap } = useMemo(() => {
    const viewMap: Partial<Record<NAV_ID_Type, number>> = {};
    const indexMap: NAV_ID_Type[] = [];
    visibleNavs.forEach((nav, index) => {
      viewMap[nav.id] = index;
      indexMap.push(nav.id);
    });
    return { viewMap, indexMap };
  }, [visibleNavs]);

  const activeIndexRef = useRef(viewMap[commonState.navActiveId] ?? 0);

  /** 是否允许分页器左右滑动（只在播放历史页禁用） */
  const canSwipePager = (id: string) =>
    !!settingState.setting['common.homePageScroll'] &&
    id !== 'nav_play_history'

  const onPageSelected = useCallback(({ nativeEvent }: PagerViewOnPageSelectedEvent) => {
    activeIndexRef.current = nativeEvent.position;
    const selectedId = indexMap[activeIndexRef.current]
    if (!selectedId) return
    setActiveNavIdState(selectedId)
    // 始终同步全局 navActiveId：顶部 chips、大标题、底部 tab 都是从这里派生的，
    // 只要漏一次同步，就会出现「底部 tab 切了、顶部 chips 没切」的错位。
    setNavActiveId(selectedId);
  }, [indexMap]);

  const onPageScrollStateChanged = useCallback(
    ({ nativeEvent }: PageScrollStateChangedNativeEvent) => {
      Keyboard.dismiss();
      const idle = nativeEvent.pageScrollState == 'idle';
      if (global.lx.homePagerIdle != idle) global.lx.homePagerIdle = idle;
    },
    []
  );

  useEffect(() => {
    const handleUpdate = (id: CommonState['navActiveId']) => {
      setActiveNavIdState(id)
      pagerViewRef.current?.setScrollEnabled(canSwipePager(id));
      const index = viewMap[id];
      if (index == null || activeIndexRef.current === index) return;
      activeIndexRef.current = index;
      pagerViewRef.current?.setPageWithoutAnimation(index);
    };
    const handleConfigUpdate = (
      keys: Array<keyof LX.AppSetting>,
      setting: Partial<LX.AppSetting>
    ) => {
      if (!keys.includes('common.homePageScroll')) return;
      pagerViewRef.current?.setScrollEnabled(canSwipePager(commonState.navActiveId));
    };

    global.state_event.on('navActiveIdUpdated', handleUpdate);
    global.state_event.on('configUpdated', handleConfigUpdate);
    return () => {
      global.state_event.off('navActiveIdUpdated', handleUpdate);
      global.state_event.off('configUpdated', handleConfigUpdate);
    };
  }, [viewMap]);

  // 全部页面组件（分页器只用前三个，其余通过覆盖层显示）
  const pageComponents = useMemo((): Partial<Record<NAV_ID_Type, ReactNode>> => ({
    nav_search: <SearchPage />,
    nav_songlist: <SongListPage />,
    nav_top: <LeaderboardPage />,
    nav_daily_rec: <DailyRecPage />,
    nav_followed_artists: <FollowedArtistsPage />,
    nav_subscribed_albums: <SubscribedAlbumsPage />,
    nav_my_playlist: <MyMusicPage />,
    nav_hot: <Hot />,
    nav_onedrive: <OneDrivePage />,
    nav_bilibili: <BilibiliPage />,
    nav_lxxwear: <LxxWearPage />,
    nav_setting: <SettingPage />,
    nav_menu: <MenuPage />,
    nav_music: <Music />,
  }), [])

  // 根据 visibleNavs 动态渲染 PagerView 的子组件（只用前三个 tab 页）
  const pages = useMemo(() => {
    return visibleNavs.map(nav => (
      <View collapsable={false} key={nav.id} style={styles.pageStyle}>
        {pageComponents[nav.id] ?? null}
      </View>
    ));
  }, [visibleNavs, pageComponents]);

  return (
    <View style={styles.container}>
      <PagerView
        ref={pagerViewRef}
        initialPage={activeIndexRef.current}
        offscreenPageLimit={1}
        onPageSelected={onPageSelected}
        onPageScrollStateChanged={onPageScrollStateChanged}
        scrollEnabled={canSwipePager(activeNavId)}
        style={[styles.pagerView, !PAGER_NAV_IDS.includes(activeNavId) ? styles.pagerHidden : null]}
      >
        {pages}
      </PagerView>
      <PlayHistoryOverlay />
      {/* 三个固定 tab 之外的页面：作为覆盖层盖在分页器上，左右滑动只在三页之间走 */}
      {!PAGER_NAV_IDS.includes(activeNavId)
        ? (
            <View style={styles.menuOverlay}>
              {pageComponents[activeNavId] ?? null}
            </View>
          )
        : null}
    </View>
  );
};

const styles = createStyle({
  container: {
    flex: 1,
  },
  pagerView: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerHidden: {
    opacity: 0,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
  },
  historyOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
    elevation: 1,
  },
  pageStyle: {
    // alignItems: 'center',
    // padding: 20,
  },
})

export default Main
