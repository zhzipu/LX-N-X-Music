import { memo, useCallback, useEffect, useRef } from 'react'
import { View } from 'react-native'
import WebView from 'react-native-webview'

import { attachAfpHost, detachAfpHost, handleAfpMessage } from '@/core/musicRecognition/afp'

/**
 * 隐藏的 WebView，只用来在本地算网易云的 AFP 指纹。
 *
 * 指纹算法是 WebAssembly，Hermes 跑不了，而 WebView 的 V8 支持 ——
 * 页面和资源在 `android/app/src/main/assets/afp/`，协议见那里的 `index.html`。
 *
 * 渲染成 1x1、不可交互，用户看不到；只要它在树上，`computeAfpFingerprint` 就能用。
 */
export default memo(() => {
  const ref = useRef<WebView>(null)

  useEffect(() => {
    attachAfpHost((payload) => {
      ref.current?.postMessage(payload)
    })
    return () => {
      detachAfpHost()
    }
  }, [])

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    handleAfpMessage(event.nativeEvent.data)
  }, [])

  return (
    <View style={styles.host} pointerEvents="none">
      <WebView
        ref={ref}
        source={{ uri: 'file:///android_asset/afp/index.html' }}
        originWhitelist={['*']}
        allowFileAccess
        javaScriptEnabled
        setSupportMultipleWindows={false}
        onMessage={onMessage}
        // 这个 WebView 只跑本地资源，禁止一切跳转
        onShouldStartLoadWithRequest={(request) => request.url.startsWith('file://')}
        onError={(event) => {
          console.log('[识曲] 指纹 WebView 加载失败：', event.nativeEvent.description)
        }}
        style={styles.webview}
      />
    </View>
  )
})

const styles = {
  host: {
    position: 'absolute' as const,
    left: 0,
    bottom: 0,
    width: 1,
    height: 1,
    overflow: 'hidden' as const,
    zIndex: -1,
  },
  webview: {
    width: 1,
    height: 1,
    backgroundColor: 'transparent',
  },
}
