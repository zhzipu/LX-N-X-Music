/**
 * 搜索类型切换（歌曲 / 歌单 / 歌手 / 专辑）。
 *
 * spoti.pw 里这类筛选是「系统玻璃上的胶囊」，这里用统一的 `Chip`：
 * 未选中 16% 白填充、选中 26% 白填充 + 纯白文字，不画描边。
 */

import { useEffect, useMemo, useState } from 'react'
import { ScrollView, View } from 'react-native'

import { createStyle } from '@/utils/tools'
import { type SearchType } from '@/store/search/state'
import { useI18n } from '@/lang'
import { getSearchSetting } from '@/utils/data'
import Chip from '@/components/spotify/Chip'

const SEARCH_TYPE_LIST = ['music', 'songlist', 'singer', 'album'] as const

export default () => {
  const t = useI18n()
  const [type, setType] = useState<SearchType>('music')

  useEffect(() => {
    void getSearchSetting().then((info) => {
      setType(info.type)
    })
  }, [])

  const list = useMemo(() => {
    return SEARCH_TYPE_LIST.map((type) => ({ label: t(`search_type_${type}`), id: type }))
  }, [t])

  const handleTypeChange = (type: SearchType) => {
    setType(type)
    global.app_event.searchTypeChanged(type)
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps={'always'}
      horizontal={true}
      showsHorizontalScrollIndicator={false}
    >
      {list.map((item) => (
        <View key={item.id} style={styles.chipWrap}>
          <Chip
            label={item.label}
            active={type === item.id}
            onPress={() => { handleTypeChange(item.id) }}
          />
        </View>
      ))}
    </ScrollView>
  )
}

const styles = createStyle({
  container: {
    flexGrow: 0,
    flexShrink: 0,
  },
  content: {
    alignItems: 'center',
  },
  chipWrap: {
    marginRight: 8,
  },
})
