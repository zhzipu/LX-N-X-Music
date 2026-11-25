/**
 * 搜索页顶部的分类方块：歌手 / 专辑 / 歌单（在别的分类页会多一个「歌曲」返回入口）。
 *
 * 方块文字取该分类搜索结果**第一项的标题**（没有结果时才退回分类名）；
 * 图片同样取第一项封面；点击切换搜索类型。
 */

import { memo, useCallback, useEffect, useState } from 'react'
import { TouchableOpacity, View, type LayoutChangeEvent } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import musicSearch from '@/utils/musicSdk/wy/musicSearch'
import musicSdk from '@/utils/musicSdk'
import { createStyle } from '@/utils/tools'

export type TopCategoryType = 'music' | 'singer' | 'album' | 'songlist'
type CategoryType = Exclude<TopCategoryType, 'music'>

const PADDING = 16
const GAP = 12
const tileSize = (width: number, count: number) => Math.max(0, Math.floor((width - PADDING * 2 - GAP * (count - 1)) / count))

interface TopCategoriesProps {
  keyword: string
  source: string
  currentType: TopCategoryType
  onSelectType: (type: TopCategoryType) => void
}

const pickCover = (item: any): string | null => {
  if (!item) return null
  return item.picUrl ?? item.meta?.picUrl ?? item.img1v1Url ?? item.avatar ?? item.img ?? item.coverImgUrl ?? null
}

interface TopInfo {
  cover: string | null
  name: string
}

const EMPTY: Record<CategoryType, TopInfo> = {
  singer: { cover: null, name: '' },
  album: { cover: null, name: '' },
  songlist: { cover: null, name: '' },
}

const TopCategories = ({ keyword, source, currentType, onSelectType }: TopCategoriesProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const [tops, setTops] = useState<Record<CategoryType, TopInfo>>(EMPTY)
  const [rowWidth, setRowWidth] = useState(0)
  const handleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setRowWidth(layout.width)
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!keyword) {
      setTops(EMPTY)
      return
    }
    const sdk = (musicSdk as any)[source === 'all' ? 'wy' : source] ?? (musicSdk as any).wy

    const toInfo = (res: any): TopInfo => ({
      cover: pickCover(res?.list?.[0]),
      name: res?.list?.[0]?.name ?? '',
    })

    const singerTask = musicSearch.searchSinger(keyword, 1, 1).then(toInfo).catch(() => EMPTY.singer)
    const albumTask = musicSearch.searchAlbum(keyword, 1, 1).then(toInfo).catch(() => EMPTY.album)
    const songlistTask = sdk?.songList?.search
      ? sdk.songList.search(keyword, 1, 1).then(toInfo).catch(() => EMPTY.songlist)
      : Promise.resolve(EMPTY.songlist)

    void Promise.all([singerTask, albumTask, songlistTask]).then(([singer, album, songlist]) => {
      if (cancelled) return
      setTops({ singer, album, songlist })
    })

    return () => { cancelled = true }
  }, [keyword, source])

  const items: Array<{ type: TopCategoryType, name: string, icon: string }> = currentType === 'music'
    ? [
        { type: 'singer', name: tops.singer.name || t('search_type_singer'), icon: 'artist' },
        { type: 'album', name: tops.album.name || t('search_type_album'), icon: 'album' },
        { type: 'songlist', name: tops.songlist.name || t('search_type_songlist'), icon: 'list' },
      ]
    : [
        { type: 'music', name: t('search_type_music'), icon: 'music_time' },
        { type: 'singer', name: tops.singer.name || t('search_type_singer'), icon: 'artist' },
        { type: 'album', name: tops.album.name || t('search_type_album'), icon: 'album' },
        { type: 'songlist', name: tops.songlist.name || t('search_type_songlist'), icon: 'list' },
      ]

  // Measure the search pane, not a startup screen snapshot: Pad only has half
  // the window, and folding/unfolding can change its width without a remount.
  const size = tileSize(rowWidth, items.length)

  return (
    <View style={styles.row} onLayout={handleLayout}>
      {items.map((item) => {
        const info = item.type === 'music' ? null : tops[item.type as CategoryType]
        return (
          <TouchableOpacity
            key={item.type}
            style={[styles.tile, { width: size }]}
            activeOpacity={0.8}
            onPress={() => { onSelectType(item.type) }}
          >
            <View style={[styles.art, { width: size, height: size, backgroundColor: sp.colors.surfaceElevated }]}>
              {info?.cover
                ? <Image url={info.cover} style={{ width: size, height: size }} />
                : <Icon name={item.icon} size={Math.round(size * 0.3)} color={sp.colors.textTertiary} />}
            </View>
            <Text size={13} numberOfLines={1} style={[styles.label, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
              {item.name}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = createStyle({
  row: {
    flexDirection: 'row',
    paddingLeft: PADDING,
    paddingRight: PADDING,
    paddingTop: 8,
    paddingBottom: 14,
    columnGap: GAP,
  },
  tile: {},
  art: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  label: {
    paddingTop: 8,
    textAlign: 'center',
  },
})

export default memo(TopCategories)
