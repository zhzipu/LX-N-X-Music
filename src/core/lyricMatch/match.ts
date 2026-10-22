/**
 * 歌词匹配引擎（音源无关）。
 *
 * 用途：给那些**本身没有歌词**的曲目（典型是 B 站视频）按「歌名 + 时长」
 * 到有歌词的音源里搜一首最像的，取其歌词。参考 BBPlayer 的做法：
 * https://github.com/bbplayer-app/BBPlayer
 *
 * 与 BBPlayer 的差异：
 *  - BBPlayer 用 Promise.any 取**最快**返回的源；这里把各源结果一起收上来，
 *    按「歌名相似度 + 时长吻合度」打分排序，取**最像**的那首（更能抗错配）。
 *  - 单个音源超时 / 报错不影响其它音源；全部失败才抛错。
 */
import wySearch from '@/utils/musicSdk/wy/musicSearch'
import wyLyric from '@/utils/musicSdk/wy/lyric'
import txSearch from '@/utils/musicSdk/tx/musicSearch'
import txLyric from '@/utils/musicSdk/tx/lyric'
import kgLyric from '@/utils/musicSdk/kg/lyric'
import { httpFetch } from '@/utils/request'

/** 搜索到的候选歌曲（已归一化成我们需要的字段） */
export interface LyricCandidate {
  provider: LyricProviderId
  /** 歌词接口要用的 id（wy=数字 songId、tx=songmid、kg=FileHash） */
  id: string
  name: string
  singer: string
  /** 时长（秒），取不到为 0 */
  duration: number
}

export type LyricProviderId = 'wy' | 'tx' | 'kg'

export interface LyricResult {
  lyric: string
  tlyric?: string | null
  rlyric?: string | null
  lxlyric?: string | null
}

interface LyricProvider {
  id: LyricProviderId
  name: string
  /** 搜索候选；失败/超时抛错即可，调用方会隔离 */
  search: (keyword: string, limit: number) => Promise<LyricCandidate[]>
  /** 按候选取歌词；带上完整候选是因为部分源的歌词接口还要歌名/时长（如酷狗） */
  fetch: (candidate: LyricCandidate) => Promise<LyricResult>
}

/** 单源搜索超时（ms）——慢源不该拖住整体 */
const SEARCH_TIMEOUT = 8_000
/** 歌词接口超时（ms） */
const LYRIC_TIMEOUT = 10_000
/** 搜索条数 */
const SEARCH_LIMIT = 10
/** 时长允许偏差（秒）：B 站视频常带前后奏/剪辑，太严会漏，太松会错配 */
const DURATION_TOLERANCE = 4
/** 候选必须达到的最低分 */
const SCORE_THRESHOLD = 0.2
/** 最多尝试取歌词的候选数（并行取，留几个备选即可，太多反而容易撞限流） */
const MAX_FETCH_ATTEMPTS = 3
/** 判断歌词是否带时间轴：`[00:12.34]` / `[0:5]` 这类 */
const TIMESTAMP_PATTERN = /\[\d{1,2}:\d{1,2}/

// ---------------------------------------------------------------- 文本工具

/** 时长标签（"03:55" / "1:02:03"）→ 秒 */
export const parseDurationText = (text?: string | null): number => {
  if (!text) return 0
  const parts = String(text).split(':')
  if (parts.some((p) => !/^\d+$/.test(p.trim()))) return 0
  let seconds = 0
  for (const part of parts) seconds = seconds * 60 + Number(part.trim())
  return seconds
}

/**
 * 归一化歌名：去掉括号补充说明、空格与标点，只留下「正题」。
 * 例：`【初音未来】千本桜 (Live)` → `千本桜`；`千本桜（初音ミク）` → `千本桜`
 */
export const normalizeName = (name?: string | null): string =>
  String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(
      /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~·，。、！？；：“”‘’《》「」『』〈〉…—～~]/g,
      ''
    )

/** 字符二元组（英文/数字按单字切，够用且实现简单） */
const bigrams = (text: string): string[] => {
  const chars = Array.from(text)
  if (chars.length <= 1) return []
  const result: string[] = []
  for (let i = 0; i < chars.length - 1; i++) result.push(chars[i] + chars[i + 1])
  return result
}

/** Dice 系数（多重集合），0~1 */
const multiSetDice = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0
  const pool = new Map<string, number>()
  for (const gram of a) pool.set(gram, (pool.get(gram) ?? 0) + 1)
  let hits = 0
  for (const gram of b) {
    const count = pool.get(gram) ?? 0
    if (count > 0) {
      pool.set(gram, count - 1)
      hits++
    }
  }
  return (2 * hits) / (a.length + b.length)
}

export const diceCoefficient = (a: string, b: string): number => multiSetDice(bigrams(a), bigrams(b))

/**
 * 相似度（0~1）。
 *
 * 取「字级 Dice」和「二元组 Dice」的较大值：
 *  - 字级对中文/日文短标题更灵敏，能兜住繁体↔简体（`千本桜` vs `千本樱`）；
 *  - 二元组对英文长标题更灵敏，不会因多一个单词就掉分。
 *
 * 注意：日文汉字与简体中文的差异（桜↔樱）不做转换，靠字级相似度容忍。
 */
export const nameSimilarity = (target: string, candidate: string): number => {
  const a = normalizeName(target)
  const b = normalizeName(candidate)
  if (!a || !b) return 0
  if (a === b) return 1

  // 用码点数组计数：String.length 数的是 UTF-16 码元，遇到非 BMP 字符（部分汉字/emoji）会虚高
  const aChars = Array.from(a)
  const bChars = Array.from(b)

  // 短名保护：一方只有 1 个字时，任何「包含该字」的歌名都能拿到字级 Dice 分
  // （如 `樱` vs `千本樱` = 0.5），门槛形同虚设。1 个字的歌名本身也太含糊，
  // 直接不给分，避免把视频误配到不相干的单字歌名上。
  if (aChars.length < 2 || bChars.length < 2) return 0

  const charScore = multiSetDice(aChars, bChars)
  const bigramScore = multiSetDice(bigrams(a), bigrams(b))
  const base = Math.max(charScore, bigramScore)

  // 一方完整包含另一方 → 视为强匹配（如 `千本桜` 与 `初音未来千本桜` 是同一首）。
  // 下限抬到 0.8：中文/日文标题字级重合率天然偏低（`初音未来千本桜` 与 `千本桜` 只有 3/8 字重合），
  // 不抬底就会把正确的候选判成低分而漏配。
  const shorter = aChars.length <= bChars.length ? a : b
  const longer = aChars.length <= bChars.length ? b : a
  if (longer.includes(shorter)) {
    return Math.min(1, Math.max(0.8, base))
  }
  return base
}

// ---------------------------------------------------------------- 各源适配

const withTimeout = <T>(promise: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what}超时`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  }) as Promise<T>
}

/** 时长取「秒」：优先用毫秒原值（wy 的 dt、酷狗的 DURATION），其次解析 "mm:ss" */
const pickDuration = (rawMs?: number | null, text?: string | null): number => {
  if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs > 0) {
    return Math.round(rawMs / 1000)
  }
  if (typeof rawMs === 'number' && Number.isFinite(rawMs) && rawMs < 0) return 0
  return parseDurationText(text)
}

/** 网易云：eapi 搜索 → search()（内部已带重试，返回 {list}） */
const wyProvider: LyricProvider = {
  id: 'wy',
  name: '网易云',
  async search(keyword, limit) {
    const result = await withTimeout(wySearch.search(keyword, 1, limit), SEARCH_TIMEOUT, '网易云搜索')
    const list = result?.list ?? []
    return list.map((item) => ({
      provider: 'wy' as const,
      id: String(item.songmid),
      name: item.name,
      singer: item.singer,
      duration: parseDurationText(item.interval),
    }))
  },
  async fetch(candidate) {
    const request = wyLyric(Number(candidate.id))
    const result = await withTimeout(request.promise, LYRIC_TIMEOUT, '网易云歌词')
    return {
      lyric: result.lyric ?? '',
      tlyric: result.tlyric ?? null,
      rlyric: result.rlyric ?? null,
      lxlyric: result.lxlyric ?? null,
    }
  },
}

/** QQ 音乐：musicSearch 直接返回 {body:{item_song}, meta}（内部已带重试） */
const txProvider: LyricProvider = {
  id: 'tx',
  name: 'QQ音乐',
  async search(keyword, limit) {
    const data = await withTimeout(
      txSearch.musicSearch(keyword, 1, limit),
      SEARCH_TIMEOUT,
      'QQ音乐搜索'
    )
    const list = txSearch.handleResult(data?.body?.item_song ?? []) ?? []
    return list.map((item) => ({
      provider: 'tx' as const,
      id: String(item.songmid),
      name: item.name,
      singer: item.singer,
      duration: parseDurationText(item.interval),
    }))
  },
  async fetch(candidate) {
    const request = txLyric.getLyric(candidate.id)
    const result = await withTimeout(request.promise, LYRIC_TIMEOUT, 'QQ音乐歌词')
    return { lyric: result.lyric ?? '', tlyric: result.tlyric ?? null }
  },
}

/**
 * 酷狗：直接走 song_search_v2 原始接口并展开 Grp 分组（与 kg/musicSearch.handleResult 的做法一致），
 * 不用 musicSearch.search——那个会为了音质再批量发一轮请求，只匹配歌词时纯属浪费。
 * 只能自己展开是因为歌词接口要的是 FileHash，而 SDK 归一化后的 songmid 是 Audioid。
 */
const kgProvider: LyricProvider = {
  id: 'kg',
  name: '酷狗',
  async search(keyword, limit) {
    const request = httpFetch(
      `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(
        keyword
      )}&page=1&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
    )
    const { body } = await withTimeout(request.promise, SEARCH_TIMEOUT, '酷狗搜索')
    if (!body || body.error_code !== 0) {
      throw new Error(`酷狗搜索失败（${body?.error_code ?? 'unknown'}）`)
    }
    const rawList: any[] = body.data?.lists ?? []
    const items: any[] = []
    const seen = new Set<string>()
    for (const item of rawList) {
      for (const candidate of [item, ...(item.Grp ?? [])]) {
        const hash = candidate?.FileHash
        if (!hash || seen.has(hash)) continue
        seen.add(hash)
        items.push(candidate)
      }
    }
    return items.slice(0, limit).map((item) => ({
      provider: 'kg' as const,
      id: String(item.FileHash),
      name: item.SongName ?? '',
      singer: item.SingerName ?? '',
      // 酷狗 DURATION 已经是毫秒
      duration: pickDuration(Number(item.Duration), null),
    }))
  },
  async fetch(candidate) {
    const request = kgLyric.searchLyric(
      candidate.name,
      candidate.id,
      candidate.duration ? candidate.duration * 1000 : 0
    )
    const found = await withTimeout(request.promise, LYRIC_TIMEOUT, '酷狗歌词')
    if (!found) throw new Error('酷狗未找到歌词')
    const download = kgLyric.getLyricDownload(found.id, found.accessKey, found.fmt)
    const result = await withTimeout(download.promise, LYRIC_TIMEOUT, '酷狗歌词下载')
    return {
      lyric: result.lyric ?? '',
      tlyric: result.tlyric ?? null,
      rlyric: result.rlyric ?? null,
      lxlyric: result.lxlyric ?? null,
    }
  },
}

/** 默认音源（与 BBPlayer 一致：网易云 / QQ音乐 / 酷狗） */
export const DEFAULT_PROVIDERS: LyricProviderId[] = ['wy', 'tx', 'kg']

/** 音源显示名，界面回显用 */
export const PROVIDER_NAMES: Record<LyricProviderId, string> = {
  wy: '网易云',
  tx: 'QQ音乐',
  kg: '酷狗',
}

const PROVIDERS: Record<LyricProviderId, LyricProvider> = {
  wy: wyProvider,
  tx: txProvider,
  kg: kgProvider,
}

// ---------------------------------------------------------------- 对外入口

/** 打分：时长对不上直接淘汰，再看歌名相似度 */
const scoreCandidate = (
  candidate: LyricCandidate,
  targetName: string,
  targetDuration: number
): number | null => {
  if (targetDuration > 0 && candidate.duration > 0) {
    const delta = Math.abs(candidate.duration - targetDuration)
    if (delta > DURATION_TOLERANCE) return null
  }
  const similarity = nameSimilarity(targetName, candidate.name)
  // 有时长可校验时，时长已经把大部分错配挡掉了，歌名门槛可以放松；
  // 没有时长兜底时必须更依赖歌名本身。
  const threshold = targetDuration > 0 ? 0.4 : 0.5
  if (similarity < threshold) return null
  let score = similarity
  // 时长吻合加分（越接近越可信）
  if (targetDuration > 0 && candidate.duration > 0) {
    const delta = Math.abs(candidate.duration - targetDuration)
    score += 0.25 * (1 - delta / (DURATION_TOLERANCE + 1))
  }
  // 网易云的歌词带逐字与翻译，同分优先
  if (candidate.provider === 'wy') score += 0.05
  return score
}

/** 给「匹配歌词」界面复用同一套打分排序（null 表示按自动匹配规则会被淘汰） */
export const scoreLyricCandidate = scoreCandidate

/**
 * 按歌名 + 时长到各音源里找一首最像的，取它的歌词。
 * （名字刻意不叫 searchLyric，避免和酷狗 SDK 的 `kgLyric.searchLyric` 混淆。）
 *
 * @param keyword 歌名（调用方负责清洗，如 `【初音未来】千本桜` → `千本桜`）
 * @param durationSeconds 目标时长（秒），传 0 表示不校验时长
 * @param providers 参与的音源，默认网易云/QQ音乐/酷狗
 * @returns 命中的歌词；全部音源都没有合适结果时抛错
 */
export const findLyricByKeyword = async (
  keyword: string,
  durationSeconds = 0,
  providers: LyricProviderId[] = DEFAULT_PROVIDERS
): Promise<LyricResult> => {
  const trimmed = keyword?.trim()
  if (!trimmed) throw new Error('歌词搜索关键词为空')

  const enabled = providers.map((id) => PROVIDERS[id]).filter(Boolean)
  if (!enabled.length) throw new Error('没有可用的歌词音源')

  const settled = await Promise.allSettled(
    enabled.map((provider) => provider.search(trimmed, SEARCH_LIMIT))
  )

  const scored: { candidate: LyricCandidate; score: number }[] = []
  const errors: string[] = []
  settled.forEach((result, index) => {
    const provider = enabled[index]
    if (result.status === 'rejected') {
      errors.push(`${provider.name}: ${result.reason?.message ?? result.reason}`)
      return
    }
    for (const candidate of result.value) {
      const score = scoreCandidate(candidate, trimmed, durationSeconds)
      if (score == null || score < SCORE_THRESHOLD) continue
      scored.push({ candidate, score })
    }
  })

  if (!scored.length) {
    throw new Error(
      errors.length ? `歌词匹配失败（${errors.join('; ')}）` : '没有匹配到合适的歌词'
    )
  }

  scored.sort((a, b) => b.score - a.score)

  // 只试最有希望的几个，避免错配；并行取歌词，谁成谁赢，
  // 而不是按分数串行等（串行最坏要等 3 个超时 = 30s）。
  const attempts = scored.slice(0, MAX_FETCH_ATTEMPTS)
  const fetched = await Promise.allSettled(
    attempts.map(({ candidate }) => PROVIDERS[candidate.provider].fetch(candidate))
  )

  const fetchErrors: string[] = []
  for (let i = 0; i < fetched.length; i++) {
    const candidate = attempts[i].candidate
    const label = `${PROVIDERS[candidate.provider].name}「${candidate.name}」`
    const result = fetched[i]
    if (result.status === 'rejected') {
      fetchErrors.push(`${label}: ${result.reason?.message ?? result.reason}`)
      continue
    }
    // 没有时间轴的歌词等于没有歌词
    if (result.value.lyric && TIMESTAMP_PATTERN.test(result.value.lyric)) return result.value
    fetchErrors.push(`${label}: 歌词为空或没有时间轴`)
  }

  throw new Error(`歌词获取失败（${fetchErrors.join('; ')}）`)
}

/**
 * 搜索候选歌词（给「匹配歌词」界面让用户自己挑一条）。
 *
 * 与 `findLyricByKeyword` 的区别：不做时长淘汰、不自动取歌词，把各源结果全部返回，
 * 由调用方排序与展示。单个音源失败不影响其它音源，全部失败才抛错。
 */
export const searchLyricCandidates = async (
  keyword: string,
  providers: LyricProviderId[] = DEFAULT_PROVIDERS
): Promise<LyricCandidate[]> => {
  const trimmed = keyword?.trim()
  if (!trimmed) throw new Error('歌词搜索关键词为空')

  const enabled = providers.map((id) => PROVIDERS[id]).filter(Boolean)
  if (!enabled.length) throw new Error('没有可用的歌词音源')

  const settled = await Promise.allSettled(
    enabled.map((provider) => provider.search(trimmed, SEARCH_LIMIT))
  )

  const errors: string[] = []
  const candidates: LyricCandidate[] = []
  const seen = new Set<string>()
  settled.forEach((result, index) => {
    const provider = enabled[index]
    if (result.status === 'rejected') {
      errors.push(`${provider.name}: ${result.reason?.message ?? result.reason}`)
      return
    }
    for (const candidate of result.value) {
      const key = `${candidate.provider}_${candidate.id}`
      if (seen.has(key)) continue
      seen.add(key)
      candidates.push(candidate)
    }
  })

  if (!candidates.length) {
    throw new Error(
      errors.length ? `歌词搜索失败（${errors.join('; ')}）` : '没有搜到歌词'
    )
  }
  return candidates
}

/** 取某个候选项的歌词 */
export const fetchLyricByCandidate = (candidate: LyricCandidate): Promise<LyricResult> => {
  const provider = PROVIDERS[candidate.provider]
  if (!provider) return Promise.reject(new Error('未知的歌词音源'))
  return provider.fetch(candidate)
}
