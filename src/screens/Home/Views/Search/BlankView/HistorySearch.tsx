import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native'
import { type InitState } from '@/store/hotSearch/state'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { useI18n } from '@/lang'
import { getSP } from '@/theme/spotify/tokens'
import { clearHistoryList, getSearchHistory, removeHistoryWord } from '@/core/search/search'
import { Icon } from '@/components/common/Icon'
import Chip from '@/components/spotify/Chip'

export type List = NonNullable<InitState['sourceList'][keyof InitState['sourceList']]>

const ListItem = ({
  keyword,
  onSearch,
  onRemove,
}: {
  keyword: string
  onSearch: (keyword: string) => void
  onRemove: (keyword: string) => void
}) => {
  return (
    <View style={styles.chipWrap}>
      <Chip
        label={keyword}
        onPress={() => { onSearch(keyword) }}
        // 长按删除历史；Chip 没有长按，所以外面再包一层可长按的透明壳
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onLongPress={() => { onRemove(keyword) }}
        onPress={() => { onSearch(keyword) }}
        delayLongPress={400}
      />
    </View>
  )
}

interface HistorySearchProps {
  onSearch: (keyword: string) => void
}
export interface HistorySearchType {
  show: () => void
}

export default forwardRef<HistorySearchType, HistorySearchProps>((props, ref) => {
  const [list, setList] = useState<List>([])
  const isUnmountedRef = useRef(false)
  const t = useI18n()
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      show() {
        void getSearchHistory().then((list) => {
          if (isUnmountedRef.current) return
          setList(list)
        })
      },
    }),
    []
  )

  const handleClear = () => {
    clearHistoryList()
    setList([])
  }

  const handleRemove = useCallback((keyword: string) => {
    setList((list) => {
      list = [...list]
      const index = list.indexOf(keyword)
      list.splice(index, 1)
      removeHistoryWord(index)
      return list
    })
  }, [])

  return list.length ? (
    <View>
      <View style={styles.titleContent}>
        <View style={styles.spacer} />
        <TouchableOpacity onPress={handleClear} style={styles.titleBtn}>
          <Icon name="eraser" color={sp.colors.textTertiary} size={16} />
        </TouchableOpacity>
      </View>
      <View style={styles.list}>
        {list.map((keyword) => (
          <ListItem
            keyword={keyword}
            key={keyword}
            onSearch={props.onSearch}
            onRemove={handleRemove}
          />
        ))}
      </View>
    </View>
  ) : null
})

const styles = createStyle({
  titleContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spacer: {
    flex: 1,
  },
  titleBtn: {
    marginLeft: 10,
    padding: 5,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chipWrap: {
    marginRight: 8,
    marginBottom: 8,
  },
})
