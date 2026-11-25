import NumberedTrackRow, { NUMBERED_TRACK_HEIGHT } from '@/components/TrackSelection/NumberedTrackRow'
import { useTrackSelection } from '@/components/TrackSelection'
/**
 * 歌单详情（布局参照 `doc/myspotify-skin-preview.html` 的「② 歌单详情」）：
 *   - 顶部返回钮（左）
 *   - 头图 12 圆角 + 歌单名 + 「N 首 · 总时长」
 *   - 播放 / 随机播放 两个胶囊（44 高）
 *   - 歌曲行：序号 + 歌名 + 歌手/来源 + 时长，点击播放
 *
 * 数据：`getListMusics(listId)`；封面取「最后添加的一首」的封面（与列表方块一致）。
 * 进入方式：音乐页「我的歌单」点任意歌单 → 在本页内切换到详情，返回键回列表。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BackHandler, FlatList, StatusBar, StyleSheet, TouchableOpacity, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { useStatusbarHeight } from '@/store/common/hook'
import { popMusicDetail, pushMusicDetail } from './detailState'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { getListMusics, playOnlineList } from '@/core/list'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import GlassSurface from '@/components/spotify/GlassSurface'
import { createStyle } from '@/utils/tools'
import Loading from '@/components/common/Loading'
import { subscribeSearchInteraction } from './searchInteraction'

const HERO_PADDING = 16

export interface PlaylistDetailProps {
  listId: string
  listName: string
  onBack: () => void
  highlightMusicId?: string
}

const getCover = (musicInfo?: LX.Music.MusicInfo | null) => {
  if (!musicInfo) return null
  const meta = (musicInfo as any).meta
  return meta?.picUrl ?? (musicInfo as any).pic ?? null
}

/** 解析时长：优先用歌曲自带的 interval（"3:47" 或秒数），否则用 meta.interval（秒） */
const parseDuration = (musicInfo: LX.Music.MusicInfo): number => {
  const raw = (musicInfo as any).interval ?? (musicInfo.meta as any)?.interval
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

const PlaylistDetail = ({ listId, listName, onBack, highlightMusicId }: PlaylistDetailProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()
  const topInset = Math.max(statusBarHeight, StatusBar.currentHeight ?? 0)
  const [musics, setMusics] = useState<LX.Music.MusicInfo[]>([])
  const selection = useTrackSelection(musics, { listId })
  const [loading, setLoading] = useState(true)
  const [highlightId, setHighlightId] = useState(highlightMusicId)
  const scrollRef = useRef<FlatList<LX.Music.MusicInfo>>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  const targetIndex = useMemo(() => musics.findIndex(song => song.id === highlightMusicId), [musics, highlightMusicId])
  const pendingLocate = useRef(Boolean(highlightMusicId))
  const locateTarget = useCallback(() => {
    if (!pendingLocate.current || !headerHeight || targetIndex < 0) return
    scrollRef.current?.scrollToOffset({ offset: Math.max(0, headerHeight + targetIndex * NUMBERED_TRACK_HEIGHT - 80), animated: false })
  }, [headerHeight, targetIndex])
  useEffect(locateTarget, [locateTarget])
  useEffect(() => {
    const clear = () => { pendingLocate.current = false; setHighlightId(undefined) }
    const unsubscribe = subscribeSearchInteraction(clear)
    global.state_event.on('navActiveIdUpdated', clear)
    global.state_event.on('componentIdsUpdated', clear)
    return () => {
      unsubscribe()
      global.state_event.off('navActiveIdUpdated', clear)
      global.state_event.off('componentIdsUpdated', clear)
    }
  }, [])
  const lastScrollOffset = useRef(0)
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y
    const deltaY = offsetY - lastScrollOffset.current
    lastScrollOffset.current = offsetY
    if (Math.abs(deltaY) >= 1) {
      global.app_event.setBottomBarHidden(deltaY > 0)
    }
  }, [])
  const [containerWidth, setContainerWidth] = useState(0)
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = Math.round(event.nativeEvent.layout.width)
    if (nextWidth > 0 && nextWidth !== containerWidth) setContainerWidth(nextWidth)
  }, [containerWidth])
  const heroSize = Math.max(0, containerWidth - HERO_PADDING * 2)

  const load = useCallback(() => {
    setLoading(true)
    void getListMusics(listId)
      .then(list => { setMusics(list) })
      .catch(() => { setMusics([]) })
      .finally(() => { setLoading(false) })
  }, [listId])

  // 告诉主页隐藏大标题（详情页占满整屏）
  useEffect(() => {
    pushMusicDetail()
    return () => { popMusicDetail() }
  }, [])

  useEffect(() => {
    load()
    const handleUpdate = (ids: string[]) => { if (ids.includes(listId)) load() }
    global.app_event.on('myListMusicUpdate', handleUpdate)
    return () => {
      global.app_event.off('myListMusicUpdate', handleUpdate)
    }
  }, [listId, load])

  // 返回键回歌单列表
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack()
      return true
    })
    return () => { sub.remove() }
  }, [onBack])

  const cover = getCover(musics.length ? musics[musics.length - 1] : null)
  const totalSeconds = useMemo(() => musics.reduce((sum, item) => sum + parseDuration(item), 0), [musics])

  const playFrom = useCallback((index: number, random = false) => {
    const list = [...musics] as LX.Music.MusicInfoOnline[]
    if (random) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = list[i]
        list[i] = list[j]
        list[j] = temp
      }
    }
    void playOnlineList(listId, list, random ? 0 : index)
  }, [listId, musics])

  const handlePlay = useCallback(() => { playFrom(0) }, [playFrom])
  const handleShuffle = useCallback(() => {
    playFrom(musics.length ? Math.floor(Math.random() * musics.length) : 0, true)
  }, [playFrom, musics.length])

  const handleRowPress = useCallback((music: LX.Music.MusicInfo, index: number) => {
    selection.press(music, () => playFrom(index))
  }, [selection.press, playFrom])
  const listHeader = useMemo(() => (
        <View style={styles.hero} onLayout={({ nativeEvent }) => setHeaderHeight(nativeEvent.layout.height)}>
          <View style={[styles.heroArt, { width: heroSize, height: heroSize, backgroundColor: sp.colors.surfaceElevated }]}>
            {/* Do not decode a 1dp placeholder and stretch that bitmap later. */}
            {heroSize > 0 && (cover
              ? <Image key={heroSize} url={cover} style={{ width: heroSize, height: heroSize }} />
              : <Icon name="album" size={72} color={sp.colors.textTertiary} />)}
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
            {listName}
          </Text>
          <Text size={13} numberOfLines={1} style={[styles.heroMeta, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
            {`${t('music_song_count', { num: musics.length })}${totalSeconds ? ` · ${formatTotal(totalSeconds)}` : ''}`}
          </Text>

          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, { backgroundColor: sp.colors.accent }]}
              activeOpacity={0.85}
              onPress={handlePlay}
            >
              <Icon name="play" size={16} color={sp.colors.onAccent} />
              <Text size={15} style={[styles.pillText, { color: sp.colors.onAccent }]} allowFontScaling={false}>
                {t('play')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, styles.pillGhost, { backgroundColor: sp.colors.interactive }]}
              activeOpacity={0.85}
              onPress={handleShuffle}
            >
              <Icon name="list-random" size={16} color={sp.colors.text} />
              <Text size={15} style={[styles.pillText, { color: sp.colors.text }]} allowFontScaling={false}>
                {t('music_shuffle_play')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
  ), [heroSize, cover, sp, onBack, t, listName, musics.length, totalSeconds, handlePlay, handleShuffle])

  return (
    <View style={[styles.container, { paddingTop: topInset }]} onLayout={handleLayout}>
      {/* 顶部返回 */}

      {loading ? (
        <View pointerEvents="none" style={styles.loading}><Loading size={28} /></View>
      ) : null}

      <FlatList
        data={musics}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        keyExtractor={(music, index) => `${music.id}_${index}`}
        extraData={selection.selectedList}
        ListHeaderComponent={listHeader}
        ListFooterComponent={<View style={{ height: HOME_BOTTOM_OVERLAY_HEIGHT }} />}
        ListEmptyComponent={loading ? null : <Text size={13} style={[styles.empty, { color: sp.colors.textTertiary }]}>{t('music_recent_empty')}</Text>}
        getItemLayout={(_, index) => ({ length: NUMBERED_TRACK_HEIGHT, offset: headerHeight + index * NUMBERED_TRACK_HEIGHT, index })}
        renderItem={({ item, index }) => <NumberedTrackRow music={item} index={index} selected={highlightId === item.id || selection.isSelected(item)} duration={formatTime(parseDuration(item))} onPress={handleRowPress} onLongPress={selection.start} />}
        ref={scrollRef}
        onContentSizeChange={locateTarget}
        onLayout={locateTarget}
        onScrollBeginDrag={() => { pendingLocate.current = false; setHighlightId(undefined) }}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  scroll: {
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
    paddingLeft: 16,
    paddingTop: 24,
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default memo(PlaylistDetail)
