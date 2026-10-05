/**
 * Bilibili 登录相关接口（passport + 用户信息）
 * 参考 BBPlayer 的实现：https://github.com/bbplayer-app/BBPlayer
 *
 * 注意：
 * - 所有请求都带 `credentials: 'omit'`，目的是绕开 RN 原生 CookieJar。
 *   否则 OkHttp 会用 jar 里的 Cookie 覆盖我们显式传入的 Cookie 头（/nav 必需）。
 *   QR 登录需要的 Set-Cookie 直接从响应头里读。
 * - passport 接口对 UA / Referer / Origin 比较敏感，缺了容易被风控。
 */

import { stringMd5 } from 'react-native-quick-md5'
import { getWbiEncodedParams } from './wbi'
import { getData, saveData } from '@/plugins/storage'

const PASSPORT_BASE = 'https://passport.bilibili.com'
const API_BASE = 'https://api.bilibili.com'
/** App 接口域名：空间/作品等接口必须走这里，api.bilibili.com 的 app 接口会被 WAF 拦成 HTML */
const APP_BASE = 'https://app.bilibili.com'

/** passport 接口使用的 User-Agent（与 B 站 App 对齐，降低风控概率） */
export const BILI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0'

const baseHeaders: Record<string, string> = {
  'User-Agent': BILI_UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
}

/** App 接口（app.bilibili.com）使用的 BiliDroid UA */
const BILI_APP_UA =
  'Mozilla/5.0 BiliDroid/7.63.0 (bbcallen@gmail.com) os/android model/Pixel mobi_app/android build/7630300 channel/bili innerVer/7630300 osVer/13 network/2'

/** App 接口签名用的 appkey / appsec（B 站 Android 客户端公开常量） */
const BILI_APPKEY = '1d8b6e7d45233436'
const BILI_APPSEC = '560c52ccd288fed045859ed18bffd973'

/**
 * App 接口签名：参数按 key 升序拼接成 query，再 md5(query + appsec)，结果作为 `sign` 附加。
 *
 * 为什么空间接口走 App 而不是 web：
 * B 站 web 的 `/x/space/wbi/arc/search`、`/x/space/wbi/acc/info` 对**未登录 + App 环境**
 * 风控极严，部分账号（尤其 16 位新创作号，如 mid=3706926166706979）直接返回 HTTP 412 / -352。
 * 而 app.bilibili.com 的 `/x/v2/space`、`/x/v2/space/archive` 不触发该风控，未登录即可稳定返回。
 */
const signAppQuery = (params: Record<string, string | number>): string => {
  const keys = Object.keys(params).sort()
  const query = keys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(params[k]))}`)
    .join('&')
  return `${query}&sign=${stringMd5(query + BILI_APPSEC)}`
}

/** 构造 App 接口的通用参数（含 appkey / 平台 / 时间戳） */
const appCommonParams = (): Record<string, string> => ({
  mobi_app: 'android',
  platform: 'android',
  build: '7630300',
  ts: String(Math.round(Date.now() / 1000)),
  appkey: BILI_APPKEY,
})

/**
 * 归一化 B 站图片 URL：
 *  - `//i0.hdslb.com/...` 补 `https:` 前缀
 *  - `http://i0.hdslb.com/...` 明文转 `https://`（Android 默认禁明文 HTTP，否则封面加载失败显示灰底）
 */
export const normalizeBiliImageUrl = (url?: string | null): string => {
  if (!url) return ''
  if (url.startsWith('//')) return `https:${url}`
  if (url.startsWith('http://')) return `https://${url.slice(7)}`
  return url
}

export class BiliApiError extends Error {
  code: number
  constructor(message: string, code = 0) {
    super(message)
    this.name = 'BiliApiError'
    this.code = code
  }
}

interface BiliEnvelope<T> {
  code: number
  message?: string
  data: T
}

const requireOk = async <T>(response: Response, what: string): Promise<BiliEnvelope<T>> => {
  if (!response.ok) {
    throw new BiliApiError(`${what}失败：HTTP ${response.status} ${response.statusText}`, response.status)
  }
  let body: BiliEnvelope<T>
  try {
    body = (await response.json()) as BiliEnvelope<T>
  } catch {
    throw new BiliApiError(`${what}失败：响应不是合法 JSON`)
  }
  if (body.code !== 0) {
    // 带上接口名与 code：B 站很多错误只有一句笼统的「请求错误」，光靠 message 无法定位
    throw new BiliApiError(`${what}失败（${body.code}）：${body.message || '未知错误'}`, body.code)
  }
  return body
}

const formBody = (data: Record<string, string>) =>
  Object.entries(data)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')

// ---------------------------------------------------------------- 扫码登录

export interface BiliQrCode {
  url: string
  qrcodeKey: string
}

/** 二维码登录状态码 */
export const QR_STATUS = {
  SUCCESS: 0,
  /** 未扫码，等待扫码 */
  WAIT: 86101,
  /** 已扫码，等待用户确认 */
  SCANNED: 86090,
  /** 二维码已过期 */
  EXPIRED: 86038,
} as const

export interface BiliQrCodePollResult {
  status: number
  /** 整段 Set-Cookie（多行以 ', ' 连接），仅在 status 为 SUCCESS 时非空 */
  rawCookies: string
}

/** 申请登录二维码 */
export const requestLoginQrCode = async (): Promise<BiliQrCode> => {
  const response = await fetch(`${PASSPORT_BASE}/x/passport-login/web/qrcode/generate`, {
    method: 'GET',
    headers: baseHeaders,
    credentials: 'omit',
  })
  const body = await requireOk<{ url: string; qrcode_key: string }>(response, '获取登录二维码')
  return { url: body.data.url, qrcodeKey: body.data.qrcode_key }
}

/**
 * 轮询二维码登录状态
 * @param qrcodeKey requestLoginQrCode 返回的 qrcode_key
 */
export const pollLoginQrCode = async (qrcodeKey: string): Promise<BiliQrCodePollResult> => {
  const response = await fetch(
    `${PASSPORT_BASE}/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    {
      method: 'GET',
      headers: baseHeaders,
      credentials: 'omit',
    }
  )
  if (!response.ok) {
    throw new BiliApiError(`查询扫码状态失败：HTTP ${response.status}`, response.status)
  }
  const body = (await response.json()) as BiliEnvelope<{ code: number }>
  if (body.code !== 0) {
    throw new BiliApiError(body.message || `查询扫码状态失败（code ${body.code}）`, body.code)
  }
  const status = body.data?.code ?? QR_STATUS.WAIT
  return {
    status,
    rawCookies: status === QR_STATUS.SUCCESS ? (response.headers.get('set-cookie') ?? '') : '',
  }
}

// ---------------------------------------------------------------- 手机号登录

export interface BiliCaptchaToken {
  /** 图形验证 token，发短信时要回传 */
  token: string
  gt: string
  challenge: string
}

/** 获取极验（geetest）图形验证参数 */
export const requestCaptchaToken = async (): Promise<BiliCaptchaToken> => {
  const response = await fetch(
    `${PASSPORT_BASE}/x/passport-login/captcha?source=main_web&t=${Date.now()}`,
    {
      method: 'GET',
      headers: baseHeaders,
      credentials: 'omit',
    }
  )
  const body = await requireOk<{
    token: string
    geetest?: { gt: string; challenge: string }
  }>(response, '获取图形验证参数')
  return {
    token: body.data.token,
    gt: body.data?.geetest?.gt ?? '',
    challenge: body.data?.geetest?.challenge ?? '',
  }
}

/** 极验验证通过后拿到的凭据 */
export interface BiliCaptchaResult {
  challenge: string
  validate: string
  seccode: string
}

/** 发送短信验证码，返回后续登录要用的 captcha_key */
export const sendLoginSms = async (
  params: { tel: string; cid: string; token: string } & BiliCaptchaResult
): Promise<string> => {
  const response = await fetch(`${PASSPORT_BASE}/x/passport-login/web/sms/send`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      cid: params.cid,
      tel: params.tel,
      source: 'main_mini_login',
      token: params.token,
      challenge: params.challenge,
      validate: params.validate,
      seccode: params.seccode,
    }),
    credentials: 'omit',
  })
  const body = await requireOk<{ captcha_key: string }>(response, '发送短信验证码')
  return body.data.captcha_key
}

/** 短信验证码登录，返回整段 Set-Cookie */
export const loginBySms = async (params: {
  tel: string
  cid: string
  code: string
  captchaKey: string
}): Promise<string> => {
  const response = await fetch(`${PASSPORT_BASE}/x/passport-login/web/login/sms`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody({
      cid: params.cid,
      tel: params.tel,
      code: params.code,
      source: 'main_mini_login',
      captcha_key: params.captchaKey,
      keep: '1',
    }),
    credentials: 'omit',
  })
  await requireOk<unknown>(response, '短信验证码登录')
  return response.headers.get('set-cookie') ?? ''
}

// ---------------------------------------------------------------- 用户信息

export interface BiliUserInfo {
  mid: number
  name: string
  face: string
  /** 是否大会员 */
  vip: boolean
}

/** 读取当前登录用户资料，未登录/失效返回 null */
export const requestUserInfo = async (cookie: string): Promise<BiliUserInfo | null> => {
  const response = await fetch(`${API_BASE}/x/web-interface/nav`, {
    method: 'GET',
    headers: {
      ...baseHeaders,
      Cookie: cookie,
    },
    credentials: 'omit',
  })
  if (!response.ok) return null
  const body = (await response.json()) as BiliEnvelope<{
    isLogin: boolean
    mid: number
    uname: string
    face: string
    vipStatus?: number
  }>
  if (body.code !== 0 || !body.data?.isLogin) return null
  return {
    mid: body.data.mid,
    name: body.data.uname,
    face: body.data.face,
    vip: (body.data.vipStatus ?? 0) === 1,
  }
}

// ---------------------------------------------------------------- 收藏夹 / 合集

/** 收藏夹（创建的） */
export interface BiliFavoriteFolder {
  id: number
  title: string
  media_count: number
  /** 前 4 个视频封面（用于田字拼图图标） */
  covers?: string[]
}

/** 合集 / 追更（收藏的别人收藏夹或追更视频合集） */
export interface BiliCollectedFolder {
  id: number
  title: string
  cover: string
  upper: { mid: number; name: string }
  media_count: number
  /** 0: 追更视频合集（用 season/list）；22: 关注的别人收藏夹（用 resource/list）；1: 已失效 */
  attr: number
  /** 0: 正常；1: 已失效 */
  state: number
}

/**
 * 获取当前用户创建的收藏夹列表
 * @param mid 用户 mid（来自 /nav）
 */
export const getFavoriteFolders = async (mid: number, cookie: string): Promise<BiliFavoriteFolder[]> => {
  const response = await fetch(`${API_BASE}/x/v3/fav/folder/created/list-all?up_mid=${mid}`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: cookie },
    credentials: 'omit',
  })
  const body = await requireOk<{ list: BiliFavoriteFolder[] | null }>(response, '获取收藏夹列表')
  return body.data?.list ?? []
}

/** 合集列表接口返回 */
export interface BiliCollectedResult {
  list: BiliCollectedFolder[]
  count: number
  hasMore: boolean
}

/**
 * 获取当前用户收藏的合集 / 追更列表
 * @param mid 用户 mid（来自 /nav）
 */
export const getCollectedFolders = async (
  mid: number,
  cookie: string,
  pn = 1
): Promise<BiliCollectedResult> => {
  const response = await fetch(
    `${API_BASE}/x/v3/fav/folder/collected/list?pn=${pn}&ps=20&up_mid=${mid}&platform=web`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{
    list: BiliCollectedFolder[] | null
    count: number
    has_more: boolean
  }>(response, '获取合集列表')
  return {
    list: body.data?.list ?? [],
    count: body.data?.count ?? 0,
    hasMore: body.data?.has_more ?? false,
  }
}

// ---------------------------------------------------------------- 收藏 / 关注（写操作）

/**
 * 读取 Cookie 里某个键的值。
 *
 * 写接口统一要求的 CSRF token 就在 Cookie 的 `bili_jct` 里，缺了会返回 -111。
 * 这里自己解析而不复用 auth.ts 的 parseBiliCookie：auth.ts 已经 import 本模块，
 * 反向再 import 会形成循环依赖。
 */
const readCookieValue = (cookie: string, name: string): string => {
  const matched = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return matched ? matched[1] : ''
}

/** 当前 Cookie 是否具备写操作能力（扫码/网页登录都会带 bili_jct，手动只填 SESSDATA 则没有） */
export const hasBiliCsrf = (cookie: string): boolean => !!readCookieValue(cookie, 'bili_jct')

/** 收藏的视频/合集统一放进的收藏夹名 */
export const BILI_MUSIC_FOLDER_NAME = '音乐'

/** POST 表单请求（自动附加 csrf） */
const postForm = async <T>(
  path: string,
  params: Record<string, string>,
  cookie: string,
  what: string
): Promise<BiliEnvelope<T>> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    body: formBody({ ...params, csrf: readCookieValue(cookie, 'bili_jct') }),
    credentials: 'omit',
  })
  return requireOk<T>(response, what)
}

/**
 * 找到「音乐」收藏夹，没有则创建，返回收藏夹 id（fid）。
 *
 * B 站规定每个账号必须保留一个默认收藏夹，所以正常情况下至少能拿到一个；
 * 这里按标题精确匹配，避免把已有收藏混进别的夹子里。
 */
export const ensureMusicFavoriteFolder = async (mid: number, cookie: string): Promise<number> => {
  const folders = await getFavoriteFolders(mid, cookie)
  const existed = folders.find((f) => f.title.trim() === BILI_MUSIC_FOLDER_NAME)
  if (existed) return existed.id
  const body = await postForm<{ id: number }>(
    '/x/v3/fav/folder/add',
    { title: BILI_MUSIC_FOLDER_NAME, privacy: '0', intro: '' },
    cookie,
    '创建「音乐」收藏夹'
  )
  const id = body.data?.id
  if (!id) throw new BiliApiError('创建「音乐」收藏夹失败：接口未返回收藏夹 id')
  return id
}

/** 收藏资源类型：2=视频（稿件），21=合集（season） */
export const BILI_FAV_TYPE_VIDEO = 2
export const BILI_FAV_TYPE_SEASON = 21

/**
 * 收藏 / 取消收藏一个资源到指定收藏夹。
 * @param rid 资源 id（视频传 avid 或 bvid，合集传 season_id）
 * @param type 资源类型，见 BILI_FAV_TYPE_*
 * @param folderId 目标收藏夹 id
 * @param add true=收藏，false=取消收藏
 */
export const dealFavoriteResource = async (
  rid: number | string,
  type: number,
  folderId: number,
  add: boolean,
  cookie: string
): Promise<void> => {
  await postForm<unknown>(
    '/x/v3/fav/resource/deal',
    {
      rid: String(rid),
      type: String(type),
      add_media_ids: add ? String(folderId) : '',
      del_media_ids: add ? '' : String(folderId),
    },
    cookie,
    add ? '收藏' : '取消收藏'
  )
}

/** 关注来源标识：web 端固定 11（空间页），缺了容易被风控 */
const RELATION_SOURCE = '11'

/**
 * 关注 / 取关 UP 主。
 * @param fid 目标用户 mid
 * @param follow true=关注，false=取消关注
 */
export const modifyBiliRelation = async (
  fid: number,
  follow: boolean,
  cookie: string
): Promise<void> => {
  await postForm<unknown>(
    '/x/relation/modify',
    { fid: String(fid), act: follow ? '1' : '2', re_src: RELATION_SOURCE },
    cookie,
    follow ? '关注 UP 主' : '取消关注'
  )
}

// ---------------------------------------------------------------- 详情 / 音频流

/** 根据 bvid 生成 B 站视频网页地址 */
export const getBiliVideoUrl = (bvid: string): string => `https://www.bilibili.com/video/${bvid}`

/** 收藏夹 / 合集里的单个视频 */
export interface BiliMediaItem {
  /** avid */
  id: number
  bvid: string
  title: string
  cover: string
  duration: number
  upper: { mid: number; name: string }
  /** 位标志，attr & 1 表示已失效（失效视频应被过滤掉） */
  attr: number
}

/**
 * 获取收藏夹内容（分页）
 * @param favoriteId 收藏夹 id
 */
export const getFavoriteContents = async (
  favoriteId: number,
  cookie: string,
  pn = 1
): Promise<{ list: BiliMediaItem[]; hasMore: boolean }> => {
  const response = await fetch(
    `${API_BASE}/x/v3/fav/resource/list?media_id=${favoriteId}&pn=${pn}&ps=40&platform=web`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{
    medias: {
      id: number
      bvid: string
      title: string
      cover: string
      duration: number
      upper: { mid: number; name: string }
      attr: number
    }[] | null
    has_more: boolean
  }>(response, '获取收藏夹内容')
  const list: BiliMediaItem[] = (body.data?.medias ?? [])
    .filter((m) => !(m.attr & 1)) // 过滤已失效视频
    .map((m) => ({
      id: m.id,
      bvid: m.bvid,
      title: m.title,
      cover: m.cover,
      duration: m.duration,
      upper: m.upper,
      attr: m.attr,
    }))
  return { list, hasMore: body.data?.has_more ?? false }
}

/**
 * 获取某个收藏夹前 4 个视频封面（用于列表的田字拼图图标）。
 * 单独接口，只取第一页 4 个，避免拉全量。
 */
export const getFavoriteFolderCovers = async (
  favoriteId: number,
  cookie: string
): Promise<string[]> => {
  try {
    const response = await fetch(
      `${API_BASE}/x/v3/fav/resource/list?media_id=${favoriteId}&pn=1&ps=4&platform=web`,
      {
        method: 'GET',
        headers: { ...baseHeaders, Cookie: cookie },
        credentials: 'omit',
      }
    )
    const body = await requireOk<{
      medias: { cover: string; attr: number }[] | null
    }>(response, '获取收藏夹封面')
    return (body.data?.medias ?? [])
      .filter((m) => !(m.attr & 1))
      .map((m) => m.cover)
      .slice(0, 4)
  } catch {
    // 封面拿不到不影响列表主流程，返回空数组走默认图标
    return []
  }
}

/**
 * 获取合集内容（分页）
 * @param collectionId 合集 id
 */
export const getCollectionContents = async (
  collectionId: number,
  cookie: string,
  pn = 1
): Promise<{ list: BiliMediaItem[]; hasMore: boolean }> => {
  const response = await fetch(
    `${API_BASE}/x/space/fav/season/list?season_id=${collectionId}&ps=20&pn=${pn}`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{
    medias: {
      id: number
      bvid: string
      title: string
      cover: string
      duration: number
      upper: { mid: number; name: string }
      attr: number
    }[] | null
    has_more: boolean
  }>(response, '获取合集内容')
  const list: BiliMediaItem[] = (body.data?.medias ?? [])
    .filter((m) => !(m.attr & 1)) // 过滤已失效视频
    .map((m) => ({
      id: m.id,
      bvid: m.bvid,
      title: m.title,
      cover: m.cover,
      duration: m.duration,
      upper: m.upper,
      attr: m.attr,
    }))
  return { list, hasMore: body.data?.has_more ?? false }
}

// ---------------------------------------------------------------- 搜索

/** 搜索结果里的单个视频 */
export interface BiliSearchVideo {
  /** avid（收藏接口按 avid 收藏，缺失会导致 -400） */
  aid: number
  bvid: string
  title: string
  author: string
  mid: number
  pic: string
  /** 时长，字符串格式如 "222:28"（分:秒）或 "7:32" */
  duration: string
  play: number
}

/**
 * 搜索 B 站视频。
 * @param keyword 关键词
 * @param page 页码（从 1 开始）
 * @param pageSize 每页数量
 */
export const searchVideos = async (
  keyword: string,
  page = 1,
  pageSize = 30,
  cookie = ''
): Promise<{ list: BiliSearchVideo[]; total: number; pages: number }> => {
  const params = [
    `search_type=video`,
    `keyword=${encodeURIComponent(keyword)}`,
    `page=${page}`,
    `page_size=${pageSize}`,
  ].join('&')
  const response = await fetch(`${API_BASE}/x/web-interface/search/type?${params}`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: cookie },
    credentials: 'omit',
  })
  const body = await requireOk<{
    result: {
      aid: number
      bvid: string
      title: string
      author: string
      mid: number
      pic: string
      duration: string
      play: number
    }[] | null
    numResults: number
    numPages: number
  }>(response, '搜索视频')
  const list: BiliSearchVideo[] = (body.data?.result ?? []).map((r) => ({
    aid: r.aid ?? 0,
    bvid: r.bvid,
    title: r.title,
    author: r.author,
    mid: r.mid,
    pic: r.pic,
    duration: r.duration ?? '',
    play: r.play,
  }))
  return {
    list,
    total: body.data?.numResults ?? list.length,
    pages: body.data?.numPages ?? 1,
  }
}

// ---------------------------------------------------------------- 评论

/** 视频基础信息（拿 aid 用，评论接口 oid 需要 avid） */
export interface BiliVideoViewInfo {
  aid: number
  bvid: string
  cid: number
  title: string
  pic: string
  duration: number
  owner: { mid: number; name: string; face: string }
  desc: string
}

/** 根据 bvid 获取视频信息（含 aid / cid / owner） */
export const getVideoInfo = async (bvid: string, cookie: string): Promise<BiliVideoViewInfo> => {
  const response = await fetch(`${API_BASE}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: cookie },
    credentials: 'omit',
  })
  const body = await requireOk<{
    aid: number
    bvid: string
    cid: number
    title: string
    pic: string
    duration: number
    owner: { mid: number; name: string; face: string }
    desc: string
  }>(response, '获取视频信息')
  return body.data
}

/** 单条评论 */
export interface BiliReplyItem {
  rpid: number
  oid: number
  mid: number
  /** 点赞数 */
  like: number
  ctime: number
  /** 回复数 */
  rcount: number
  member: { mid: number; uname: string; avatar: string }
  content: { message: string }
  /** 子回复（楼中楼） */
  replies?: BiliReplyItem[] | null
}

/**
 * 获取视频评论列表（/x/v2/reply/main，游标分页）。
 * 老接口 /x/v2/reply 的 sort 参数只支持热度（1/2 结果一样且不带 sort 返回空），
 * 时间排序必须走 reply/main 的 mode 参数。
 * @param oid 视频 avid
 * @param mode 排序：3=热度，2=时间
 * @param next 游标（首页传 0，之后传上一页返回的 cursor.next）
 */
export const getReplyList = async (
  oid: number,
  mode: number,
  next = 0,
  ps = 20,
  cookie = ''
): Promise<{ replies: BiliReplyItem[]; count: number; next: number; isEnd: boolean }> => {
  const response = await fetch(
    `${API_BASE}/x/v2/reply/main?oid=${oid}&type=1&mode=${mode}&next=${next}&ps=${ps}&plat=1`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{
    replies?: BiliReplyItem[] | null
    cursor?: { next?: number; is_end?: boolean; all_count?: number }
  }>(response, '获取评论')
  return {
    replies: body.data?.replies ?? [],
    count: body.data?.cursor?.all_count ?? 0,
    next: body.data?.cursor?.next ?? 0,
    isEnd: body.data?.cursor?.is_end ?? true,
  }
}

// ---------------------------------------------------------------- UP 主空间

/**
 * 获取/缓存 buvid3+buvid4（B 站风控标识）。
 * 空间接口（acc/info、arc/search）无 buvid3 会被 WAF 拦（-352/412），
 * 通过 /x/frontend/finger/spi 获取，缓存一天。
 */
const BUVID_STORAGE = 'bili_buvid'
interface BuvidKeys { buvid3: string; buvid4: string; timestamp: number }

const fetchBuvid = async (): Promise<BuvidKeys> => {
  const response = await fetch(`${API_BASE}/x/frontend/finger/spi`, {
    method: 'GET',
    headers: baseHeaders,
    credentials: 'omit',
  })
  const body = (await response.json()) as {
    code: number
    data?: { b_3?: string; b_4?: string }
  }
  if (body.code !== 0 || !body.data?.b_3) {
    throw new Error('获取 buvid 失败')
  }
  const keys: BuvidKeys = {
    buvid3: body.data.b_3,
    buvid4: body.data.b_4 ?? '',
    timestamp: Date.now(),
  }
  await saveData(BUVID_STORAGE, keys)
  return keys
}

const getBuvid = async (): Promise<BuvidKeys> => {
  const cached = await getData<BuvidKeys>(BUVID_STORAGE)
  if (cached?.buvid3 && Date.now() - cached.timestamp < 24 * 3600 * 1000) {
    return cached
  }
  try {
    return await fetchBuvid()
  } catch {
    // 拿不到 buvid 时返回空，让请求尽量照常发（部分接口无 buvid 也能过）
    return { buvid3: '', buvid4: '', timestamp: Date.now() }
  }
}

/** 给 cookie 补上 buvid3/buvid4（若缺） */
const ensureBuvid = async (cookie: string): Promise<string> => {
  if (/buvid3=/.test(cookie)) return cookie
  const { buvid3, buvid4 } = await getBuvid()
  if (!buvid3) return cookie
  const extra = buvid4 ? `buvid3=${buvid3}; buvid4=${buvid4}` : `buvid3=${buvid3}`
  return cookie ? `${cookie}; ${extra}` : extra
}

/**
 * 说明：早期空间接口（acc/info、arc/search）走 web + WBI 签名，需要拼 dm_* 风控参数
 * （dm_img_str=base64(WebGL) 等固定值）。但实测 web 接口对未登录 + App 环境的账号
 * 仍会 412 / -352，已整体改为 App 接口（见 getMemberInfo / getMemberArchives）。
 */

/** UP 主详情（头像/简介） */
export interface BiliMemberInfo {
  mid: number
  name: string
  face: string
  /** 个人简介 */
  sign: string
}

/**
 * 获取 UP 主信息（头像 + 简介）。
 *
 * 走 App 接口 `/x/v2/space`（appkey 签名），不走 web 的 `/x/space/wbi/acc/info`：
 * 后者对未登录 + App 环境的账号（尤其 16 位新创作号）会返回 -352 风控校验失败。
 */
export const getMemberInfo = async (mid: number, cookie: string): Promise<BiliMemberInfo> => {
  const finalCookie = await ensureBuvid(cookie)
  const query = signAppQuery({ ...appCommonParams(), vmid: mid })
  const response = await fetch(`${APP_BASE}/x/v2/space?${query}`, {
    method: 'GET',
    headers: {
      'User-Agent': BILI_APP_UA,
      Referer: `https://space.bilibili.com/${mid}/dynamic`,
      Cookie: finalCookie,
    },
    credentials: 'omit',
  })
  const body = await requireOk<{
    card?: { mid: number; name: string; face: string; sign: string }
  }>(response, '获取 UP 主信息')
  const card = body.data?.card
  if (!card) throw new BiliApiError('获取 UP 主信息失败：返回数据为空')
  return {
    mid: card.mid,
    name: card.name,
    face: card.face,
    sign: card.sign ?? '',
  }
}

/** UP 主的作品（视频） */
export interface BiliMemberArchive {
  aid: number
  bvid: string
  title: string
  pic: string
  duration: number
}

/** App 空间作品接口单页返回上限（实测 ps 传再大也只给 20 条） */
const APP_ARCHIVE_PAGE_MAX = 20

/**
 * 获取 UP 主投稿的视频列表（作品）。
 *
 * 走 App 接口 `/x/v2/space/archive`（appkey 签名）。
 * 不用 web 的 `/x/space/wbi/arc/search`：后者对未登录 + App 环境的账号
 * （尤其 16 位新创作号）会返回 HTTP 412 / -352 风控。
 *
 * 注意：App 接口每页最多返回 20 条，这里按请求的 `ps` 自动翻子页凑满，
 * 保证上层传 limit=100 时能拿到完整一页。
 *
 * @param order 排序：`pubdate`=最新（时间），`click`=播放量（热门），`stow`=收藏数
 */
export const getMemberArchives = async (
  mid: number,
  page = 1,
  ps = 30,
  cookie = '',
  order = 'pubdate'
): Promise<{ list: BiliMemberArchive[]; count: number }> => {
  const finalCookie = await ensureBuvid(cookie)
  const start = (page - 1) * ps // 需要跳过的作品总数
  let apiPage = Math.floor(start / APP_ARCHIVE_PAGE_MAX) + 1 // 对应到 App 接口的页号
  let toSkip = start % APP_ARCHIVE_PAGE_MAX // 首页需要跳过的条数
  const list: BiliMemberArchive[] = []
  let count = 0

  for (let guard = 0; guard < 30 && list.length < ps; guard++) {
    const query = signAppQuery({
      ...appCommonParams(),
      vmid: mid,
      pn: apiPage,
      ps: APP_ARCHIVE_PAGE_MAX,
      order,
      tid: 0,
    })
    const response = await fetch(`${APP_BASE}/x/v2/space/archive?${query}`, {
      method: 'GET',
      headers: {
        'User-Agent': BILI_APP_UA,
        Referer: `https://space.bilibili.com/${mid}/video`,
        Cookie: finalCookie,
      },
      credentials: 'omit',
    })
    const body = await requireOk<{
      count?: number
      item?: {
        param?: string | number
        bvid: string
        title: string
        cover: string
        duration?: number
      }[]
    }>(response, '获取 UP 主作品')
    count = body.data?.count ?? count
    const items = body.data?.item ?? []
    if (!items.length) break
    const usable = toSkip > 0 ? items.slice(toSkip) : items
    toSkip = 0
    list.push(
      ...usable.map((v) => ({
        aid: Number(v.param) || 0,
        bvid: v.bvid,
        title: v.title,
        pic: v.cover,
        duration: v.duration ?? 0,
      }))
    )
    apiPage += 1
  }

  return { list: list.slice(0, ps), count }
}

/** UP 主的合集（专辑） */
export interface BiliMemberSeason {
  id: number
  title: string
  cover: string
  /** 合集内视频数 */
  total: number
}

/** web 合集接口 page_size 上限：>20 会返回 -400 请求错误（实测 20 可、30 起失败） */
const SEASONS_PAGE_MAX = 20

/**
 * 获取 UP 主的合集 / 系列（专辑）。
 * 走 /x/polymer/web-space/seasons_series_list（web 接口，不受 412 风控影响）。
 *
 * 注意：该接口 page_size 上限为 20，传大了会返回 -400 请求错误，
 * 这里按请求的 `ps` 自动翻子页凑满（上层 AlbumLimit=100 也能拿到完整一页）。
 */
export const getMemberSeasons = async (
  mid: number,
  page = 1,
  ps = 20,
  cookie = ''
): Promise<{ list: BiliMemberSeason[]; hasMore: boolean }> => {
  const finalCookie = await ensureBuvid(cookie)
  const start = (page - 1) * ps
  let apiPage = Math.floor(start / SEASONS_PAGE_MAX) + 1
  let toSkip = start % SEASONS_PAGE_MAX
  const list: BiliMemberSeason[] = []
  let total = 0

  for (let guard = 0; guard < 30 && list.length < ps; guard++) {
    const response = await fetch(
      `${API_BASE}/x/polymer/web-space/seasons_series_list?mid=${mid}&page_num=${apiPage}&page_size=${SEASONS_PAGE_MAX}`,
      {
        method: 'GET',
        headers: { ...baseHeaders, Cookie: finalCookie },
        credentials: 'omit',
      }
    )
    const body = await requireOk<{
      items_lists?: {
        seasons_list?: {
          meta: { season_id: number; name: string; cover: string; total: number }
        }[]
        series_list?: {
          meta: { series_id: number; name: string; cover: string; total: number }
        }[]
        page?: { total?: number }
      }
    }>(response, '获取 UP 主合集')
    total = body.data?.items_lists?.page?.total ?? total
    const seasons = (body.data?.items_lists?.seasons_list ?? []).map((s) => ({
      id: s.meta.season_id,
      title: s.meta.name,
      cover: s.meta.cover,
      total: s.meta.total,
    }))
    const series = (body.data?.items_lists?.series_list ?? []).map((s) => ({
      id: s.meta.series_id,
      title: s.meta.name,
      cover: s.meta.cover,
      total: s.meta.total,
    }))
    const merged = [...seasons, ...series]
    if (!merged.length) break
    const usable = toSkip > 0 ? merged.slice(toSkip) : merged
    toSkip = 0
    list.push(...usable)
    apiPage += 1
  }

  return {
    list: list.slice(0, ps),
    hasMore: total > 0 ? page * ps < total : false,
  }
}

// ---------------------------------------------------------------- 排行榜

/** 排行榜里的单个视频（ranking/v2 返回） */
export interface BiliRankVideo {
  aid: number
  bvid: string
  cid: number
  title: string
  pic: string
  duration: number
  owner: { mid: number; name: string; face: string }
}

/** 音频榜单里的单曲（copyright-music-publicity 返回），含关联的二创视频 */
export interface BiliMusicRankItem {
  music_id: string
  music_title: string
  singer: string
  album: string
  mv_cover: string
  /** 关联的二创视频（用于播放）——热歌榜(list_type=1)顶层有值，二创榜(list_type=3)为空 */
  creation_bvid: string
  creation_first_cid: number
  creation_cover: string
  creation_title: string
  creation_up: number
  creation_nickname: string
  creation_duration: number
  creation_play: number
  rank: number
  heat: number
  /** 二创榜(list_type=3)把多个二创视频放在 arc_list 里，顶层 creation_* 全为空 */
  arc_list?: BiliArcItem[]
}

/** arc_list 里的单个二创视频（二创榜用） */
export interface BiliArcItem {
  aid: number
  bvid: string
  first_cid: number
  title: string
  cover: string
  up_name: string
  mid: number
  play: number
  duration: number
}

/**
 * 获取分区视频排行榜（/v/popular/rank 页面）。
 * @param rid 分区 id：1003 音乐区（新版），119 鬼畜区
 * type=all 综合榜。旧版音乐区 rid=3 也能返回但走旧分区体系；PiliPlus 用 1003。
 */
export const getRankingVideos = async (rid: number | string = 1003, cookie: string = ''): Promise<BiliRankVideo[]> => {
  // 鬼畜区(119)等分区有风控，无 cookie 时返回 -352，需带 buvid3（任意值即可过）
  let finalCookie = cookie
  if (!/buvid3=/.test(finalCookie)) {
    finalCookie = finalCookie ? `${finalCookie}; buvid3=00000000-0000-0000-0000-000000000000infoc` : 'buvid3=00000000-0000-0000-0000-000000000000infoc'
  }
  const response = await fetch(`${API_BASE}/x/web-interface/ranking/v2?rid=${rid}&type=all`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: finalCookie },
    credentials: 'omit',
  })
  const body = await requireOk<{
    list: {
      aid: number
      bvid: string
      cid: number
      title: string
      pic: string
      duration: number
      owner: { mid: number; name: string; face: string }
    }[] | null
  }>(response, '获取音乐区排行榜')
  return (body.data?.list ?? []).map((v) => ({
    aid: v.aid,
    bvid: v.bvid,
    cid: v.cid,
    title: v.title,
    pic: v.pic,
    duration: v.duration,
    owner: v.owner,
  }))
}

/**
 * 获取音频榜单最新一期的榜单 id。
 * @param listType 1=热歌榜 3=二创榜
 */
export const getLatestMusicRankId = async (listType: number, cookie: string): Promise<number> => {
  const response = await fetch(
    `${API_BASE}/x/copyright-music-publicity/toplist/all_period?list_type=${listType}`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{ list: Record<string, { ID: number; priod: number; publish_time: number }[]> }>(
    response,
    '获取榜单期数'
  )
  const years = Object.keys(body.data?.list ?? {}).sort((a, b) => Number(b) - Number(a))
  const latestYear = years[0]
  const periods = body.data?.list?.[latestYear] ?? []
  // 取最新一期（按 publish_time 降序，取第一个）
  const latest = periods.slice().sort((a, b) => b.publish_time - a.publish_time)[0]
  if (!latest) throw new BiliApiError('未找到可用的榜单期数')
  return latest.ID
}

/**
 * 获取音频榜单内容（热歌榜/二创榜的歌曲列表）。
 * @param listId 榜单 id（来自 all_period）
 */
export const getMusicRankList = async (listId: number, cookie: string): Promise<BiliMusicRankItem[]> => {
  const response = await fetch(
    `${API_BASE}/x/copyright-music-publicity/toplist/music_list?list_id=${listId}`,
    {
      method: 'GET',
      headers: { ...baseHeaders, Cookie: cookie },
      credentials: 'omit',
    }
  )
  const body = await requireOk<{ list: BiliMusicRankItem[] | null }>(response, '获取榜单内容')
  return body.data?.list ?? []
}

/** 分 P 信息（拿 cid 用） */
export interface BiliPage {
  cid: number
  page: number
  part: string
  duration: number
}

/** 获取视频分 P 列表，拿到第一个 P 的 cid（播放音频用） */
export const getVideoPages = async (bvid: string, cookie: string): Promise<BiliPage[]> => {
  const response = await fetch(`${API_BASE}/x/player/pagelist?bvid=${bvid}`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: cookie },
    credentials: 'omit',
  })
  const body = await requireOk<BiliPage[]>(response, '获取视频分 P 信息')
  return body.data ?? []
}

/** 音频流结果 */
export interface BiliAudioStream {
  url: string
  /** 音频质量 id */
  quality: number
}

/**
 * 获取视频的音频流直链（dash 音频）。
 * 通过 WBI 签名请求 /x/player/wbi/playurl，fnval=4048 请求 dash，
 * 从 dash.audio 里取最高质量音频流。
 */
export const getAudioStream = async (
  bvid: string,
  cid: number,
  cookie: string
): Promise<BiliAudioStream> => {
  const query = await getWbiEncodedParams(
    {
      bvid,
      cid: String(cid),
      fnval: '4048',
      fnver: '0',
      fourk: '1',
    },
    cookie
  )
  const response = await fetch(`${API_BASE}/x/player/wbi/playurl?${query}`, {
    method: 'GET',
    headers: { ...baseHeaders, Cookie: cookie },
    credentials: 'omit',
  })
  const body = await requireOk<{
    dash?: { audio?: { id: number; baseUrl: string }[]; flac?: { audio?: { id: number; baseUrl: string } } }
    durl?: { url: string }[]
  }>(response, '获取音频流')

  // 优先 Hi-Res flac
  if (body.data?.dash?.flac?.audio) {
    return { url: body.data.dash.flac.audio.baseUrl, quality: body.data.dash.flac.audio.id }
  }
  // 其次 dash 音频（取第一个，通常是最高质量）
  const audio = body.data?.dash?.audio
  if (audio && audio.length > 0) {
    return { url: audio[0].baseUrl, quality: audio[0].id }
  }
  // 老视频回退 durl
  const durl = body.data?.durl
  if (durl && durl.length > 0) {
    return { url: durl[0].url, quality: 0 }
  }
  throw new BiliApiError('未找到可用的音频流')
}
