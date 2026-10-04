import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Keyboard,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { verifyAndSaveBiliCookie } from '@/core/bilibili/auth'
import { loginBySms, requestCaptchaToken, sendLoginSms, type BiliCaptchaToken } from '@/core/bilibili/api'
import { ErrorText, PageHeader, styles as shared } from './components'

type Step = 'phone' | 'geetest' | 'code'

/** 中国大陆国家码 */
const COUNTRY_CODE = '86'
/** 重发验证码倒计时（秒） */
const RESEND_SECONDS = 60

const GEETEST_HTML = (gt: string, challenge: string) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-height: 100vh; background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .card { background: #fff; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); width: 90%; max-width: 340px; }
    h3 { text-align: center; margin-bottom: 16px; font-size: 16px; color: #333; }
    #err-msg { color: #d32f2f; text-align: center; margin-top: 10px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h3>请完成安全验证</h3>
    <div id="captcha"></div>
    <div id="err-msg"></div>
  </div>
  <script src="https://static.geetest.com/static/js/gt.0.4.9.js"></script>
  <script>
    initGeetest({
      gt: ${JSON.stringify(gt)},
      challenge: ${JSON.stringify(challenge)},
      offline: false,
      new_captcha: true,
      product: 'popup',
      width: '100%',
      https: true
    }, function (captchaObj) {
      captchaObj.appendTo('#captcha');
      captchaObj.onSuccess(function () {
        var r = captchaObj.getValidate();
        window.ReactNativeWebView.postMessage(JSON.stringify({
          validate: r.geetest_validate,
          seccode: r.geetest_seccode,
          challenge: r.geetest_challenge
        }));
      });
      captchaObj.onError(function () {
        document.getElementById('err-msg').textContent = '验证出错，请关闭后重试';
      });
    });
  </script>
</body>
</html>`

export default memo(({ onBack }: { onBack: () => void }) => {
  const theme = useTheme()
  const [step, setStep] = useState<Step>('phone')
  const [tel, setTel] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [captcha, setCaptcha] = useState<BiliCaptchaToken | null>(null)
  const [captchaKey, setCaptchaKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [countdown, setCountdown] = useState(0)

  /** 防止极验回调重复触发（WebView 可能多次 postMessage） */
  const submittingRef = useRef(false)

  useEffect(() => {
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  /** 第一步：手机号 -> 申请图形验证参数 */
  const handleRequestCode = useCallback(async () => {
    const value = tel.trim()
    if (!/^\d{5,15}$/.test(value)) {
      setErrorMsg('请输入正确的手机号')
      return
    }
    Keyboard.dismiss()
    setErrorMsg('')
    setLoading(true)
    try {
      const token = await requestCaptchaToken()
      if (!token.gt || !token.challenge) throw new Error('获取图形验证参数失败')
      setCaptcha(token)
      setStep('geetest')
    } catch (error) {
      setErrorMsg((error as Error)?.message || '获取图形验证参数失败')
    } finally {
      setLoading(false)
    }
  }, [tel])

  /** 第二步：极验通过 -> 发送短信 */
  const handleGeetestMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      if (!captcha || submittingRef.current) return
      let parsed: { validate?: string; seccode?: string; challenge?: string }
      try {
        parsed = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }
      const { validate, seccode, challenge } = parsed
      if (!validate || !seccode || !challenge) return

      submittingRef.current = true
      setLoading(true)
      try {
        const key = await sendLoginSms({
          tel: tel.trim(),
          cid: COUNTRY_CODE,
          token: captcha.token,
          challenge,
          validate,
          seccode,
        })
        setCaptchaKey(key)
        setStep('code')
        setCountdown(RESEND_SECONDS)
        setErrorMsg('')
        toast('验证码已发送')
      } catch (error) {
        const message = (error as Error)?.message || '发送验证码失败'
        setErrorMsg(message)
        setStep('phone')
        toast(message, 'long')
      } finally {
        submittingRef.current = false
        setLoading(false)
      }
    },
    [captcha, tel]
  )

  /** 第三步：短信验证码登录 */
  const handleLogin = useCallback(async () => {
    if (!/^\d{4,8}$/.test(smsCode.trim())) {
      setErrorMsg('请输入正确的验证码')
      return
    }
    Keyboard.dismiss()
    setErrorMsg('')
    setLoading(true)
    try {
      const rawCookies = await loginBySms({
        tel: tel.trim(),
        cid: COUNTRY_CODE,
        code: smsCode.trim(),
        captchaKey,
      })
      await verifyAndSaveBiliCookie(rawCookies)
      toast('登录成功')
    } catch (error) {
      setErrorMsg((error as Error)?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }, [captchaKey, smsCode, tel])

  const inputStyle = [styles.input, { color: theme['c-font'], borderColor: theme['c-border-background'] }]

  return (
    <View style={shared.fill}>
      <PageHeader title="手机号登录 Bilibili" onBack={onBack} />
      <ScrollView contentContainerStyle={shared.scrollContent} keyboardShouldPersistTaps="handled">
        {step === 'code' ? (
          <>
            <Text size={13} color={theme['c-font-label']}>
              验证码已发送至 {tel}
            </Text>
            <TextInput
              value={smsCode}
              onChangeText={setSmsCode}
              placeholder="请输入短信验证码"
              placeholderTextColor={theme['c-font-label']}
              selectionColor={theme['c-primary-light-100-alpha-300']}
              keyboardType="number-pad"
              maxLength={8}
              style={[...inputStyle, styles.codeInput]}
            />
            <ErrorText>{errorMsg}</ErrorText>
            <Button
              style={{
                ...styles.submitBtn,
                backgroundColor: theme['c-button-background'],
                opacity: loading ? 0.5 : 1,
              }}
              disabled={loading}
              onPress={() => void handleLogin()}
            >
              <Text color={theme['c-button-font']}>{loading ? '登录中…' : '登录'}</Text>
            </Button>
            <TouchableOpacity
              style={styles.linkBtn}
              disabled={loading}
              onPress={() => {
                setStep('phone')
                setErrorMsg('')
              }}
            >
              <Text size={12} color={theme['c-primary-font']}>
                换个手机号 / 重新获取验证码
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text size={13} color={theme['c-font-label']}>
              {'登录后可以读取收藏夹、稍后再看，并访问需要账号权限的音频内容。'}
            </Text>
            <TextInput
              value={tel}
              onChangeText={setTel}
              placeholder="请输入手机号"
              placeholderTextColor={theme['c-font-label']}
              selectionColor={theme['c-primary-light-100-alpha-300']}
              keyboardType="number-pad"
              maxLength={15}
              style={inputStyle}
            />
            <ErrorText>{errorMsg}</ErrorText>
            <Button
              style={{
                ...styles.submitBtn,
                backgroundColor: theme['c-button-background'],
                opacity: loading ? 0.5 : 1,
              }}
              disabled={loading}
              onPress={() => void handleRequestCode()}
            >
              <Text color={theme['c-button-font']}>
                {loading ? '加载中…' : countdown > 0 ? `重新获取 (${countdown}s)` : '获取验证码'}
              </Text>
            </Button>
            <Text style={styles.hint} size={11} color={theme['c-font-label']}>
              获取验证码前需要完成一次 B 站的安全验证（极验），成功后短信会发送到你的手机。
            </Text>
          </>
        )}
      </ScrollView>

      {step === 'geetest' && captcha ? (
        <View style={[styles.geetestOverlay, { backgroundColor: theme['c-content-background'] }]}>
          <View style={{ ...styles.geetestHeader, borderBottomColor: theme['c-border-background'] }}>
            <Text style={styles.geetestTitle}>安全验证</Text>
            <TouchableOpacity
              onPress={() => {
                setStep('phone')
                setCaptcha(null)
              }}
            >
              <Text size={13} color={theme['c-primary-font']}>
                取消
              </Text>
            </TouchableOpacity>
          </View>
          <WebView
            style={shared.fill}
            source={{ html: GEETEST_HTML(captcha.gt, captcha.challenge), baseUrl: 'https://www.bilibili.com' }}
            onMessage={(event) => void handleGeetestMessage(event)}
            javaScriptEnabled
            originWhitelist={['*']}
            mixedContentMode="always"
            startInLoadingState
          />
        </View>
      ) : null}
    </View>
  )
})

const styles = createStyle({
  input: {
    marginTop: 18,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    fontSize: 14,
  },
  codeInput: {
    letterSpacing: 4,
  },
  submitBtn: {
    marginTop: 22,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  hint: {
    marginTop: 16,
    lineHeight: 18,
  },
  geetestOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  geetestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  geetestTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
})
