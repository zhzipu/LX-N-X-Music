import { memo, type ReactNode } from 'react'
import {
  Platform, Pressable, StyleSheet, UIManager, View, requireNativeComponent,
  type NativeSyntheticEvent, type StyleProp, type ViewStyle,
} from 'react-native'
import { Icon } from '@/components/common/Icon'
import { hexToRgba, type GlassTabsParams } from './glassTabsParams'

export interface LiquidTabItem { id: string, icon: string, label: string }
interface Props {
  items: LiquidTabItem[]
  selectedIndex: number
  params: GlassTabsParams
  dark: boolean
  style?: StyleProp<ViewStyle>
  onSelect: (index: number, dragged: boolean) => void
}
interface NativeProps {
  children: ReactNode
  selectedIndex: number
  glassParams: GlassTabsParams
  dark: boolean
  style: StyleProp<ViewStyle>
  onTabSelect: (event: NativeSyntheticEvent<{ index: number, dragged: boolean }>) => void
}

// requireNativeComponent alone does not validate the native registration.
const nativeAvailable = Platform.OS === 'android' && !!UIManager.getViewManagerConfig('LiquidTabsView')
const NativeTabs = nativeAvailable ? requireNativeComponent<NativeProps>('LiquidTabsView') : null
const NativeBackdrop = nativeAvailable
  ? requireNativeComponent<{ children: ReactNode, style?: StyleProp<ViewStyle> }>('GlassBackdropView')
  : null

export const LiquidTabsBackdrop = ({ children, style }: { children: ReactNode, style?: StyleProp<ViewStyle> }) => (
  NativeBackdrop ? <NativeBackdrop style={style}>{children}</NativeBackdrop> : <View style={style}>{children}</View>
)

export default memo(({ items, selectedIndex, params, dark, style, onSelect }: Props) => {
  const children = items.map((item, index) => {
    const color = NativeTabs ? (dark ? '#FFFFFF' : '#000000') : index === selectedIndex ? params.tabsAccentColor : dark ? '#FFFFFF' : '#000000'
    return (
      <Pressable
        key={item.id}
        collapsable={false}
        style={styles.item}
        accessibilityRole="tab"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: selectedIndex === index }}
        onPress={() => { onSelect(index, false) }}
        onAccessibilityTap={() => { onSelect(index, false) }}
      >
        <Icon name={item.icon} rawSize={28} color={color} />
      </Pressable>
    )
  })
  if (NativeTabs) {
    return (
      <NativeTabs
        style={[styles.bar, style]}
        selectedIndex={selectedIndex}
        glassParams={params}
        dark={dark}
        onTabSelect={({ nativeEvent }) => { onSelect(nativeEvent.index, nativeEvent.dragged) }}
      >{children}</NativeTabs>
    )
  }
  return (
    <View style={[styles.bar, { borderRadius: params.shape === 'capsule' ? 32 : params.cornerRadius, backgroundColor: hexToRgba(params.containerColor, params.containerAlpha) }, style]}>
      <View pointerEvents="none" style={styles.fallbackTrack}>
        {items.map((item, index) => <View key={item.id} style={[styles.fallbackSlot, index === selectedIndex && { backgroundColor: hexToRgba(dark ? '#FFFFFF' : '#000000', params.pillAlpha) }]} />)}
      </View>
      {children}
    </View>
  )
})

const styles = StyleSheet.create({
  bar: { height: 64, flexDirection: 'row', padding: 4, overflow: 'visible' },
  item: { flex: 1, height: 56, justifyContent: 'center', alignItems: 'center' },
  fallbackTrack: { position: 'absolute', top: 4, bottom: 4, left: 4, right: 4, flexDirection: 'row' },
  fallbackSlot: { flex: 1, borderRadius: 28 },
})
