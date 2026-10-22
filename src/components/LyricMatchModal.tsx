import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, TouchableOpacity, View } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Input, { type InputType } from '@/components/common/Input'
import ButtonPrimary from '@/components/common/ButtonPrimary'
import Text from '@/components/common/Text'
import {
  fetchLyricByCandidate,
  PROVIDER_NAMES,
  scoreLyricCandidate,
  searchLyricCandidates,
  type LyricCandidate,
} from '@/core/lyricMatch/match'
import { cleanMusicKeyword } from '@/core/lyricMatch/bili'
import { setLyricOverride } from '@/core/lyricAdjust'
import { createStyle, toast } from '@/utils/tools'
import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import playerState from '@/store/player/state'

/** 带 `[00:12.34]` 这类时间轴才算有效歌词 */
const TIMESTAMP_RXP = /\[\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?\]/

export interface LyricMatchModalType {
  show: () => void
}

const formatDuration = (seconds: number) => {
  if (!seconds) return '--:--'
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60)
  return `${min}:${String(sec).padStart(2, '0')}`
}

/** 与自动匹配一致：先把标题里的【】《》（）等补充说明去掉，再补上歌手 */
const buildKeyword = (name?: string | null, singer?: string | null) => {
  const base = cleanMusicKeyword(name ?? '') || String(name ?? '')
  const artist = String(singer ?? '').trim()
  if (!artist || base.includes(artist)) return base
  return `${base} ${artist}`
}

const keyOf = (candidate: LyricCandidate) => `${candidate.provider}_${candidate.id}`

export default forwardRef<LyricMatchModalType, {}>((_props, ref) => {
  const theme = useTheme()
  const popupRef = useRef<PopupType>(null)
  const inputRef = useRef<InputType>(null)
  const requestIdRef = useRef(0)
  const [visible, setVisible] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [list, setList] = useState<LyricCandidate[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applyingKey, setApplyingKey] = useState('')

  const search = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      toast('请输入要搜索的歌名')
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')
    try {
      const candidates = await searchLyricCandidates(trimmed)
      if (requestId !== requestIdRef.current) return
      // 和自动匹配同一套打分：歌名相似度 + 时长吻合度，网易云同分优先
      const musicInfo = playerState.musicInfo
      const duration = playerState.progress.maxPlayTime
      const scoreOf = (candidate: LyricCandidate) =>
        scoreLyricCandidate(candidate, musicInfo.name, duration) ?? -1
      candidates.sort((a, b) => {
        const diff = scoreOf(b) - scoreOf(a)
        return diff !== 0 ? diff : a.provider.localeCompare(b.provider)
      })
      setList(candidates)
      if (!candidates.length) setError('没有搜到歌词')
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return
      setList([])
      setError(err?.message ?? '搜索失败')
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  const handleHide = useCallback(() => {
    requestIdRef.current += 1
    setVisible(false)
    setLoading(false)
  }, [])

  useImperativeHandle(ref, () => ({
    show() {
      const musicInfo = playerState.musicInfo
      if (!musicInfo.id) {
        toast('当前没有正在播放的歌曲')
        return
      }
      const text = buildKeyword(musicInfo.name, musicInfo.singer)
      setKeyword(text)
      setList([])
      setError('')
      setApplyingKey('')
      requestIdRef.current += 1

      const open = () => {
        popupRef.current?.setVisible(true)
        void search(text)
      }
      if (visible) {
        open()
      } else {
        setVisible(true)
        requestAnimationFrame(open)
      }
    },
  }))

  const handleApply = useCallback(
    async (candidate: LyricCandidate) => {
      const musicInfo = playerState.musicInfo
      if (!musicInfo.id) return
      const key = keyOf(candidate)
      if (applyingKey) return
      setApplyingKey(key)
      try {
        const result = await fetchLyricByCandidate(candidate)
        const lrc = result.lyric ?? ''
        if (!TIMESTAMP_RXP.test(lrc)) throw new Error('这条歌词没有时间轴，换一条试试')
        setLyricOverride(musicInfo.id, {
          lrc,
          tlrc: result.tlyric ?? '',
          rlrc: result.rlyric ?? '',
          provider: PROVIDER_NAMES[candidate.provider],
          source: `${candidate.name}${candidate.singer ? ` - ${candidate.singer}` : ''}`,
        })
        toast('歌词已替换')
        popupRef.current?.setVisible(false)
        setVisible(false)
      } catch (err: any) {
        toast(err?.message ?? '歌词获取失败')
      } finally {
        setApplyingKey('')
      }
    },
    [applyingKey]
  )

  const renderItem = useCallback(
    ({ item }: { item: LyricCandidate }) => {
      const key = keyOf(item)
      const isApplying = applyingKey === key
      return (
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => {
            void handleApply(item)
          }}
        >
          <View style={styles.rowInfo}>
            <Text size={14} numberOfLines={1}>
              {item.name}
            </Text>
            <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
              {`${item.singer || '未知歌手'} · ${PROVIDER_NAMES[item.provider]} · ${formatDuration(
                item.duration
              )}`}
            </Text>
          </View>
          {isApplying ? <ActivityIndicator size="small" color={theme['c-primary']} /> : null}
        </TouchableOpacity>
      )
    },
    [applyingKey, handleApply, theme]
  )

  const emptyComponent = () => {
    if (loading) return null
    return (
      <View style={styles.empty}>
        <Text size={12} color={theme['c-font-label']}>
          {error || '输入歌名搜索歌词'}
        </Text>
      </View>
    )
  }

  return visible ? (
    <Popup ref={popupRef} title="匹配歌词" onHide={handleHide}>
      <View style={styles.content}>
        <View style={{ ...styles.searchBar, borderBottomColor: theme['c-border-background'] }}>
          <View style={styles.inputBox}>
            <Input
              ref={inputRef}
              value={keyword}
              clearBtn
              placeholder="歌名 歌手"
              returnKeyType="search"
              onChangeText={setKeyword}
              onSubmitEditing={() => {
                void search(keyword)
              }}
            />
          </View>
          <ButtonPrimary
            onPress={() => {
              inputRef.current?.blur()
              void search(keyword)
            }}
          >
            搜索
          </ButtonPrimary>
        </View>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme['c-primary']} />
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={keyOf}
            renderItem={renderItem}
            style={styles.list}
            keyboardShouldPersistTaps="always"
            ListEmptyComponent={emptyComponent}
          />
        )}
        <Text size={11} color={theme['c-font-label']} style={styles.tip}>
          选中的歌词只对当前歌曲生效
        </Text>
      </View>
    </Popup>
  ) : null
})

const styles = createStyle({
  content: {
    flexGrow: 0,
    flexShrink: 1,
  },
  // 与顶部歌曲搜索栏同一套风格：透明底 + 一条细分隔线（见 Home/Views/Search/HeaderBar）
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 38,
    paddingLeft: 15,
    paddingRight: 5,
    borderBottomWidth: BorderWidths.normal,
  },
  inputBox: {
    flexGrow: 1,
    flexShrink: 1,
    // 必须给定高度：Input 内的清除按钮是 height:'70%'，
    // 父级高度不确定时（百分比无从解析）会把整块撑到弹窗最大高度
    height: 36,
    justifyContent: 'center',
    paddingLeft: 6,
    paddingRight: 6,
  },
  loading: {
    paddingTop: 30,
    paddingBottom: 30,
    alignItems: 'center',
  },
  list: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 10,
    paddingBottom: 10,
  },
  rowInfo: {
    flexGrow: 1,
    flexShrink: 1,
  },
  empty: {
    paddingTop: 30,
    paddingBottom: 30,
    alignItems: 'center',
  },
  tip: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingTop: 8,
    paddingBottom: 10,
  },
})
