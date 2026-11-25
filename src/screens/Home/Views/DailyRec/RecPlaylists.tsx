import { memo, useEffect, useState, useCallback } from 'react'
import { View, FlatList, RefreshControl, Keyboard, ScrollView } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import wyApi from '@/utils/musicSdk/wy/dailyRec'
import wy from '@/utils/musicSdk/wy/index'
import { getDailyRecPlaylistsCache, setDailyRecPlaylistsCache, clearDailyRecPlaylistsCache } from '@/core/cache'
import SectionTitle from '@/components/spotify/SectionTitle'
import PressScale from '@/components/myspotify/PressScale'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { getSP } from '@/theme/spotify/tokens'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { formatPlayCount } from '@/utils'
import { type ListInfoItem } from '@/store/songlist/state'

/**
 * 推荐歌单卡（spoti.pw 的横滑封面卡）。
 *
 * 为什么不上边框/底色：spoti.pw 的层级完全由「封面 + 留白」表达，
 * 卡片本体保持透明，只有封面是实心的 149×149 圆角 8。
 */
const PlaylistTile = ({ item, onPress }: { item: any, onPress: (item: any) => void }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const coverSize = sp.size.tileCover

  // 播放量优先（更接近 spoti.pw 卡片的副标题），缺失时退回曲目数
  const count = Number(item.playCount)
  const subtitle = Number.isFinite(count) && count > 0
    ? `${formatPlayCount(count)} 次播放`
    : Number(item.trackCount) > 0 ? `${item.trackCount} 首` : undefined

  return (
    <PressScale
      style={{ width: sp.size.tileWidth }}
      onPress={() => { onPress(item) }}
      accessibilityLabel={item.name}
    >
      {item.coverImgUrl
        ? (
            <Image
              url={item.coverImgUrl}
              style={{
                width: coverSize,
                height: coverSize,
                borderRadius: sp.radius.tile,
                backgroundColor: sp.colors.surface,
              }}
            />
          )
        : (
            <View
              style={{
                width: coverSize,
                height: coverSize,
                borderRadius: sp.radius.tile,
                backgroundColor: sp.colors.surface,
              }}
            />
          )}
      <Text
        size={sp.font.tileTitle}
        numberOfLines={2}
        color={sp.colors.text}
        style={[styles.title, { fontWeight: sp.font.tileTitleWeight }]}
      >
        {item.name}
      </Text>
      {subtitle
        ? (
            <Text
              size={sp.font.tileSubtitle}
              numberOfLines={1}
              color={sp.colors.textSecondary}
              style={styles.subtitle}
            >
              {subtitle}
            </Text>
          )
        : null}
    </PressScale>
  )
}

/** 卡片间距 12（token 的 spacing.md），最后一列不多出额外留白 */
const TileSeparator = () => <View style={styles.tileSeparator} />

export default memo(({ onOpenDetail }: { onOpenDetail: (info: any) => void }) => {
  const [playlists, setPlaylists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const cookie = useSettingValue('common.wy_cookie')
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const loadPlaylists = useCallback((isRefresh = false) => {
    if (!cookie) {
      setLoading(false)
      setPlaylists([])
      return
    }

    if (!isRefresh) {
      const cachedPlaylists = getDailyRecPlaylistsCache()
      if (cachedPlaylists) {
        setPlaylists(cachedPlaylists)
        setLoading(false)
        return
      }
    }

    setLoading(true)
    wyApi.getRecPlaylists(cookie).then(async list => {
      const adaptedList =  list
        // .filter(item => !item.name.includes('雷达'))
        .map(item => ({
          id: item.id,
          name: item.name,
          trackCount: item.trackCount,
          coverImgUrl: item.picUrl,
          creator: { nickname: item.creator?.nickname ?? '推荐' },
          playCount: item.playcount,
          description: item.copywriter,
        }))

      let isFirstRadarFound = false
      for (let i = 0; i < adaptedList.length; i++) {
        if (!isFirstRadarFound && adaptedList[i].name.includes('私人雷达') && adaptedList[i].trackCount === 0) {
          isFirstRadarFound = true
          try {
            const detail = await wy.songList.getListDetail(String(adaptedList[i].id), 1)
            if (detail && detail.info) {
              adaptedList[i].name = detail.info.name || adaptedList[i].name
              adaptedList[i].trackCount = detail.total != null ? detail.total : adaptedList[i].trackCount
              adaptedList[i].coverImgUrl = detail.info.img || adaptedList[i].coverImgUrl
            }
          } catch (e) {
            console.log('Failed to fetch radar detail:', e)
          }
        }
      }

      setPlaylists(adaptedList)
      setDailyRecPlaylistsCache(adaptedList)
    }).catch(err => {
      toast(`获取推荐歌单失败: ${err.message}`)
    }).finally(() => {
      setLoading(false)
    })
  }, [cookie])

  useEffect(() => {
    loadPlaylists()
  }, [loadPlaylists])

  // 与改动前一致：先转成 ListInfoItem 再交给详情页
  const handleItemPress = useCallback((item: any) => {
    const playlistInfo: ListInfoItem = {
      id: String(item.id),
      name: item.name,
      author: item.creator?.nickname,
      img: item.coverImgUrl,
      play_count: item.playCount,
      desc: item.description,
      source: 'wy',
      userId: item.userId,
      total: item.trackCount,
    }
    onOpenDetail(playlistInfo)
  }, [onOpenDetail])

  const handleRefresh = () => {
    clearDailyRecPlaylistsCache()
    loadPlaylists(true)
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScrollBeginDrag={Keyboard.dismiss}
        refreshControl={
          <RefreshControl
            colors={[sp.colors.accent]}
            refreshing={loading}
            onRefresh={handleRefresh}
          />
        }
      >
        <SectionTitle title="推荐歌单" />
        <FlatList
          horizontal
          data={playlists}
          renderItem={({ item }) => <PlaylistTile item={item} onPress={handleItemPress} />}
          keyExtractor={item => String(item.id)}
          showsHorizontalScrollIndicator={false}
          ItemSeparatorComponent={TileSeparator}
          contentContainerStyle={{ paddingHorizontal: sp.size.pagePaddingH }}
          style={styles.shelf}
        />
      </ScrollView>
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    // 底部浮层（迷你播放条 + Tab 栏）不占布局，用 padding 顶开
    paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT,
  },
  shelf: {
    flexGrow: 0,
  },
  title: {
    paddingTop: 8,
  },
  subtitle: {
    paddingTop: 2,
  },
  tileSeparator: {
    width: 12,
  },
})
