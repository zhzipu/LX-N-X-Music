/**
 * 页面向下渐黑的遮罩（spoti.pw 的 SGRField）。
 *
 * spoti.pw 的页面不是纯黑：App 全局铺了一张「当前歌曲封面 + 模糊」的动态底，
 * 页面再叠一层从「几乎透明」过渡到「纯黑」的遮罩，于是顶部能透出封面色雾、
 * 底部收成纯黑保证列表可读。之前各页直接铺 #000 把这层动态底整块盖掉了，
 * 这个组件就是把它放回来时用的那层遮罩。
 *
 * 用法：放在页面容器里的第一个子节点（绝对定位），页面自身底色设成 transparent。
 */

import { memo, useCallback, useState } from 'react'
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

export interface PageScrimProps {
  /** 顶部黑度 0..1（越大越暗），默认 0.10 */
  top?: number
  /** 中段黑度，默认 0.34 */
  middle?: number
  /** 中段出现的位置（占高度比例），默认 0.45 */
  middleAt?: number
  /** 底部黑度，默认 0.75；想要纯黑收口就传 1 */
  bottom?: number
}

const PageScrim = ({ top = 0.10, middle = 0.34, middleAt = 0.45, bottom = 0.75 }: PageScrimProps) => {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const onLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
    setSize(previous => previous.width === layout.width && previous.height === layout.height
      ? previous
      : { width: layout.width, height: layout.height })
  }, [])
  // Recreate the native SVG viewport after folding: its cached percentage
  // bounds can otherwise retain the outer-screen width and shade only one pane.
  return (
  <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
  <Svg key={`${size.width}x${size.height}`} width={size.width} height={size.height} preserveAspectRatio="none">
    <Defs>
      <LinearGradient id="pageScrim" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#000000" stopOpacity={top} />
        <Stop offset={String(middleAt)} stopColor="#000000" stopOpacity={middle} />
        {/* 只用渐变压暗、不在底部收成纯黑：整页都能看到封面色雾 */}
        <Stop offset="0.76" stopColor="#000000" stopOpacity={(middle + bottom) / 2 + 0.06} />
        <Stop offset="1" stopColor="#000000" stopOpacity={bottom} />
      </LinearGradient>
    </Defs>
    <Rect x="0" y="0" width="100%" height="100%" fill="url(#pageScrim)" />
  </Svg>
  </View>
  )
}

export default memo(PageScrim)
