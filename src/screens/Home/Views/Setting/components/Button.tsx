/**
 * 设置页按钮（spoti.pw）：
 *  - 主按钮：白底 + 深色字（和 PlayPill 同款观感），胶囊高 44、r22；
 *  - 次按钮：16% 白填充胶囊 + 纯白字；
 *  - 只增加一个可选 `primary` 标记，调用方的 onPress / disabled / children 全部保持原样。
 */

import { memo } from 'react'

import Button, { type BtnProps } from '@/components/common/Button'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

type ButtonProps = BtnProps & {
  /** true = 白底深色字主按钮；false = 16% 白填充次按钮 */
  primary?: boolean
}

export default memo(({ disabled, onPress, children, primary = false }: ButtonProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const backgroundColor = primary ? sp.colors.playButtonBg : sp.colors.chipBg
  const color = primary ? sp.colors.playButtonIcon : sp.colors.text

  return (
    <Button
      style={{ ...styles.button, backgroundColor, opacity: disabled ? 0.4 : 1 }}
      onPress={onPress}
      disabled={disabled}
    >
      <Text size={15} style={{ color, fontWeight: '600' }} allowFontScaling={false}>
        {children}
      </Text>
    </Button>
  )
})

const styles = createStyle({
  button: {
    minHeight: 44,
    maxWidth: '100%',
    flexShrink: 1,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginBottom: 10,
  },
})
