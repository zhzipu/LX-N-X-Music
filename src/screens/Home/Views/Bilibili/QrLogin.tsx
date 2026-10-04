import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, TouchableOpacity, View } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { createStyle, openUrl, toast } from '@/utils/tools'
import { verifyAndSaveBiliCookie } from '@/core/bilibili/auth'
import { pollLoginQrCode, QR_STATUS, requestLoginQrCode } from '@/core/bilibili/api'
import { Card, ErrorText, PageHeader, styles as shared } from './components'

type Status = 'generating' | 'polling' | 'scanned' | 'expired' | 'error' | 'success'

const POLL_INTERVAL = 2000
/** 二维码有效期按 3 分钟算，超时后自行作废 */
const EXPIRE_MS = 3 * 60 * 1000

export default memo(({ onBack }: { onBack: () => void }) => {
  const theme = useTheme()
  const [status, setStatus] = useState<Status>('generating')
  const [statusText, setStatusText] = useState('正在生成二维码…')
  const [qrUrl, setQrUrl] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  /** 每次生成二维码自增，用于让还在飞的轮询结果自动作废 */
  const sessionRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const generate = useCallback(async () => {
    stopPolling()
    const session = ++sessionRef.current
    setStatus('generating')
    setStatusText('正在生成二维码…')
    setErrorMsg('')
    setQrUrl('')

    const deadline = Date.now() + EXPIRE_MS

    const startPolling = (qrcodeKey: string) => {
      const poll = async () => {
        if (session !== sessionRef.current) return
        if (Date.now() > deadline) {
          setStatus('expired')
          setStatusText('二维码已过期')
          return
        }
        let result: { status: number; rawCookies: string }
        try {
          result = await pollLoginQrCode(qrcodeKey)
        } catch {
          // 单次轮询失败不打断整体流程，继续下一轮
          timerRef.current = setTimeout(poll, POLL_INTERVAL)
          return
        }
        if (session !== sessionRef.current) return

        switch (result.status) {
          case QR_STATUS.SUCCESS: {
            stopPolling()
            setStatus('success')
            setStatusText('登录成功')
            try {
              await verifyAndSaveBiliCookie(result.rawCookies)
              toast('登录成功')
            } catch (error) {
              setStatus('error')
              setStatusText('保存登录信息失败')
              setErrorMsg((error as Error)?.message || '保存登录信息失败')
            }
            return
          }
          case QR_STATUS.SCANNED:
            setStatus('scanned')
            setStatusText('已扫码，请在手机上确认')
            break
          case QR_STATUS.EXPIRED:
            setStatus('expired')
            setStatusText('二维码已过期')
            return
          default:
            setStatus('polling')
            setStatusText('等待扫码')
            break
        }
        timerRef.current = setTimeout(poll, POLL_INTERVAL)
      }
      timerRef.current = setTimeout(poll, POLL_INTERVAL)
    }

    try {
      const qrCode = await requestLoginQrCode()
      if (session !== sessionRef.current) return
      setQrUrl(qrCode.url)
      setStatus('polling')
      setStatusText('等待扫码')
      startPolling(qrCode.qrcodeKey)
    } catch (error) {
      if (session !== sessionRef.current) return
      setStatus('error')
      setErrorMsg((error as Error)?.message || '获取二维码失败')
      setStatusText('获取二维码失败')
    }
  }, [stopPolling])

  useEffect(() => {
    void generate()
    return () => {
      // 离开页面时让所有在飞的请求结果作废
      sessionRef.current++
      stopPolling()
    }
  }, [generate, stopPolling])

  const showOverlay = status === 'expired' || status === 'error'
  const dotColor =
    status === 'success'
      ? '#4CAF50'
      : status === 'scanned'
        ? '#4CAF50'
        : status === 'expired' || status === 'error'
          ? '#E53935'
          : status === 'polling'
            ? '#FFB300'
            : theme['c-primary-font']

  return (
    <View style={shared.fill}>
      <PageHeader title="扫码登录 Bilibili" onBack={onBack} />
      <View style={styles.body}>
        <Card style={styles.card}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            <Text size={13}>{statusText}</Text>
          </View>

          <View style={styles.qrWrap}>
            {qrUrl ? (
              <Pressable onPress={() => void openUrl(qrUrl)} style={styles.qrPressable}>
                <QRCode value={qrUrl} size={190} backgroundColor="#FFFFFF" color="#000000" />
              </Pressable>
            ) : (
              <Text size={12} color={theme['c-font-label']}>
                二维码生成中…
              </Text>
            )}

            {showOverlay ? (
              <View style={styles.qrOverlay}>
                <Icon name="available_updates" size={34} color="#FFFFFF" />
                <Text style={styles.qrOverlayText}>
                  {status === 'expired' ? '二维码已失效' : '获取失败'}
                </Text>
                <Button
                  style={{ ...styles.refreshBtn, backgroundColor: theme['c-button-background'] }}
                  onPress={() => void generate()}
                >
                  <Text color={theme['c-button-font']}>刷新二维码</Text>
                </Button>
              </View>
            ) : null}
          </View>

          <ErrorText>{showOverlay ? errorMsg : ''}</ErrorText>
        </Card>

        {qrUrl ? (
          <TouchableOpacity style={styles.openBtn} onPress={() => void openUrl(qrUrl)}>
            <Text size={12} color={theme['c-primary-font']}>
              在 Bilibili 客户端中打开
            </Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.hint} size={11} color={theme['c-font-label']}>
          请使用 Bilibili 客户端扫描上方二维码完成登录。
          {'\n'}二维码 3 分钟内有效，过期后点「刷新二维码」重新获取。
        </Text>
      </View>
    </View>
  )
})

const styles = createStyle({
  body: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  card: {
    alignSelf: 'stretch',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  qrWrap: {
    width: 210,
    height: 210,
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPressable: {
    padding: 10,
  },
  qrOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  qrOverlayText: {
    marginTop: 8,
    marginBottom: 12,
    color: '#FFFFFF',
  },
  refreshBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
  },
  openBtn: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hint: {
    marginTop: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
})
