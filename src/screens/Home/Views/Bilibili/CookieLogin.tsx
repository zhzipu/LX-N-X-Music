import { memo, useCallback, useState } from 'react'
import { Keyboard, ScrollView, TextInput, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import { clearBiliCookie, verifyAndSaveBiliCookie } from '@/core/bilibili/auth'
import { createStyle, toast } from '@/utils/tools'
import { ErrorText, PageHeader, styles as shared } from './components'

export default memo(({ onBack }: { onBack: () => void }) => {
  const theme = useTheme()
  const savedCookie = useSettingValue('common.bili_cookie')
  const [value, setValue] = useState(savedCookie)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleSave = useCallback(async () => {
    const raw = value.trim()
    if (!raw) {
      setErrorMsg('请先粘贴 Cookie')
      return
    }
    Keyboard.dismiss()
    setErrorMsg('')
    setLoading(true)
    try {
      const user = await verifyAndSaveBiliCookie(raw)
      toast(`登录成功：${user.name}`)
    } catch (error) {
      setErrorMsg((error as Error)?.message || 'Cookie 校验失败')
    } finally {
      setLoading(false)
    }
  }, [value])

  const handleClear = useCallback(() => {
    clearBiliCookie()
    setValue('')
    setErrorMsg('')
    toast('已清除 Cookie')
  }, [])

  return (
    <View style={shared.fill}>
      <PageHeader title="添加 Cookie" onBack={onBack} />
      <ScrollView contentContainerStyle={shared.scrollContent} keyboardShouldPersistTaps="handled">
        <Text size={13} color={theme['c-font-label']}>
          粘贴一段包含 SESSDATA 的完整 Cookie 即可完成登录。
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"
          placeholderTextColor={theme['c-font-label']}
          selectionColor={theme['c-primary-light-100-alpha-300']}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          style={[
            styles.input,
            { color: theme['c-font'], borderColor: theme['c-border-background'] },
          ]}
        />
        <ErrorText>{errorMsg}</ErrorText>

        <Button
          style={{
            ...styles.submitBtn,
            backgroundColor: theme['c-button-background'],
            opacity: loading ? 0.5 : 1,
          }}
          disabled={loading}
          onPress={() => void handleSave()}
        >
          <Text color={theme['c-button-font']}>{loading ? '校验中…' : '保存并校验'}</Text>
        </Button>

        <TouchableOpacity style={styles.linkBtn} disabled={loading} onPress={handleClear}>
          <Text size={12} color={theme['c-primary-font']}>
            清除已保存的 Cookie
          </Text>
        </TouchableOpacity>

        <View style={{ ...styles.tipBox, borderTopColor: theme['c-border-background'] }}>
          <Text size={11} color={theme['c-font-label']} style={styles.tipText}>
            {'获取方式：在浏览器登录 bilibili.com 后，打开开发者工具 →'}
            {' Application → Cookies → https://www.bilibili.com，'}
            {'把 SESSDATA、bili_jct、DedeUserID 等字段拼成 name=value 的形式，用分号连接即可。'}
          </Text>
          <Text size={11} color={theme['c-font-label']} style={styles.tipText}>
            也可以直接粘贴从浏览器复制出来的整段 Cookie 字符串，保存时会自动解析去重。
          </Text>
        </View>
      </ScrollView>
    </View>
  )
})

const styles = createStyle({
  input: {
    marginTop: 16,
    minHeight: 120,
    maxHeight: 200,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  submitBtn: {
    marginTop: 20,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  tipBox: {
    marginTop: 26,
    paddingTop: 14,
    borderTopWidth: 0.5,
  },
  tipText: {
    marginBottom: 8,
    lineHeight: 17,
  },
})
