import { memo, useMemo, useState } from 'react';
import { View, TouchableOpacity } from 'react-native';
import ImagePreviewModal from '@/components/common/ImagePreviewModal';
import Text from '@/components/common/Text';
import { useTheme } from '@/store/theme/hook';
import { getSP } from '@/theme/spotify/tokens';
import { toast, createStyle } from '@/utils/tools';
import { dateFormat } from '@/utils/common';
import { useStatusbarHeight } from '@/store/common/hook';
import { pop, navigations } from '@/navigation';
import { useIsWyAlbumSubscribed } from '@/store/user/hook';
import wyApi from '@/utils/musicSdk/wy/user';
import { addWySubscribedAlbum, removeWySubscribedAlbum } from '@/store/user/action';
import { type SubscribedAlbumInfo } from '@/store/user/state';
import { useI18n } from '@/lang';
import GlassIconButton from '@/components/spotify/GlassIconButton';
import PlayPill from '@/components/spotify/PlayPill';
import DetailHero, { DETAIL_AUTHOR_SIZE } from '@/screens/SonglistDetail/DetailHero';

interface Props {
  albumInfo: any
  componentId: string
  /** 播放整张专辑（沿用列表的播放逻辑） */
  onPlayAll?: () => void
  /** 随机播放整张专辑 */
  onShuffle?: () => void
}

export default memo(({ albumInfo, componentId, onPlayAll, onShuffle }: Props) => {
  const theme = useTheme();
  const sp = getSP(theme.isDark);
  const t = useI18n();
  const statusBarHeight = useStatusbarHeight();
  const isSubscribed = useIsWyAlbumSubscribed(albumInfo.id);
  const [isPreviewVisible, setPreviewVisible] = useState(false);
  const albumPic = albumInfo.picUrl || albumInfo.img;

  const handleArtistPress = (artist: any) => {
    if (!artist.id) return;
    navigations.pushArtistDetailScreen(componentId, { id: String(artist.id), name: artist.name });
  };

  const toggleSubscribe = () => {
    if (!albumInfo.id) {
      toast('正在加载专辑信息，请稍后...');
      return;
    }
    const newSubState = !isSubscribed;
    wyApi.subAlbum(String(albumInfo.id), newSubState).then(() => {
      toast(newSubState ? '收藏成功' : '取消收藏成功');
      if (newSubState) {
        const albumInfoForStore: SubscribedAlbumInfo = {
          id: albumInfo.id,
          name: albumInfo.name,
          picUrl: albumInfo.picUrl,
          artists: albumInfo.artists,
          publishTime: albumInfo.publishTime,
          size: albumInfo.size,
        };
        addWySubscribedAlbum(albumInfoForStore);
      } else {
        removeWySubscribedAlbum(albumInfo.id);
      }
    }).catch((err: any) => {
      toast(`操作失败: ${err.message}`);
    });
  };

  const authorNode = useMemo(() => {
    if (!albumInfo.artists?.length) {
      return albumInfo.author
        ? (
            <Text size={DETAIL_AUTHOR_SIZE} numberOfLines={1} style={{ color: sp.colors.text }}>
              {albumInfo.author}
            </Text>
          )
        : undefined;
    }
    return (
      <View style={styles.artists}>
        {albumInfo.artists.map((artist: any, index: number) => (
          <TouchableOpacity
            key={artist.id || `${artist.name}_${index}`}
            onPress={() => { handleArtistPress(artist) }}
            disabled={!artist.id}
            hitSlop={6}
          >
            <Text size={DETAIL_AUTHOR_SIZE} numberOfLines={1} style={{ color: sp.colors.text }}>
              {artist.name}{index < albumInfo.artists.length - 1 ? ' / ' : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }, [albumInfo.artists, albumInfo.author, sp.colors.text]);

  const meta = useMemo(() => {
    const parts: string[] = [];
    if (albumInfo.publishTime) parts.push(dateFormat(albumInfo.publishTime, 'Y.M.D'));
    const total = albumInfo.size ?? albumInfo.total;
    if (total) parts.push(`${total} tracks`);
    return parts.join(' · ');
  }, [albumInfo.publishTime, albumInfo.size, albumInfo.total]);

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
        icon={isSubscribed ? 'love-filled' : 'love'}
        onPress={toggleSubscribe}
        color={isSubscribed ? sp.colors.accent : undefined}
        accessibilityLabel={t('collect')}
      />
    </>
  ), [t, isSubscribed, sp.colors.accent, onPlayAll, onShuffle]);

  return (
    <>
      <DetailHero
        pageTitle={t('album_detail')}
        onBack={() => { void pop(componentId) }}
        topInset={statusBarHeight}
        cover={albumPic}
        onCoverPress={albumPic ? () => setPreviewVisible(true) : undefined}
        title={albumInfo.name || ''}
        authorNode={authorNode}
        meta={meta}
        desc={albumInfo.desc}
        actions={actions}
      />
      <ImagePreviewModal
        visible={isPreviewVisible}
        url={albumPic}
        name={albumInfo.name || 'album'}
        onClose={() => setPreviewVisible(false)}
      />
    </>
  )
})

const styles = createStyle({
  artists: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 6,
  },
})
