/**
 * 玻璃浮层容器（原生 `GlassOverlay`）。
 *
 * 背景录制宿主会跳过浮层里的整棵子树，等背景上屏后再把浮层整体画一遍；
 * 于是「玻璃底 + 压在上面的图标/文字」能得到正确层级 —— 图标不会被玻璃糊掉。
 *
 * 原生组件不存在时（非安卓 / 构建失败）退化成普通 View，不影响功能。
 */

import { memo, type ReactNode } from 'react'
import { Platform, requireNativeComponent, View, type StyleProp, type ViewStyle } from 'react-native'

interface NativeOverlayProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

let nativeOverlay: React.ComponentType<NativeOverlayProps> | null = null
let probed = false

const probeNativeOverlay = () => {
  if (probed) return nativeOverlay
  probed = true
  if (Platform.OS !== 'android') return null
  try {
    nativeOverlay = requireNativeComponent<NativeOverlayProps>('GlassOverlay')
  } catch {
    nativeOverlay = null
  }
  return nativeOverlay
}

export interface GlassOverlayProps {
  children?: ReactNode
  style?: StyleProp<ViewStyle>
}

const GlassOverlay = memo(({ children, style }: GlassOverlayProps) => {
  const Native = probeNativeOverlay()
  if (Native) {
    return <Native style={style}>{children}</Native>
  }
  return <View style={style} collapsable={false}>{children}</View>
})

export default GlassOverlay
