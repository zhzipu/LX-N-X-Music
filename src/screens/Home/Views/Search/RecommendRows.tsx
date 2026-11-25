import { useTrackSelection } from '@/components/TrackSelection'
/**
 * 搜索页（空白态）搜索框下方的两行推荐：
 *   推荐歌曲 = 每日推荐里的「默认推荐」，取前 10 首
 *   推荐歌单 = 每日推荐的推荐歌单，取前 10 个
 *
 * 卡片样式与「音乐 → 最近播放」的横向卡片一致（140 封面 + 标题）。
 * 点标题旁「更多」→ 展开完整列表（歌曲可直接播放；歌单点开进歌单详情）。
 */

import { memo, useCallback, useEffect, useState } from 'react'
import { BackHandler, ScrollView, TouchableOpacity, View } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import wyDailyRec from '@/utils/musicSdk/wy/dailyRec'
import { playOnlineList } from '@/core/list'
import { createStyle } from '@/utils/tools'
import { useNavActiveId } from '@/store/common/hook'
import { useDetailDock } from '../../detailDockState'

type Row = 'songs' | 'playlists'

interface RecommendRowsProps {
  onOpenPlaylist: (item: any) => void
  /** 加载完成后告诉父级是否有推荐内容（用于隐藏空白页的欢迎语） */
  onLoaded?: (has: boolean) => void
  /** 展开/收起时通知父级（父级据此隐藏下面的内容层） */
  onExpandChange?: (open: boolean) => void
}

const CARD_W = 120
const LIMIT = 10

const pickCover = (item: any): string | null => {
  if (!item) return null
  return item.picUrl ?? item.meta?.picUrl ?? item.img ?? item.coverImgUrl ?? null
}

const parseDuration = (music: any): number => {
  const raw = music?.interval ?? music?.meta?.interval
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

const RecommendRows = ({ onOpenPlaylist, onLoaded, onExpandChange }: RecommendRowsProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const cookie = useSettingValue('common.wy_cookie')
  const [songs, setSongs] = useState<any[]>([])
  const selection = useTrackSelection(songs)
  const [playlists, setPlaylists] = useState<any[]>([])
  const [playlistError, setPlaylistError] = useState('')
  const [loading, setLoading] = useState(false)
  const [reload, setReload] = useState(0)
  const [expanded, setExpanded] = useState<Row | null>(null)
  const activeNavId = useNavActiveId()
  useDetailDock(activeNavId === 'nav_search' && expanded !== null)

  useEffect(() => {
    setSongs([])
    setPlaylists([])
    setPlaylistError('')
    setLoading(false)
    onLoaded?.(false)
    if (!cookie?.trim() || activeNavId !== 'nav_search') return
    let cancelled = false
    setLoading(true)
    const songsTask = wyDailyRec.getList(cookie)
      .then((res: any) => (res?.list ?? []).slice(0, LIMIT))
      .catch(() => [])
      .then((list: any[]) => { if (!cancelled) setSongs(list) })
    const playlistsTask = wyDailyRec.getRecPlaylists(cookie)
      .then((list: any) => (Array.isArray(list) ? list : [])
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          trackCount: item.trackCount,
          coverImgUrl: item.picUrl ?? item.coverImgUrl,
          creator: { nickname: item.creator?.nickname ?? '推荐' },
          playCount: item.playcount ?? item.playCount,
          description: item.copywriter,
        }))
        .slice(0, LIMIT))
      .then((list: any[]) => { if (!cancelled) setPlaylists(list) })
      .catch((error: Error) => {
        if (!cancelled) setPlaylistError(error.message || t('search_recommend_failed'))
      })
    void Promise.all([songsTask, playlistsTask]).then(() => {
      if (cancelled) return
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [cookie, activeNavId, reload])

  useEffect(() => {
    onLoaded?.(songs.length > 0 || playlists.length > 0 || loading || !!playlistError)
  }, [songs, playlists, loading, playlistError, onLoaded])

  useEffect(() => {
    onExpandChange?.(!!expanded)
  }, [expanded, onExpandChange])

  // 展开时用返回键收起
  useEffect(() => {
    if (!expanded || activeNavId !== 'nav_search') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setExpanded(null)
      return true
    })
    return () => { sub.remove() }
  }, [expanded, activeNavId])

  const playSong = useCallback((index: number) => {
    void playOnlineList('dailyrec_songs', songs as LX.Music.MusicInfoOnline[], index)
  }, [songs])

  const renderCardRow = (row: Row, list: any[], title: string) => (
    <View>
      <TouchableOpacity style={styles.header} activeOpacity={0.7} onPress={() => { setExpanded(row) }}>
        <Text size={17} style={{ color: sp.colors.text, fontWeight: '700' }} allowFontScaling={false}>
          {title}
        </Text>
        <View style={styles.spacer} />
        <Text size={12} style={{ color: sp.colors.textTertiary }} allowFontScaling={false}>
          {t('search_recommend_more')}
        </Text>
        <Icon name="chevron-right" size={16} color={sp.colors.textTertiary} />
      </TouchableOpacity>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
        {list.map((item, index) => {
          const cover = pickCover(item)
          return (
            <TouchableOpacity
              key={`${item.id ?? index}`}
              style={[styles.card, row === 'songs' && selection.isSelected(item) && { backgroundColor: sp.colors.interactivePressed }]}
              delayLongPress={300} onLongPress={row === 'songs' ? () => selection.start(item) : undefined}
              activeOpacity={0.8}
              onPress={() => {
                if (row === 'songs') selection.press(item, () => playSong(index))
                else onOpenPlaylist(item)
              }}
            >
              <View style={[styles.cardArt, { backgroundColor: sp.colors.surfaceElevated }]}>
                {cover ? <Image url={cover} style={styles.cardImage} /> : <Icon name="music_time" size={34} color={sp.colors.textTertiary} />}
              </View>
              <Text size={13} numberOfLines={2} style={[styles.cardTitle, { color: sp.colors.text }]} allowFontScaling={false}>
                {item.name ?? ''}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )

  const renderExpanded = () => {
    const list = expanded === 'songs' ? songs : playlists
    const title = expanded === 'songs' ? t('search_recommend_songs') : t('search_recommend_playlists')
    return (
      <View style={styles.expanded}>
        <View style={styles.expandedHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => { setExpanded(null) }} accessibilityLabel={t('back')}>
            <Icon name="chevron-left" size={24} color={sp.colors.text} />
          </TouchableOpacity>
          <Text size={20} style={{ color: sp.colors.text, fontWeight: '700' }} allowFontScaling={false}>
            {title}
          </Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {list.map((item, index) => {
            const cover = pickCover(item)
            return (
              <TouchableOpacity
                key={`${item.id ?? index}`}
                style={[styles.row, expanded === 'songs' && selection.isSelected(item) && { backgroundColor: sp.colors.interactivePressed }]}
                delayLongPress={300} onLongPress={expanded === 'songs' ? () => selection.start(item) : undefined}
                activeOpacity={0.75}
                onPress={() => {
                  if (expanded === 'songs') selection.press(item, () => playSong(index))
                  else onOpenPlaylist(item)
                }}
              >
                <View style={[styles.rowThumb, { backgroundColor: sp.colors.surfaceElevated }]}>
                  {cover ? <Image url={cover} style={styles.rowThumbImage} /> : <Icon name="music_time" size={22} color={sp.colors.textTertiary} />}
                </View>
                <View style={styles.rowBody}>
                  <Text size={15} numberOfLines={1} style={{ color: sp.colors.text }} allowFontScaling={false}>
                    {item.name ?? ''}
                  </Text>
                  <Text size={12} numberOfLines={1} style={[styles.rowSub, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
                    {expanded === 'songs' ? (item.singer ?? '') : (item.author?.name ?? item.creator?.nickname ?? '')}
                  </Text>
                </View>
                {expanded === 'songs'
                  ? (
                      <Text size={12} style={{ color: sp.colors.textTertiary }} allowFontScaling={false}>
                        {formatTime(parseDuration(item))}
                      </Text>
                    )
                  : <Icon name="chevron-right" size={16} color={sp.colors.textTertiary} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    )
  }

  if (expanded) return <View style={[styles.container, styles.expandedContainer]}>{renderExpanded()}</View>
  if (!cookie?.trim()) return null

  return (
    <View style={styles.container}>
      {songs.length ? renderCardRow('songs', songs, t('search_recommend_songs')) : null}
      {playlists.length ? renderCardRow('playlists', playlists, t('search_recommend_playlists')) : null}
      {!playlists.length ? (
        <View style={styles.status}>
          <Text size={17} style={{ color: sp.colors.text, fontWeight: '700' }}>{t('search_recommend_playlists')}</Text>
          <Text size={13} style={{ color: sp.colors.textSecondary }}>
            {loading ? t('search_recommend_loading') : playlistError || t('search_recommend_empty')}
          </Text>
          {!loading ? <TouchableOpacity style={styles.retry} onPress={() => { setReload(value => value + 1) }}>
            <Text size={14} style={{ color: sp.colors.text }}>{t('search_recommend_retry')}</Text>
          </TouchableOpacity> : null}
        </View>
      ) : null}
    </View>
  )
}

const styles = createStyle({
  container: {},
  status: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10, gap: 10 },
  retry: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 12 },
  expandedContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  spacer: {
    flex: 1,
  },
  shelf: {
    paddingLeft: 16,
    paddingRight: 16,
  },
  card: {
    width: CARD_W,
    marginRight: 12,
  },
  cardArt: {
    width: CARD_W,
    height: CARD_W,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    width: CARD_W,
    height: CARD_W,
  },
  cardTitle: {
    paddingTop: 8,
    fontWeight: '600',
  },
  expanded: {
    flex: 1,
  },
  expandedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingLeft: 8,
    paddingRight: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 72,
    paddingLeft: 16,
    paddingRight: 16,
  },
  rowThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowThumbImage: {
    width: 56,
    height: 56,
  },
  rowBody: {
    flex: 1,
    paddingLeft: 12,
    paddingRight: 12,
  },
  rowSub: {
    paddingTop: 2,
  },
})

export default memo(RecommendRows)
