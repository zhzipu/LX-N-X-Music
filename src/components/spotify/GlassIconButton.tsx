/**
 * 玻璃圆形图标按钮（spoti.pw 的镜像按钮）。
 *
 * 命中区 48、玻璃圆 44、字形 24。玻璃用原生 `GlassSurface`，
 * 外面包一层 `GlassOverlay`：浮层整块不进背景录制，图标才不会被糊进玻璃。
 */

import { memo } from 'react'
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'
import GlassSurface from './GlassSurface'
import GlassOverlay from './GlassOverlay'
import ConfiguredGlassSurface from './ConfiguredGlassSurface'
import type { GlassTarget } from './glassControlSettings'
import type { GlassTabsParams } from './glassTabsParams'
import { glassSurfaceParams } from './glassSurfaceParams'

export interface GlassIconButtonProps {
  icon: string
  size?: number
  onPress?: () => void
  onLongPress?: () => void
  /** 图标颜色，默认纯白 */
  color?: string
  /** 命中区边长，默认 48 */
  hitSize?: number
  /** 玻璃圆直径，默认 44 */
  circleSize?: number
  style?: StyleProp<ViewStyle>
  accessibilityLabel?: string
  glassTarget?: GlassTarget
  glassParams?: GlassTabsParams
  /** Use an opaque standard button instead of the Liquid Glass surface. */
  plain?: boolean
}

const GlassIconButton = ({
  icon,
  size,
  onPress,
  onLongPress,
  color,
  hitSize = 48,
  circleSize = 44,
  style,
  accessibilityLabel,
  glassTarget,
  glassParams,
  plain = false,
}: GlassIconButtonProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const iconSize = size ?? sp.size.controlIcon

  if (plain) {
    return (
      <Pressable
        style={[styles.plain, { width: hitSize, height: hitSize }, style]}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.circle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2, backgroundColor: sp.colors.surfaceElevated }]}>
          <Icon name={icon} size={iconSize} color={color ?? sp.colors.text} />
        </View>
      </Pressable>
    )
  }

  return (
    <GlassOverlay style={[styles.hit, { width: hitSize, height: hitSize }, style]}>
      <Pressable
        style={styles.press}
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
      >
        <View style={[styles.circle, { width: circleSize, height: circleSize, borderRadius: circleSize / 2 }]}>
          {glassParams ? <GlassSurface pointerEvents="none" style={styles.glass} {...glassSurfaceParams(glassParams, circleSize / 2)} /> : glassTarget ? <ConfiguredGlassSurface
            target={glassTarget}
            capsuleRadius={circleSize / 2}
            pointerEvents="none"
            style={styles.glass}
          /> : <GlassSurface
            pointerEvents="none"
            style={styles.glass}
            borderRadius={circleSize / 2}
            glassAmount={0.55}
          />}
          <Icon name={icon} size={iconSize} color={color ?? sp.colors.text} />
        </View>
      </Pressable>
    </GlassOverlay>
  )
}

const styles = createStyle({
  hit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  press: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glass: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
})

export default memo(GlassIconButton)
