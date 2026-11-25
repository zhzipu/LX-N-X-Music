import { memo, useCallback } from 'react'
import { Pressable } from 'react-native'
import ListRow from '@/components/spotify/ListRow'
import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { type ListInfoItem } from '@/store/songlist/state'

/**
 * 网易云歌单行（spoti.pw 的库行）：
 * 80 高、64 圆角封面、标题 15/500 + 副标题 12 次级色，右侧「心动模式」入口。
 */
export default memo(({ item, onPress, onHeartbeatPress }: { item: any, onPress: (info: ListInfoItem) => void, onHeartbeatPress?: (info: ListInfoItem) => void }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const buildInfo = useCallback((): ListInfoItem => ({
    id: String(item.id),
    name: item.name,
    author: item.creator?.nickname,
    img: item.coverImgUrl,
    play_count: item.playCount,
    desc: item.description,
    source: 'wy',
    userId: item.userId,
    total: item.trackCount,
  }), [item])

  const handlePress = useCallback(() => {
    onPress(buildInfo())
  }, [onPress, buildInfo])

  const handleHeartbeatPress = useCallback(() => {
    onHeartbeatPress?.(buildInfo())
  }, [onHeartbeatPress, buildInfo])

  const showHeartbeat = typeof item.name === 'string' && item.name.endsWith('喜欢的音乐') && !!onHeartbeatPress

  return (
    <ListRow
      variant="library"
      title={item.name}
      subtitle={item.trackCount > 0 ? `${item.trackCount} tracks` : undefined}
      cover={item.coverImgUrl}
      onPress={handlePress}
      right={showHeartbeat
        ? (
            <Pressable
              style={styles.heartbeat}
              onPress={handleHeartbeatPress}
              accessibilityRole="button"
              accessibilityLabel="心动模式"
              hitSlop={6}
            >
              <SvgIcon name="heartbeat" size={22} color={sp.colors.accent} />
            </Pressable>
          )
        : undefined}
    />
  )
})

const styles = createStyle({
  heartbeat: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
