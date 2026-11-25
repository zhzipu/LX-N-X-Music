import { useTrackSelection } from '@/components/TrackSelection'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, BackHandler, FlatList, ScrollView, TouchableOpacity, View } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { getListDetail } from '@/core/leaderboard'
import { useSettingValue } from '@/store/setting/hook'
import { useNavActiveId } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useI18n } from '@/lang'
import { createStyle, toast } from '@/utils/tools'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { handlePlay } from '../Leaderboard/listAction'
import { readHotBoards, type HotBoard } from './settings'
import HotSettingsButton from './SettingsButton'
import { useDetailDock } from '../../detailDockState'

const play = (board: HotBoard, list: LX.Music.MusicInfoOnline[], index: number) => {
  void handlePlay(board.id, list, index).catch(() => toast(global.i18n.t('hot_play_failed')))
}

const ChartRow = memo(({ board, onOpen }: { board: HotBoard, onOpen: () => void }) => {
  const sp = getSP(useTheme().isDark)
  const t = useI18n()
  const [songs, setSongs] = useState<LX.Music.MusicInfoOnline[]>([])
  const selection = useTrackSelection(songs, { scopeKey: board.id })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    void getListDetail(board.id, 1, retry > 0).then(result => {
      if (!cancelled) setSongs(result.list)
    }).catch(() => {
      if (!cancelled) setError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [board.id, retry])
  return (
    <View>
      <TouchableOpacity style={styles.header} onPress={onOpen} activeOpacity={0.7}>
        <Text size={17} style={styles.heading}>{board.name}</Text>
        <View style={{ flex: 1 }} />
        <Text size={12} color={sp.colors.textTertiary}>{t('search_recommend_more')}</Text>
        <Icon name="chevron-right" size={16} color={sp.colors.textTertiary} />
      </TouchableOpacity>
      {loading ? <ActivityIndicator style={styles.feedback} color={sp.colors.text} /> : error ? (
        <TouchableOpacity style={styles.feedback} onPress={() => setRetry(value => value + 1)}><Text>{t('hot_load_failed')}</Text></TouchableOpacity>
      ) : !songs.length ? <Text style={styles.feedback}>{t('hot_no_songs')}</Text> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
          {songs.slice(0, 10).map((song, index) => (
            <TouchableOpacity key={song.id} style={[styles.card, selection.isSelected(song) && { backgroundColor: sp.colors.interactivePressed }]} activeOpacity={0.8} delayLongPress={300} onLongPress={() => selection.start(song)} onPress={() => selection.press(song, () => play(board, songs, index))}>
              <Image url={song.meta.picUrl} style={styles.cover} />
              <Text size={13} numberOfLines={2} style={styles.cardTitle} allowFontScaling={false}>{song.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  )
})

const ChartDetail = ({ board, onBack }: { board: HotBoard, onBack: () => void }) => {
  const sp = getSP(useTheme().isDark)
  const t = useI18n()
  const [songs, setSongs] = useState<LX.Music.MusicInfoOnline[]>([])
  const selection = useTrackSelection(songs, { scopeKey: board.id })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const page = useRef(1)
  const hasMore = useRef(true)
  const pending = useRef(false)
  const alive = useRef(true)
  const load = async () => {
    if (pending.current || !hasMore.current) return
    pending.current = true
    setLoading(true)
    setError(false)
    try {
      const result = await getListDetail(board.id, page.current)
      if (!alive.current) return
      setSongs(previous => {
        const ids = new Set(previous.map(song => song.id))
        return [...previous, ...result.list.filter(song => !ids.has(song.id))]
      })
      hasMore.current = result.list.length > 0 && page.current * result.limit < result.total
      page.current++
    } catch {
      if (alive.current) setError(true)
    } finally {
      pending.current = false
      if (alive.current) setLoading(false)
    }
  }
  useEffect(() => {
    alive.current = true
    void load()
    return () => { alive.current = false }
  }, [])
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.detailHeader}>
        <TouchableOpacity style={styles.back} onPress={onBack} accessibilityLabel={t('back')}><Icon name="chevron-left" size={24} color={sp.colors.text} /></TouchableOpacity>
        <Text size={20} style={styles.heading}>{board.name}</Text>
      </View>
      <FlatList
        data={songs}
        keyExtractor={song => song.id}
        contentContainerStyle={styles.listContent}
        onEndReached={() => { if (!error) void load() }}
        onEndReachedThreshold={0.4}
        renderItem={({ item, index }) => (
          <TouchableOpacity style={[styles.song, selection.isSelected(item) && { backgroundColor: sp.colors.interactivePressed }]} delayLongPress={300} onLongPress={() => selection.start(item)} onPress={() => selection.press(item, () => play(board, songs, index))}>
            <Image url={item.meta.picUrl} style={styles.thumb} />
            <View style={styles.songBody}>
              <Text size={15} numberOfLines={1}>{item.name}</Text>
              <Text size={12} numberOfLines={1} color={sp.colors.textSecondary}>{item.singer}</Text>
            </View>
            <Text size={12} color={sp.colors.textTertiary}>{item.interval}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading && !error ? <Text style={styles.feedback}>{t('hot_no_songs')}</Text> : null}
        ListFooterComponent={loading ? <ActivityIndicator style={styles.feedback} color={sp.colors.text} /> : error ? (
          <TouchableOpacity style={styles.feedback} onPress={() => { void load() }}><Text>{t('hot_load_failed')}</Text></TouchableOpacity>
        ) : null}
      />
    </View>
  )
}

export default function Hot({ showSettings = false }: { showSettings?: boolean }) {
  const active = useNavActiveId() === 'nav_hot'
  const saved = useSettingValue('common.hotBoards')
  const boards = useMemo(() => readHotBoards(saved), [saved])
  const t = useI18n()
  const [visited, setVisited] = useState(active)
  const [opened, setOpened] = useState<HotBoard | null>(null)
  useDetailDock(active && opened !== null)
  useEffect(() => { if (active) setVisited(true) }, [active])
  useEffect(() => {
    if (!opened || !active) return
    const listener = BackHandler.addEventListener('hardwareBackPress', () => { setOpened(null); return true })
    return () => listener.remove()
  }, [opened, active])
  useEffect(() => { setOpened(null) }, [saved])
  if (!visited) return null
  return (
    <View style={{ flex: 1 }}>
      {showSettings ? <View style={styles.detailHeader}><Text size={22} style={{ flex: 1 }}>{t('nav_hot')}</Text><HotSettingsButton /></View> : null}
      {opened ? <ChartDetail key={opened.id} board={opened} onBack={() => setOpened(null)} /> : (
        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {boards.map(board => <ChartRow key={board.id} board={board} onOpen={() => setOpened(board)} />)}
          {!boards.length ? <Text style={styles.feedback}>{t('hot_empty')}</Text> : null}
        </ScrollView>
      )}
    </View>
  )
}

const styles = createStyle({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 10 },
  heading: { fontWeight: '700', flexShrink: 1 },
  shelf: { paddingHorizontal: 16 },
  card: { width: 120, marginRight: 12 },
  cover: { width: 120, height: 120, borderRadius: 12, overflow: 'hidden' },
  cardTitle: { paddingTop: 8, fontWeight: '600' },
  listContent: { paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT },
  feedback: { paddingHorizontal: 16, paddingVertical: 28 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  song: { flexDirection: 'row', alignItems: 'center', height: 72, paddingHorizontal: 16 },
  thumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden' },
  songBody: { flex: 1, paddingHorizontal: 12, gap: 2 },
})
