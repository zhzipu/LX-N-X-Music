import { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import Mylist from '../Mylist'
import MyPlaylist from '../MyPlaylist'
import Chip from '@/components/spotify/Chip'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import {
  getMyMusicSegment,
  setMyMusicSegment,
  subscribeMyMusicSegment,
  type MyMusicSegment,
} from './segment'

/**
 * 「我的歌单」= 原「我的列表」+ 原「我的歌单」合并页。
 * 顶部两个分段（spoti.pw 的 chip）：本地列表（试听 / 收藏 / 自建歌单）与网易云歌单。
 * 两个子页面都保持原有实现，这里只负责分段切换，不复制其内部逻辑。
 *
 * 注：Home 顶栏已经绘制了 34/700 的页面大标题 + 汉堡，这里不再重复 PageHeader，
 * 只保留分段 chip（否则会出现两个「我的歌单」大标题）。
 */
export default () => {
  const t = useI18n()
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const [segment, setSegment] = useState<MyMusicSegment>(getMyMusicSegment)

  useEffect(() => subscribeMyMusicSegment(setSegment), [])

  const items = useMemo<Array<{ key: MyMusicSegment, label: string }>>(() => [
    { key: 'local', label: t('my_music_tab_local') },
    { key: 'online', label: t('my_music_tab_online') },
  ], [t])

  const handleChange = useCallback((value: MyMusicSegment) => {
    setMyMusicSegment(value)
  }, [])

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <View style={styles.segments}>
        {items.map(item => (
          <Chip
            key={item.key}
            label={item.label}
            active={segment === item.key}
            onPress={() => { handleChange(item.key) }}
          />
        ))}
      </View>
      <View style={styles.content}>
        {segment === 'local' ? <Mylist /> : <MyPlaylist />}
      </View>
    </View>
  )
}

const styles = createStyle({
  container: {
    flex: 1,
  },
  segments: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 2,
    paddingBottom: 10,
  },
  content: {
    flex: 1,
  },
})
