/**
 * Liquid Glass 玻璃面板。
 *
 * 项目没有 BlurView，所以这里不是真的 backdrop-filter，而是靠视觉要素拼出玻璃感：
 *  - 半透明填充 + 深色 tint（磨砂感，避免透成一片白）；
 *  - 1px 描边，顶部用更亮的高光色 —— 这一步是 Liquid Glass 的灵魂，
 *    「上亮下暗」的边界才像一块有厚度的玻璃，否则只是个半透明圆角块；
 *  - 安卓 RN 0.73 的 shadow 属性无效，只能用 elevation，且 elevation 会给面板加一道灰边，
 *    所以玻璃面板默认不加 elevation，浮起感全靠描边和高光。
 *
 * 用法上它只是一层容器，层级关系是：模糊底图 → GlassPanel → 内容。
 */

import { memo, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'

const STYLE_ABSOLUTE_FILL = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

export interface GlassPanelProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
  /** 覆盖圆角，默认取令牌 glass.radius */
  radius?: number
  /** 更厚的一档玻璃（弹层、悬浮条、播放条）：填充更实 */
  strong?: boolean
  /** 是否绘制顶部高光描边，默认 true */
  highlight?: boolean
  /** 是否叠加深色 tint；纯装饰性的浅玻璃可以关掉 */
  tint?: boolean
}

const GlassPanel = ({
  children,
  style,
  radius,
  strong = false,
  highlight = true,
  tint = true,
}: GlassPanelProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const g = sp.glass

  return (
    <View
      style={[
        {
          borderRadius: radius ?? g.radius,
          backgroundColor: strong ? g.fillStrong : g.fill,
          borderWidth: 1,
          borderColor: g.stroke,
          borderTopColor: highlight ? g.strokeTop : g.stroke,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {/* tint 单独一层，避免和 fill 混在一起后无法做蒙版 */}
      {tint ? (
        <View
          pointerEvents="none"
          style={{
            ...STYLE_ABSOLUTE_FILL,
            backgroundColor: g.tint,
          }}
        />
      ) : null}
      {children}
    </View>
  )
}

export default memo(GlassPanel)
