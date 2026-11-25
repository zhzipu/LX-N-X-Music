import { useRef, useImperativeHandle, forwardRef, useState, useEffect, useCallback } from 'react'
import { View, TouchableOpacity } from 'react-native'
import SearchTipList, {
  type SearchTipListProps as _SearchTipListProps,
  type SearchTipListType as _SearchTipListType,
} from '@/components/SearchTipList'
import Button from '@/components/common/Button'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { scaleSizeH } from '@/utils/pixelRatio'
import musicSdk from '@/utils/musicSdk'
import searchState, { type InitState as SearchState } from '@/store/search/state'
import {
  clearHistoryList,
  getSearchHistory,
  removeHistoryWord,
  setSearchText,
  setTipList,
  setTipListInfo,
} from '@/core/search/search'
import { debounce } from '@/utils'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { Icon } from '@/components/common/Icon'

export const ITEM_HEIGHT = scaleSizeH(36)

export const debounceTipSearch = debounce(
  (keyword: string, source: SearchState['temp_source'], callback: (list: string[]) => void) => {
    // console.log(reslutList)
    void musicSdk[source].tipSearch.search(keyword).then(callback)
  },
  200
)

export type SearchTipListProps = _SearchTipListProps<string>
export type SearchTipListType = _SearchTipListType<string>

/** tip: 输入联想候选；history: 搜索历史。两者共用同一个下拉面板，只是内容不同 */
type ListMode = 'tip' | 'history'

interface TipListProps {
  onSearch: (keyword: string) => void
  /** 点击面板下方空白区域（用于收起键盘） */
  onPressBg?: () => void
}
export interface TipListType {
  /** 输入框被点击/获得焦点：文本为空显示搜索历史，否则显示候选 */
  show: (height: number, keyword?: string) => void
  /** 输入内容变化：有内容显示候选，清空后回到搜索历史 */
  search: (keyword: string, height: number) => void
  hide: () => void
}

export default forwardRef<TipListType, TipListProps>(({ onSearch, onPressBg }, ref) => {
  const searchTipListRef = useRef<SearchTipListType>(null)
  const [visible, setVisible] = useState(false)
  const [mode, setMode] = useState<ListMode>('tip')
  const modeRef = useRef<ListMode>('tip')
  const historyListRef = useRef<string[]>([])
  const visibleListRef = useRef(false)
  const isUnmountedRef = useRef(false)
  const theme = useTheme()
  const t = useI18n()

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const switchMode = useCallback((next: ListMode) => {
    if (modeRef.current === next) return
    modeRef.current = next
    setMode(next)
  }, [])

  /** 展示搜索历史（与候选列表同一套面板/行样式） */
  const handleShowHistory = (height: number) => {
    switchMode('history')
    searchTipListRef.current?.setHeight(height)
    void getSearchHistory().then((list) => {
      if (isUnmountedRef.current || !visibleListRef.current || modeRef.current != 'history') return
      historyListRef.current = [...list]
      searchTipListRef.current?.setList([...list])
    })
  }

  /** 拉取并展示输入联想候选 */
  const handleSearchTips = (keyword: string, height: number) => {
    switchMode('tip')
    searchTipListRef.current?.setHeight(height)
    setTipListInfo(keyword, searchState.temp_source)
    debounceTipSearch(keyword, searchState.temp_source, (list) => {
      if (keyword != searchState.tipListInfo.text) return
      setTipList(list)
      if (isUnmountedRef.current || !visibleListRef.current || modeRef.current != 'tip') return
      searchTipListRef.current?.setList(list)
    })
  }

  const handleTextChange = (keyword: string, height: number) => {
    setSearchText(keyword)
    if (keyword) {
      // 一旦有输入就先收起搜索历史，等候选返回再展开，
      // 避免候选还没回来时面板里还挂着历史记录
      if (modeRef.current == 'history') searchTipListRef.current?.setList([])
      handleSearchTips(keyword, height)
    } else {
      // 清空输入：收起候选，回到搜索历史
      setTipListInfo('', searchState.temp_source)
      setTipList([])
      handleShowHistory(height)
    }
  }

  const handleShow = (height: number, keyword = '') => {
    visibleListRef.current = true
    if (visible) {
      handleTextChange(keyword, height)
    } else {
      setVisible(true)
      requestAnimationFrame(() => {
        handleTextChange(keyword, height)
      })
    }
  }

  useImperativeHandle(
    ref,
    () => ({
      show(height, keyword = '') {
        handleShow(height, keyword)
      },
      search(keyword, height) {
        // 提交搜索时会先 hide，再触发 search，此时不应重新拉起面板，
        // 所以这里不主动把 visibleListRef 置为 true。
        if (visible) handleTextChange(keyword, height)
        else {
          setVisible(true)
          requestAnimationFrame(() => {
            handleTextChange(keyword, height)
          })
        }
      },
      hide() {
        visibleListRef.current = false
        requestAnimationFrame(() => {
          if (isUnmountedRef.current) return
          searchTipListRef.current?.setList([])
        })
      },
    }),
    [visible]
  )

  const handleRemoveHistory = useCallback((keyword: string) => {
    const index = historyListRef.current.indexOf(keyword)
    if (index < 0) return
    removeHistoryWord(index)
    const next = historyListRef.current.slice()
    next.splice(index, 1)
    historyListRef.current = next
    searchTipListRef.current?.setList(next)
  }, [])

  const handleClearHistory = useCallback(() => {
    clearHistoryList()
    historyListRef.current = []
    searchTipListRef.current?.setList([])
  }, [])

  const handlePressBg = () => {
    visibleListRef.current = false
    searchTipListRef.current?.setList([])
    onPressBg?.()
  }

  const renderTipItem: SearchTipListProps['renderItem'] = ({ item, index }) => {
    return (
      <Button
        style={styles.item}
        onPress={() => {
          onSearch(item)
        }}
        key={index}
      >
        <Text style={styles.itemText} numberOfLines={1}>{item}</Text>
      </Button>
    )
  }

  const renderHistoryItem: SearchTipListProps['renderItem'] = ({ item, index }) => {
    return (
      <Button
        style={styles.item}
        onPress={() => {
          onSearch(item)
        }}
        onLongPress={() => {
          handleRemoveHistory(item)
        }}
        delayLongPress={400}
        key={index}
      >
        <Text style={styles.itemText} numberOfLines={1}>{item}</Text>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => {
            handleRemoveHistory(item)
          }}
        >
          <Icon name="remove" size={12} color={theme['c-font-label']} />
        </TouchableOpacity>
      </Button>
    )
  }

  const getkey: SearchTipListProps['keyExtractor'] = (item, index) => String(index)
  const getItemLayout: SearchTipListProps['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return visible ? (
    <SearchTipList
      ref={searchTipListRef}
      renderItem={mode == 'history' ? renderHistoryItem : renderTipItem}
      header={
        mode == 'history'
          ? (
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle} size={12} color={theme['c-font-label']}>
                  {t('search_history_search')}
                </Text>
                <TouchableOpacity style={styles.clearBtn} onPress={handleClearHistory}>
                  <Icon name="eraser" size={14} color={theme['c-font-label']} />
                </TouchableOpacity>
              </View>
            )
          : undefined
      }
      onPressBg={handlePressBg}
      keyExtractor={getkey}
      getItemLayout={getItemLayout}
    />
  ) : null
})

const styles = createStyle({
  item: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
  },
  itemText: {
    flexGrow: 1,
    flexShrink: 1,
  },
  removeBtn: {
    flexGrow: 0,
    flexShrink: 0,
    padding: 6,
    marginRight: -6,
  },
  historyHeader: {
    height: ITEM_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 15,
    paddingRight: 15,
  },
  historyTitle: {
    flexGrow: 1,
    flexShrink: 1,
  },
  clearBtn: {
    flexGrow: 0,
    flexShrink: 0,
    padding: 4,
    marginRight: -4,
  },
})
