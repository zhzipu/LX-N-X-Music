import { memo, useCallback, useEffect, useRef } from 'react'
import { BackHandler, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { TouchableOpacity } from 'react-native'
import OnlineList, { type OnlineListType } from '@/components/OnlineList'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { playOnlineList } from '@/core/list'
import { getBiliCookie } from '@/core/bilibili/auth'
import {
  getCollectionContents,
  getFavoriteContents,
  type BiliMediaItem,
} from '@/core/bilibili/api'
import { toBiliMusicInfo } from '@/core/bilibili/music'

export interface FolderDetailProps {
  /** 'favorite' 收藏夹 / 'collection' 追更合集 / 'collected-fav' 关注的别人收藏夹 */
  type: 'favorite' | 'collection' | 'collected-fav'
  folderId: number
  title: string
  onBack: () => void
}

/** 收藏夹 / 合集 详情页：列表 + 点击播放 + 长按多选加入列表 */
export default memo(({ type, folderId, title, onBack }: FolderDetailProps) => {
  const theme = useTheme()
  const listRef = useRef<OnlineListType>(null)
  // 用 ref 同步最新列表，避免闭包/重渲染时序导致 onPlayList 拿到空数组
  const musicsRef = useRef<LX.Music.MusicInfo_bili[]>([])
  // 分页状态
  const pageRef = useRef(1)
  const hasMoreRef = useRef(true)
  const loadingRef = useRef(false)

  const fetchContent = useCallback(
    async (append = false) => {
      if (loadingRef.current) return
      loadingRef.current = true
      const cookie = getBiliCookie()
      try {
        // collection（追更合集）走 season/list；favorite / collected-fav（关注的收藏夹）走 resource/list
        const result =
          type === 'collection'
            ? await getCollectionContents(folderId, cookie, pageRef.current)
            : await getFavoriteContents(folderId, cookie, pageRef.current)
        const items = result.list as BiliMediaItem[]
        const newMusics = items.map(toBiliMusicInfo)
        musicsRef.current = append ? [...musicsRef.current, ...newMusics] : newMusics
        hasMoreRef.current = result.hasMore
        listRef.current?.setList(newMusics, append)
        listRef.current?.setStatus(result.hasMore ? 'idle' : 'end')
      } catch (error) {
        toast((error as Error)?.message || '获取内容失败')
        listRef.current?.setStatus('error')
      } finally {
        loadingRef.current = false
      }
    },
    [type, folderId]
  )

  useEffect(() => {
    pageRef.current = 1
    hasMoreRef.current = true
    listRef.current?.setStatus('loading')
    void fetchContent(false)
  }, [fetchContent])

  // 系统返回键：详情页内返回列表，而不是退出整个 Bilibili 页
  useEffect(() => {
    const handler = () => {
      onBack()
      return true
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler)
    return () => subscription.remove()
  }, [onBack])

  const onPlayList = useCallback(
    (index: number) => {
      const list = musicsRef.current
      if (!list.length) return
      void playOnlineList(`bili_${type}_${folderId}`, list, index)
    },
    [type, folderId]
  )

  const handleLoadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingRef.current) return
    pageRef.current += 1
    void fetchContent(true)
  }, [fetchContent])

  return (
    <View style={styles.container}>
      <View style={{ ...styles.header, borderBottomColor: theme['c-border-background'] }}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Icon name="chevron-left-2" size={22} color={theme['c-font']} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <OnlineList
        ref={listRef}
        listId={`bili_${type}_${folderId}`}
        forcePlayList={true}
        removeClippedSubviews={false}
        onPlayList={onPlayList}
        onRefresh={() => {
          pageRef.current = 1
          hasMoreRef.current = true
          listRef.current?.setStatus('refreshing')
          void fetchContent(false)
        }}
        onLoadMore={handleLoadMore}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
})
