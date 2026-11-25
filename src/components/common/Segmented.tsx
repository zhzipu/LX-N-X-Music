import { Pressable, View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'

export interface SegmentedItem<T extends string> {
  key: T
  label: string
}

interface Props<T extends string> {
  items: ReadonlyArray<SegmentedItem<T>>
  value: T
  onChange: (value: T) => void
}

/**
 * 顶部分段切换控件（跟随主题）。
 * 视觉：半透明交互面做底槽，选中项用一层更亮的叠加，靠字重与透明度区分层级，
 * 与 Myspotify 皮肤「无边框、靠透明度分层」的规则一致。
 */
const Segmented = <T extends string>({ items, value, onChange }: Props<T>) => {
  const theme = useTheme()
  const activeBg = theme.isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.10)'

  return (
    <View style={[styles.container, { backgroundColor: theme['c-button-background'] }]}>
      {items.map((item) => {
        const active = item.key === value
        return (
          <Pressable
            key={item.key}
            accessibilityRole='button'
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) onChange(item.key)
            }}
            style={[styles.item, active ? { backgroundColor: activeBg } : null]}
          >
            <Text
              style={active ? styles.labelActive : styles.label}
              color={active ? theme['c-font'] : theme['c-font-label']}
              size={13}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = createStyle({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    padding: 3,
    borderRadius: 10,
  },
  item: {
    flex: 1,
    height: 34,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontWeight: '500',
  },
  labelActive: {
    fontWeight: '600',
  },
})

export default Segmented
