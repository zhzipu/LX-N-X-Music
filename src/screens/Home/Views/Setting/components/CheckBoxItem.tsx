/**
 * 设置开关行（spoti.pw 风格）：
 *  - 行高 56，标题 15 / 500 / 纯白，右侧开关竖直居中；
 *  - 开关轨道 on = sp.colors.accent（现在是白色），off = 20% 白；拇指 on 时用 onAccent（深色），
 *    off 时纯白，避免白底白滑块看不见；
 *  - 行间发丝分隔线（sp.colors.divider），由页面容器 16 gutter 决定内缩位置；
 *  - 帮助说明（helpTitle / helpDesc）仍然走原来的 tipDialog，不改变任何设置读写逻辑。
 */

import { memo, useCallback } from 'react'

import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native'

import type { CheckBoxProps } from '@/components/common/CheckBox'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import SpSwitch from '@/components/spotify/SpSwitch'
import { createStyle, tipDialog } from '@/utils/tools'

const ROW_HEIGHT = 56

export default memo(({
  check,
  label,
  children,
  onChange,
  disabled = false,
  need = false,
  helpTitle,
  helpDesc,
  marginBottom = 0,
}: CheckBoxProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  // need = 单选语义：已选中时不能再点掉（保持原 CheckBox 的行为）
  const isDisabled = disabled || (need && check)

  const handleToggle = useCallback(() => {
    if (isDisabled) return
    onChange(!check)
  }, [isDisabled, onChange, check])

  const handleShowHelp = useCallback(() => {
    void tipDialog({
      title: helpTitle ?? '',
      message: helpDesc,
      btnText: global.i18n.t('understand'),
    })
  }, [helpTitle, helpDesc])

  return (
    <Pressable
      onPress={handleToggle}
      disabled={isDisabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: check, disabled: isDisabled }}
      style={[
        styles.row,
        {
          borderBottomColor: sp.colors.divider,
          marginBottom,
          opacity: isDisabled ? 0.45 : 1,
        },
      ]}
    >
      <View style={styles.texts}>
        {label
          ? (
              <Text size={15} style={{ color: sp.colors.text, fontWeight: '500' }} allowFontScaling={false}>
                {label}
              </Text>
            )
          : children}
      </View>
      {(helpTitle ?? helpDesc)
        ? (
            <TouchableOpacity style={styles.helpBtn} onPress={handleShowHelp} hitSlop={8}>
              <Icon name="help" size={15} color={sp.colors.textSecondary} />
            </TouchableOpacity>
          )
        : null}
      <SpSwitch
        value={check}
        onChange={onChange}
        disabled={isDisabled}
        activeColor={sp.colors.accent}
        activeThumbColor={sp.colors.onAccent}
        inactiveColor={sp.colors.track}
      />
    </Pressable>
  )
})

const styles = createStyle({
  row: {
    minHeight: ROW_HEIGHT,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  texts: {
    flex: 1,
    paddingRight: 12,
    justifyContent: 'center',
  },
  helpBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
})
