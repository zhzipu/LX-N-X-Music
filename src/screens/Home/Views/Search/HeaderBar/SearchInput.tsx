import { useCallback, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import { View } from 'react-native'
import type { ReactNode } from 'react'
import MusicRecognition from '@/components/MusicRecognition'
import Input, { type InputType, type InputProps } from '@/components/common/Input'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'

export interface SearchInputProps {
  /** 左侧插槽：平台选择（放大镜触发） */
  left?: ReactNode
  onChangeText: (text: string) => void
  onSubmit: (text: string) => void
  onBlur: () => void
  /** 点击搜索框，带上当前输入内容（用于决定展示搜索历史还是候选） */
  onTouchStart: (text: string) => void
}

export interface SearchInputType {
  setText: (text: string) => void
  // getText: () => string
  focus: () => void
  blur: () => void
}

/** 搜索框：普通胶囊输入框（浅色填充，不再走液态玻璃） */
const SearchInput = forwardRef<SearchInputType, SearchInputProps>(
  ({ left, onChangeText, onSubmit, onBlur, onTouchStart }, ref) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)
    const [text, setText] = useState('')
    const inputRef = useRef<InputType>(null)

    useImperativeHandle(ref, () => ({
      // getText() {
      //   return text.trim()
      // },
      setText(text) {
        setText(text)
      },
      focus() {
        inputRef.current?.focus()
      },
      blur() {
        inputRef.current?.blur()
      },
    }))

    const handleChangeText = (text: string) => {
      setText(text)
      onChangeText(text.trim())
    }

    const handleClearText = useCallback(() => {
      setText('')
      onChangeText('')
      onSubmit('')
    }, [onChangeText, onSubmit])

    const handleSubmit = useCallback<NonNullable<InputProps['onSubmitEditing']>>(
      ({ nativeEvent: { text } }) => {
        onSubmit(text)
      },
      [onSubmit]
    )

    return (
      // 普通文本框（不用液态玻璃）：实心胶囊底，圆角 24，高 48
      <View style={[styles.pill, { backgroundColor: sp.colors.surfaceElevated }]}>
        <View style={styles.row}>
          {/* 放大镜 = 音乐平台选择入口 */}
          {left ?? <Icon name="search-2" size={18} color={sp.colors.textSecondary} />}
          <Input
            ref={inputRef}
            placeholder="搜索歌曲、歌手、歌单"
            placeholderTextColor={sp.colors.textTertiary}
            value={text}
            onChangeText={handleChangeText}
            style={styles.input}
            onBlur={onBlur}
            onSubmitEditing={handleSubmit}
            onClearText={handleClearText}
            onTouchStart={() => { onTouchStart(text) }}
            clearBtn
          />
          {/* 听歌识曲移到搜索框内最右侧 */}
          <MusicRecognition />
        </View>
      </View>
    )
  }
)

const SEARCH_PILL_RADIUS = 24

const styles = createStyle({
  pill: {
    flexGrow: 1,
    flexShrink: 1,
    height: 48,
    borderRadius: SEARCH_PILL_RADIUS,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
  },
  input: {
    // Input 内部会把这个 style 合并到 TextInput 上
    color: '#FFFFFF',
    height: 40,
    paddingLeft: 8,
    paddingRight: 4,
    fontSize: 15,
    backgroundColor: 'transparent',
  },
})

export default SearchInput
