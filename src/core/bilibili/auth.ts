import { updateSetting } from '@/core/common'
import settingState from '@/store/setting/state'
import { requestUserInfo, type BiliUserInfo } from './api'

/** 存放 B 站 Cookie 的设置项，与 common.wy_cookie / common.yt_cookie 同一套风格 */
export const BILI_COOKIE_KEY = 'common.bili_cookie' as const

/** 登录态必需字段，缺一个就不是有效登录 */
const REQUIRED_COOKIE_KEYS = ['SESSDATA']

export const getBiliCookie = (): string => settingState.setting[BILI_COOKIE_KEY] ?? ''

export const saveBiliCookie = (cookie: string) => {
  updateSetting({ 'common.bili_cookie': cookie })
}

export const clearBiliCookie = () => {
  saveBiliCookie('')
}

/**
 * 判断 Cookie 是否处于登录态。
 * 只做本地字段校验，不联网；真正的有效性由 requestUserInfo 兜底。
 */
export const isBiliLoggedIn = (cookie?: string): boolean => {
  const value = cookie ?? getBiliCookie()
  if (!value) return false
  return REQUIRED_COOKIE_KEYS.every((key) => new RegExp(`(^|;\\s*)${key}=[^;]`).test(value))
}

/**
 * 拆 Set-Cookie 头。
 * RN 会把多个 Set-Cookie 用 ", " 拼成一个头，而 Expires 里本身也含逗号
 * （如 `Expires=Wed, 21 Oct 2026 07:28:00 GMT`），所以不能直接 split(',')。
 * 这里只在「逗号后面紧跟 name=」的位置切分。
 */
const splitSetCookieHeader = (header: string): string[] => {
  if (!header) return []
  return header
    .split(/,(?=\s*[^;=,\s]+=)/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

/** 把 Cookie 串解析成键值对，兼容 "a=1; b=2" 与 Set-Cookie 那种带属性的格式 */
export const parseBiliCookie = (raw: string): Record<string, string> => {
  const result: Record<string, string> = {}
  if (!raw) return result
  // Set-Cookie 里含 Expires/Max-Age 等属性，且多个 Cookie 用逗号连接，需要先按逗号拆
  const chunks = /\b(?:expires|max-age|path|domain|httponly|secure|samesite)=/i.test(raw)
    ? splitSetCookieHeader(raw)
    : raw.split(/[;\r\n]+/)
  for (const chunk of chunks) {
    const pair = chunk.trim().split(';')[0]
    if (!pair) continue
    const index = pair.indexOf('=')
    if (index <= 0) continue
    const name = pair.slice(0, index).trim()
    const value = pair.slice(index + 1).trim()
    if (!name) continue
    result[name] = value
  }
  return result
}

/** 把键值对还原成 Cookie 串 */
export const stringifyBiliCookie = (cookie: Record<string, string>): string =>
  Object.entries(cookie)
    .filter(([name, value]) => name && value != null && value !== '')
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

/**
 * 归一化一段 Cookie：
 * 先按 Set-Cookie 的多条格式拆分，再逐条解析成键值对，最后合并去重。
 */
export const normalizeBiliCookie = (raw: string): string => {
  const merged: Record<string, string> = {}
  for (const line of splitSetCookieHeader(raw)) {
    Object.assign(merged, parseBiliCookie(line))
  }
  return stringifyBiliCookie(merged)
}

/**
 * 合并新 Cookie 到已有 Cookie 上（后写入的覆盖同名项）
 * @param raw 新增的 Cookie（整段 Set-Cookie 或普通 Cookie 串）
 * @param base 已有的 Cookie，默认取设置里保存的
 */
export const mergeBiliCookie = (raw: string, base = getBiliCookie()): string => {
  const incoming = normalizeBiliCookie(raw)
  if (!incoming) return base
  const merged: Record<string, string> = {
    ...(base ? parseBiliCookie(base) : {}),
    ...parseBiliCookie(incoming),
  }
  return stringifyBiliCookie(merged)
}

/** 联网校验 Cookie 并取用户资料；无效返回 null */
export const fetchBiliUserInfo = async (cookie = getBiliCookie()): Promise<BiliUserInfo | null> => {
  if (!cookie) return null
  return requestUserInfo(cookie)
}

/**
 * 校验并保存 Cookie（用于扫码 / 短信 / 手动粘贴的统一入口）
 * @returns 校验通过返回用户资料，否则抛出错误
 */
export const verifyAndSaveBiliCookie = async (raw: string): Promise<BiliUserInfo> => {
  const cookie = mergeBiliCookie(raw)
  if (!isBiliLoggedIn(cookie)) {
    throw new Error('Cookie 中缺少 SESSDATA，请确认已登录 B 站')
  }
  const userInfo = await fetchBiliUserInfo(cookie)
  if (!userInfo) {
    throw new Error('Cookie 校验失败，可能已失效，请重新登录')
  }
  saveBiliCookie(cookie)
  return userInfo
}
