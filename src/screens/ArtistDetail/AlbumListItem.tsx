import { memo, useState } from 'react'
import { Modal, View, TouchableOpacity } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle, toast } from '@/utils/tools'
import { dateFormat } from '@/utils/common'
import { navigations } from '@/navigation'
import { Icon } from '@/components/common/Icon'
import { useIsWyAlbumSubscribed, useIsBiliAlbumSubscribed } from '@/store/user/hook'
import wyApi from '@/utils/musicSdk/wy/user'
import { addWySubscribedAlbum, removeWySubscribedAlbum } from '@/store/user/action'
import { type SubscribedAlbumInfo } from '@/store/user/state'
import BiliFolderDetail from '@/screens/Home/Views/Bilibili/FolderDetail'
import { toggleBiliAlbumSubscribe } from '@/core/bilibili/favorite'

export default memo(({ componentId, item, width, viewMode }: { componentId: string, item: any, width: number, viewMode: 'grid' | 'list' }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const isBili = item.source === 'bili'
  // 网易云收藏的专辑与 bili 收藏的合集是两套独立存储，按音源二选一
  const isWySubscribed = useIsWyAlbumSubscribed(isBili ? undefined : item.id)
  const isBiliSubscribed = useIsBiliAlbumSubscribed(isBili ? item.id : undefined)
  const isSubscribed = isBili ? isBiliSubscribed : isWySubscribed
  const [biliDetail, setBiliDetail] = useState<{ folderId: number, title: string } | null>(null)

  const handlePress = () => {
    // B 站合集：内嵌展示合集详情（season 列表）
    if (item.source === 'bili') {
      setBiliDetail({ folderId: Number(item.id), title: item.name })
      return
    }
    const albumInfo = {
      id: item.id,
      name: item.name,
      author: item.artist.name,
      img: item.picUrl,
      play_count: '',
      desc: item.briefDesc,
      source: 'wy',
      artists: item.artists,
      picUrl: item.picUrl,
      size: item.size,
      publishTime: item.publishTime,
    }
    navigations.pushAlbumDetailScreen(componentId, albumInfo)
  }

  const toggleSubscribe = (event: any) => {
    event.stopPropagation()
    if (!item.id) return
    // B 站合集：先落地本地收藏，再尽力同步进 B 站「音乐」收藏夹
    if (isBili) {
      void toggleBiliAlbumSubscribe(
        { id: item.id, name: item.name, picUrl: item.picUrl, size: item.size },
        !isSubscribed,
      )
      return
    }
    const newSubState = !isSubscribed
    wyApi.subAlbum(String(item.id), newSubState).then(() => {
      toast(newSubState ? '收藏成功' : '取消收藏成功')
      if (newSubState) {
        const albumInfoForStore: SubscribedAlbumInfo = {
          id: item.id,
          name: item.name,
          picUrl: item.picUrl,
          artists: item.artists,
          publishTime: item.publishTime,
          size: item.size,
        }
        addWySubscribedAlbum(albumInfoForStore)
      } else {
        removeWySubscribedAlbum(item.id)
      }
    }).catch(err => {
      toast(`操作失败: ${err.message}`)
    })
  }

  // B 站合集详情：必须用全屏 Modal 覆盖层。
  // 不能像以前那样直接 return 在本组件内——本组件是网格（FlatList numColumns）的子项，
  // 宽度会被限制成一个格子的宽度（约 1/3 屏），导致详情页标题/列表项被挤成省略号。
  const biliDetailModal = biliDetail ? (
    <Modal
      visible
      animationType="slide"
      transparent={false}
      onRequestClose={() => setBiliDetail(null)}
    >
      <View style={[styles.modal, { backgroundColor: sp.colors.bg }]}>
        <BiliFolderDetail
          type="collection"
          folderId={biliDetail.folderId}
          title={biliDetail.title}
          onBack={() => setBiliDetail(null)}
        />
      </View>
    </Modal>
  ) : null

  const likeButton = (
    <TouchableOpacity style={styles.likeButton} onPress={toggleSubscribe} hitSlop={6}>
      <Icon
        name={isSubscribed ? 'love-filled' : 'love'}
        size={16}
        color={isSubscribed ? sp.colors.accent : sp.colors.textSecondary}
      />
    </TouchableOpacity>
  )

  // 列表视图模式
  if (viewMode === 'list') {
    return (
      <>
        <TouchableOpacity style={[styles.listItem, { width }]} onPress={handlePress}>
          <Image url={item.picUrl} style={styles.listArtwork} />
          <View style={styles.listInfo}>
            <Text
              size={sp.font.rowTitle}
              numberOfLines={1}
              style={{ color: sp.colors.text, fontWeight: sp.font.rowTitleWeight }}
            >
              {item.name}
            </Text>
            <Text
              size={sp.font.rowSubtitle}
              numberOfLines={1}
              style={[styles.listMeta, { color: sp.colors.textSecondary }]}
            >
              {isBili ? `${item.size} 个视频` : `${dateFormat(item.publishTime, 'Y.M.D')} • ${item.size} tracks`}
            </Text>
          </View>
          {likeButton}
        </TouchableOpacity>
        {biliDetailModal}
      </>
    )
  }

  // 默认（网格）视图模式
  return (
    <>
      <TouchableOpacity style={[styles.gridItem, { width }]} onPress={handlePress}>
        <Image url={item.picUrl} style={[styles.gridArtwork, { width, height: width }]} />
        <Text
          size={sp.font.tileTitle}
          numberOfLines={1}
          style={{ color: sp.colors.text, fontWeight: sp.font.tileTitleWeight }}
        >
          {item.name}
        </Text>
        <View style={styles.metaContainer}>
          <View style={styles.metaTextContainer}>
            <Text size={sp.font.tileSubtitle} numberOfLines={1} style={{ color: sp.colors.textSecondary }}>
              {isBili ? `${item.size} 个视频` : dateFormat(item.publishTime, 'Y.M.D')}
            </Text>
            {isBili ? null : (
              <Text
                size={sp.font.tileSubtitle}
                numberOfLines={1}
                style={[styles.trackCount, { color: sp.colors.textSecondary }]}
              >
                {`${item.size} tracks`}
              </Text>
            )}
          </View>
          {likeButton}
        </View>
      </TouchableOpacity>
      {biliDetailModal}
    </>
  )
})

const styles = createStyle({
  modal: {
    flex: 1,
  },
  gridItem: {
    marginBottom: 16,
  },
  gridArtwork: {
    borderRadius: 6,
    marginBottom: 8,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  metaTextContainer: {
    flexDirection: 'column',
    flexShrink: 1,
  },
  trackCount: {
    paddingTop: 2,
  },
  likeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  listArtwork: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  listInfo: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  listMeta: {
    paddingTop: 2,
  },
})
