import {forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef} from 'react'
import { View, Pressable } from 'react-native'
import OnlineList from '@/components/OnlineList'
import AlbumList from './AlbumList'
import Header from './Header'
import Chip from '@/components/spotify/Chip'
import { Icon } from '@/components/common/Icon.tsx'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { playOnlineList } from '@/core/list'
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view'
import { type OnlineListType } from '@/components/OnlineList'

interface SongListProps {
  componentId: string
  artistId: string
  artist: any
  songs: { list: any[], hasMore: boolean, page: number, loading: boolean, sort: string }
  albums: { list: any[], hasMore: boolean, page: number, loading: boolean }
  activeTab: 'songs' | 'albums'
  albumViewMode: 'grid' | 'list'
  playingId: string | null
  source?: string
  onTabChange: (tab: 'songs' | 'albums') => void
  onLoadMoreSongs: () => void
  onLoadMoreAlbums: () => void
  onSortChange: (sort: 'hot' | 'time') => void
  onRefresh: () => void
  onAlbumViewModeChange: (mode: 'grid' | 'list') => void
  onSongListUpdate: (list: LX.Music.MusicInfoOnline[]) => void
}

interface SongListRef {
  scrollToInfo: (info: LX.Music.MusicInfoOnline) => void
}

const SongList = forwardRef<SongListRef, SongListProps>(({
                                                           componentId,
                                                           artistId,
                                                           artist,
                                                           songs, albums, activeTab, onTabChange,
                                                           onLoadMoreSongs, onLoadMoreAlbums,
                                                           onSortChange, onRefresh,
                                                           playingId,
                                                           albumViewMode, onAlbumViewModeChange,
                                                           onSongListUpdate,
                                                           source,
                                                         }, ref) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const songListRef = useRef<OnlineListType>(null)
  const pagerViewRef = useRef<PagerView>(null)

  useImperativeHandle(ref, () => ({
    scrollToInfo: (info) => {
      songListRef.current?.scrollToInfo(info)
    },
  }))

  const onPlayList = useCallback((index: number) => {
    if (!songs.list.length) return
    const listId = `artist_detail_${artistId}`
    void playOnlineList(listId, songs.list, index)
  }, [songs.list, artistId])

  // 播放全部 / 随机播放的回调保持稳定，避免每次分页都让整块页头重渲染
  const songsRef = useRef(songs.list)
  songsRef.current = songs.list

  /** 播放全部：复用列表自己的播放逻辑，从第一首开始 */
  const handlePlayAll = useCallback(() => {
    const list = songsRef.current
    if (!list.length) return
    void playOnlineList(`artist_detail_${artistId}`, [...list], 0)
  }, [artistId])

  const handleShuffle = useCallback(() => {
    const list = songsRef.current
    if (!list.length) return
    const shuffled = [...list]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = temp
    }
    void playOnlineList(`artist_detail_${artistId}`, shuffled, 0)
  }, [artistId])

  useEffect(() => {
    const pageIndex = activeTab === 'songs' ? 0 : 1
    pagerViewRef.current?.setPage(pageIndex)
  }, [activeTab])

  const onPageSelected = useCallback((event: PagerViewOnPageSelectedEvent) => {
    const newTab = event.nativeEvent.position === 0 ? 'songs' : 'albums'
    if (newTab !== activeTab) {
      onTabChange(newTab)
    }
  }, [activeTab, onTabChange])


  useEffect(() => {
    if (activeTab === 'songs') {
      if (songs.loading && songs.list.length === 0) {
        songListRef.current?.setStatus('loading')
      } else {
        songListRef.current?.setStatus(songs.hasMore ? 'idle' : 'end')
      }
      songListRef.current?.setList(songs.list, songs.page > 1, false)
    }
  }, [songs.list, songs.loading, songs.hasMore, songs.page, activeTab])

  /**
   * 页头（歌手大图 + 操作行）和分段 / 排序条都放进列表的 ListHeaderComponent，
   * 这样整页像 spoti.pw 一样从上滚到下；两个 Tab 各自持有一份同样的页头。
   */
  const listHeader = useMemo(() => (
    <View>
      <Header
        artist={artist}
        componentId={componentId}
        source={source}
        onPlayAll={handlePlayAll}
        onShuffle={handleShuffle}
      />
      <View style={styles.bar}>
        <View style={styles.group}>
          <Chip
            label="所有歌曲"
            active={activeTab === 'songs'}
            onPress={() => onTabChange('songs')}
          />
          <Chip
            label="所有专辑"
            active={activeTab === 'albums'}
            onPress={() => onTabChange('albums')}
          />
        </View>
        <View style={styles.group}>
          {activeTab === 'songs'
            ? (
                <>
                  <Chip
                    label="热门"
                    active={songs.sort === 'hot'}
                    onPress={() => onSortChange('hot')}
                  />
                  <Chip
                    label="时间"
                    active={songs.sort === 'time'}
                    onPress={() => onSortChange('time')}
                  />
                </>
              )
            : (
                <>
                  <Pressable
                    style={styles.viewModeBtn}
                    onPress={() => onAlbumViewModeChange('grid')}
                    accessibilityRole="button"
                  >
                    <Icon
                      name="album"
                      size={sp.size.controlIcon}
                      color={albumViewMode === 'grid' ? sp.colors.accent : sp.colors.textSecondary}
                    />
                  </Pressable>
                  <Pressable
                    style={styles.viewModeBtn}
                    onPress={() => onAlbumViewModeChange('list')}
                    accessibilityRole="button"
                  >
                    <Icon
                      name="menu"
                      size={sp.size.controlIcon}
                      color={albumViewMode === 'list' ? sp.colors.accent : sp.colors.textSecondary}
                    />
                  </Pressable>
                </>
              )}
        </View>
      </View>
    </View>
  ), [
    artist, componentId, source, handlePlayAll, handleShuffle,
    activeTab, onTabChange, songs.sort, onSortChange,
    albumViewMode, onAlbumViewModeChange, sp,
  ])

  return (
    <View style={{ flex: 1 }}>
      <PagerView
        ref={pagerViewRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={onPageSelected}
      >
        <View key="1" style={{ flex: 1 }}>
          <OnlineList
            ref={songListRef}
            listId="search"
            forcePlayList={true}
            onPlayList={onPlayList}
            onRefresh={onRefresh}
            onLoadMore={onLoadMoreSongs}
            onListUpdate={onSongListUpdate}
            playingId={playingId}
            ListHeaderComponent={listHeader}
          />
        </View>
        <View key="2" style={{ flex: 1 }}>
          <AlbumList
            componentId={componentId}
            albums={albums.list}
            loading={albums.loading}
            hasMore={albums.hasMore}
            onRefresh={onRefresh}
            viewMode={albumViewMode}
            onLoadMore={onLoadMoreAlbums}
            ListHeaderComponent={listHeader}
          />
        </View>
      </PagerView>
    </View>
  )
})

export default memo(SongList)

const styles = createStyle({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewModeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
