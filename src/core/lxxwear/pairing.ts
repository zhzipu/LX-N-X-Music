import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * 与手表端 LX-N-XW-Music 的配对信息。
 * 协议见 LX-N-XW-Music/docs/LAN_PROTOCOL.md：
 * 手表在「配对手机」页临时开一个 HTTP 服务，手机 POST /pair 用配对码换 token。
 */
export interface WatchPairing {
  ip: string
  port: number
  token: string
  watchName: string
  pairedAt: number
}

export interface QrInfo {
  ip: string
  port: number
  code: string
}

const STORAGE_KEY = 'lxx_wear_pairing'
/** 手机上显示给手表的设备名 */
export const DEVICE_NAME = '我的手机'

export const loadPairing = async (): Promise<WatchPairing | null> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as WatchPairing
    if (!data?.ip || !data?.token) return null
    return data
  } catch {
    return null
  }
}

export const savePairing = async (pairing: WatchPairing): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pairing))
}

export const clearPairing = async (): Promise<void> => {
  await AsyncStorage.removeItem(STORAGE_KEY)
}

/**
 * 从 query 里取参数。注意第一个参数前面没有 `?` 或 `&`（调用方已经把 `?` 切掉了），
 * 所以这里必须允许行首匹配，否则 `h=` 这种开头的参数永远取不到。
 */
const readParam = (query: string, key: string): string => {
  const matched = new RegExp(`(?:^|[?&])${key}=([^&]*)`, 'i').exec(query)
  if (!matched?.[1]) return ''
  try {
    return decodeURIComponent(matched[1])
  } catch {
    return matched[1]
  }
}

/**
 * 解析手表二维码里的内容，形如 `lxnx://p?h=192.168.1.23&p=8688&c=482913`。
 * 也接受手输的 `192.168.1.23:8688` 形式（此时配对码需要另外填）。
 */
export const parseQrPayload = (text: string): QrInfo | null => {
  // 二维码里偶尔夹换行/空格（尤其是从相册识别），先清掉
  const raw = text.replace(/\s+/g, '').trim()
  if (!raw) return null

  if (raw.includes('?') || /^lxnx:/i.test(raw)) {
    const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : ''
    const ip = readParam(query, 'h')
    const port = Number(readParam(query, 'p'))
    const code = readParam(query, 'c')
    if (!ip) return null
    return { ip, port: Number.isFinite(port) && port > 0 ? port : 8688, code }
  }

  // ip:port
  const matched = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(raw)
  if (matched) {
    return { ip: matched[1], port: matched[2] ? Number(matched[2]) : 8688, code: '' }
  }
  return null
}

const describeError = (e: any): string => {
  if (e?.name === 'AbortError') return '连接超时，确认手表和手机在同一个 Wi-Fi'
  const msg = typeof e?.message === 'string' ? e.message : ''
  if (msg === 'Network request failed') return '连不上手表，检查 IP、端口和 Wi-Fi'
  return msg || '配对失败'
}

/**
 * 向手表换取 token。失败时抛出可直接展示的中文原因。
 */
export const pairWithWatch = async (
  ip: string,
  port: number,
  code: string,
  deviceToken: string
): Promise<{ token: string; watchName: string }> => {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort() }, 8000)
  try {
    let res
    try {
      res = await fetch(`http://${ip}:${port}/pair`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, deviceName: DEVICE_NAME, token: deviceToken }),
        signal: controller.signal,
      })
    } catch (e) {
      throw new Error(describeError(e))
    }

    const text = await res.text()
    let data: any = null
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }

    if (!res.ok || data?.ok !== true) {
      if (data?.error === 'wrong code') throw new Error('配对码不对，看手表屏幕上的 6 位数字')
      throw new Error(`手表返回 ${res.status}`)
    }
    if (typeof data.token !== 'string' || !data.token) throw new Error('手表没有返回 token')

    return {
      token: data.token,
      watchName: typeof data.watchName === 'string' && data.watchName
        ? data.watchName
        : '手表',
    }
  } finally {
    clearTimeout(timer)
  }
}
