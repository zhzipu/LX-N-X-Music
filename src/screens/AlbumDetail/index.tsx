import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import PageContent from '@/components/PageContent'
import PageScrim from '@/components/spotify/PageScrim'
import Header from './Header'
import OnlineList, { type OnlineListType } from '@/components/OnlineList'
import wyApi from '@/utils/musicSdk/wy/album'
import { createStyle, toast } from '@/utils/tools'
import { setComponentId } from '@/core/common'
import PlayerBar from '@/components/player/PlayerBar'
import { type ListInfoItem } from '@/store/songlist/state'
import { playOnlineList } from '@/core/list'
import {COMPONENT_IDS, LIST_IDS} from "@/config/constant.ts"
import playerState from '@/store/player/state'
import listState from '@/store/list/state'
import {usePlayerMusicInfo} from "@/store/player/hook.ts";
import { useBottomBarMotion, useWideLayout } from '@/utils/hooks'
import Loading from '@/components/common/Loading'

export default memo(({ componentId, albumInfo }: { componentId: string; albumInfo: ListInfoItem }) => {
  const [albumDetail, setAlbumDetail] = useState({ info: null, list: [] })
  const [loading, setLoading] = useState(true)
  const listRef = useRef<OnlineListType>(null)
  const playerMusicInfo = usePlayerMusicInfo()
  const isWide = useWideLayout()
  const bottomMotion = useBottomBarMotion({ initialHidden: !isWide, broadcast: !isWide })

  useEffect(() => {
    const handleJumpPosition = () => {
      let listId = playerState.playMusicInfo.listId
      if (listId === LIST_IDS.TEMP) listId = listState.tempListMeta.id
      if (listId !== `album_${albumInfo.id}`) return

      const musicInfo = playerState.playMusicInfo.musicInfo
      if (musicInfo) {
        listRef.current?.scrollToInfo(musicInfo as LX.Music.MusicInfoOnline)
      }
    }
    global.app_event.on('jumpListPosition', handleJumpPosition)
    return () => {
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [albumInfo.id])

  useEffect(() => {
    setComponentId(COMPONENT_IDS.ALBUM_DETAIL_SCREEN, componentId);
    let cancelled = false;
    setLoading(true);
    listRef.current?.setStatus('loading');
    wyApi.getAlbum(albumInfo.id).then(data => {
      if (cancelled) return;
      setAlbumDetail(data);
      listRef.current?.setList(data.list);
      listRef.current?.setStatus('idle');
    }).catch(() => {
      if (cancelled) return;
      toast('获取专辑信息失败');
      listRef.current?.setStatus('error');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [componentId, albumInfo.id]);

  const onRefresh = useCallback(() => {
    listRef.current?.setStatus('refreshing');
    wyApi.getAlbum(albumInfo.id).then(data => {
      setAlbumDetail(data);
      listRef.current?.setList(data.list);
      listRef.current?.setStatus('idle');
    }).catch(() => {
      toast('刷新专辑信息失败');
      listRef.current?.setStatus('error');
    });
  }, [albumInfo.id]);

  const onPlayList = useCallback((index: number) => {
    if (!albumDetail.list.length) return;
    const listId = `album_${albumInfo.id}`;
    void playOnlineList(listId, albumDetail.list, index);
  }, [albumDetail.list, albumInfo.id]);

  const handleListUpdate = useCallback((newList: LX.Music.MusicInfoOnline[]) => {
    setAlbumDetail(prev => ({
      ...prev,
      list: newList,
    }));
  }, []);

  /** 播放全部：沿用列表自己的播放逻辑，从第一首开始 */
  const handlePlayAll = useCallback(() => {
    const list = albumDetail.list as LX.Music.MusicInfoOnline[]
    if (!list.length) return
    void playOnlineList(`album_${albumInfo.id}`, [...list], 0)
  }, [albumDetail.list, albumInfo.id])

  /** 随机播放：洗牌副本，不改动详情页自身顺序 */
  const handleShuffle = useCallback(() => {
    const list = albumDetail.list as LX.Music.MusicInfoOnline[]
    if (!list.length) return
    const shuffled = [...list]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = temp
    }
    void playOnlineList(`album_${albumInfo.id}`, shuffled, 0)
  }, [albumDetail.list, albumInfo.id])

  const listHeader = useMemo(() => (
    <Header
      albumInfo={albumDetail.info || albumInfo}
      componentId={componentId}
      onPlayAll={handlePlayAll}
      onShuffle={handleShuffle}
    />
  ), [albumDetail.info, albumInfo, componentId, handlePlayAll, handleShuffle])

  return (
    <PageContent>
      <View
        style={styles.container}
        onTouchStart={isWide ? undefined : bottomMotion.onTouchStart}
        onTouchMove={isWide ? undefined : bottomMotion.onTouchMove}
        onTouchEnd={isWide ? undefined : bottomMotion.onTouchEnd}
        onTouchCancel={isWide ? undefined : bottomMotion.onTouchEnd}
      >
        {/* 页面级渐黑遮罩：必须压在最下面（第一个子节点），让全局模糊封面底透出来 */}
        <PageScrim />
        {loading && <View pointerEvents="none" style={styles.loading}><Loading size={28} /></View>}
        <OnlineList componentId={componentId}
          ref={listRef}
          listId='album'
          forcePlayList={true}
          onPlayList={onPlayList}
          onLoadMore={() => {}}
          onRefresh={onRefresh}
          onListUpdate={handleListUpdate}
          playingId={playerMusicInfo.id}
          ListHeaderComponent={listHeader}
        />
        <PlayerBar componentId={componentId} autoHideOnScroll={!isWide} />
      </View>
    </PageContent>
  )
});

const styles = createStyle({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
