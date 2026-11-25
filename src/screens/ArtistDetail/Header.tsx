import { memo, useMemo, useRef, useState } from 'react'
import { View } from 'react-native'
import ImagePreviewModal from '@/components/common/ImagePreviewModal'
import Chip from '@/components/spotify/Chip'
import GlassIconButton from '@/components/spotify/GlassIconButton'
import PlayPill from '@/components/spotify/PlayPill'
import DetailHero from '@/screens/SonglistDetail/DetailHero'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle, toast } from '@/utils/tools'
import { useStatusbarHeight } from '@/store/common/hook'
import { pop } from '@/navigation'
import wyApi from '@/utils/musicSdk/wy/user'
import { useIsBiliArtistFollowed, useIsWyArtistFollowed } from '@/store/user/hook'
import { addWyFollowedArtist, removeWyFollowedArtist } from '@/store/user/action'
import { type FollowedArtistInfo } from '@/store/user/state'
import SimilarArtistsModal, { type SimilarArtistsModalType } from './SimilarArtistsModal'
import { toggleBiliArtistFollow } from '@/core/bilibili/favorite'
import { useI18n } from '@/lang'

interface Props {
  artist: any
  componentId: string
  source?: string
  /** 播放歌手热门歌曲（沿用列表的播放逻辑） */
  onPlayAll?: () => void
  /** 随机播放歌手歌曲 */
  onShuffle?: () => void
}

export default memo(({ artist, componentId, source, onPlayAll, onShuffle }: Props) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()
  const similarArtistsModalRef = useRef<SimilarArtistsModalType>(null)
  const [isDescExpanded, setDescExpanded] = useState(false)
  const [isPreviewVisible, setPreviewVisible] = useState(false)
  const isBili = source === 'bili'
  // 网易云的「关注」与 bili 的「收藏」是两套独立存储，按音源二选一
  const isWyFollowed = useIsWyArtistFollowed(isBili ? undefined : artist.id)
  const isBiliFollowed = useIsBiliArtistFollowed(isBili ? artist.id : undefined)
  const isFollowed = isBili ? isBiliFollowed : isWyFollowed

  const artistName = artist?.name || ''
  const artistAlias = artist?.alias?.length ? ` ${artist.alias[0]}` : ''
  const description = artist?.briefDesc || ''
  const artistPic = artist?.avatar || artist?.cover

  const toggleFollow = () => {
    if (!artist.name) {
      toast('正在加载歌手信息，请稍后...')
      return
    }
    // B 站 UP 主：先落地本地收藏，再尽力同步到 B 站账号（关注）
    if (isBili) {
      void toggleBiliArtistFollow(
        { id: artist.id, name: artist.name, picUrl: artist.avatar },
        !isFollowed,
      )
      return
    }
    const newFollowState = !isFollowed
    wyApi.followSinger(String(artist.id), newFollowState).then(() => {
      toast(newFollowState ? '关注成功' : '取消关注成功')
      if (newFollowState) {
        const artistInfoForStore: FollowedArtistInfo = {
          id: artist.id,
          name: artist.name,
          alias: artist.alias || null,
          albumSize: artist.albumSize,
          picUrl: artist.avatar,
          img1v1Url: artist.avatar,
        }
        addWyFollowedArtist(artistInfoForStore)
      } else {
        removeWyFollowedArtist(artist.id)
      }
    }).catch((err: any) => {
      toast(`操作失败: ${err.message}`)
    })
  }

  const meta = useMemo(() => {
    const parts: string[] = []
    if (artistAlias) parts.push(artistAlias.trim())
    if (artist.albumSize) parts.push(`${artist.albumSize} 张专辑`)
    return parts.join(' · ')
  }, [artistAlias, artist.albumSize])

  const desc = useMemo(() => {
    if (!isDescExpanded && description.length > 75) {
      return description.substring(0, 75) + '...'
    }
    return description
  }, [description, isDescExpanded])

  const actions = useMemo(() => (
    <>
      <GlassIconButton
        icon="list-random"
        onPress={onShuffle}
        accessibilityLabel={t('play_list_random')}
      />
      <PlayPill
        label={t('play')}
        onPress={onPlayAll}
        accessibilityLabel={t('play_all')}
      />
      <GlassIconButton
        icon={isFollowed ? 'love-filled' : 'love'}
        onPress={toggleFollow}
        color={isFollowed ? sp.colors.accent : undefined}
        accessibilityLabel={t('collect')}
      />
    </>
  ), [t, isFollowed, sp.colors.accent, onPlayAll, onShuffle])

  const footer = isBili
    ? null
    : (
        <View style={styles.footer}>
          <Chip
            label="相似歌手"
            onPress={() => similarArtistsModalRef.current?.show({ id: artist.id, name: artistName })}
          />
        </View>
      )

  return (
    <>
      <DetailHero
        pageTitle={t('artist_detail')}
        onBack={() => { void pop(componentId) }}
        cover={artistPic}
        coverShape="circle"
        onCoverPress={artistPic ? () => setPreviewVisible(true) : undefined}
        title={`${artistName}${artistAlias}`}
        meta={meta}
        desc={desc}
        onDescPress={description.length > 75 ? () => setDescExpanded(v => !v) : undefined}
        actions={actions}
        footer={footer}
        topInset={statusBarHeight}
      />
      <ImagePreviewModal
        visible={isPreviewVisible}
        url={artistPic}
        name={artistName || 'artist'}
        onClose={() => setPreviewVisible(false)}
      />
      {isBili ? null : <SimilarArtistsModal ref={similarArtistsModalRef} componentId={componentId} />}
    </>
  )
})

const styles = createStyle({
  footer: {
    paddingTop: 18,
    alignItems: 'center',
  },
})
