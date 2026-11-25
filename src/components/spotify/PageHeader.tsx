/**
 * 页面大标题（spoti.pw 的 LargeTitle）。
 *
 * 规范：34 / Bold / 字距 -0.8，左侧可带一个 24pt 图标按钮（汉堡 / 返回），
 * 右侧可以放一个操作节点（如头像、更多）。标题本身不吸顶，跟着内容滚动。
 */

import { memo, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

export interface PageHeaderProps {
  title: string
  /** 左侧图标，传了就显示按钮 */
  leftIcon?: string
  onLeftPress?: () => void
  /** 右侧自定义节点 */
  right?: ReactNode
  /** 标题下方额外内容（如筛选 chip 行） */
  children?: ReactNode
}

const PageHeader = ({ title, leftIcon, onLeftPress, right, children }: PageHeaderProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {leftIcon ? (
          <Pressable
            style={styles.leftBtn}
            onPress={onLeftPress}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Icon name={leftIcon} size={sp.size.tabIcon} color={sp.colors.text} />
          </Pressable>
        ) : null}
        <Text
          style={styles.title}
          size={sp.font.pageTitle}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {title}
        </Text>
        <View style={styles.spacer} />
        {right}
      </View>
      {children}
    </View>
  )
}

const styles = createStyle({
  container: {
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 16,
    minHeight: 48,
  },
  leftBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '700',
    letterSpacing: -0.8,
    paddingLeft: 4,
    flexShrink: 1,
  },
  spacer: {
    flex: 1,
  },
})

export default memo(PageHeader)
