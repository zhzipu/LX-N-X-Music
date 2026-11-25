import {useCallback, useEffect, useRef} from 'react'
import { useWideLayout } from '@/utils/hooks'
import PageContent from '@/components/PageContent'
import {setComponentId, setNavActiveId} from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import Vertical from './Vertical'
import WideHome from './WideHome'
import { navigations } from '@/navigation'
import { foldPage } from '@/navigation/foldPage'
import ArtistSelectorManager from '@/components/ArtistSelectorManager'
import settingState from '@/store/setting/state'
import {useI18n} from "@/lang";
import {BackHandler, View} from "react-native";
import { clearSearchHighlight } from './Views/Music/searchInteraction'
import {toast} from "@/utils/tools.ts";
import commonState from '@/store/common/state'
import {useBackHandler} from "@/utils/hooks/useBackHandler.ts";

import { setSearchText as setSearchState } from '@/core/search/search'
import WebLoginManager from "@/components/WebLoginManager.tsx";
import DownloadBall from "@/components/DownloadBall";
import YouTubeLoginManager from "@/components/YouTubeLoginManager.tsx";
import VideoPlayerManager from "@/components/VideoPlayerManager.tsx";
interface Props {
  componentId: string
}

export default ({ componentId }: Props) => {
  const isWideLayout = useWideLayout()
  const t = useI18n() // 新增
  const lastBackPressed = useRef(0)
  const startupPushHandled = useRef(false)
  const wasWide = useRef(isWideLayout)

  // Window-size changes switch between phone and wide layouts without
  // remounting the navigation screen. Register its id only once per component;
  // otherwise usePageVisible sees duplicate Home entries and disables lyric updates.
  useEffect(() => {
    setComponentId(COMPONENT_IDS.home, componentId)
  }, [componentId])

  useEffect(() => {
    if (wasWide.current && !isWideLayout && foldPage.current !== 'home') {
      navigations.pushPlayDetailScreen(componentId, true, foldPage.current === 'lyrics' ? 1 : 0)
    }
    wasWide.current = isWideLayout
    if (!startupPushHandled.current) {
      startupPushHandled.current = true
      if (!isWideLayout && settingState.setting['player.startupPushPlayDetailScreen']) {
        navigations.pushPlayDetailScreen(componentId, true)
      }
    }

    const handleGlobalSearch = (text: string) => {
      setSearchState(text)
      setNavActiveId('nav_search')
    }

    global.app_event.on('triggerSearch', handleGlobalSearch)

    return () => {
      global.app_event.off('triggerSearch', handleGlobalSearch)
    }

  }, [componentId, isWideLayout])

  useBackHandler(
    useCallback(() => {
      const topScreen = commonState.componentIds[commonState.componentIds.length - 1]
      if (topScreen && topScreen.id !== componentId) {
        return false;
      }

      // 如果当前在设置页面，让设置页面的返回逻辑优先处理
      if (commonState.navActiveId === 'nav_setting') {
        return false
      }

      if (commonState.navActiveId === 'nav_play_history') {
        setNavActiveId(commonState.lastNavActiveId)
        return true
      }

      const now = Date.now()
      if (lastBackPressed.current && now - lastBackPressed.current < 2000) {
        BackHandler.exitApp()
        return true
      }

      lastBackPressed.current = now
      toast(t('exit_app_tip_double_press'))
      return true
    }, [componentId, t])
  )

  return (
    <>
      <PageContent><View style={{ flex: 1 }} onTouchStart={clearSearchHighlight}>{isWideLayout ? <WideHome componentId={componentId} /> : <Vertical componentId={componentId} />}</View></PageContent>
      <ArtistSelectorManager />
      <WebLoginManager />
      {/*<YouTubeLoginManager />*/}
      <VideoPlayerManager />
      <DownloadBall />
    </>
  )}
