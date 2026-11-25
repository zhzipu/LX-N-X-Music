/**
 * 歌单详情页的操作行（spoti.pw 的 SGRActionRow）。
 *
 * 一行三个控件：随机播放（玻璃圆钮）+ 播放（白色胶囊）+ 更多（玻璃圆钮）。
 * 「更多」里收着原来底栏的三个动作（收藏到本地列表 / 网易云收藏 / 创作者编辑删除），
 * 这样一行就能放下全部操作，同时不删掉任何原有功能。
 *
 * 纯表现层改动：播放 / 收藏仍然走 `listAction` 里原来的函数，随机播放只是把同一批
 * 歌曲洗牌后交给原来的 `handlePlay`，不新增任何数据请求。
 */

import { memo, useRef } from 'react'
import { View } from 'react-native'
import GlassIconButton from '@/components/spotify/GlassIconButton'
import PlayPill from '@/components/spotify/PlayPill'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { type Position } from '@/components/common/Menu'
import { getListDetailAll } from '@/core/songlist'
import { playOnlineList } from '@/core/list'
import { handlePlay } from './listAction'
import songlistState from '@/store/songlist/state'
import { useListInfo } from './state'

export interface ActionBarProps {
  /** 点「更多」时把按钮在屏幕上的位置回传，由页头决定弹什么菜单 */
  onMore?: (position: Position) => void
}

export default memo(({ onMore }: ActionBarProps) => {
  const t = useI18n()
  const info = useListInfo()
  const moreButtonRef = useRef<View>(null)

  const handlePlayAll = () => {
    if (!songlistState.listDetailInfo.info.name) return
    void handlePlay(info.id, info.source, songlistState.listDetailInfo.list)
  }

  const handleShuffle = async() => {
    const listId = `${info.source}__${info.id}`
    // 取整份歌单（与「播放全部」一致），否则只会打乱当前已加载的这一页
    let list: LX.Music.MusicInfoOnline[] = []
    try {
      list = await getListDetailAll(info.source, info.id)
    } catch {}
    if (!list.length) list = songlistState.listDetailInfo.list
    if (!list.length) {
      handlePlayAll()
      return
    }
    // 洗牌副本：不修改详情页自身的列表，只把播放队列换成随机顺序
    const shuffled = [...list]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = temp
    }
    void playOnlineList(listId, shuffled, 0)
  }

  const handleMore = () => {
    moreButtonRef.current?.measure((fx, fy, width, height, px, py) => {
      onMore?.({
        x: Math.ceil(px),
        y: Math.ceil(py),
        w: Math.ceil(width),
        h: Math.ceil(height),
      })
    })
  }

  return (
    <View style={styles.container}>
      <GlassIconButton
        icon="list-random"
        onPress={handleShuffle}
        accessibilityLabel={t('play_list_random')}
      />
      <PlayPill
        label={t('play')}
        onPress={handlePlayAll}
        accessibilityLabel={t('play_all')}
      />
      <View ref={moreButtonRef} collapsable={false}>
        <GlassIconButton
          icon="dots-vertical"
          onPress={handleMore}
          accessibilityLabel={t('collect_songlist')}
        />
      </View>
    </View>
  )
})

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
})
