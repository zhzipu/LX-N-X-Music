/**
 * 歌词翻译：把「自动识别」出来的非中文歌词翻成中文。
 *
 * 走百度翻译开放平台的「大模型翻译」（`model_type=llm`）：识别出来的日/韩/英歌词
 * 多是口语短句，机翻（nmt）逐句硬翻会很生硬，大模型翻译带上下文，成句更像歌词。
 * 文档：https://fanyi-api.baidu.com/doc/21
 *
 * 只在用户开着「显示歌词翻译」时才调用（见 `core/asr/autoAlign`），
 * 也不会把翻译结果当成歌词本体——原文照旧按识别结果落盘，译文放 tlrc。
 */
import settingState from '@/store/setting/state'
import { toMD5 } from '@/utils/tools'
import { log } from '@/utils/log'

/** 大模型文本翻译（新接口，Bearer API KEY 鉴权） */
const AIT_ENDPOINT = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
/** 通用文本翻译（老接口，appid + 密钥的 sign 鉴权，同样能吃 model_type=llm） */
const SIGN_ENDPOINT = 'https://fanyi-api.baidu.com/api/trans/vip/translate'
/** 文档建议单次请求 2000 字符以内，这里留点余量给多行拼接 */
const MAX_CHARS = 1200
/** 触发频率/流量限制时的重试次数与基础间隔（免费版 QPS=1） */
const RETRY_TIMES = 2
const RETRY_DELAY = 900
/** 每次请求之间的最小间隔，避免连发被限频 */
const REQUEST_GAP = 260

const KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/
const HANGUL_RE = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
const LATIN_RE = /[A-Za-z\u00c0-\u024f]/
const LRC_TAG_RE = /\[[^\]]*\]/g
/** 一行歌词 = 若干时间轴 + 正文 */
const LRC_ROW_RE = /^((?:\[[^\]]*\])+)([\s\S]*)$/

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 歌词正文（去掉时间轴、空行），用来判断语种 */
export const lyricTextOnly = (lrc: string): string =>
  lrc
    .split('\n')
    .map((line) => line.replace(LRC_TAG_RE, '').trim())
    .filter(Boolean)
    .join('\n')

/**
 * 这首歌词本身是不是中文。
 *
 * 只看「汉字 vs 拉丁字母」的比例不够：日文歌词里汉字可能过半，韩文也可能夹汉字，
 * 所以先按假名/谚文一票否决；剩下的只有英文/其它拉丁文字才会被判成需要翻译。
 */
export const isChineseLyric = (lrc: string): boolean => {
  const text = lyricTextOnly(lrc)
  let cjk = 0
  let latin = 0
  for (const ch of text) {
    if (KANA_RE.test(ch) || HANGUL_RE.test(ch)) return false
    if (CJK_RE.test(ch)) cjk++
    else if (LATIN_RE.test(ch)) latin++
  }
  const total = cjk + latin
  // 只剩数字/符号（纯音乐、器乐标注）时没什么可翻的
  if (!total) return true
  return cjk / total >= 0.5
}

const appId = () => (settingState.setting['common.translateAppId'] ?? '').trim()
const apiKey = () => (settingState.setting['common.translateApiKey'] ?? '').trim()

/** 凭据齐了才能翻：大模型翻译接口要 APPID（body 里）+ 密钥/API KEY（Bear 头或签名） */
export const hasTranslateKey = () => !!apiKey() && !!appId()

const ERROR_HINTS: Record<string, string> = {
  '52001': '请求超时，请重试',
  '52002': '翻译服务系统错误',
  '52003': '未授权用户：APPID / API KEY 不对',
  '54000': '必填参数为空',
  '54001': '签名 / API KEY 无效（APPID 与密钥不匹配）',
  '54003': '访问频率受限（免费版 QPS=1）',
  '54004': '账户余额不足',
  '54005': '长 query 请求频繁，请稍后再试',
  '58000': '客户端 IP 非法',
  '58002': '服务已关闭',
}

interface TransResponse {
  from?: string
  to?: string
  trans_result?: Array<{ src?: string; dst?: string }>
  /** 少数接口把结果包在 data 里 */
  data?: { trans_result?: Array<{ src?: string; dst?: string }> }
  error_code?: string
  error_msg?: string
}

let lastRequestAt = 0

const waitGap = async () => {
  const gap = Date.now() - lastRequestAt
  if (gap < REQUEST_GAP) await sleep(REQUEST_GAP - gap)
  lastRequestAt = Date.now()
}

const parseResponse = async (res: Response): Promise<string> => {
  const data = (await res.json()) as TransResponse
  if (data.error_code) {
    const message = ERROR_HINTS[data.error_code] ?? data.error_msg ?? '翻译失败'
    const err = new Error(`${message}（${data.error_code}）`)
    ;(err as Error & { code?: string }).code = data.error_code
    throw err
  }
  const result = data.trans_result ?? data.data?.trans_result
  if (!result?.length) throw new Error('翻译接口没有返回结果')
  return result.map((item) => item.dst ?? '').join('\n')
}

/** 大模型翻译接口：JSON + Bearer API KEY（新版控制台），appid 仍要放在 body 里 */
const requestByApiKey = async (q: string, id: string, key: string): Promise<string> => {
  await waitGap()
  const res = await fetch(AIT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ appid: id, q, from: 'auto', to: 'zh' }),
  })
  return parseResponse(res)
}

/**
 * 通用翻译接口 + sign 鉴权（老控制台只给 APPID + 密钥）。
 * 签名 = MD5(appid + q + salt + 密钥)，q 参与拼接时不 encode，发出去时才 encode。
 */
const requestBySign = async (q: string, id: string, key: string): Promise<string> => {
  await waitGap()
  // 手工拼表单：RN 的 URLSearchParams 是残缺 polyfill，别指望它
  const pairs: string[] = []
  const add = (name: string, value: string) => {
    pairs.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  }
  const salt = `${Date.now()}${Math.floor(Math.random() * 10000)}`
  add('q', q)
  add('from', 'auto')
  add('to', 'zh')
  add('model_type', 'llm')
  add('appid', id)
  add('salt', salt)
  add('sign', toMD5(`${id}${q}${salt}${key}`))
  const res = await fetch(SIGN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: pairs.join('&'),
  })
  return parseResponse(res)
}

const requestOnce = async (q: string): Promise<string> => {
  const id = appId()
  const key = apiKey()
  if (!key) throw new Error('还没填百度翻译密钥')
  if (!id) throw new Error('还没填百度翻译 APPID（控制台里的 17 位数字），大模型翻译接口要它')
  try {
    return await requestByApiKey(q, id, key)
  } catch (err: any) {
    const code = String(err?.code ?? '')
    // 54001 invalid token / 54000 appid is empty：填的其实是「密钥」而不是 API KEY，
    // 换成 sign 鉴权再试一次（同一个字符串当签名密钥用）
    if (code !== '54001' && code !== '54000') throw err
    log.warn(`大模型翻译 Bearer 鉴权没通过（${err?.message ?? err}），改用 sign 鉴权`)
    return await requestBySign(q, id, key)
  }
}

const requestWithRetry = async (q: string): Promise<string> => {
  for (let i = 0; ; i++) {
    try {
      return await requestOnce(q)
    } catch (err: any) {
      const code = String(err?.code ?? '')
      const retryable = code === '54003' || code === '54005' || code === '52001'
      if (i >= RETRY_TIMES || !retryable) throw err
      log.warn(`歌词翻译限频，${RETRY_DELAY * (i + 1)}ms 后重试：${err?.message ?? err}`)
      await sleep(RETRY_DELAY * (i + 1))
    }
  }
}

/**
 * 翻一批歌词行，保证返回的数组长度与输入一致（译文要按行塞进歌词列表，错位比没有更糟）。
 *
 * 首选整块发送、靠换行分句：一次请求就能翻完一首歌。遇上模型合句/拆句导致行数对不上，
 * 就把这块对半拆开再翻，直到单行——单行怎么翻都只有一条。
 */
const translateRows = async (rows: string[]): Promise<string[]> => {
  if (!rows.length) return []
  if (rows.length === 1) {
    const text = await requestWithRetry(rows[0])
    return [text.replace(/\s*\n\s*/g, ' ').trim()]
  }
  const text = await requestWithRetry(rows.join('\n'))
  const lines = text.split('\n').map((line) => line.trim())
  if (lines.length === rows.length) return lines
  log.warn(`歌词翻译行数对不上（期望 ${rows.length}，得到 ${lines.length}），拆开重翻`)
  const mid = Math.ceil(rows.length / 2)
  return [...(await translateRows(rows.slice(0, mid))), ...(await translateRows(rows.slice(mid)))]
}

/** 把整段歌词按行切块，凑够一批再翻 */
export const translateLyricToChinese = async (lrc: string): Promise<string> => {
  const rows = lrc.split('\n').map((line) => {
    const match = line.match(LRC_ROW_RE)
    return match
      ? { tags: match[1], text: match[2].trim() }
      : { tags: '', text: line.trim() }
  })
  const indexes: number[] = []
  const texts: string[] = []
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i].text) continue
    indexes.push(i)
    texts.push(rows[i].text)
  }
  if (!texts.length) return ''

  const result: string[] = []
  let start = 0
  while (start < texts.length) {
    let end = start
    let size = 0
    while (end < texts.length && (end === start || size + texts[end].length + 1 <= MAX_CHARS)) {
      size += texts[end].length + 1
      end++
    }
    result.push(...(await translateRows(texts.slice(start, end))))
    start = end
  }

  const translated: string[] = new Array(rows.length).fill('')
  indexes.forEach((index, i) => {
    translated[index] = result[i] ?? ''
  })
  return rows
    .map((row, i) => {
      const text = translated[i]
      if (!row.text || !text) return ''
      return `${row.tags}${text}`
    })
    .filter(Boolean)
    .join('\n')
}
