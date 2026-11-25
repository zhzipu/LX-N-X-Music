/**
 * 区段标题（spoti.pw 的 Title2）：22 / Bold / 字距 -0.5。
 *
 * 右侧可选一个「全部 / 更多」文字入口，颜色用次级文字。
 */

import { memo, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

export interface SectionTitleProps {
  title: string
  /** 右侧文字入口 */
  actionLabel?: string
  onActionPress?: () => void
  /** 右侧自定义节点，优先于 actionLabel */
  right?: ReactNode
  /** 去掉左右内边距（用于嵌在已有 padding 的容器里） */
  flush?: boolean
}

const SectionTitle = ({ title, actionLabel, onActionPress, right, flush = false }: SectionTitleProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  return (
    <View style={[styles.container, flush ? styles.flush : null]}>
      <Text style={styles.title} size={sp.font.sectionTitle} numberOfLines={1} allowFontScaling={false}>
        {title}
      </Text>
      <View style={styles.spacer} />
      {right ?? (actionLabel
        ? (
            <Pressable onPress={onActionPress} hitSlop={8}>
              <Text size={sp.font.caption} style={{ color: sp.colors.textSecondary }}>{actionLabel}</Text>
            </Pressable>
          )
        : null)}
    </View>
  )
}

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  flush: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
})

export default memo(SectionTitle)
