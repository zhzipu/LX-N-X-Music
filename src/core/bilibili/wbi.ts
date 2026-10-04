/**
 * B 站 WBI 签名（混元算法）
 * 移植自 BBPlayer：https://github.com/bbplayer-app/BBPlayer
 *
 * 用于 /x/player/wbi/playurl 等需要 w_rid 签名的接口。
 * img_key / sub_key 从 /x/web-interface/nav 的 wbi_img 字段提取，缓存一天。
 */
import { stringMd5 } from 'react-native-quick-md5'
import { getData, saveData } from '@/plugins/storage'

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

const WBI_KEYS_STORAGE = 'bili_wbi_keys'

interface WbiKeys {
  img_key: string
  sub_key: string
  timestamp: number
}

const getMixinKey = (orig: string) =>
  mixinKeyEncTab
    .map((n) => orig[n])
    .join('')
    .slice(0, 32)

const encWbi = (params: Record<string, string | number>, imgKey: string, subKey: string): string => {
  const mixinKey = getMixinKey(imgKey + subKey)
  const wts = Math.round(Date.now() / 1000)
  const chrFilter = /[!'()*]/g
  const query = Object.keys({ ...params, wts })
    .sort()
    .map((key) => {
      const value = String(({ ...params, wts } as Record<string, string | number>)[key]).replace(
        chrFilter,
        ''
      )
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')
  const wbiSign = stringMd5(query + mixinKey)
  return `${query}&w_rid=${wbiSign}`
}

const isSameDay = (timestamp: number): boolean => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  )
}

/** 从 /nav 拉取最新的 img_key / sub_key */
const fetchWbiKeys = async (cookie: string): Promise<WbiKeys> => {
  const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    method: 'GET',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
      Referer: 'https://www.bilibili.com/',
      Cookie: cookie,
    },
    credentials: 'omit',
  })
  const body = (await response.json()) as {
    code: number
    data?: { wbi_img?: { img_url: string; sub_url: string } }
  }
  const imgUrl = body.data?.wbi_img?.img_url ?? ''
  const subUrl = body.data?.wbi_img?.sub_url ?? ''
  if (!imgUrl || !subUrl) {
    throw new Error('获取 WBI 签名密钥失败')
  }
  const imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.'))
  const subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1)
  const keys: WbiKeys = { img_key: imgKey, sub_key: subKey, timestamp: Date.now() }
  await saveData(WBI_KEYS_STORAGE, keys)
  return keys
}

/**
 * 对参数做 WBI 签名，返回可直接拼到 URL 的查询串。
 * @param params 请求参数（会自动补 wts 并算 w_rid）
 * @param cookie 用于获取 wbi 密钥（未登录也够用）
 */
export const getWbiEncodedParams = async (
  params: Record<string, string | number>,
  cookie = ''
): Promise<string> => {
  let keys: WbiKeys | null = await getData<WbiKeys>(WBI_KEYS_STORAGE)
  if (!keys || !keys.img_key || !keys.sub_key || !isSameDay(keys.timestamp)) {
    keys = await fetchWbiKeys(cookie)
  }
  return encWbi(params, keys.img_key, keys.sub_key)
}
