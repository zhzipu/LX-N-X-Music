/**
 * 列表行（spoti.pw 的 library / playlist / album 三种行）。
 *
 * 规范：
 *  - 库行：高 80，封面 64，圆角 6；
 *  - 歌单行：高 64，封面 48，圆角 6；
 *  - 专辑行：高 56，无封面（用序号占位）；
 *  - 标题 15/500，副标题 12 次级色；分隔线只从文字左缘开始（内缩 = 封面 + 12）。
 *
 * 纯展示组件：点击由调用方传 onPress；右侧操作放 `right`。
 */

import { memo, type ReactNode } from 'react'
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

export type ListRowVariant = 'library' | 'playlist' | 'album'

export interface ListRowProps {
  title: string
  subtitle?: string
  /** 封面地址；没有封面时专辑样式显示 indexText */
  cover?: string
  /** 无封面时左侧的序号 / 图标文本 */
  indexText?: string
  variant?: ListRowVariant
  onPress?: () => void
  onLongPress?: () => void
  delayLongPress?: number
  right?: ReactNode
  /** 是否画底部分隔线（最后一行传 false） */
  divider?: boolean
  /** 高亮（当前播放） */
  active?: boolean
  style?: StyleProp<ViewStyle>
}

const HEIGHTS: Record<ListRowVariant, number> = {
  library: 80,
  playlist: 64,
  album: 56,
}
const COVERS: Record<ListRowVariant, number> = {
  library: 64,
  playlist: 48,
  album: 0,
}
const RADII: Record<ListRowVariant, number> = {
  library: 6,
  playlist: 6,
  album: 0,
}

const ListRow = ({
  title,
  subtitle,
  cover,
  indexText,
  variant = 'playlist',
  onPress,
  onLongPress,
  delayLongPress,
  right,
  divider = true,
  active = false,
  style,
}: ListRowProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const height = HEIGHTS[variant]
  const coverSize = COVERS[variant]
  const radius = RADII[variant]
  const hasLead = coverSize > 0 || !!indexText
  // 分隔线从文字左缘开始：封面 + 图文间距 12
  const dividerInset = coverSize > 0 ? coverSize + 12 : 16

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      accessibilityRole="button"
      style={[styles.row, { height, paddingLeft: 16, paddingRight: 8 }, style]}
    >
      {coverSize > 0
        ? (cover
            ? (
                <Image
                  source={{ uri: cover }}
                  resizeMode="cover"
                  style={[styles.cover, { width: coverSize, height: coverSize, borderRadius: radius, backgroundColor: sp.colors.surface }]}
                />
              )
            : <View style={[styles.cover, { width: coverSize, height: coverSize, borderRadius: radius, backgroundColor: sp.colors.surface }]} />)
        : (indexText
            ? <Text size={sp.font.rowSubtitle} style={[styles.index, { color: sp.colors.textSecondary }]}>{indexText}</Text>
            : null)}

      <View style={[styles.center, hasLead ? styles.centerWithLead : null]}>
        <Text
          size={sp.font.rowTitle}
          numberOfLines={1}
          style={{ fontWeight: sp.font.rowTitleWeight, color: sp.colors.text }}
        >
          {title}
        </Text>
        {subtitle
          ? (
              <Text size={sp.font.rowSubtitle} numberOfLines={1} style={[styles.subtitle, { color: sp.colors.textSecondary }]}>
                {subtitle}
              </Text>
            )
          : null}
      </View>

      {right}

      {divider
        ? (
            <View
              pointerEvents="none"
              style={[styles.divider, { left: dividerInset, backgroundColor: sp.colors.divider, height: sp.size.hairline }]}
            />
          )
        : null}
    </Pressable>
  )
}

const styles = createStyle({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cover: {
    // 尺寸与圆角在行内按 variant 覆盖，这里只留一个空声明给类型
  },
  index: {
    width: 24,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  centerWithLead: {
    paddingLeft: 12,
  },
  subtitle: {
    paddingTop: 2,
  },
  divider: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
})

export default memo(ListRow)
