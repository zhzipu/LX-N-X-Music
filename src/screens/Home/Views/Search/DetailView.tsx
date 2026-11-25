import NumberedTrackRow from '@/components/TrackSelection/NumberedTrackRow'
import { useTrackSelection } from '@/components/TrackSelection'
/**
 * 搜索里的「歌手 / 专辑 / 歌单」详情页。
 *
 * 布局与「音乐 → 我的歌单 → 歌单详情」保持一致：
 *   返回钮 · 头图（铺满宽）· 标题 · 「N 首 · 时长」· 播放 / 随机播放 · 编号歌曲行。
 * 每一层点击都能用系统返回键退回上一层（由父级 BackHandler 处理）。
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, StatusBar, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent } from 'react-native'
import Loading from '@/components/common/Loading'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { getListDetail } from '@/core/songlist'
import wyAlbum from '@/utils/musicSdk/wy/album'
import wyArtist from '@/utils/musicSdk/wy/artist'
import { playOnlineList } from '@/core/list'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import GlassSurface from '@/components/spotify/GlassSurface'
import { createStyle } from '@/utils/tools'

export type DetailKind = 'singer' | 'album' | 'songlist'

export interface DetailViewProps {
  kind: DetailKind
  item: any
  source: string
  onBack: () => void
}

const pickCover = (item: any): string | null => {
  if (!item) return null
  return item.picUrl ?? item.img1v1Url ?? item.avatar ?? item.img ?? item.coverImgUrl ?? null
}

const parseDuration = (musicInfo: any): number => {
  const raw = musicInfo?.interval ?? musicInfo?.meta?.interval
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    if (/^\d+:\d{1,2}$/.test(raw)) {
      const [m, s] = raw.split(':')
      return Number(m) * 60 + Number(s)
    }
    const num = Number(raw)
    if (Number.isFinite(num)) return num
  }
  return 0
}

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const formatTotal = (seconds: number) => {
  const m = Math.round(seconds / 60)
  if (m < 60) return `${m} 分钟`
  const h = Math.floor(m / 60)
  return `${h} 小时 ${m % 60} 分`
}

const DetailView = ({ kind, item, source, onBack }: DetailViewProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()
  const topInset = Math.max(statusBarHeight, StatusBar.currentHeight ?? 0)
  const [musics, setMusics] = useState<LX.Music.MusicInfo[]>([])
  const selection = useTrackSelection(musics, { scopeKey: `${source}:${kind}:${item.id}` })
  const [loading, setLoading] = useState(true)
  const [cover, setCover] = useState<string | null>(pickCover(item))
  const [title, setTitle] = useState<string>(item?.name ?? '')
  const [metaText, setMetaText] = useState('')
  const [containerWidth, setContainerWidth] = useState(0)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width)
    if (nextWidth > 0 && nextWidth !== containerWidth) setContainerWidth(nextWidth)
  }, [containerWidth])
  const heroSize = Math.max(0, containerWidth - 32)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const load = async () => {
      if (kind === 'songlist') {
        const detail = await getListDetail(String(item.id), (source === 'all' ? 'wy' : source) as LX.OnlineSource, 1)
        if (cancelled) return
        setMusics(detail.list ?? [])
        setCover(pickCover(detail.info) ?? pickCover(item))
        setMetaText(`${(detail.list ?? []).length} 首`)
      } else if (kind === 'album') {
        const detail = await wyAlbum.getAlbum(String(item.id))
        if (cancelled) return
        const list = (detail?.list ?? []) as LX.Music.MusicInfo[]
        setMusics(Array.isArray(list) ? list : [])
        setCover(pickCover(detail?.info) ?? pickCover(item))
        const singer = (detail?.info as any)?.singer ?? (item?.artist?.name ?? '')
        setMetaText([singer, `${list.length} 首`].filter(Boolean).join(' · '))
      } else {
        const res: any = await wyArtist.getSongs(String(item.id), 'hot', 100)
        const list = (Array.isArray(res) ? res : (res?.list ?? [])) as LX.Music.MusicInfo[]
        if (cancelled) return
        setMusics(Array.isArray(list) ? list : [])
        setMetaText(t('search_hot_songs', { num: (list ?? []).length }))
      }
    }
    void load().catch(() => { if (!cancelled) setMusics([]) }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [kind, item, source, t])

  const totalSeconds = useMemo(() => musics.reduce((sum, m) => sum + parseDuration(m), 0), [musics])

  const playFrom = useCallback((index: number, random = false) => {
    if (!musics.length) return
    const list = [...musics] as LX.Music.MusicInfoOnline[]
    if (random) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = list[i]
        list[i] = list[j]
        list[j] = temp
      }
    }
    void playOnlineList(`${kind}_${item.id}`, list, random ? 0 : index)
  }, [kind, item, musics])

  const handleRowPress = useCallback((music: LX.Music.MusicInfo, index: number) => {
    selection.press(music, () => playFrom(index))
  }, [selection.press, playFrom])
  const listHeader = useMemo(() => (
        <View style={styles.hero}>
          <View style={[styles.heroArt, { width: heroSize, height: heroSize, backgroundColor: sp.colors.surfaceElevated }]}>
            {/* Wait for the real pane width before Glide decodes the image.
                Remount on resize so a folded/unfolded pane gets a fresh decode. */}
            {heroSize > 0 && (cover
              ? <Image key={heroSize} url={cover} style={{ width: heroSize, height: heroSize }} />
              : <Icon name={kind === 'singer' ? 'artist' : kind === 'album' ? 'album' : 'list'} size={72} color={sp.colors.textTertiary} />)}
          <TouchableOpacity
            style={styles.heroBackBtn}
            onPress={onBack}
            accessibilityLabel={t('back')}
            activeOpacity={0.85}
          >
            <GlassSurface
              style={styles.heroBackGlass}
              borderRadius={18}
              glassAmount={0.5}
              refractionHeight={12}
              refractionAmount={7}
              blurRadius={2}
              forceFallback
              pointerEvents="none"
            >
              <Icon name="chevron-left" size={22} color="#FFFFFF" />
            </GlassSurface>
          </TouchableOpacity>
          </View>
          <Text size={22} numberOfLines={2} style={[styles.heroTitle, { color: sp.colors.text }]} allowFontScaling={false}>
            {title}
          </Text>
          <Text size={13} numberOfLines={1} style={[styles.heroMeta, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
            {[metaText, totalSeconds ? formatTotal(totalSeconds) : ''].filter(Boolean).join(' · ')}
          </Text>

          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, { backgroundColor: sp.colors.accent }]}
              activeOpacity={0.85}
              onPress={() => { playFrom(0) }}
            >
              <Icon name="play" size={16} color={sp.colors.onAccent} />
              <Text size={15} style={[styles.pillText, { color: sp.colors.onAccent }]} allowFontScaling={false}>
                {t('play')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, styles.pillGhost, { backgroundColor: sp.colors.interactive }]}
              activeOpacity={0.85}
              onPress={() => { playFrom(musics.length ? Math.floor(Math.random() * musics.length) : 0, true) }}
            >
              <Icon name="list-random" size={16} color={sp.colors.text} />
              <Text size={15} style={[styles.pillText, { color: sp.colors.text }]} allowFontScaling={false}>
                {t('music_shuffle_play')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
  ), [heroSize, cover, sp, kind, onBack, t, title, metaText, totalSeconds, playFrom, musics.length])
  return (
    <View style={[styles.container, { paddingTop: topInset }]} onLayout={handleLayout}>
      {loading && <View pointerEvents="none" style={styles.loading}><Loading size={28} /></View>}

      <FlatList
        data={musics}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyExtractor={(music, index) => music.id + '_' + index}
        extraData={selection.selectedList}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={<View style={{ height: HOME_BOTTOM_OVERLAY_HEIGHT }} />}
        ListEmptyComponent={loading ? null : <Text size={13} style={[styles.empty, { color: sp.colors.textTertiary }]}>{t('list_empty')}</Text>}
        renderItem={({ item: music, index }) => <NumberedTrackRow music={music} index={index} selected={selection.isSelected(music)} duration={formatTime(parseDuration(music))} onPress={handleRowPress} onLongPress={selection.start} />}
      />



    </View>
  )
}

const styles = createStyle({
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  heroBackBtn: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  heroBackGlass: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
  },
  heroArt: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroTitle: {
    paddingTop: 14,
    fontWeight: '700',
  },
  heroMeta: {
    paddingTop: 6,
  },
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pill: {
    height: 44,
    borderRadius: 22,
    paddingLeft: 18,
    paddingRight: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pillGhost: {
    paddingLeft: 16,
    paddingRight: 18,
  },
  pillText: {
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    paddingLeft: 16,
    paddingRight: 16,
  },
  index: {
    width: 24,
  },
  rowBody: {
    flex: 1,
    paddingRight: 12,
  },
  rowSub: {
    paddingTop: 2,
  },
  empty: {
    paddingTop: 24,
    paddingLeft: 16,
  },
})

export default memo(DetailView)
