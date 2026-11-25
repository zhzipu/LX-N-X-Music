/**
 * 歌手 / 专辑 / 歌单 的搜索结果列表。
 *
 * 样式与歌曲结果列表保持一致：左侧 56 圆角封面 + 标题 + 副标题 + 右侧箭头。
 * 点击：歌手 → 歌手详情；专辑 → 专辑详情；歌单 → 歌单详情。
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { FlatList, TouchableOpacity, View } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import musicSearch from '@/utils/musicSdk/wy/musicSearch'
import musicSdk from '@/utils/musicSdk'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { createStyle } from '@/utils/tools'

export type CategorySearchType = 'singer' | 'album' | 'songlist'

interface CategoryListProps {
  searchType: CategorySearchType
  keyword: string
  source: string
  /** 点击条目 → 打开详情（歌手/专辑/歌单 统一走搜索页内的详情视图） */
  onOpenItem: (kind: CategorySearchType, item: any) => void
  /** 关键词/类型变化时用来触发重新加载 */
  reloadKey?: number
}

const PAGE_SIZE = 30

const pickCover = (item: any): string | null => {
  if (!item) return null
  return item.picUrl ?? item.meta?.picUrl ?? item.img1v1Url ?? item.avatar ?? item.img ?? item.coverImgUrl ?? null
}

const getSubtitle = (type: CategorySearchType, item: any) => {
  if (type === 'singer') {
    const album = item.albumSize ?? item.albumCount
    return album != null ? `专辑 ${album}` : ''
  }
  if (type === 'album') {
    const singer = item.artist?.name ?? item.singer ?? ''
    const size = item.size ?? item.songCount
    return [singer, size != null ? `${size} 首` : ''].filter(Boolean).join(' · ')
  }
  const author = item.author?.name ?? item.creator?.nickname ?? ''
  const count = item.total ?? item.count ?? item.playCount
  return [author, count != null ? `${count} 首` : ''].filter(Boolean).join(' · ')
}

const CategoryList = ({ searchType, keyword, source, onOpenItem, reloadKey = 0 }: CategoryListProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const infoRef = useRef({ page: 1, hasMore: true, total: 0 })

  const fetchPage = useCallback((page: number): Promise<{ list: any[]; total: number }> => {
    if (!keyword) return Promise.resolve({ list: [], total: 0 })
    if (searchType === 'singer') {
      return musicSearch.searchSinger(keyword, page, PAGE_SIZE).then((res: any) => ({ list: res?.list ?? [], total: res?.total ?? 0 }))
    }
    if (searchType === 'album') {
      return musicSearch.searchAlbum(keyword, page, PAGE_SIZE).then((res: any) => ({ list: res?.list ?? [], total: res?.total ?? 0 }))
    }
    const sdk = (musicSdk as any)[source === 'all' ? 'wy' : source] ?? (musicSdk as any).wy
    if (!sdk?.songList?.search) return Promise.resolve({ list: [], total: 0 })
    return sdk.songList.search(keyword, page, PAGE_SIZE).then((res: any) => ({ list: res?.list ?? [], total: res?.total ?? 0 }))
  }, [keyword, searchType, source])

  const load = useCallback((page: number, append: boolean) => {
    if (loading || (!append && !infoRef.current.hasMore && page > 1)) return
    setLoading(true)
    void fetchPage(page)
      .then(({ list: next, total }) => {
        infoRef.current.total = total
        infoRef.current.page = page
        infoRef.current.hasMore = next.length >= PAGE_SIZE && (total === 0 || total > page * PAGE_SIZE)
        setList(prev => append ? [...prev, ...next] : next)
      })
      .catch(() => {
        if (!append) setList([])
      })
      .finally(() => { setLoading(false) })
  }, [fetchPage, loading])

  useEffect(() => {
    if (!keyword) {
      setList([])
      return
    }
    infoRef.current = { page: 1, hasMore: true, total: 0 }
    setList([])
    load(1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, searchType, source, reloadKey])

  const handlePress = useCallback((item: any) => {
    onOpenItem(searchType, item)
  }, [searchType, onOpenItem])

  const renderItem = ({ item }: { item: any }) => {
    const cover = pickCover(item)
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.75} onPress={() => { handlePress(item) }}>
        <View style={[styles.thumb, { backgroundColor: sp.colors.surfaceElevated }]}>
          {cover
            ? <Image url={cover} style={styles.thumbImage} />
            : <Icon name={searchType === 'singer' ? 'artist' : searchType === 'album' ? 'album' : 'list'} size={22} color={sp.colors.textTertiary} />}
        </View>
        <View style={styles.body}>
          <Text size={15} numberOfLines={1} style={{ color: sp.colors.text }} allowFontScaling={false}>
            {item.name}
          </Text>
          <Text size={12} numberOfLines={1} style={[styles.sub, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
            {getSubtitle(searchType, item)}
          </Text>
        </View>
        <Icon name="chevron-right" size={16} color={sp.colors.textTertiary} />
      </TouchableOpacity>
    )
  }

  return (
    <FlatList
      data={list}
      keyExtractor={(item, index) => `${item.id ?? index}`}
      renderItem={renderItem}
      contentContainerStyle={{ paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT }}
      onEndReached={() => {
        if (infoRef.current.hasMore && !loading) load(infoRef.current.page + 1, true)
      }}
      onEndReachedThreshold={0.4}
      ListEmptyComponent={loading ? null : (
        <Text size={13} style={[styles.empty, { color: sp.colors.textTertiary }]} allowFontScaling={false}>
          {t('list_empty')}
        </Text>
      )}
    />
  )
}

const styles = createStyle({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    paddingLeft: 16,
    paddingRight: 16,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: 56,
    height: 56,
  },
  body: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 12,
  },
  sub: {
    paddingTop: 2,
  },
  empty: {
    paddingTop: 30,
    textAlign: 'center',
  },
})

export default memo(CategoryList)
