import { memo, useState, useEffect, useRef, useCallback } from 'react'

import { StyleSheet, View, Keyboard } from 'react-native'
import type { InputType, InputProps } from '@/components/common/Input'
import Input from '@/components/common/Input'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import Text from '@/components/common/Text'

export interface InputItemProps extends InputProps {
  value: string
  label: string
  onChanged: (text: string, callback: (vlaue: string) => void) => void
}

export default memo(({ value, label, onChanged, ...props }: InputItemProps) => {
  const [text, setText] = useState(value)
  const textRef = useRef(value)
  const isMountRef = useRef(false)
  const dirtyRef = useRef(false)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const inputRef = useRef<InputType>(null)
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const saveValue = useCallback(() => {
    if (!dirtyRef.current) return
    const draft = textRef.current
    dirtyRef.current = false
    onChangedRef.current(draft, (value: string) => {
      if (!isMountRef.current || textRef.current !== draft) return
      const newValue = String(value)
      setText(newValue)
      textRef.current = newValue
    })
  }, [])
  useEffect(() => {
    isMountRef.current = true
    return () => {
      isMountRef.current = false
      // Category navigation can unmount the field before Android sends onBlur.
      saveValue()
    }
  }, [saveValue])
  useEffect(() => {
    const handleKeyboardDidHide = () => {
      if (!inputRef.current?.isFocused()) return
      saveValue()
    }
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', handleKeyboardDidHide)

    return () => {
      keyboardDidHide.remove()
    }
  }, [saveValue])
  useEffect(() => {
    const newValue = String(value)
    setText(newValue)
    textRef.current = newValue
    dirtyRef.current = false
  }, [value])
  const handleSetSelectMode = (text: string) => {
    dirtyRef.current = true
    setText(text)
    textRef.current = text
  }
  return (
    <View style={styles.container}>
      <Text size={15} style={{ ...styles.label, color: sp.colors.text, fontWeight: '500' }} allowFontScaling={false}>
        {label}
      </Text>
      <View style={[styles.pill, { backgroundColor: sp.colors.surfaceElevated }]}>
        <Input
          value={text}
          accessibilityLabel={label}
          ref={inputRef}
          onChangeText={handleSetSelectMode}
          style={{ ...styles.input, color: sp.colors.text }}
          placeholderTextColor={sp.colors.textTertiary}
          selectionColor={sp.colors.accent}
          {...props}
          onBlur={saveValue}
        />
      </View>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  pill: {
    minHeight: 48,
    borderRadius: 12,
    justifyContent: 'center',
  },
  input: {
    backgroundColor: 'transparent',
    minHeight: 48,
    paddingLeft: 16,
    paddingRight: 16,
    fontSize: 15,
  },
})
