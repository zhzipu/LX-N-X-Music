import { memo } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { MS_FONT, MS_SIZE, MS_SPACING } from '@/theme/myspotify/tokens'

export type SectionTitleVariant = 'large' | 'section'

export interface SectionTitleProps {
  /** 标题文案（必须已经过 useI18n() 或来自数据，不要写死中文） */
  title: string
  /** large = 页面大标题 30/700；section = 区块标题 22/700 */
  variant?: SectionTitleVariant
  /** 外层容器样式（用于控制左右留白与上下间距） */
  style?: StyleProp<ViewStyle>
  /** 标题右侧的附加内容（如「全部」按钮） */
  extra?: React.ReactNode
}

/**
 * Myspotify 皮肤的两档标题。
 *
 * 中文环境没有 SF Pro，因此不设 fontFamily，靠 fontWeight + letterSpacing 逼近苹果排版：
 *  - large：30 / 700 / letterSpacing -0.5
 *  - section：22 / 700 / letterSpacing -0.3
 * 字号走 Text 的 size（内部 setSpText），因此跟随 `global.lx.fontSize` 设置缩放。
 */
const SectionTitle = ({ title, variant = 'section', style, extra }: SectionTitleProps) => {
  const theme = useTheme()
  const isLarge = variant === 'large'

  return (
    <View style={[styles.container, isLarge ? styles.largeContainer : styles.sectionContainer, style]}>
      <Text
        size={isLarge ? MS_FONT.pageTitle : MS_FONT.sectionTitle}
        color={theme['c-font']}
        numberOfLines={1}
        style={isLarge ? styles.largeText : styles.sectionText}
      >
        {title}
      </Text>
      {extra ? <View style={styles.extra}>{extra}</View> : null}
    </View>
  )
}

const styles = createStyle({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: MS_SIZE.pagePaddingH,
  },
  largeContainer: {
    paddingTop: MS_SPACING.md,
    paddingBottom: MS_SPACING.sm,
  },
  sectionContainer: {
    paddingTop: MS_SPACING.xl,
    paddingBottom: MS_SPACING.sm,
  },
  largeText: {
    fontWeight: MS_FONT.pageTitleWeight,
    letterSpacing: MS_FONT.pageTitleLetterSpacing,
  },
  sectionText: {
    fontWeight: MS_FONT.sectionTitleWeight,
    letterSpacing: MS_FONT.sectionTitleLetterSpacing,
  },
  extra: {
    flexGrow: 0,
    flexShrink: 0,
    paddingLeft: MS_SPACING.sm,
  },
})

export default memo(SectionTitle)
