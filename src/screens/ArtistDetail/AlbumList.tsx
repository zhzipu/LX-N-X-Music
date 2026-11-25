import { memo, useMemo, type ReactElement } from 'react'
import { FlatList, View, RefreshControl } from 'react-native'
import AlbumListItem from './AlbumListItem'
import { useHorizontalMode, useLayout } from '@/utils/hooks'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { scaleSizeW } from '@/utils/pixelRatio'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'

const MIN_WIDTH = scaleSizeW(120);
const HORIZONTAL_SPACING = 24;
/** 列表左右内边距（与页面其它列表保持一致） */
const PAGE_PADDING = 16

interface AlbumListProps {
  componentId: string
  albums: any[]
  loading: boolean
  hasMore: boolean
  onLoadMore: () => void
  onRefresh: () => void
  viewMode: 'grid' | 'list'
  ListHeaderComponent?: ReactElement
}

export default memo(({ componentId, albums, loading, hasMore, onLoadMore, onRefresh, ListHeaderComponent, viewMode }: AlbumListProps) => {
  const { onLayout, width } = useLayout()
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const isHorizontal = useHorizontalMode()

  const rowInfo = useMemo(() => {
    if (width === 0) return { num: 3, itemWidth: 0 }
    const availableWidth = Math.max(width - PAGE_PADDING * 2, 0)
    if (viewMode === 'list') {
      const num = isHorizontal ? 2 : 1
      // 单列时整行铺满（行内自己留 16 的内边距），双列时按内容宽度均分
      if (num === 1) return { num, itemWidth: width }
      const itemWidth = Math.floor((availableWidth - HORIZONTAL_SPACING) / num)
      return { num, itemWidth }
    }
    const num = Math.max(Math.floor((availableWidth + HORIZONTAL_SPACING) / (MIN_WIDTH + HORIZONTAL_SPACING)), 3)
    const totalSpacing = HORIZONTAL_SPACING * (num - 1)
    const itemWidth = Math.floor((availableWidth - totalSpacing) / num)
    return { num, itemWidth }
  }, [width, viewMode, isHorizontal])

  const renderItem = ({ item }: { item: any }) => {
    if (item.id.toString().startsWith('white__')) {
      return <View style={{ width: rowInfo.itemWidth }} />
    }
    return <AlbumListItem componentId={componentId} item={item} width={rowInfo.itemWidth} viewMode={viewMode} />
  }

  const list = useMemo(() => {
    const list = [...albums]
    if (rowInfo.num <= 1) return list
    if (rowInfo.num === 0) return list // Avoid division by zero
    let whiteItemNum = list.length % rowInfo.num
    if (whiteItemNum > 0) whiteItemNum = rowInfo.num - whiteItemNum
    for (let i = 0; i < whiteItemNum; i++) {
      list.push({ id: `white__${i}` })
    }
    return list
  }, [albums, rowInfo.num])

  const ListFooterComponent = () => {
    let text = ''
    if (loading && albums.length > 0) text = t('list_loading')
    else if (!hasMore) text = t('list_end')
    return (
      <View style={styles.footer}>
        <Text size={sp.font.caption} color={sp.colors.textSecondary}>{text}</Text>
      </View>
    )
  }

  return (
    <View style={styles.container} onLayout={onLayout}>
      {width > 0 && (
        <FlatList
          key={String(rowInfo.num) + viewMode}
          numColumns={rowInfo.num}
          data={list}
          renderItem={renderItem}
          keyExtractor={item => String(item.id)}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          refreshControl={
            <RefreshControl
              colors={[sp.colors.accent]}
              refreshing={loading && albums.length === 0}
              onRefresh={onRefresh}
            />
          }
          columnWrapperStyle={rowInfo.num > 1 ? styles.row : undefined}
        />
      )}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  row: {
    paddingLeft: 16,
    paddingRight: 16,
    justifyContent: 'space-between',
  },
  footer: {
    width: '100%',
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
  },
})
