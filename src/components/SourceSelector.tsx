import { forwardRef, type Ref, useImperativeHandle, useMemo, useState } from 'react'
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from 'react-native'

import DorpDownMenu, {
  type DorpDownMenuProps as _DorpDownMenuProps,
} from '@/components/common/DorpDownMenu'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useI18n } from '@/lang'

import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'

type Sources = Readonly<Array<LX.OnlineSource | 'all'>>

export interface SourceSelectorProps<S extends Sources> {
  fontSize?: number
  center?: _DorpDownMenuProps<any>['center']
  /** 触发区显示成图标（例如搜索框左侧的放大镜），不传则显示平台名文字 */
  icon?: string
  iconSize?: number
  iconColor?: string
  onSourceChange: (source: S[number]) => void
}

export interface SourceSelectorType<S extends Sources> {
  setSourceList: (list: S, activeSource: S[number]) => void
}

export const useSourceListI18n = (list: Sources) => {
  const sourceNameType = useSettingValue('common.sourceNameType')
  const t = useI18n()
  return useMemo(() => {
    return list.map((s) => ({ label: t(`source_${sourceNameType}_${s}` as any), action: s }))
  }, [list, sourceNameType, t])
}

const Component = <S extends Sources>(
  { fontSize = 15, center, icon, iconSize = 18, iconColor, onSourceChange }: SourceSelectorProps<S>,
  ref: Ref<SourceSelectorType<S>>
) => {
  const sourceNameType = useSettingValue('common.sourceNameType')
  const [list, setList] = useState([] as unknown as S)
  const [source, setSource] = useState<S[number]>('kw')
  const [pickerVisible, setPickerVisible] = useState(false)
  const t = useI18n()
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  useImperativeHandle(
    ref,
    () => ({
      setSourceList(list, activeSource) {
        setList(list)
        setSource(activeSource)
      },
    }),
    []
  )

  const sourceList_t = useSourceListI18n(list)

  type DorpDownMenuProps = _DorpDownMenuProps<typeof sourceList_t>

  const handleChangeSource: DorpDownMenuProps['onPress'] = ({ action }) => {
    onSourceChange(action)
    setSource(action)
  }

  // 图标触发（搜索框左侧放大镜）：用居中的小面板选平台，
  // 不再借用 DorpDownMenu（它的菜单宽度跟着触发区走，放大镜太窄会把菜单挤成一条）。
  if (icon) {
    return (
      <>
        <TouchableOpacity
          style={styles.sourceMenuIcon}
          accessibilityLabel={t('search_source_title' as any)}
          onPress={() => { setPickerVisible(true) }}
        >
          <Icon name={icon} size={iconSize} color={iconColor ?? sp.colors.textSecondary} />
        </TouchableOpacity>
        <Modal
          visible={pickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => { setPickerVisible(false) }}
        >
          <Pressable style={styles.backdrop} onPress={() => { setPickerVisible(false) }} />
          <View style={styles.pickerWrap} pointerEvents="box-none">
            <View style={[styles.picker, { backgroundColor: sp.colors.surface, borderColor: sp.colors.divider }]}>
              <Text size={15} style={[styles.pickerTitle, { color: sp.colors.textSecondary }]} allowFontScaling={false}>
                {t('search_source_title' as any)}
              </Text>
              {sourceList_t.map((item) => (
                <TouchableOpacity
                  key={String(item.action)}
                  style={styles.pickerRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    handleChangeSource({ action: item.action } as any)
                    setPickerVisible(false)
                  }}
                >
                  <Text size={16} style={{ color: sp.colors.text, fontWeight: item.action === source ? '600' : '400' }} allowFontScaling={false}>
                    {item.label}
                  </Text>
                  {item.action === source
                    ? <Icon name="checkbox-marked" size={18} color={sp.colors.accent} />
                    : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Modal>
      </>
    )
  }

  return (
    <DorpDownMenu
      menus={sourceList_t}
      center={center}
      onPress={handleChangeSource}
      fontSize={fontSize}
      activeId={source}
    >
      <View style={styles.sourceMenu}>
        <Text style={{ textAlign: center ? 'center' : 'left' }} numberOfLines={1} size={fontSize}>
          {t(`source_${sourceNameType}_${source}` as any)}
        </Text>
      </View>
    </DorpDownMenu>
  )
}

export default forwardRef(Component) as <S extends Sources>(
  p: SourceSelectorProps<S> & { ref?: Ref<SourceSelectorType<S>> }
) => JSX.Element | null

const styles = createStyle({
  sourceMenu: {
    height: '100%',
    justifyContent: 'center',
    // paddingTop: 12,
    // paddingBottom: 12,
    paddingLeft: 15,
    paddingRight: 15,
    // backgroundColor: '#ccc',
  },
  sourceMenuIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    width: 260,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 16,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
  },
  pickerTitle: {
    paddingLeft: 12,
    paddingBottom: 8,
  },
  pickerRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 12,
    paddingRight: 12,
  },
})
