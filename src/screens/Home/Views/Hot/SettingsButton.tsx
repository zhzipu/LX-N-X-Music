import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Modal, ScrollView, TouchableOpacity, View } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { getBoardsList } from '@/core/leaderboard'
import leaderboardState, { type BoardItem } from '@/store/leaderboard/state'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { DEFAULT_BOARDS, readHotBoards, type HotBoard } from './settings'

export default function HotSettingsButton() {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const t = useI18n()
  const saved = useSettingValue('common.hotBoards')
  const [visible, setVisible] = useState(false)
  const [selected, setSelected] = useState<HotBoard[]>([])
  const [source, setSource] = useState<LX.OnlineSource>('kw')
  const [boards, setBoards] = useState<BoardItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    setLoading(true)
    setError(false)
    setBoards([])
    void getBoardsList(source).then(list => {
      if (!cancelled) setBoards(list)
    }).catch(() => {
      if (!cancelled) setError(true)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [visible, source, retry])

  const toggle = (board: BoardItem) => {
    setSelected(previous => previous.some(item => item.id === board.id)
      ? previous.filter(item => item.id !== board.id)
      : [...previous, { id: board.id, name: board.name, source }])
  }

  return (
    <>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('hot_edit')} style={styles.gear} onPress={() => {
        setSelected(readHotBoards(saved))
        setVisible(true)
      }}>
        <Icon name="setting" size={22} color={sp.colors.text} />
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: theme['c-content-background'] }]}>
            <Text size={21} style={styles.title}>{t('hot_edit')}</Text>
            <Text size={13} style={styles.hint}>{t('hot_selection_hint', { count: selected.length })}</Text>
            <ScrollView horizontal style={styles.sources} showsHorizontalScrollIndicator={false}>
              {leaderboardState.sources.map(item => (
                <TouchableOpacity key={item} onPress={() => setSource(item)} style={[styles.source, { backgroundColor: item === source ? theme['c-primary-alpha-200'] : sp.colors.surfaceElevated }]}>
                  <Text size={13}>{t(('source_alias_' + item) as 'source_alias_kw')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {loading ? <ActivityIndicator style={styles.feedback} color={sp.colors.text} /> : error ? (
              <TouchableOpacity style={styles.feedback} onPress={() => setRetry(value => value + 1)}>
                <Text>{t('hot_load_failed')}</Text>
              </TouchableOpacity>
            ) : (
              <FlatList
                data={boards}
                keyExtractor={item => item.id}
                extraData={selected}
                renderItem={({ item }) => {
                  const checked = selected.some(board => board.id === item.id)
                  return (
                    <TouchableOpacity style={styles.option} onPress={() => toggle(item)} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                      <Text style={styles.optionName} size={16}>{item.name}</Text>
                      <Text size={22} color={checked ? theme['c-primary'] : sp.colors.textTertiary}>{checked ? '✓' : '○'}</Text>
                    </TouchableOpacity>
                  )
                }}
                ListEmptyComponent={<Text style={styles.hint}>{t('hot_no_boards')}</Text>}
              />
            )}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.action} onPress={() => setSelected([...DEFAULT_BOARDS])}><Text size={14}>{t('hot_reset')}</Text></TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity style={styles.action} onPress={() => setVisible(false)}><Text size={14}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={styles.action} onPress={() => {
                updateSetting({ 'common.hotBoards': JSON.stringify(selected) })
                setVisible(false)
              }}><Text size={14} color={theme['c-primary']}>{t('hot_save')}</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = createStyle({
  gear: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  backdrop: { flex: 1, paddingHorizontal: 20, paddingVertical: 48, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  dialog: { width: '100%', maxWidth: 520, height: '85%', borderRadius: 20, paddingTop: 20, overflow: 'hidden' },
  title: { fontWeight: '700', paddingHorizontal: 20 },
  hint: { paddingHorizontal: 20, paddingVertical: 10 },
  sources: { flexGrow: 0, flexShrink: 0, marginHorizontal: 12, marginBottom: 10 },
  source: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginRight: 8 },
  option: { minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  optionName: { flex: 1, paddingRight: 12 },
  feedback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', padding: 8 },
  action: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
})
