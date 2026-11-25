import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, FlatList, Keyboard, Pressable, TextInput, View } from 'react-native'
import Text from '@/components/common/Text'
import { getListMusics } from '@/core/list'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'

import { filterPlaylistSongs, type PlaylistMatch } from './playlistSearchMatch'

export default function PlaylistSearch({ lists, onSelect }: {
  lists: Array<{ id: string; name: string }>
  onSelect: (match: PlaylistMatch) => void
}) {
  const sp = getSP(useTheme().isDark)
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<PlaylistMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const update = () => setRevision(value => value + 1)
    global.app_event.on('myListMusicUpdate', update)
    return () => global.app_event.off('myListMusicUpdate', update)
  }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFailed(false)
    void Promise.all(lists.map(async list => {
      const musics = await getListMusics(list.id)
      return musics.map(music => ({ listId: list.id, listName: list.name, music }))
    })).then(groups => {
      if (!cancelled) setEntries(groups.flat())
    }).catch(() => {
      if (!cancelled) { setEntries([]); setFailed(true) }
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [lists, revision])
  const results = useMemo(() => filterPlaylistSongs(entries, query), [entries, query])
  return (
    <View style={styles.container}>
      <TextInput
        autoFocus value={query} onChangeText={setQuery}
        placeholder="搜索已加入歌单的歌曲、歌手或专辑"
        placeholderTextColor={sp.colors.textTertiary}
        accessibilityLabel="搜索我的歌单歌曲"
        style={[styles.input, { color: sp.colors.text, backgroundColor: sp.colors.surfaceElevated }]}
      />
      {loading ? <ActivityIndicator color={sp.colors.text} /> : failed ? (
        <Pressable onPress={() => setRevision(value => value + 1)}><Text>歌单加载失败，点击重试</Text></Pressable>
      ) : (
        <FlatList
          data={results} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT }}
          keyExtractor={(item, index) => `${item.listId}:${item.music.id}:${index}`}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => { Keyboard.dismiss(); onSelect(item) }}>
              <Text numberOfLines={1} size={15} color={sp.colors.text}>{item.music.name}</Text>
              <Text numberOfLines={1} size={12} color={sp.colors.textSecondary}>{item.music.singer} · {item.listName}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text color={sp.colors.textSecondary}>{query.trim() ? '没有找到匹配的歌曲' : '输入关键词搜索我的收藏及已保存的歌单'}</Text>}
        />
      )}
    </View>
  )
}
const styles = createStyle({
  container: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  input: { height: 44, borderRadius: 22, paddingHorizontal: 16, marginBottom: 12 },
  row: { minHeight: 64, paddingVertical: 12, justifyContent: 'center' },
})
