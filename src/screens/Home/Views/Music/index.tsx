import { useTrackSelection } from '@/components/TrackSelection'
/**
 * 「音乐」页（底部第 1 个 tab）。
 *
 * 布局参照 `doc/myspotify-skin-preview.html` 的「① 首页」：
 *   最近播放（横向书架卡片：封面 + 歌名 + 歌手 + 播放次数）
 *   我的歌单（第一行固定「当前列表」= 正在播放的那首歌所属的列表，
 *            图标取该列表最后添加曲目的封面；其余为本地列表，图标逻辑相同）
 *
 * 最近播放的数据规则：取播放历史里**最近 20 首**（按最近一次播放时间挑），
 * 再按**播放次数从多到少**排序（次数相同按最近播放时间靠前）。
 * 播放历史按「同一天同一首歌只记一条」去重，所以每条记录≈当天播过，条数即次数。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, ScrollView, TouchableOpacity, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import SectionTitle from '@/components/spotify/SectionTitle'
import EmptyState from '@/components/spotify/EmptyState'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { useTheme } from '@/store/theme/hook'
import { useNavActiveId } from '@/store/common/hook'
import { useMyList } from '@/store/list/hook'
import { usePlayMusicInfo } from '@/store/player/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { getPlayHistory } from '@/utils/data'
import { getListMusics, playOnlineList, setActiveList } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import PlaylistDetail from './PlaylistDetail'
import PlaylistSearch from './PlaylistSearch'
import { useDetailDock } from '../../detailDockState'
import { handleRemove as handleRemovePlaylist } from '../Mylist/MyList/listAction'
import { createStyle } from '@/utils/tools'

const RECENT_LIMIT = 20

interface RecentItem {
  musicInfo: LX.Music.MusicInfo
  count: number
  lastPlayedAt: number
}

/** 取封面地址：在线歌曲在 meta.picUrl，本地/其它来源可能有 pic */
const getCover = (musicInfo?: LX.Music.MusicInfo | null) => {
  if (!musicInfo) return null
  const meta = (musicInfo as any).meta
  return meta?.picUrl ?? (musicInfo as any).pic ?? null
}

const Music = () => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const [recent, setRecent] = useState<RecentItem[]>([])
  const recentSongs = useMemo(() => recent.map(item => item.musicInfo), [recent])
  const selection = useTrackSelection(recentSongs)
  const lastScrollOffset = useRef(0)

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y
    const deltaY = offsetY - lastScrollOffset.current
    lastScrollOffset.current = offsetY
    if (Math.abs(deltaY) >= 1) {
      global.app_event.setBottomBarHidden(deltaY > 0)
    }
  }, [])

  const allList = useMyList()
  const playMusicInfo = usePlayMusicInfo()
  /** 正在播放的那首歌所属的列表（列表 id 可能是 default/search 这类临时队列） */
  const playingListId = playMusicInfo.listId ?? LIST_IDS.DEFAULT
  const [playingListMusics, setPlayingListMusics] = useState<LX.Music.MusicInfo[]>([])

  // 当前列表的歌：既要在切歌/切列表时刷新，也要在列表内容变化时刷新
  const loadPlayingList = useCallback(() => {
    void getListMusics(playingListId)
      .then(list => { setPlayingListMusics(list) })
      .catch(() => { setPlayingListMusics([]) })
  }, [playingListId])

  useEffect(() => {
    loadPlayingList()
    const handleListMusicUpdate = (ids: string[]) => {
      if (ids.includes(playingListId)) loadPlayingList()
    }
    global.app_event.on('myListMusicUpdate', handleListMusicUpdate)
    return () => {
      global.app_event.off('myListMusicUpdate', handleListMusicUpdate)
    }
  }, [playingListId, loadPlayingList])

  /** 当前列表最后添加的一首（列表顺序末尾） */
  const lastAddedMusic = playingListMusics.length
    ? playingListMusics[playingListMusics.length - 1]
    : null
  const currentListCover = getCover(lastAddedMusic)

  /** 本地列表（去掉试听列表）→ 最后添加曲目的封面与曲目数 */
  const [listCovers, setListCovers] = useState<Record<string, { cover: string | null; count: number }>>({})

  const localLists = useMemo(
    () => allList.filter(item => item.id !== LIST_IDS.DEFAULT),
    [allList],
  )

  const loadListCovers = useCallback(() => {
    void Promise.all(localLists.map(list =>
      getListMusics(list.id)
        .then(musics => [
          list.id,
          {
            cover: getCover(musics.length ? musics[musics.length - 1] : null),
            count: musics.length,
          },
        ] as const)
        .catch(() => [list.id, { cover: null, count: 0 }] as const)
    )).then(entries => {
      const next: Record<string, { cover: string | null; count: number }> = {}
      for (const [id, info] of entries) next[id] = info
      setListCovers(next)
    })
  }, [localLists])

  useEffect(() => {
    loadListCovers()
    const handleListMusicUpdate = () => { loadListCovers() }
    global.app_event.on('myListMusicUpdate', handleListMusicUpdate)
    return () => {
      global.app_event.off('myListMusicUpdate', handleListMusicUpdate)
    }
  }, [loadListCovers])

  /** 点歌单后在本页内切到「歌单详情」（布局参考 doc 里的 ② 歌单详情） */
  const [detail, setDetail] = useState<{ id: string; name: string; musicId?: string } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const navId = useNavActiveId()
  useDetailDock(searchOpen && !detail && navId === 'nav_music')
  useEffect(() => {
    if (!searchOpen || detail || navId !== 'nav_music') return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSearchOpen(false)
      return true
    })
    return () => subscription.remove()
  }, [searchOpen, detail, navId])

  const handleOpenList = useCallback((id: string, name: string) => {
    setActiveList(id)
    setDetail({ id, name })
  }, [])

  const handleCloseDetail = useCallback(() => { setDetail(null) }, [])

  const playingListName = useMemo(() => {
    const found = allList.find(item => item.id === playingListId)
    if (found) return found.name
    switch (playingListId) {
      case LIST_IDS.DEFAULT: return t('list_name_default')
      case LIST_IDS.LOVE: return t('list_name_love')
      case LIST_IDS.TEMP: return t('list_name_temp')
      case 'search': return t('nav_search')
      default: return playingListId
    }
  }, [allList, playingListId, t])

  const loadRecent = useCallback(() => {
    void getPlayHistory().then((history) => {
      const map = new Map<string, RecentItem>()
      for (const item of history) {
        const id = item.musicInfo?.id
        if (!id) continue
        const cur = map.get(id)
        if (cur) {
          cur.count++
          if (item.playedAt > cur.lastPlayedAt) cur.lastPlayedAt = item.playedAt
        } else {
          map.set(id, { musicInfo: item.musicInfo, count: 1, lastPlayedAt: item.playedAt })
        }
      }
      // 先挑最近播放过的 20 首，再按播放次数从多到少排
      const latest = [...map.values()]
        .sort((a, b) => b.lastPlayedAt - a.lastPlayedAt)
        .slice(0, RECENT_LIMIT)
      latest.sort((a, b) => b.count - a.count || b.lastPlayedAt - a.lastPlayedAt)
      setRecent(latest)
    }).catch(() => { setRecent([]) })
  }, [])

  useEffect(() => {
    loadRecent()
    global.app_event.on('playHistoryUpdated', loadRecent)
    return () => {
      global.app_event.off('playHistoryUpdated', loadRecent)
    }
  }, [loadRecent])

  const handlePlay = useCallback((index: number) => {
    const list = recent.map(item => item.musicInfo) as LX.Music.MusicInfoOnline[]
    void playOnlineList('play_history', list, index)
  }, [recent])

  const shelf = useMemo(() => recent.map((item, index) => {
    const cover = getCover(item.musicInfo)
    return (
      <TouchableOpacity
        key={`${item.musicInfo.id}_${index}`}
        style={[styles.shelfItem, selection.isSelected(item.musicInfo) && { backgroundColor: sp.colors.interactivePressed }]}
        activeOpacity={0.8}
        delayLongPress={300} onLongPress={() => selection.start(item.musicInfo)}
        onPress={() => selection.press(item.musicInfo, () => handlePlay(index))}
      >
        <View style={[styles.shelfArt, { backgroundColor: sp.colors.surfaceElevated }]}>
          {cover
            ? <Image url={cover} style={styles.shelfImage} />
            : <Icon name="music_time" size={40} color={sp.colors.textTertiary} />}
        </View>
        <Text size={15} numberOfLines={1} style={[styles.shelfTitle, { color: sp.colors.text }]} allowFontScaling={false}>
          {item.musicInfo.name}
        </Text>
        <Text size={12} numberOfLines={1} style={[styles.shelfSub, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
          {item.musicInfo.singer}
        </Text>
        <Text size={11} numberOfLines={1} style={[styles.shelfSub, { color: sp.colors.textTertiary }]} allowFontScaling={false}>
          {t('music_play_count', { num: item.count })}
        </Text>
      </TouchableOpacity>
    )
  }), [recent, handlePlay, sp, t, selection])

  if (detail) {
    return (
      <PlaylistDetail
        key={`${detail.id}:${detail.musicId ?? ''}`}
        listId={detail.id}
        listName={detail.name}
        onBack={handleCloseDetail}
        highlightMusicId={detail.musicId}
      />
    )
  }

  if (searchOpen) return (
    <View style={styles.container}>
      <SectionTitle title="搜索我的歌单" right={(
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="关闭歌单搜索" hitSlop={10} onPress={() => setSearchOpen(false)}>
          <Icon name="close" size={20} color={sp.colors.text} />
        </TouchableOpacity>
      )} />
      <PlaylistSearch lists={localLists} onSelect={({ listId, listName, music }) => {
        setActiveList(listId)
        setDetail({ id: listId, name: listName, musicId: music.id })
        setSearchOpen(false)
      }} />
    </View>
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onScroll={handleScroll}
      scrollEventThrottle={16}
    >
      <SectionTitle title={t('music_recent_play')} />
      {recent.length
        ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.shelf}
            >
              {shelf}
            </ScrollView>
          )
        : <EmptyState icon="music_time" title={t('music_recent_empty')} />}

      <SectionTitle title={t('music_my_playlists')} right={(
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="搜索歌单歌曲" hitSlop={10} onPress={() => setSearchOpen(value => !value)}>
          <Icon name={searchOpen ? 'close' : 'search-2'} size={20} color={sp.colors.text} />
        </TouchableOpacity>
      )} />
      <View style={styles.list}>
        {/* 第一行固定「当前列表」= 正在播放的列表；图标 = 该列表最后添加曲目的封面 */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.8}
          onPress={() => { handleOpenList(playingListId, t('music_current_list')) }}
        >
          <View style={[styles.rowThumb, { backgroundColor: sp.colors.surfaceElevated }]}>
            {currentListCover
              ? <Image url={currentListCover} style={styles.rowThumbImage} />
              : <Icon name="music_time" size={22} color={sp.colors.textTertiary} />}
          </View>
          <View style={styles.rowTexts}>
            <Text size={15} numberOfLines={1} style={{ color: sp.colors.text, fontWeight: '600' }} allowFontScaling={false}>
              {t('music_current_list')}
            </Text>
            <Text size={12} numberOfLines={1} style={[styles.rowSub, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
              {playingListName + (playingListMusics.length ? ` · ${playingListMusics.length}` : '')}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 本地列表：图标同样取「该列表最后添加曲目的封面」 */}
        {localLists.map((list) => {
          const info = listCovers[list.id]
          return (
            <TouchableOpacity
              key={list.id}
              style={styles.row}
              activeOpacity={0.8}
              onPress={() => { handleOpenList(list.id, list.name) }}
              onLongPress={list.id === LIST_IDS.LOVE ? undefined : () => {
                handleRemovePlaylist(list as LX.List.UserListInfo)
              }}
            >
              <View style={[styles.rowThumb, { backgroundColor: sp.colors.surfaceElevated }]}>
                {info?.cover
                  ? <Image url={info.cover} style={styles.rowThumbImage} />
                  : <Icon name="album" size={22} color={sp.colors.textTertiary} />}
              </View>
              <View style={styles.rowTexts}>
                <Text size={15} numberOfLines={1} style={{ color: sp.colors.text, fontWeight: '600' }} allowFontScaling={false}>
                  {list.name}
                </Text>
                <Text size={12} numberOfLines={1} style={[styles.rowSub, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
                  {t('music_song_count', { num: info?.count ?? 0 })}
                </Text>
              </View>
              <Icon name="chevron-right" size={16} color={sp.colors.textTertiary} />
            </TouchableOpacity>
          )
        })}
      </View>

      {/* 底部留给浮层（迷你播放条 + Tab 栏） */}
      <View style={{ height: HOME_BOTTOM_OVERLAY_HEIGHT }} />
    </ScrollView>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  shelf: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  shelfItem: {
    width: 140,
    marginRight: 12,
  },
  shelfArt: {
    width: 140,
    height: 140,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  shelfImage: {
    width: 140,
    height: 140,
  },
  shelfTitle: {
    paddingTop: 10,
    fontWeight: '600',
  },
  shelfSub: {
    paddingTop: 2,
  },
  list: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
  },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowThumbImage: {
    width: 56,
    height: 56,
  },
  rowTexts: {
    flex: 1,
    paddingLeft: 12,
  },
  rowSub: {
    paddingTop: 2,
  },
})

export default memo(Music)
