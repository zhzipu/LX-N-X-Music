import AsyncStorage from '@react-native-async-storage/async-storage'
import { loadPairing } from './pairing'

/**
 * 手机自己这一侧的局域网凭据。
 *
 * token 的权威来源必须是手机：手表只在配对时收下并保存，之后拿它校验广播和请求。
 * 以前 token 由手表生成、手机只是存下来，手机重装后两边就会永久错位
 * （配对看起来成功，但广播全被手表当外人丢掉，同步一动不动）。
 */

const STORAGE_KEY = 'lxx_wear_device_token'

let cached = ''

const randomToken = (): string => {
  let out = ''
  for (let i = 0; i < 32; i++) out += '0123456789abcdef'[Math.floor(Math.random() * 16)]
  return out
}

export const getDeviceToken = async (): Promise<string> => {
  if (cached) return cached
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY)
    if (saved) {
      cached = saved
      return cached
    }
  } catch {}
  // 兼容已经配对过的机器：沿用当初配对拿到的 token，手表那边就不用重新配对
  const pairing = await loadPairing()
  cached = pairing?.token || randomToken()
  try {
    await AsyncStorage.setItem(STORAGE_KEY, cached)
  } catch {}
  return cached
}
