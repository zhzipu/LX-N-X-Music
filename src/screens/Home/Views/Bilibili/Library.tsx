import { memo, useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, RefreshControl, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { getBiliCookie } from '@/core/bilibili/auth'
import {
  getCollectedFolders,
  getFavoriteFolderCovers,
  getFavoriteFolders,
  requestUserInfo,
  type BiliCollectedFolder,
  type BiliFavoriteFolder,
} from '@/core/bilibili/api'
import { BorderWidths } from '@/theme'
import FolderDetail from './FolderDetail'

type TabId = 'favorite' | 'collection'

/** 顶部两个 tab：收藏夹 / 合集 */
const Tabs = memo(({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) => {
  const theme = useTheme()
  const t = useI18n()
  const items: { id: TabId; label: string }[] = [
    { id: 'favorite', label: t('bili_tab_favorite') },
    { id: 'collection', label: t('bili_tab_collection') },
  ]
  return (
    <View style={styles.tabBar}>
      {items.map((item) => {
        const isActive = active === item.id
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.tabItem}
            onPress={() => onChange(item.id)}
          >
            <Text
              size={15}
              style={{
                ...styles.tabLabel,
                borderBottomColor: isActive ? theme['c-primary-background-active'] : 'transparent',
              }}
              color={isActive ? theme['c-primary-font-active'] : theme['c-font']}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
})

/** 收藏夹列表项 */
const FavoriteItem = memo(
  ({ item, onPress }: { item: BiliFavoriteFolder; onPress: (item: BiliFavoriteFolder) => void }) => {
    const theme = useTheme()
    return (
      <TouchableOpacity style={styles.item} onPress={() => onPress(item)}>
        <FolderCover covers={item.covers} />
        <View style={styles.itemText}>
          <Text size={15} numberOfLines={1}>
            {item.title}
          </Text>
          <Text size={11} color={theme['c-font-label']}>
            {item.media_count} 个视频
          </Text>
        </View>
      </TouchableOpacity>
    )
  }
)

/** 田字四图拼图图标：前 4 个视频封面；不足 4 张时用占位块补齐 */
const FolderCover = memo(({ covers }: { covers?: string[] }) => {
  const theme = useTheme()
  const cells = covers && covers.length ? covers.slice(0, 4) : []
  if (!cells.length) {
    // 无封面时回退到原来的心跳图标
    return (
      <View style={{ ...styles.itemIcon, backgroundColor: theme['c-primary-light-400-alpha-700'] }}>
        <SvgIcon name="heartbeat" size={22} color={theme['c-primary-font']} />
      </View>
    )
  }
  return (
    <View style={styles.coverGrid}>
      {[0, 1, 2, 3].map((i) =>
        cells[i] ? (
          <Image key={i} url={cells[i]} style={styles.coverGridCell} />
        ) : (
          <View
            key={i}
            style={{ ...styles.coverGridCell, backgroundColor: theme['c-primary-light-400-alpha-700'] }}
          />
        )
      )}
    </View>
  )
})

/** 合集列表项 */
const CollectionItem = memo(
  ({ item, onPress }: { item: BiliCollectedFolder; onPress: (item: BiliCollectedFolder) => void }) => {
    const theme = useTheme()
    return (
      <TouchableOpacity style={styles.item} onPress={() => onPress(item)}>
        <Image url={item.cover} style={styles.itemCover} />
        <View style={styles.itemText}>
          <Text size={15} numberOfLines={1}>
            {item.title}
          </Text>
          <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
            {item.upper?.name ? `${item.upper.name} · ` : ''}
            {item.media_count} 个视频
          </Text>
        </View>
      </TouchableOpacity>
    )
  }
)

/** 详情页导航状态 */
interface DetailState {
  type: 'favorite' | 'collection' | 'collected-fav'
  folderId: number
  title: string
}

/** 登录后的内容页：收藏夹 / 合集 两个 tab */
export default memo(() => {
  const theme = useTheme()
  const t = useI18n()
  const [active, setActive] = useState<TabId>('favorite')
  const [favorites, setFavorites] = useState<BiliFavoriteFolder[]>([])
  const [collections, setCollections] = useState<BiliCollectedFolder[]>([])
  const [collectionCount, setCollectionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(false)
  const [detail, setDetail] = useState<DetailState | null>(null)

  const load = useCallback(
    async (showRefreshing: boolean) => {
      if (showRefreshing) setRefreshing(true)
      else setLoading(true)
      setError(false)
      const cookie = getBiliCookie()
      try {
        const userInfo = await requestUserInfo(cookie)
        if (!userInfo) {
          setError(true)
          return
        }
        const mid = userInfo.mid
        const [favResult, colResult] = await Promise.all([
          getFavoriteFolders(mid, cookie),
          getCollectedFolders(mid, cookie),
        ])
        // 并发拉取每个收藏夹前 4 个封面，用于田字拼图图标（封面失败静默回退默认图标）
        const favWithCovers = await Promise.all(
          favResult.map(async (f) => ({
            ...f,
            covers: await getFavoriteFolderCovers(f.id, cookie),
          }))
        )
        setFavorites(favWithCovers)
        setCollections(colResult.list)
        setCollectionCount(colResult.count)
      } catch {
        setError(true)
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    []
  )

  useEffect(() => {
    void load(false)
  }, [load])

  // 打开详情页
  if (detail) {
    return (
      <FolderDetail
        type={detail.type}
        folderId={detail.folderId}
        title={detail.title}
        onBack={() => setDetail(null)}
      />
    )
  }

  const data = active === 'favorite' ? favorites : collections

  const renderItem = ({ item }: { item: BiliFavoriteFolder | BiliCollectedFolder }) =>
    active === 'favorite' ? (
      <FavoriteItem
        item={item as BiliFavoriteFolder}
        onPress={(it) =>
          setDetail({ type: 'favorite', folderId: it.id, title: it.title })
        }
      />
    ) : (
      <CollectionItem
        item={item as BiliCollectedFolder}
        onPress={(it) => {
          // attr=0 是追更视频合集（用 season/list）；其它（如 22）是关注的别人收藏夹（用 resource/list）
          const kind = it.attr === 0 ? 'collection' : 'collected-fav'
          setDetail({ type: kind, folderId: it.id, title: it.title })
        }}
      />
    )

  const countText =
    active === 'favorite'
      ? `${favorites.length} ${t('bili_folder_count')}`
      : `${collectionCount} ${t('bili_collection_count')}`

  return (
    <View style={styles.container}>
      <Tabs active={active} onChange={setActive} />

      <View style={styles.countRow}>
        <Text size={12} color={theme['c-font-label']}>
          {countText}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme['c-primary']} />
        </View>
      ) : error ? (
        <TouchableOpacity style={styles.center} onPress={() => void load(false)}>
          <Text size={13} color={theme['c-font-label']}>
            {t('bili_load_failed')}
          </Text>
        </TouchableOpacity>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={data.length === 0 ? styles.emptyContainer : undefined}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text size={13} color={theme['c-font-label']}>
                {active === 'favorite' ? t('bili_empty_favorite') : t('bili_empty_collection')}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              colors={[theme['c-primary']]}
              tintColor={theme['c-primary']}
            />
          }
        />
      )}
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  tabItem: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  tabLabel: {
    paddingHorizontal: 2,
    paddingVertical: 4,
    borderBottomWidth: BorderWidths.normal3,
  },
  countRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  itemIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCover: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  coverGrid: {
    width: 48,
    height: 48,
    borderRadius: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
  },
  coverGridCell: {
    width: 24,
    height: 24,
  },
  itemText: {
    flex: 1,
    marginLeft: 12,
  },
})
