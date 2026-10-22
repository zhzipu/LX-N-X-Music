import { memo, useCallback } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native'
import Text from '@/components/common/Text'
import CheckBox from '@/components/common/CheckBox'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import type { SyncCandidate } from '@/core/lxxwear/sync'

/**
 * 单个歌单的选歌弹窗：列出这个歌单里的歌，
 * 没选过歌的歌单默认全选，选过的话回显上次的选择。
 */

interface RowProps {
  item: SyncCandidate
  checked: boolean
  onToggle: (key: string) => void
}

const PickRow = memo(({ item, checked, onToggle }: RowProps) => {
  const theme = useTheme()
  return (
    <View style={[styles.row, { borderBottomColor: theme['c-border-background'] }]}>
      <CheckBox check={checked} onChange={() => onToggle(item.key)} marginBottom={0} size={0.9}>
        <View style={styles.rowText}>
          <Text size={12} numberOfLines={1}>{item.name || '未知歌曲'}</Text>
          <Text size={10} color={theme['c-font-label']} numberOfLines={1}>
            {item.artist || '未知歌手'}
          </Text>
        </View>
      </CheckBox>
    </View>
  )
})

export interface SongPickerProps {
  visible: boolean
  loading: boolean
  /** 正在编辑的歌单名 */
  title?: string
  /** 歌单本身有多少首（用来发现「只读到一部分」的情况） */
  playlistTotal?: number
  songs: SyncCandidate[]
  picked: Set<string>
  onToggle: (key: string) => void
  onToggleAll: (check: boolean) => void
  /** 顺序往后多选 N 首 */
  onAddMore: (count: number) => void
  onCancel: () => void
  onConfirm: () => void
}

/** 快速多选：点一下按列表顺序补上这么多首 */
const ADD_STEPS = [10, 50, 100]

export default ({
  visible,
  loading,
  title,
  playlistTotal,
  songs,
  picked,
  onToggle,
  onToggleAll,
  onAddMore,
  onCancel,
  onConfirm,
}: SongPickerProps) => {
  const theme = useTheme()

  const renderItem = useCallback(({ item }: { item: SyncCandidate }) => (
    <PickRow item={item} checked={picked.has(item.key)} onToggle={onToggle} />
  ), [picked, onToggle])

  const keyExtractor = useCallback((item: SyncCandidate) => item.key, [])

  // 歌单曲目数和读到的候选数对不上：说明只读到了一部分，提示出来，别让人以为全选就这么多
  const shortBy = !loading && playlistTotal && playlistTotal > songs.length
    ? ` · 歌单共 ${playlistTotal} 首，这里只读到 ${songs.length} 首`
    : ''
  const headerHint = loading
    ? '正在读取歌单…'
    : picked.size === songs.length
      ? `已全选 ${songs.length} 首${shortBy || ' · 取消勾选即不同步'}`
      : `已选 ${picked.size} / ${songs.length} 首${shortBy}`

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      hardwareAccelerated
      onRequestClose={onCancel}
    >
      <View style={styles.mask}>
        <View style={[styles.sheet, { backgroundColor: theme['c-content-background'] }]}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text size={14} color={theme['c-primary-font']} numberOfLines={1}>
                {title ? `「${title}」要同步的歌` : '选择要同步的歌曲'}
              </Text>
              <Text size={10} color={theme['c-font-label']} style={styles.headerHint}>
                {headerHint}
              </Text>
            </View>
            <TouchableOpacity activeOpacity={0.6} onPress={onCancel} style={styles.closeBtn}>
              <Text size={12} color={theme['c-font-label']}>关闭</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.toolRow}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => { onToggleAll(true) }}
              style={[styles.toolBtn, { borderColor: theme['c-border-background'] }]}
            >
              <Text size={11} color={theme['c-primary-font']}>全选</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => { onToggleAll(false) }}
              style={[styles.toolBtn, { borderColor: theme['c-border-background'] }]}
            >
              <Text size={11} color={theme['c-primary-font']}>全不选</Text>
            </TouchableOpacity>
            {ADD_STEPS.map(step => (
              <TouchableOpacity
                key={step}
                activeOpacity={0.6}
                onPress={() => { onAddMore(step) }}
                style={[styles.toolBtn, { borderColor: theme['c-border-background'] }]}
              >
                <Text size={11} color={theme['c-primary-font']}>{`+${step}`}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading
            ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={theme['c-primary-font']} />
                  <Text size={11} color={theme['c-font-label']} style={styles.loadingText}>
                    正在读歌单，网易云歌单可能要等几秒
                  </Text>
                </View>
              )
            : (
                <FlatList
                  style={styles.list}
                  data={songs}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  extraData={picked}
                  initialNumToRender={24}
                  windowSize={10}
                  keyboardShouldPersistTaps="handled"
                />
              )}

          <View style={[styles.footer, { borderTopColor: theme['c-border-background'] }]}>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={onCancel}
              style={[styles.footerBtn, { borderColor: theme['c-border-background'] }]}
            >
              <Text size={12} color={theme['c-primary-font']}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={onConfirm}
              disabled={loading || picked.size === 0}
              style={[
                styles.footerBtn,
                styles.footerPrimary,
                { backgroundColor: theme['c-button-background'], opacity: loading || picked.size === 0 ? 0.5 : 1 },
              ]}
            >
              <Text size={12} color={theme['c-button-font']}>保存（{picked.size}）</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = createStyle({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    maxHeight: '82%',
    borderRadius: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  headerText: {
    flex: 1,
  },
  headerHint: {
    marginTop: 3,
  },
  closeBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  toolBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 6,
  },
  rowText: {
    flexGrow: 0,
    flexShrink: 1,
  },
  loading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 10,
  },
  footerBtn: {
    flex: 1,
    height: 38,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerPrimary: {
    marginLeft: 10,
    borderWidth: 0,
  },
})
