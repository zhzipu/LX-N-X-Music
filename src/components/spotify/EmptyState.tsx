/**
 * 列表空状态（spoti.pw 里没有现成组件，按它的语言自建）。
 *
 * 规范：居中、次级色图标、主文案 17/600、说明 15/400 次级色；
 * 不画卡片底、不加边框，和列表其它部分同一套留白。
 */

import { memo, type ReactNode } from 'react'
import { View } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

export interface EmptyStateProps {
  /** 图标名，默认用专辑图标 */
  icon?: string
  title: string
  desc?: string
  /** 底部可选操作（例如「去设置」胶囊按钮） */
  action?: ReactNode
}

const EmptyState = ({ icon = 'album', title, desc, action }: EmptyStateProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={40} color={sp.colors.textTertiary} />
      <Text size={17} style={[styles.title, { color: sp.colors.text }]} allowFontScaling={false}>
        {title}
      </Text>
      {desc
        ? (
            <Text size={15} style={[styles.desc, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
              {desc}
            </Text>
          )
        : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  )
}

const styles = createStyle({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    paddingBottom: 72,
    paddingLeft: 32,
    paddingRight: 32,
  },
  title: {
    marginTop: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  desc: {
    marginTop: 6,
    textAlign: 'center',
  },
  action: {
    marginTop: 18,
  },
})

export default memo(EmptyState)
