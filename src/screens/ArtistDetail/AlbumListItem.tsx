import { memo, useState } from 'react'
import { Modal, View, TouchableOpacity } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { dateFormat } from '@/utils/common'
import { navigations } from '@/navigation'
import commonState from '@/store/common/state'
import { Icon } from '@/components/common/Icon'
import { useIsWyAlbumSubscribed } from '@/store/user/hook'
import wyApi from '@/utils/musicSdk/wy/user'
import { addWySubscribedAlbum, removeWySubscribedAlbum } from '@/store/user/action'
import { type SubscribedAlbumInfo } from '@/store/user/state'
import BiliFolderDetail from '@/screens/Home/Views/Bilibili/FolderDetail'

export default memo(({ componentId, item, width, viewMode }: { componentId: string, item: any, width: number, viewMode: 'grid' | 'list' }) => {
  const theme = useTheme()
  const isSubscribed = useIsWyAlbumSubscribed(item.id)
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
      <View style={{ flex: 1, backgroundColor: theme['c-content-background'] }}>
        <BiliFolderDetail
          type="collection"
          folderId={biliDetail.folderId}
          title={biliDetail.title}
          onBack={() => setBiliDetail(null)}
        />
      </View>
    </Modal>
  ) : null

  const isBili = item.source === 'bili'

  // 列表视图模式
  if (viewMode === 'list') {
    return (
      <>
      <TouchableOpacity style={[listStyles.container, { width }]} onPress={handlePress}>
        <Image url={item.picUrl} style={listStyles.artwork} />
        <View style={listStyles.info}>
          <Text style={listStyles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={listStyles.time} size={12} color={theme['c-font-label']}>
            {isBili ? `${item.size} 个视频` : `${dateFormat(item.publishTime, 'Y.M.D')} • ${item.size} tracks`}
          </Text>
        </View>
        {isBili ? null : (
          <TouchableOpacity style={listStyles.likeButton} onPress={toggleSubscribe}>
            <Icon name={isSubscribed ? 'love-filled' : 'love'} color={isSubscribed ? theme['c-liked'] : theme['c-font-label']} size={18} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {biliDetailModal}
      </>
    )
  }

  // 默认（网格）视图模式
  return (
    <>
    <TouchableOpacity style={{ ...gridStyles.container, width }} onPress={handlePress}>
      <Image url={item.picUrl} style={{ ...gridStyles.artwork, width, height: width }} />
      <Text style={gridStyles.name} numberOfLines={1}>{item.name}</Text>
      <View style={gridStyles.metaContainer}>
        <View style={gridStyles.metaTextContainer}>
          <Text style={gridStyles.time} size={10} color={theme['c-font-label']}>
            {isBili ? '' : dateFormat(item.publishTime, 'Y.M.D')}
          </Text>
          <Text style={gridStyles.trackCount} size={10} color={theme['c-font-label']}>
            {isBili ? `${item.size} 个视频` : `• ${item.size} tracks`}
          </Text>
        </View>
        {isBili ? null : (
          <TouchableOpacity style={gridStyles.likeButton} onPress={toggleSubscribe}>
            <Icon name={isSubscribed ? 'love-filled' : 'love'} color={isSubscribed ? theme['c-liked'] : theme['c-font-label']} size={18} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
    {biliDetailModal}
    </>
  )
})

const gridStyles = createStyle({
  container: {
    marginBottom: 16,
  },
  artwork: {
    borderRadius: 6,
    marginBottom: 8,
  },
  name: {
    fontSize: 12,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  metaTextContainer: {
    flexDirection: 'column',
  },
  time: {},
  trackCount: {
    marginTop: 2,
  },
  likeButton: {
    padding: 5,
  },
})

const listStyles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
  artwork: {
    width: 60,
    height: 60,
    borderRadius: 6,
  },
  info: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'center',
  },
  name: {
    fontSize: 15,
    marginBottom: 5,
  },
  time: {},
  likeButton: {
    paddingHorizontal: 25,
  },
})
