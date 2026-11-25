import { memo, useEffect, useState, useCallback, useRef } from 'react'
import {View, FlatList, RefreshControl, BackHandler, StyleSheet, Keyboard, type NativeScrollEvent, type NativeSyntheticEvent} from 'react-native'
import ListItem from './ListItem'
import wyApi from '@/utils/musicSdk/wy/user'
import wyDailyRecApi from '@/utils/musicSdk/wy/dailyRec'
import wyMusicDetailApi from '@/utils/musicSdk/wy/musicDetail'
import { playOnlineList } from '@/core/list'
import { MUSIC_TOGGLE_MODE } from '@/config/constant'
import { updateSetting } from '@/core/common'
import { useWySubscribedPlaylists, useWyUid } from '@/store/user/hook.ts'
import userState from '@/store/user/state'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import SonglistDetail from '../../../SonglistDetail'
import { type ListInfoItem } from '@/store/songlist/state'
import commonState from '@/store/common/state'
import playerState from '@/store/player/state'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import {setWySubscribedPlaylists} from "@/store/user/action.ts"
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import MusicInfoOnline = LX.Music.MusicInfoOnline;

/** 空状态：居中次级色图标 + 17/600 主文案 + 15 次级说明 */
const EmptyState = ({ icon, title, desc }: { icon: string, title: string, desc?: string }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={44} color={sp.colors.textTertiary} />
      <Text size={17} style={[styles.emptyTitle, { color: sp.colors.text }]}>{title}</Text>
      {desc ? <Text size={15} style={[styles.emptyDesc, { color: sp.colors.textSecondary }]}>{desc}</Text> : null}
    </View>
  )
}

export default memo(() => {
  const playlists = useWySubscribedPlaylists()
  const uid = useWyUid()
  const [loading, setLoading] = useState(true)
  const cookie = useSettingValue('common.wy_cookie')
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const [selectedPlaylist, setSelectedPlaylist] = useState<ListInfoItem | null>(null)
  const [scrollToMusicInfo, setScrollToMusicInfo] = useState<MusicInfoOnline | null>(null)
  const selectedPlaylistRef = useRef(selectedPlaylist)
  selectedPlaylistRef.current = selectedPlaylist
  const lastScrollOffset = useRef(0)

  useEffect(() => {
    const handleJumpPosition = () => {
      let listId = playerState.playMusicInfo.listId
      if (listId === LIST_IDS.TEMP) listId = listState.tempListMeta.id
      if (!listId?.startsWith('wy__')) return

      const playlistId = listId.replace('wy__', '')
      const targetPlaylist = playlists.find(p => String(p.id) === playlistId)

      if (targetPlaylist) {
        const playlistInfo: ListInfoItem = {
          id: String(targetPlaylist.id),
          name: targetPlaylist.name,
          author: targetPlaylist.creator?.nickname,
          img: targetPlaylist.coverImgUrl,
          play_count: targetPlaylist.playCount,
          desc: targetPlaylist.description,
          source: 'wy',
          userId: targetPlaylist.userId,
          total: targetPlaylist.trackCount,
        }
        const musicInfo = 'progress' in playerState.playMusicInfo.musicInfo
          ? playerState.playMusicInfo.musicInfo.metadata.musicInfo
          : playerState.playMusicInfo.musicInfo
        if (musicInfo) setScrollToMusicInfo(musicInfo as MusicInfoOnline)
        setSelectedPlaylist(playlistInfo)
      }
    }

    global.app_event.on('jumpListPosition', handleJumpPosition)
    return () => {
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [playlists])

  useEffect(() => {
    if (!cookie || !uid) {
      setLoading(false)
      setWySubscribedPlaylists([])
      return
    }
    if (playlists.length > 0) {
      setLoading(false)
      return
    }
    setLoading(true)
    wyApi.getUserPlaylists(uid, cookie)
      .then(playlists => {
        setWySubscribedPlaylists(playlists)
      })
      .catch(err => {
        toast(`获取歌单失败: ${err.message}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [cookie, uid])

  const onRefresh = useCallback(() => {
    if (!cookie || !uid) {
      setLoading(false)
      setWySubscribedPlaylists([])
      return
    }
    setLoading(true)
    wyApi.getUserPlaylists(uid, cookie)
      .then(playlists => {
        setWySubscribedPlaylists(playlists)
      })
      .catch(err => {
        toast(`刷新歌单失败: ${err.message}`)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [cookie, uid])

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y
    const deltaY = offsetY - lastScrollOffset.current
    lastScrollOffset.current = offsetY
    if (Math.abs(deltaY) >= 1) {
      global.app_event.setBottomBarHidden(deltaY > 0)
    }
  }, [])

  // 处理物理返回键，仅在显示详情时触发
  useEffect(() => {
    const onBackPress = () => {
      // 检查当前是否正在显示歌单详情页B
      if (selectedPlaylistRef.current) {
        // 检查是否有其他原生屏幕（如歌手/专辑详情页C）在Home屏幕之上
        // 当只有Home屏幕时，componentIds的长度为1。
        // 当有其他屏幕被push时，长度会大于1。
        if (commonState.componentIds.length > 1) {
          // 有其他原生屏幕在顶部，让原生导航处理返回事件
          return false;
        }

        // 如果没有其他原生屏幕，说明这个返回操作是针对歌单详情页B的
        setSelectedPlaylist(null);
        return true; // 消费事件，防止退出应用
      }

      // 如果不在歌单详情页，则不处理返回事件
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, []); // 依然使用空依赖数组

  // 定义点击列表项的事件
  const handleItemPress = useCallback((playlistInfo: ListInfoItem) => {
    setSelectedPlaylist(playlistInfo)
  }, [])

  const handleHeartbeatPress = useCallback(async (playlistInfo: ListInfoItem) => {
    if (!cookie || !uid) return
    try {
      toast('正在开启心动模式...')
      let ids = Array.from(userState.wy_liked_song_ids)
      if (!ids || !ids.length) {
        ids = (await wyApi.getLikedSongList(uid, cookie)).map(String)
      }

      if (!ids || !ids.length) {
        toast('没有喜欢的歌曲')
        return
      }

      const randomSongId = ids[Math.floor(Math.random() * ids.length)]
      const musicInfoRes = await wyMusicDetailApi.getList([randomSongId])
      const mInfo = musicInfoRes.list[0]

      if (!mInfo) {
        toast('获取歌曲详情失败')
        return
      }

      const res = await wyDailyRecApi.getHeartbeatModeList(cookie, playlistInfo.id, randomSongId)
      const heartbeatList = [mInfo, ...res.list].filter(Boolean) as any[]

      updateSetting({ 'player.togglePlayMethod': MUSIC_TOGGLE_MODE.heartbeat })
      playOnlineList('heartbeat', heartbeatList, 0, false)
      toast('心动模式已开启')
    } catch (err: any) {
      toast(`开启心动模式失败: ${err.message}`)
    }
  }, [cookie, uid])

  if (!cookie) {
    return (
      <View style={[styles.container, { backgroundColor: 'transparent' }]}>
        <EmptyState
          icon="love"
          title="请先设置网易云 Cookie"
          desc="设置 → 基本设置 → 网易云音乐 Cookie"
        />
      </View>
    )
  }

  const handleBack = useCallback(() => {
    setSelectedPlaylist(null)
    setScrollToMusicInfo(null)
  }, [])
  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={[{ flex: 1 }, selectedPlaylist ? { opacity: 0 } : null]} pointerEvents={selectedPlaylist ? 'none' : 'auto'}>
        <FlatList
        onScroll={handleScroll}
        scrollEventThrottle={16}
          onScrollBeginDrag={Keyboard.dismiss}
          data={playlists}
          renderItem={({ item }) => <ListItem item={item} onPress={handleItemPress} onHeartbeatPress={handleHeartbeatPress} />}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={loading
            ? null
            : (
                <EmptyState
                  icon="album"
                  title="还没有网易云歌单"
                  desc="下拉刷新试试，或先去网易云收藏一些歌单"
                />
              )}
          refreshControl={
            <RefreshControl
              colors={[sp.colors.accent]}
              refreshing={loading}
              onRefresh={onRefresh}
            />
          }
        />
      </View>
      {selectedPlaylist && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'transparent' }]}>
          <SonglistDetail info={selectedPlaylist} onBack={handleBack} initialScrollToInfo={scrollToMusicInfo} />
        </View>
      )}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 4,
    // 底部浮层（迷你播放条 + Tab 栏）不占布局，用 padding 把最后一项顶到浮层上方
    paddingBottom: 24 + HOME_BOTTOM_OVERLAY_HEIGHT,
  },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 32,
    paddingRight: 32,
    paddingBottom: 48,
  },
  emptyTitle: {
    paddingTop: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyDesc: {
    paddingTop: 8,
    textAlign: 'center',
  },
})
