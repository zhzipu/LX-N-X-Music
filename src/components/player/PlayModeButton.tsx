/**
 * 播放模式切换按钮（可复用）。
 *
 * 循环：列表循环 → 随机 → 顺序 → 单曲循环 →（列表）循环…
 * 图标与播放页播放模式按钮一致，颜色统一由外部控制。
 */

import { memo, useCallback, useMemo } from 'react'
import { MUSIC_TOGGLE_MODE, MUSIC_TOGGLE_MODE_LIST } from '@/config/constant'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { toast } from '@/utils/tools'
import { Pressable, type StyleProp, type ViewStyle } from 'react-native'
import { Icon } from '@/components/common/Icon'

const MODE_ICON: Record<string, string> = {
  [MUSIC_TOGGLE_MODE.listLoop]: 'list-loop',
  [MUSIC_TOGGLE_MODE.random]: 'list-random',
  [MUSIC_TOGGLE_MODE.list]: 'list-order',
  [MUSIC_TOGGLE_MODE.singleLoop]: 'single-loop',
  [MUSIC_TOGGLE_MODE.none]: 'single',
}

const MODE_NAME: Record<string, string> = {
  [MUSIC_TOGGLE_MODE.listLoop]: 'play_list_loop',
  [MUSIC_TOGGLE_MODE.random]: 'play_list_random',
  [MUSIC_TOGGLE_MODE.list]: 'play_list_order',
  [MUSIC_TOGGLE_MODE.singleLoop]: 'play_single_loop',
  [MUSIC_TOGGLE_MODE.none]: 'play_single',
}

interface PlayModeButtonProps {
  size?: number
  color?: string
  style?: StyleProp<ViewStyle>
  onLongPress?: () => void
}

/** 只切循环模式（不掺心动模式），mini 播放器用 */
const PlayModeButton = ({ size = 22, color, style, onLongPress }: PlayModeButtonProps) => {
  const togglePlayMethod = useSettingValue('player.togglePlayMethod')
  const t = useI18n()

  const icon = useMemo(() => MODE_ICON[togglePlayMethod] ?? 'list-loop', [togglePlayMethod])

  const handlePress = useCallback(() => {
    const list = [...MUSIC_TOGGLE_MODE_LIST] as string[]
    let index = list.indexOf(togglePlayMethod)
    if (++index >= list.length) index = 0
    const mode = list[index]
    updateSetting({ 'player.togglePlayMethod': mode as any })
    const name = MODE_NAME[mode]
    if (name) toast(t(name as any))
  }, [togglePlayMethod, t])

  return (
    <Pressable
      style={style}
      onPress={handlePress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel="play mode"
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  )
}

export default memo(PlayModeButton)
