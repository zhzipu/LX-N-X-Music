import { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BackHandler, Keyboard, Modal, Pressable, StyleSheet, View } from 'react-native'
import Text from '@/components/common/Text'
import GlassSurface from '@/components/spotify/GlassSurface'
import { createSelectionStore, type Options, type Selection } from './store'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import MusicMultiAddModal, { type MusicMultiAddModalType } from '@/components/MusicMultiAddModal'
import BatchDownloadModal, { type BatchDownloadModalType } from '@/components/OnlineList/BatchDownloadModal'
import { addTempPlayList } from '@/core/player/tempPlayList'
import { getListMusics, removeListMusics } from '@/core/list'
import listState from '@/store/list/state'
import { LIST_IDS } from '@/config/constant'
import { confirmDialog, toast } from '@/utils/tools'

type Music = LX.Music.MusicInfo
interface Controller {
  store: ReturnType<typeof createSelectionStore>
  clear: (owner?: symbol) => void
  open: () => void
  anchor: (token: symbol, mounted: boolean) => void
}
const Context = createContext<Controller | null>(null)

export function TrackSelectionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSelectionStore)
  const selection = useSyncExternalStore(store.subscribe, store.get)
  const [menu, setMenu] = useState(false)
  const [anchors, setAnchors] = useState<symbol[]>([])
  const addRef = useRef<MusicMultiAddModalType>(null)
  const downloadRef = useRef<BatchDownloadModalType>(null)
  const actionSelection = useRef<Selection | null>(null)
  const busy = useRef(false)
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const clear = useCallback((owner?: symbol) => {
    if (owner && store.get()?.owner !== owner) return
    store.clear(owner)
    setMenu(false)
  }, [store])
  const clearRef = useRef(clear)
  clearRef.current = clear
  useEffect(() => {
    const reset = () => clearRef.current()
    global.state_event.on('navActiveIdUpdated', reset)
    global.state_event.on('componentIdsUpdated', reset)
    return () => {
      global.state_event.off('navActiveIdUpdated', reset)
      global.state_event.off('componentIdsUpdated', reset)
    }
  }, [])
  useEffect(() => {
    if (!selection) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { clear(); return true })
    return () => sub.remove()
  }, [selection])

  const finish = () => {
    if (store.get() === actionSelection.current) clear()
  }
  const run = async (action: string) => {
    if (action === '取消') { clear(); return }
    const snapshot = store.get()
    if (!snapshot?.songs.length) { toast('请先选择歌曲'); return }
    if (busy.current) return
    actionSelection.current = snapshot
    setMenu(false)
    const songs = [...snapshot.songs]
    if (action === '添加到...') {
      addRef.current?.show({ selectedList: songs, listId: snapshot.listId ?? '', isMove: false })
      return
    }
    if (action === '下载') { downloadRef.current?.show(songs); return }
    busy.current = true
    try {
      if (action === '稍后播放') {
        addTempPlayList(songs.map(musicInfo => ({ listId: snapshot.listId ?? null, musicInfo })))
        toast(`已加入稍后播放：${songs.length} 首`)
      } else {
        const local = snapshot.listId && (listState.allList.some(list => list.id === snapshot.listId) || snapshot.listId === LIST_IDS.TEMP)
        const target = local ? snapshot.listId! : LIST_IDS.LOVE
        // A list may not yet be in memory (for example the favorites fallback).
        const actual = snapshot.onRemove ? songs : (await getListMusics(target)).filter(song => songs.some(selected => selected.id === song.id))
        if (!actual.length) { toast('所选歌曲不在可移出的歌单或本地收藏中'); return }
        const confirmed = await confirmDialog({ message: `确定将选中的 ${actual.length} 首歌曲移出${snapshot.onRemove || local ? '当前歌单' : '本地收藏'}？` })
        if (!confirmed) return
        if (snapshot.onRemove) await snapshot.onRemove(actual)
        else await removeListMusics(target, actual.map(song => song.id))
        toast('已移出所选歌曲')
      }
      finish()
    } catch { toast('操作失败，请重试') } finally { busy.current = false }
  }
  const controller = useMemo<Controller>(() => ({
    store, clear,
    open: () => { Keyboard.dismiss(); setMenu(true) },
    anchor: (token, mounted) => setAnchors(previous => mounted ? [...previous.filter(item => item !== token), token] : previous.filter(item => item !== token)),
  }), [store, clear])
  return (
    <Context.Provider value={controller}>
      <View style={styles.root}>
        {children}
        {!anchors.length && selection && <View pointerEvents="box-none" style={styles.fallback}><SelectionButton /></View>}
      </View>
      <Modal visible={menu && !!selection} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <View style={styles.modal}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenu(false)} accessibilityLabel="关闭多选菜单" />
          <View style={[styles.menu, { borderRadius: sp.radius.card, backgroundColor: theme.isDark ? '#202020' : '#FAFAFA' }]}><GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} borderRadius={sp.radius.card} glassAmount={0.5} forceFallback />
            <Text style={styles.count}>已选择 {selection?.songs.length ?? 0} 首</Text>
            {['稍后播放', '添加到...', '移出歌单/收藏', '下载', '取消'].map(action => (
              <Pressable key={action} style={styles.action} onPress={() => { void run(action) }} accessibilityRole="button">
                <Text size={16} color={sp.colors.text}>{action}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
      <MusicMultiAddModal ref={addRef} onAdded={finish} />
      <BatchDownloadModal ref={downloadRef} onConfirm={finish} />
    </Context.Provider>
  )
}

function SelectionButton() {
  const context = useContext(Context)!
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const selection = useSyncExternalStore(context!.store.subscribe, context!.store.get)
  if (!selection) return null
  return <View pointerEvents="box-none" style={styles.buttonRow}>
    <Pressable accessibilityRole="button" accessibilityLabel={`操作已选的 ${selection.songs.length} 首歌曲`} onPress={context.open}
      style={[styles.button, { backgroundColor: theme.isDark ? 'rgba(40,40,40,0.65)' : 'rgba(250,250,250,0.65)', borderColor: theme.isDark ? '#FFFFFF55' : '#00000022' }]}>
      <View pointerEvents="none" style={[styles.checkmark, { borderColor: sp.colors.text }]} />
    </Pressable>
  </View>
}

// In the dock's normal layout flow, this moves with the actual mini player.
export function TrackSelectionAnchor() {
  const context = useContext(Context)
  const token = useRef(Symbol('selection-anchor')).current
  const anchorRef = useRef(context?.anchor)
  anchorRef.current = context?.anchor
  useEffect(() => {
    anchorRef.current?.(token, true)
    return () => anchorRef.current?.(token, false)
  }, [token])
  return <SelectionButton />
}

export function useTrackSelection<T extends Music>(list: T[], options: Options = {}) {
  const context = useContext(Context)!
  const owner = useRef(Symbol('track-list')).current
  const { store } = context
  const scope = options.scopeKey ?? options.listId
  useEffect(() => () => context.clear(owner), [context, owner, scope])
  const getOwned = useCallback(() => {
    const snapshot = store.get()
    return snapshot?.owner === owner ? snapshot : null
  }, [store, owner])
  // An unchanged null snapshot prevents unrelated mounted lists from re-rendering.
  const selected = useSyncExternalStore(store.subscribe, getOwned)
  const selectedIds = useMemo(() => new Set(selected?.songs.map(song => song.id)), [selected])
  const selectedList = useMemo(() => selected ? list.filter(song => selectedIds.has(song.id)) : [], [list, selected, selectedIds])
  const latest = useRef({ list, options })
  latest.current = { list, options }
  const listRef = useRef(list)
  useEffect(() => {
    if (listRef.current === list) return
    listRef.current = list
    if (selected && store.get() === selected && (selectedList.length !== selected.songs.length || selectedList.some((song, index) => song !== selected.songs[index]))) {
      store.change({ ...selected, songs: selectedList })
    }
  }, [list, selected, selectedList, store])
  const start = useCallback((song: T) => {
    if (store.start(owner, song, latest.current.options)) Keyboard.dismiss()
  }, [store, owner])
  const press = useCallback((song: T, play: () => void) => {
    if (!store.toggle(owner, song, latest.current.list)) play()
  }, [store, owner])
  return {
    active: !!selected,
    selectedList,
    isSelected: (song: Music) => selectedIds.has(song.id),
    start, press,
    clear: () => context.clear(owner),
  }
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fallback: { position: 'absolute', bottom: 16, left: 0, right: 0, zIndex: 1000 },
  buttonRow: { height: 56, alignItems: 'center', justifyContent: 'flex-start' },
  button: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', elevation: 6, borderWidth: 1 },
  checkmark: { width: 12, height: 22, borderRightWidth: 3, borderBottomWidth: 3, transform: [{ rotate: '45deg' }], marginTop: -5 },
  modal: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#00000033' },
  menu: { width: 260, maxWidth: '100%', borderRadius: 18, paddingVertical: 8, elevation: 12, overflow: 'hidden' },
  count: { paddingHorizontal: 20, paddingVertical: 10, opacity: 0.6 },
  action: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 20 },
})
