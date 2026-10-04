import { memo, useCallback, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Hero, MethodButton, styles } from './components'
import QrLogin from './QrLogin'
import PhoneLogin from './PhoneLogin'
import CookieLogin from './CookieLogin'

type LoginStep = 'home' | 'qrcode' | 'phone' | 'cookie'

/** 未登录时的入口页，三种登录方式（与 BBPlayer 的登录页一致） */
export default memo(() => {
  const [step, setStep] = useState<LoginStep>('home')

  const goHome = useCallback(() => setStep('home'), [])

  if (step === 'qrcode') return <QrLogin onBack={goHome} />
  if (step === 'phone') return <PhoneLogin onBack={goHome} />
  if (step === 'cookie') return <CookieLogin onBack={goHome} />

  return (
    <ScrollView contentContainerStyle={styles.loginContent}>
      <Hero
        title="连接 Bilibili"
        desc={'登录后可以读取收藏夹、稍后再看、上传播放记录，并访问需要账号权限的音频内容。'}
      />
      <View style={styles.loginActions}>
        <MethodButton
          icon="svg:qrcode"
          label="扫码登录"
          desc="使用 Bilibili 客户端扫码，最安全"
          primary
          onPress={() => setStep('qrcode')}
        />
        <MethodButton
          icon="svg:phone"
          label="手机号登录"
          desc="使用短信验证码登录"
          onPress={() => setStep('phone')}
        />
        <MethodButton
          icon="svg:cookie"
          label="添加 Cookie"
          desc="手动粘贴已有 Cookie"
          onPress={() => setStep('cookie')}
        />
      </View>
    </ScrollView>
  )
})
