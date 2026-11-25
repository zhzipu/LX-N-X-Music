import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { View, BackHandler, StyleSheet } from 'react-native'
import MusicList, { type MusicListType } from './MusicList'
import { type ListInfoItem } from '@/store/songlist/state'
import { ListInfoContext } from './state'
import ActionBar from './ActionBar'
import DetailHero from './DetailHero'
import PageScrim from '@/components/spotify/PageScrim'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import commonState from '@/store/common/state'
import { useIsWyPlaylistSubscribed, useWySubscribedPlaylists, useWyUid } from '@/store/user/hook'
import wyApi from '@/utils/musicSdk/wy/user'
import { addWySubscribedPlaylist, removeWySubscribedPlaylist } from '@/store/user/action'
import Menu, { type MenuType, type Position } from '@/components/common/Menu'
import PlaylistEditModal, { type PlaylistEditModalType } from '../Home/Views/MyPlaylist/PlaylistEditModal'
import { type DetailInfo } from "@/screens/SonglistDetail/Header.tsx"
import { handleCollect } from './listAction'
import playerState from '@/store/player/state'
import { COMPONENT_IDS, LIST_IDS, NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import { usePlayerMusicInfo } from "@/store/player/hook.ts"
import MusicInfoOnline = LX.Music.MusicInfoOnline
import { popHomeDetail, pushHomeDetail } from '@/screens/Home/Views/Music/detailState'

type MenuAction = 'collect' | 'subscribe' | 'edit' | 'delete'

const ListHeader = ({ detailInfo, info, onBack }: { detailInfo: DetailInfo, info: ListInfoItem, onBack?: () => void }) => {
  const t = useI18n()
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const loggedInUserId = useWyUid()
  const isSubscribed = useIsWyPlaylistSubscribed(info.id)
  const menuRef = useRef<MenuType>(null)
  const playlistEditModalRef = useRef<PlaylistEditModalType>(null)
  const [isMenuVisible, setMenuVisible] = useState(false)

  const isCreator = useMemo(() => {
    return info.source === 'wy' &&
      detailInfo.userId &&
      String(detailInfo.userId) === String(loggedInUserId)
  }, [info.source, detailInfo.userId, loggedInUserId])

  const showSubscribeButton = useMemo(() => {
    return info.source === 'wy' && !isCreator
  }, [info.source, isCreator])

  const toggleSubscribe = useCallback(() => {
    const newSubState = !isSubscribed
    wyApi.subPlaylist(String(info.id), newSubState).then(() => {
      toast(newSubState ? '收藏成功' : '取消收藏成功')
      if (newSubState) {
        addWySubscribedPlaylist({
          id: info.id,
          userId: detailInfo.userId as number,
          name: detailInfo.name,
          coverImgUrl: detailInfo.imgUrl || '',
          trackCount: info.total || 0,
        })
      } else {
        removeWySubscribedPlaylist(info.id)
      }
    }).catch(err => {
      toast(`操作失败: ${err.message}`)
    })
  }, [isSubscribed, info, detailInfo])

  /** 「更多」菜单：把原来底栏的收藏 + 创作者的编辑 / 删除都收在这里 */
  const menus = useMemo(() => {
    const items: Array<{ action: MenuAction, label: string }> = [
      { action: 'collect', label: t('collect_songlist') },
    ]
    if (showSubscribeButton) {
      items.push({
        action: 'subscribe',
        label: isSubscribed ? '取消网易云收藏' : '收藏到网易云',
      })
    }
    if (isCreator) {
      items.push({ action: 'edit', label: '编辑' }, { action: 'delete', label: '删除' })
    }
    return items
  }, [showSubscribeButton, isSubscribed, isCreator, t])

  const showMenu = useCallback((position: Position) => {
    setMenuVisible(true)
    requestAnimationFrame(() => {
      menuRef.current?.show(position)
    })
  }, [])

  const handleMenuPress = useCallback(({ action }: { action: string }) => {
    setMenuVisible(false)
    switch (action) {
      case 'collect':
        void handleCollect(info.id, info.source, info.name)
        break
      case 'subscribe':
        toggleSubscribe()
        break
      case 'edit':
        playlistEditModalRef.current?.show({
          id: String(info.id),
          name: detailInfo.name,
          desc: detailInfo.desc,
        })
        break
      case 'delete':
        confirmDialog({
          message: `确定要删除歌单“${detailInfo.name}”吗？`,
          confirmButtonText: '删除',
        }).then(confirm => {
          if (!confirm) return
          wyApi.deletePlaylist(info.id).then(() => {
            toast('删除成功')
            removeWySubscribedPlaylist(info.id)
            onBack?.()
          }).catch(err => {
            toast(`删除失败: ${err.message}`)
          })
        })
        break
    }
  }, [info, detailInfo, toggleSubscribe, onBack])

  const meta = useMemo(() => {
    const parts: string[] = []
    if (detailInfo.playCount) parts.push(`${detailInfo.playCount} 次播放`)
    if (detailInfo.total) parts.push(`${detailInfo.total} 首`)
    return parts.join(' · ')
  }, [detailInfo.playCount, detailInfo.total])

  const actions = useMemo(() => <ActionBar onMore={showMenu} />, [showMenu])

  return (
    <>
      <DetailHero
        pageTitle={t('nav_songlist')}
        onBack={onBack}
        cover={detailInfo.imgUrl}
        coverNativeID={`${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_to_${info.id}`}
        titleNativeID={NAV_SHEAR_NATIVE_IDS.songlistDetail_title}
        title={detailInfo.name}
        author={info.author}
        meta={meta}
        desc={detailInfo.desc}
        actions={actions}
      />
      {isMenuVisible && (
        <Menu
          ref={menuRef}
          menus={menus}
          onPress={handleMenuPress}
          onHide={() => setMenuVisible(false)}
        />
      )}
      <PlaylistEditModal ref={playlistEditModalRef} />
    </>
  )
}

export default ({ info, onBack, initialScrollToInfo }: { info: ListInfoItem, onBack?: () => void, initialScrollToInfo: MusicInfoOnline | null }) => {
  const musicListRef = useRef<MusicListType>(null)
  const [loading, setLoading] = useState(true)
  const loadVersion = useRef(0)
  useEffect(() => () => { loadVersion.current++ }, [])
  const [detailInfo, setDetailInfo] = useState<DetailInfo>({
    name: info.name,
    desc: info.desc || '',
    playCount: info.play_count || '',
    imgUrl: info.img,
    userId: info.userId,
    total: Number(info.total) || 0,
  })
  const playlists = useWySubscribedPlaylists()
  const isInitialMount = useRef(true)
  const loggedInUserId = useWyUid()
  const playerMusicInfo = usePlayerMusicInfo()
  const initialScrollDoneRef = useRef(false)

  useEffect(() => {
    pushHomeDetail()
    return () => { popHomeDetail() }
  }, [])

  const handleBack = onBack

  const refreshList = useCallback((isRefresh = false) => {
    const version = ++loadVersion.current
    setLoading(true)
    const request = musicListRef.current?.loadList(info.source, info.id, isRefresh)
    if (!request) { setLoading(false); return }
    void request.then(detail => {
      if (version === loadVersion.current) setDetailInfo(detail)
    }).catch(() => {
      // MusicList already switches to its retryable error state.
    }).finally(() => {
      if (version === loadVersion.current) setLoading(false)
    })
  }, [info.source, info.id])

  useEffect(() => {
    const handleJumpPosition = () => {
      let listId = playerState.playMusicInfo.listId
      if (listId === LIST_IDS.TEMP) listId = listState.tempListMeta.id
      if (listId !== `${info.source}__${info.id}`) return
      const musicInfo = playerState.playMusicInfo.musicInfo
      if (musicInfo) {
        musicListRef.current?.scrollToInfo(musicInfo as LX.Music.MusicInfoOnline)
      }
    }
    global.app_event.on('jumpListPosition', handleJumpPosition)
    return () => {
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [info.id, info.source])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  useEffect(() => {
    const handlePlaylistUpdate = ({ source, listId }: { source: string, listId: string }) => {
      if (info.source === source && String(info.id) === String(listId)) {
        console.log(`歌单详情页 ${listId} 收到更新事件，正在刷新...`)
        refreshList(true)
      }
    }
    global.app_event.on('playlist_updated', handlePlaylistUpdate)
    return () => {
      global.app_event.off('playlist_updated', handlePlaylistUpdate)
    }
  }, [info.id, info.source, refreshList])

  useEffect(() => {
    const onBackPress = () => {
      // 获取状态管理中记录的最后一个（即最顶层）屏幕信息
      const lastScreen = commonState.componentIds[commonState.componentIds.length - 1]

      // 如果最顶层的屏幕不是 Home 屏幕，则意味着有其他屏幕（如歌手详情页）被 push 到栈顶
      // 此时不应处理返回事件，应交由 react-native-navigation 默认处理（即 pop 顶层屏幕）
      if (lastScreen && lastScreen.name !== COMPONENT_IDS.home) {
        return false
      }

      // 否则，处理返回事件，关闭当前的歌单详情浮层
      if (!handleBack) return false
      handleBack()
      return true
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => subscription.remove()
  }, [handleBack])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const updatedPlaylist = playlists.find(p => String(p.id) === String(info.id))
    if (!updatedPlaylist) {
      return
    }
    if (updatedPlaylist.name !== detailInfo.name || updatedPlaylist.description !== detailInfo.desc && updatedPlaylist.description != null) {
      console.log('歌单详情页检测到名称或描述变化，正在更新UI...')
      setDetailInfo(prev => ({
        ...prev,
        name: updatedPlaylist.name,
        desc: updatedPlaylist.description || '',
      }))
    }
  }, [playlists, handleBack, info.id, detailInfo.name, detailInfo.desc])

  useEffect(() => {
    if (initialScrollToInfo && detailInfo.total > 0 && !initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true
      setTimeout(() => {
        musicListRef.current?.scrollToInfo(initialScrollToInfo)
      }, 300)
    }
  }, [detailInfo.total, initialScrollToInfo])

  const ListHeaderComponent = useMemo(
    () => <ListHeader detailInfo={detailInfo} info={info} onBack={handleBack} />,
    [detailInfo, info, handleBack],
  )

  const isCreator = useMemo(() => {
    return info.source === 'wy' &&
      detailInfo.userId &&
      String(detailInfo.userId) === String(loggedInUserId)
  }, [info.source, detailInfo.userId, loggedInUserId])

  const handleListUpdate = useCallback((newList: LX.Music.MusicInfoOnline[]) => {
    setDetailInfo(prev => ({
      ...prev,
      total: newList.length,
    }))
  }, [])

  return (
    <View style={styles.container}>
      {/* 页面级渐黑遮罩：第一个子节点，压在内容下面、全局模糊封面底上面 */}
      <PageScrim />
      {loading && <View pointerEvents="none" style={styles.loading}><Loading size={28} /></View>}
      <ListInfoContext.Provider value={info}>
        <MusicList
          ref={musicListRef}
          playingId={playerMusicInfo.id}
          componentId={commonState.componentIds[commonState.componentIds.length - 1]?.id}
          isCreator={isCreator}
          onListUpdate={handleListUpdate}
          ListHeaderComponent={ListHeaderComponent}
        />
      </ListInfoContext.Provider>
    </View>
  )
}

const styles = createStyle({
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
})
