/**
 * 歌词对齐：**参考歌词文本 + ASR 时间轴 → 带时间轴的 LRC**。
 *
 * 这是 `D:\AndroidDev\asr\align_lyric.py` 的 TS 移植，两份实现的判定逻辑必须保持一致，
 * 改这里之前先看 PC 端脚本的注释和实测结论（两首歌 MAE 0.56s / 1.09s）。
 *
 * 为什么是混合方案：
 *  - ASR 的文字会错（同音字、漏句），但能给「这一句大概在几分几秒」；
 *  - 参考歌词的文字 100% 正确，但可能根本没有时间轴（B 站、本地 txt 歌词）；
 *  - 于是拿参考文本 + ASR 时间，做**句级 DTW 单调对齐**。
 *
 * 为什么不是字符级 SequenceMatcher：遇到「最后的温暖 / 你给的温暖」这类近似句会跨句错配，
 * 而 DTW 的单调性保证第 N 句不会跑到第 N+1 句之后。
 */
import type { AsrResult, AsrSegment as RawSegment } from './index'
import { toSimplified } from './t2s'

// ---------------------------------------------------------------- 文本归一化

/** ASR 幻觉的常见模式：几乎不会出现在正文歌词里 */
const JUNK_RE =
  /作词|作曲|编曲|制作人|监制|混音|母带|字幕|翻译|校对|志愿者|感谢观看|订阅|点赞|请不吝|明镜|优优独播|独家.*播出|人声\s*[:：]|www\.|http/i

/**
 * 制作信息行的关键词前缀。
 *
 * 音源给的 LRC 经常整块都是 `词：xxx / 曲：xxx / Programming by：xxx` 这种署名，
 * 而正文歌词里带冒号的句子极少，所以判据是「关键词前缀 + 冒号」——
 * 只按关键词匹配会把「作曲」这种词出现在歌词里的句子也一起干掉。
 */
const CREDIT_PREFIX_RE =
  /^(作词|作曲|编曲|制作|制作人|监制|混音|母带|录音|和声|合声|伴唱|配唱|人声|吉他|贝斯|键盘|弦乐|钢琴|鼓|打击乐|出品|发行|策划|统筹|封面|字幕|翻译|校对|词|曲|演唱|原唱|Rap\s*Making|Vocal\s*Directed|Background\s*Vocals?|Programming|Produced|Composed|Arranged|Written|Lyrics?|Music|Mixed|Mastered|Recorded|Directed|Guitar|Bass|Drum|Piano|Strings|Synth|Chorus|OP|SP)/i

/** `词：xxx`、`Programming by：xxx` 这类署名行，不是歌词 */
const isCreditLine = (text: string): boolean => {
  if (!/[:：]/.test(text)) return false
  if (CREDIT_PREFIX_RE.test(text)) return true
  // 英文署名：`Background Vocals by：`、`Recorded by：`
  return /[A-Za-z][A-Za-z0-9 .&'’-]*\s+by\s*[:：]/i.test(text)
}

/** LRC 元信息行，不是歌词 */
const META_RE = /^\[(ti|ar|al|by|offset|re|ve|length|kana|au|encoding)\s*:/i

/**
 * 纯器乐段的标注。
 *
 * whisper 遇到没人声的段落会输出 `(音樂)`、`[Music]`、`（伴奏）` 这类占位，
 * 实测一首歌的前奏会稳定产出。不加这一条，识别出的歌词第一行就是「(音樂)」。
 */
const INSTRUMENTAL_RE =
  /^[（(\[【]?\s*(音乐|音樂|music|伴奏|纯音乐|純音樂|instrumental|applause|掌声|掌聲)\s*[）)\]】]?$/i

/** 时间戳前缀（一行可能挂多个，如 `[00:10.00][01:20.00]歌词`） */
const TS_RE = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/

const PUNCT = new Set(
  Array.from(
    '，。、！？；：“”‘’（）《》〈〉…—～·,!?;:\'"()[]<>/\\|_=+*&^%$#@`~ \t\u3000.'
  )
)

const charsOf = (text: string): string[] => Array.from(text)

/** 归一化：只留文字本身，去掉所有标点与空白 */
export const norm = (text: string): string =>
  Array.from(text)
    .filter((ch) => !PUNCT.has(ch))
    .join('')

// ---------------------------------------------------------------- 相似度

interface Block {
  a: number
  b: number
  size: number
}

interface Opcode {
  tag: 'equal' | 'replace' | 'delete' | 'insert'
  i1: number
  i2: number
  j1: number
  j2: number
}

/**
 * difflib.SequenceMatcher.find_longest_match 的等价实现。
 *
 * 刻意照抄 Python 的实现（含「取最小 i、再取最小 j」的偏序）而不是另写一个 LCS：
 * 相似度分毫之差都可能让 DTW 走到另一条路径上，精度就没法和 PC 端的结果对比了。
 */
const findLongestMatch = (
  a: string[],
  b: string[],
  alo: number,
  ahi: number,
  blo: number,
  bhi: number
): Block => {
  const b2j = new Map<string, number[]>()
  for (let j = blo; j < bhi; j++) {
    const arr = b2j.get(b[j])
    if (arr) arr.push(j)
    else b2j.set(b[j], [j])
  }

  let besti = alo
  let bestj = blo
  let bestsize = 0
  let j2len = new Map<number, number>()

  for (let i = alo; i < ahi; i++) {
    const next = new Map<number, number>()
    const positions = b2j.get(a[i])
    if (positions) {
      for (const j of positions) {
        const k = (j2len.get(j - 1) ?? 0) + 1
        next.set(j, k)
        if (k > bestsize) {
          besti = i - k + 1
          bestj = j - k + 1
          bestsize = k
        }
      }
    }
    j2len = next
  }

  return { a: besti, b: bestj, size: bestsize }
}

/** difflib.SequenceMatcher.get_matching_blocks（autojunk 关闭） */
const matchingBlocks = (a: string[], b: string[]): Block[] => {
  const blocks: Block[] = []
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop() as [number, number, number, number]
    const m = findLongestMatch(a, b, alo, ahi, blo, bhi)
    if (!m.size) continue
    blocks.push(m)
    if (alo < m.a && blo < m.b) queue.push([alo, m.a, blo, m.b])
    if (m.a + m.size < ahi && m.b + m.size < bhi) {
      queue.push([m.a + m.size, ahi, m.b + m.size, bhi])
    }
  }
  blocks.sort((x, y) => x.a - y.a)
  return blocks
}

/** difflib.SequenceMatcher.get_opcodes（基于 matching blocks 推导） */
const opcodes = (a: string[], b: string[], blocks: Block[]): Opcode[] => {
  const out: Opcode[] = []
  let i = 0
  let j = 0
  for (const blk of blocks) {
    let tag: Opcode['tag'] | '' = ''
    if (i < blk.a && j < blk.b) tag = 'replace'
    else if (i < blk.a) tag = 'delete'
    else if (j < blk.b) tag = 'insert'
    if (tag) out.push({ tag, i1: i, i2: blk.a, j1: j, j2: blk.b })
    i = blk.a + blk.size
    j = blk.b + blk.size
    out.push({ tag: 'equal', i1: blk.a, i2: i, j1: blk.b, j2: j })
  }

  let tag: Opcode['tag'] | '' = ''
  if (i < a.length && j < b.length) tag = 'replace'
  else if (i < a.length) tag = 'delete'
  else if (j < b.length) tag = 'insert'
  if (tag) out.push({ tag, i1: i, i2: a.length, j1: j, j2: b.length })
  return out
}

/** both 已经转成字符数组，避免重复 Array.from */
const ratio = (a: string[], b: string[], blocks: Block[]): number => {
  if (!a.length || !b.length) return 0
  let matched = 0
  for (const blk of blocks) matched += blk.size
  return (2 * matched) / (a.length + b.length)
}

/**
 * 参考句有多少比例的字能在窗口里连成片段。
 * 只算长度 >= 2 的块，避免「一个字碰巧对上」把覆盖率虚抬上去。
 */
const coverage = (ref: string[], text: string[]): number => {
  if (!ref.length) return 0
  const blocks = matchingBlocks(ref, text)
  let got = 0
  for (const blk of blocks) {
    if (ref.length < 3 || blk.size >= 2) got += blk.size
  }
  return got / ref.length
}

// ---------------------------------------------------------------- 参考歌词解析

export interface RefLine {
  text: string
}

/**
 * 把 LRC / 纯文本歌词解析成「一句一行」，剔除元信息、纯时间戳行与幻觉行。
 *
 * 与 PC 端的一处差异：这里会先把 `[ti:]/[ar:]` 这类元信息整行扔掉。
 * PC 脚本的正则不认它们，会当成歌词行塞进来（它的测试文件恰好没有头部），
 * 而 App 里从音源拿到的歌词几乎都带头部。
 */
export const parseRefLyric = (raw: string): RefLine[] => {
  const out: RefLine[] = []
  for (const line of raw.split(/\r?\n/)) {
    let text = line.trim()
    if (!text) continue
    if (META_RE.test(text)) continue

    // 剥掉可能存在的多个时间戳前缀
    let matched = false
    while (true) {
      const m = TS_RE.exec(text)
      if (!m) break
      matched = true
      text = text.slice(m[0].length).trim()
    }
    // 纯时间戳行 = 间奏标记，对不齐任何文本，交回给 ASR 时间轴
    if (matched && !text) continue
    if (!norm(text)) continue
    if (JUNK_RE.test(text) || INSTRUMENTAL_RE.test(text)) continue
    if (isCreditLine(text)) continue
    out.push({ text })
  }
  return out
}

/**
 * 输出前的行文本清理：去掉句号与点（`。`、`．`、`.`）。
 *
 * 歌词行末尾的句号滚动起来很碍眼；只去这两种，逗号/问号/感叹号保留
 * （它们承担断句，去掉会把两句连读）。
 */
export const cleanLineText = (text: string): string =>
  text
    .replace(/[。．]/g, '')
    .replace(/\./g, '')
    .trim()

/**
 * 参考歌词是否真的能用。
 *
 * 踩过的坑：B 站等音源给的 LRC 有时只有「词/曲/编曲」几行署名，或者干脆是一段
 * 说明文字。这种文本拿去对齐，出来的歌词还是那几行署名（只是时间被重排了一遍），
 * 用户看起来就是「识别完了歌词没变」；行数太少时点名时间还会一格一格跳。
 * 判据用**字密度**：中文歌正常在 2~5 字/秒，低于 1 字/秒说明根本不是在唱歌词。
 */
export const isRefUsable = (raw: string, durationSeconds = 0): boolean => {
  const refs = parseRefLyric(raw)
  if (!refs.length) return false
  let chars = 0
  for (const line of refs) chars += norm(line.text).length
  if (durationSeconds > 40 && chars / durationSeconds < 1) return false
  if (durationSeconds > 60 && refs.length < 8) return false
  return true
}

// ---------------------------------------------------------------- ASR 结果整理

export interface AlignWord {
  start: number
  end: number
  word: string
}

export interface AlignSegment {
  start: number
  end: number
  text: string
  norm: string
  words: AlignWord[]
}

/**
 * 把 JNI 的输出转成对齐算法的输入。
 *
 * 三件必须做的事，少一件精度就明显掉：
 *  1. **繁转简** —— whisper 的中文输出常是繁体，和简体参考歌词字面对不上；
 *  2. **token 结束时刻取下一个 token 的起点** —— 否则每个字时长算成 0，长音修正判断失效；
 *  3. **段起点取首个 token 的 DTW 时刻**，而不是段起点（段起点含前导静音，会系统性偏早）。
 */
export const buildAlignSegments = (result: AsrResult): AlignSegment[] => {
  const out: AlignSegment[] = []
  for (const seg of result.segments as RawSegment[]) {
    const text = toSimplified((seg.text ?? '').trim())
    const n = norm(text)
    if (!n) continue

    const tokens = seg.tokens ?? []
    const words: AlignWord[] = []
    for (let k = 0; k < tokens.length; k++) {
      const cur = tokens[k]
      const next = tokens[k + 1]
      // 优先用模型给的 token 结束时刻；没有（旧版本 JNI 或手工构造的数据）才退化到
      // 「下一个 token 的起点 / 段尾」。这条近似的代价实测很明显：
      // 歌1 的 MAE 0.56 → 0.85、超 1 秒的句子 4 → 8。
      //
      // 注意 DTW 起点偶尔会晚于模型给的原生结束时刻（拖长音被拍平），此时时长按 0 算，
      // 不要拿下一个 token 顶上来 —— 那会把「这个字唱了多久」估长，长音修正判断跟着错。
      const rawEnd = cur.e ?? (next ? next.t : seg.t1)
      words.push({
        start: cur.t,
        end: Math.max(rawEnd, cur.t),
        word: toSimplified(cur.s ?? ''),
      })
    }

    out.push({
      start: tokens.length ? tokens[0].t : seg.t0,
      end: seg.t1,
      text,
      norm: n,
      words,
    })
  }
  return out.filter(
    (seg) => !JUNK_RE.test(seg.text) && !INSTRUMENTAL_RE.test(seg.text) && !isCreditLine(seg.text)
  )
}

// ---------------------------------------------------------------- 对齐主体

/** 句级 DTW：把参考句单调地对到 ASR 段上，返回与参考句等长的段下标（未匹配为 null） */
const sentDtw = (refs: string[][], segs: AlignSegment[]): (number | null)[] => {
  const N = refs.length
  const M = segs.length
  const SKIP_REF = 1.25
  const SKIP_ASR = 0.55
  const W = M + 1

  // 用扁平 TypedArray：长歌 200 句 × 300 段，二维数组会制造几千个临时数组
  const cost = new Float64Array((N + 1) * W).fill(Infinity)
  const back = new Int8Array((N + 1) * W) // 0=diag 1=up 2=left
  const segChars = segs.map((seg) => charsOf(seg.norm))

  cost[0] = 0
  for (let i = 1; i <= N; i++) {
    cost[i * W] = cost[(i - 1) * W] + SKIP_REF
    back[i * W] = 1
  }
  for (let j = 1; j <= M; j++) {
    cost[j] = cost[j - 1] + SKIP_ASR
    back[j] = 2
  }

  for (let i = 1; i <= N; i++) {
    const ri = refs[i - 1]
    for (let j = 1; j <= M; j++) {
      const sj = segChars[j - 1]
      const s =
        ri.length && sj.length
          ? ratio(ri, sj, matchingBlocks(ri, sj))
          : 0
      let best = cost[(i - 1) * W + (j - 1)] + (1 - s) * 2
      let ptr = 0
      const up = cost[(i - 1) * W + j] + SKIP_REF
      if (up < best) {
        best = up
        ptr = 1
      }
      const left = cost[i * W + (j - 1)] + SKIP_ASR
      if (left < best) {
        best = left
        ptr = 2
      }
      cost[i * W + j] = best
      back[i * W + j] = ptr
    }
  }

  const pairs: (number | null)[] = new Array(N).fill(null)
  let i = N
  let j = M
  while (i > 0 && j > 0) {
    const ptr = back[i * W + j]
    if (ptr === 0) {
      pairs[i - 1] = j - 1
      i -= 1
      j -= 1
    } else if (ptr === 1) {
      i -= 1
    } else {
      j -= 1
    }
  }
  return pairs
}

/**
 * 参考句常跨多个 ASR 段，DTW 可能选中靠后的那一段，退回到最早的覆盖段。
 * 返回移动次数，仅用于日志。
 */
const expandLeft = (
  refs: string[][],
  segs: AlignSegment[],
  pairs: (number | null)[]
): number => {
  const segChars = segs.map((seg) => charsOf(seg.norm))
  let moved = 0
  for (let k = 0; k < pairs.length; k++) {
    let j = pairs[k]
    if (j === null) continue
    const prevUsed = k > 0 && pairs[k - 1] !== null ? (pairs[k - 1] as number) : -1
    while (j - 1 > prevUsed) {
      const cand = segChars[j - 1]
      if (ratio(refs[k], cand, matchingBlocks(refs[k], cand)) < 0.34) break
      j -= 1
      moved += 1
    }
    pairs[k] = j
  }
  return moved
}

type WordBound = [number, number, number]

/**
 * 长音修正的触发阈值与上限（秒/字）。
 *
 * 一个字占到 1.2 秒以上，基本可以认为这个「词」把上一句拖长的尾音一起吞了，
 * 真正的起唱在词尾。但识别结果偶尔给出离谱的时长（实测一个两字的词被标成 35 秒），
 * 那种时候词尾时间本身就是错的，只能退回词头 —— 否则整句会被定位到几十秒之后。
 */
const LONG_NOTE_PER_CHAR = 1.2
const LONG_NOTE_MAX_PER_CHAR = 3.5

/** 词尾是否可信地代表「真正的起唱」 */
const isHeldNote = (start: number, end: number, size: number): boolean => {
  if (!size) return false
  const per = (end - start) / size
  return per > LONG_NOTE_PER_CHAR && per <= LONG_NOTE_MAX_PER_CHAR
}

/**
 * 把 segs[lo..hi] 的文本摊成字符序列，并给出每个字的估计时间。
 * 同时记录每个字所属的 (词起点, 词终点, 字数)，用于长音修正。
 */
const buildCharAxis = (segs: AlignSegment[], lo: number, hi: number) => {
  const chars: string[] = []
  const times: number[] = []
  const bounds: (WordBound | null)[] = []

  for (let k = lo; k <= hi; k++) {
    const seg = segs[k]
    if (!seg) continue
    if (!seg.words.length) {
      // 没有词级时间戳：整段均分，精度差但比没有好
      const nt = charsOf(seg.norm)
      const n = nt.length
      const dur = Math.max(seg.end - seg.start, 0)
      for (let idx = 0; idx < n; idx++) {
        chars.push(nt[idx])
        times.push(seg.start + dur * (n ? idx / n : 0))
        bounds.push(null)
      }
      continue
    }

    for (const w of seg.words) {
      const wt = charsOf(norm(w.word))
      const n = wt.length
      if (!n) continue
      const dur = Math.max(w.end - w.start, 0)
      for (let idx = 0; idx < n; idx++) {
        chars.push(wt[idx])
        times.push(w.start + dur * (idx / n))
        bounds.push([w.start, w.end, n])
      }
    }
  }

  return { chars, times, bounds }
}

/** 在给定字符轴里定位参考句的起点，返回时间 */
const locate = (
  ref: string[],
  text: string[],
  times: number[],
  bounds: (WordBound | null)[]
): number | null => {
  const blocks = matchingBlocks(ref, text)
  let pos: number | null = null
  for (const op of opcodes(ref, text, blocks)) {
    if (op.i1 > 0) continue // 只关心参考句开头落在窗口里的哪一处
    if (op.tag === 'insert') continue // 窗口开头多出来的字（上一句的尾巴）
    pos = op.j1
    break
  }

  if (pos === null) {
    let best: Block | null = null
    for (const blk of blocks) if (!best || blk.size > best.size) best = blk
    if (!best || best.size < 2) return null
    pos = best.b
  }

  const b = bounds[pos]
  if (b) {
    const [st, en, n] = b
    // 长音被并入首词：真正的起唱在词尾，取词头会早 1 秒以上
    if (isHeldNote(st, en, n)) return en
  }
  return times[pos] ?? null
}

/**
 * 在 segs[j-1 .. j] 的拼接文本里定位参考句起点。
 *
 * 只看 segs[j] 一定偏：ASR 的分段和歌词句边界并不一致 ——
 * 一句被切成两段时句首字在前一段尾巴上，两句并成一段时句首字被后面的字顶走。
 * 但**无条件**向左扩会被前一段的相似片段误吸（实测把某句拉早近 4 秒），
 * 所以只在左扩的覆盖率显著更高（> 0.08）时才采纳。
 */
const refineLocal = (refLine: string, segs: AlignSegment[], j: number, back = 1): number | null => {
  const ref = charsOf(refLine)
  let best = (() => {
    const axis = buildCharAxis(segs, j, j)
    return { cov: coverage(ref, axis.chars), axis }
  })()

  for (let step = 1; step <= back; step++) {
    if (j - step < 0) break
    const axis = buildCharAxis(segs, j - step, j)
    const cov = coverage(ref, axis.chars)
    if (cov > best.cov + 0.08) best = { cov, axis }
  }

  if (!best.axis.chars.length) return null
  return locate(ref, best.axis.chars, best.axis.times, best.axis.bounds)
}

/**
 * 只保留最长的「时间递增」锚点链，链外的锚点当作错配（退回按字数插值）。
 *
 * 时间戳是逐词定位出来的，只要有一个词的时长/时间离谱（实测一句「你说」被标成
 * 47.5s→82.6s），它后面那批真实时间更早的句子就全被末端的「+0.05s 强制单调」
 * 一路顶过去 —— 20 句话压进 1 秒，播放时看着就是「滚到这句就不动了」。
 * 用最长递增子序列挑出可信的那一批，单个离群锚点扔不掉整段。
 */
const keepMonotoneAnchors = (times: (number | null)[]): (number | null)[] => {
  const tails: number[] = []
  const tailsAt: number[] = []
  const prev: number[] = new Array(times.length).fill(-1)

  for (let i = 0; i < times.length; i++) {
    const t = times[i]
    if (t === null) continue
    let lo = 0
    let hi = tails.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (tails[mid] <= t) lo = mid + 1
      else hi = mid
    }
    if (lo > 0) prev[i] = tailsAt[lo - 1]
    tails[lo] = t
    tailsAt[lo] = i
  }

  const keep = new Set<number>()
  let cur = tailsAt.length ? tailsAt[tailsAt.length - 1] : -1
  while (cur >= 0) {
    keep.add(cur)
    cur = prev[cur]
  }
  return times.map((t, i) => (t === null || keep.has(i) ? t : null))
}

/** 把已定的时间填给参考句；未匹配的按字数比例插值，最后强制单调 */
const assignTimes = (
  refs: RefLine[],
  base: (number | null)[],
  offset: number
): { time: number; text: string }[] => {
  const times: (number | null)[] = keepMonotoneAnchors(
    base.map((t) => (t === null ? null : t + offset))
  )
  const lens = refs.map((line) => norm(line.text).length)

  const known: number[] = []
  for (let k = 0; k < times.length; k++) if (times[k] !== null) known.push(k)
  if (!known.length) return refs.map((line) => ({ time: 0, text: line.text }))

  // 全曲平均「每字所占时间」（含间奏摊薄），用于单边插值
  const firstK = known[0]
  const lastK = known[known.length - 1]
  const spanT = (times[lastK] as number) - (times[firstK] as number)
  let spanC = 0
  for (let x = firstK; x <= lastK; x++) spanC += lens[x]
  const rate = spanC && spanT > 0 ? spanT / spanC : 0.5

  for (let k = 0; k < refs.length; k++) {
    if (times[k] !== null) continue
    let prevK: number | null = null
    let nextK: number | null = null
    for (const x of known) {
      if (x < k) prevK = x
      else if (x > k) {
        nextK = x
        break
      }
    }

    if (prevK !== null && nextK !== null) {
      let total = 0
      for (let x = prevK + 1; x <= nextK; x++) total += lens[x]
      let done = 0
      for (let x = prevK + 1; x <= k; x++) done += lens[x]
      const r = done / Math.max(total, 1)
      times[k] = (times[prevK] as number) + ((times[nextK] as number) - (times[prevK] as number)) * r
    } else if (prevK !== null) {
      times[k] = (times[prevK] as number) + rate * lens[k]
    } else if (nextK !== null) {
      times[k] = Math.max(0, (times[nextK] as number) - rate * lens[k])
    } else {
      times[k] = 0
    }
  }

  const out: { time: number; text: string }[] = []
  for (let k = 0; k < refs.length; k++) {
    let t = Math.max(Number(times[k] ?? 0), 0)
    if (out.length && t <= out[out.length - 1].time) t = out[out.length - 1].time + 0.05
    out.push({ time: t, text: refs[k].text })
  }
  return out
}

/** `[mm:ss.xx]` —— 与 PC 端 `ts_lrc` 完全一致 */
export const formatTimestamp = (sec: number): string => {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  const rest = s - m * 60
  return `[${String(m).padStart(2, '0')}:${rest.toFixed(2).padStart(5, '0')}]`
}

/**
 * 统一出口：清掉句号/点、丢掉空行，并保证 `times`/`texts` 与 lrc 行严格一一对应。
 *
 * 清理放在这里而不是各个生成分支里，是因为三个分支（有参考、无参考、字符轴对齐）
 * 都要用同一套规则；分散写迟早会漏掉一处，导致 `retimeAuxLyric` 的行数对不上、
 * 翻译被整段丢掉。
 */
const toOutput = (lines: { time: number; text: string }[], report: AlignReport): AlignOutput => {
  const kept: { time: number; text: string }[] = []
  for (const line of lines) {
    const text = cleanLineText(line.text)
    if (!text) continue
    kept.push({ time: line.time, text })
  }
  return {
    lrc: kept.map((line) => `${formatTimestamp(line.time)}${line.text}`).join('\n'),
    report,
    times: kept.map((line) => line.time),
    texts: kept.map((line) => line.text),
  }
}

// ------------------------------------------------- 无参考歌词：直接生成歌词行

/**
 * 单行最多多少字。
 *
 * whisper 的分段是按「语义块」来的，一句能拉到三四十字 —— 当歌词读太长，
 * 滚动起来一屏塞不下两行。演唱的一行通常在 10~18 字，取中间值。
 */
const MAX_LINE_CHARS = 18

/** 句末标点：在这些位置断开最接近自然的换行 */
const BREAK_RE = /[^，。！？；：、,.!?;:…]+[，。！？；：、,.!?;:…]*/g

/**
 * 把一段 ASR 文本切成适合当歌词的行。
 *
 * 先按标点断句；单句仍然超长（ASR 常常整段只给一个逗号甚至没有标点）时按字数硬切，
 * 否则会出现「一行 40 字」这种没法看的歌词。
 */
const splitAsrText = (text: string): string[] => {
  const out: string[] = []
  for (const piece of text.match(BREAK_RE) ?? [text]) {
    const trimmed = piece.trim()
    if (!trimmed) continue
    const chars = charsOf(trimmed)
    if (chars.length <= MAX_LINE_CHARS) {
      out.push(trimmed)
      continue
    }
    // 均分而不是每 MAX 字切一刀：40 字切成「18+18+4」会留一条极短的尾巴，
    // 均分成 14/14/12 才像歌词。切点仍然可能落在词中间，这里没有分词可用，
    // 但至少不会出现「爱」/「上你」这种一两个字的碎片。
    const parts = Math.ceil(chars.length / MAX_LINE_CHARS)
    const per = Math.ceil(chars.length / parts)
    for (let i = 0; i < chars.length; i += per) {
      const part = chars.slice(i, i + per).join('').trim()
      if (part) out.push(part)
    }
  }
  return out
}

/**
 * 没有参考歌词时，用 ASR 分段直接生成歌词行。
 *
 * 段内的时间是按**字数比例**摊的：whisper 只给到段级（词级时间戳在音乐上抖动很大），
 * 与其编一个更细的假时间，不如让每行的起点稳稳落在它该在的位置上。
 */
const asrLines = (segs: AlignSegment[]): { time: number; text: string }[] => {
  const lines: { time: number; text: string }[] = []
  let last = -1

  for (const seg of segs) {
    const parts = splitAsrText(seg.text)
    if (!parts.length) continue

    const spans = parts.map((part) => Math.max(norm(part).length, 1))
    const total = spans.reduce((sum, n) => sum + n, 0)
    const duration = Math.max(seg.end - seg.start, 0)

    let used = 0
    for (let k = 0; k < parts.length; k++) {
      let t = seg.start + (duration * used) / total
      used += spans[k]
      if (t <= last) t = last + 0.05
      last = t
      lines.push({ time: Math.max(t, 0), text: parts[k] })
    }
  }
  return lines
}

export interface AlignReport {
  /** 参考歌词句数 */
  total: number
  /** DTW 匹配上的句数 */
  hit: number
  /** 词级精修成功数 */
  refined: number
  /** 向左扩展移动次数 */
  moved: number
}

export interface AlignOutput {
  lrc: string
  report: AlignReport
  /** 每句的时间（秒），与 `texts` 一一对应，用于把翻译的时间轴一起改写 */
  times: number[]
  texts: string[]
  /** 参考歌词与识别文本对不上，最终用的是识别文本（界面要据此换提示文案） */
  fromAsr?: boolean
}

/**
 * 按 `times` 重写一份辅助歌词（翻译/音译）的时间戳，行数对不上就返回空串。
 *
 * 翻译是独立时间轴的文本：主歌词的时间轴被整体重算之后，翻译不跟着改会全部错位。
 * 只在行数完全一致时才改写 —— 部分行有翻译的情况分不清对应关系，宁可丢掉，
 * 也不能留一份"看起来在、实际全错"的翻译。
 */
export const retimeAuxLyric = (aux: string, times: number[]): string => {
  if (!aux || !times.length) return ''
  const texts: string[] = []
  for (const line of aux.split(/\r?\n/)) {
    let text = line.trim()
    if (!text) continue
    while (true) {
      const m = TS_RE.exec(text)
      if (!m) break
      text = text.slice(m[0].length).trim()
    }
    if (!text) continue
    texts.push(text)
  }
  if (texts.length !== times.length) return ''
  return texts
    .map((text, k) => `${formatTimestamp(times[k])}${cleanLineText(text)}`)
    .join('\n')
}

/**
 * 主入口：参考歌词 + ASR 结果 → LRC 文本。
 *
 * 参考歌词为空时（B 站这类连文本歌词都没有的），直接按 ASR 文本出词：
 * 文字可能有同音字错误，但至少有了时间轴，比什么都没有强。
 * 这一段走 `asrLines`，只做断行整理，不碰 DTW —— 没有参考文本可比对。
 */
export const alignLyric = (
  refRaw: string,
  asr: AsrResult,
  offset = 0
): AlignOutput => {
  const segs = buildAlignSegments(asr)

  const refs = parseRefLyric(refRaw)
  if (!refs.length) {
    const lines = asrLines(segs)
    return {
      ...toOutput(lines, {
        total: lines.length,
        hit: lines.length,
        refined: 0,
        moved: 0,
      }),
      fromAsr: true,
    }
  }

  const refChars = refs.map((line) => charsOf(norm(line.text)))
  const pairs = sentDtw(refChars, segs)
  let hit = 0
  for (const p of pairs) if (p !== null) hit += 1
  const moved = expandLeft(refChars, segs, pairs)

  const base: (number | null)[] = []
  let refined = 0
  for (let k = 0; k < pairs.length; k++) {
    const j = pairs[k]
    if (j === null) {
      base.push(null)
      continue
    }
    const t = refineLocal(norm(refs[k].text), segs, j)
    if (t !== null) {
      refined += 1
      base.push(t)
    } else {
      base.push(segs[j].start)
    }
  }

  const lines = assignTimes(refs, base, offset)
  return toOutput(lines, { total: refs.length, hit, refined, moved })
}

// ------------------------------------------------- 云端引擎：字符轴全局对齐

/**
 * 字符级全局单调对齐（Needleman-Wunsch）的代价常量，整数化避免浮点累加误差。
 *
 * 取值理由：
 *  - 认错一个字（7）要低于「跳掉参考字 + 跳掉轴上字」（12 + 4 = 16），
 *    否则同音字会让算法宁可插两个空档，时间轴被撑开；
 *  - 轴上多出来的字（4）比参考字没唱（12）便宜得多 —— 云端会输出气口、和声、
 *    甚至前奏里的念白，这些都必须能被无声丢掉，而歌词整句没唱是罕见情况。
 */
const MATCH_COST = 0
const MISMATCH_COST = 7
const SKIP_REF_COST = 12
const SKIP_AXIS_COST = 4

/** 超过这个格子数就不用全矩阵（长歌 + 识别输出很长时会到几百万），退回贪心定位 */
const MAX_DP_CELLS = 4_000_000

/**
 * 参考歌词里至少要有这么大比例的字能在识别文本里对上，才认为「这份歌词属于这首歌」。
 *
 * B 站曲目经常自动配到同歌手另一首歌的歌词，两份文本共享的字很少；
 * 而正确的歌词即使有一批同音字，命中率也在七成以上。0.35 留足余量。
 */
const MIN_REF_HIT_RATIO = 0.35

/**
 * 把整段参考歌词的字与整条识别字符轴做全局对齐，返回「参考第 i 个字 → 轴下标」。
 *
 * 为什么不再逐行贪心：贪心时每行都去剩余轴上找最长公共片段，一旦某行定位偏后，
 * 游标就永久跳到那里，后面的行只能在更后面找 —— 表现就是歌词「隔一段跳一次」，
 * 而且中间那些行被迫挤在同一个时间点附近。全局 DP 天然单调，
 * 重复副歌也由整体代价决定落在第几遍，不会单独一行吸到远处。
 */
const charDtw = (ref: string[], text: string[]): { map: (number | null)[]; matched: number } => {
  const N = ref.length
  const M = text.length
  const W = M + 1
  const cost = new Int32Array((N + 1) * W)
  const back = new Int8Array((N + 1) * W) // 0=对角 1=跳过参考字 2=跳过轴上字

  for (let i = 1; i <= N; i++) {
    cost[i * W] = i * SKIP_REF_COST
    back[i * W] = 1
  }
  for (let j = 1; j <= M; j++) {
    cost[j] = j * SKIP_AXIS_COST
    back[j] = 2
  }

  for (let i = 1; i <= N; i++) {
    const ri = ref[i - 1]
    const row = i * W
    const prev = row - W
    for (let j = 1; j <= M; j++) {
      let best = cost[prev + j - 1] + (ri === text[j - 1] ? MATCH_COST : MISMATCH_COST)
      let ptr = 0
      const up = cost[prev + j] + SKIP_REF_COST
      if (up < best) {
        best = up
        ptr = 1
      }
      const left = cost[row + j - 1] + SKIP_AXIS_COST
      if (left < best) {
        best = left
        ptr = 2
      }
      cost[row + j] = best
      back[row + j] = ptr
    }
  }

  const map: (number | null)[] = new Array(N).fill(null)
  let matched = 0
  let i = N
  let j = M
  while (i > 0 && j > 0) {
    const ptr = back[i * W + j]
    if (ptr === 0) {
      map[i - 1] = j - 1
      if (ref[i - 1] === text[j - 1]) matched += 1
      i -= 1
      j -= 1
    } else if (ptr === 1) {
      i -= 1
    } else {
      j -= 1
    }
  }
  return { map, matched }
}

/** 字符轴上某个字的起唱时刻；长音被并进同一个词时取词尾 */
const axisTimeAt = (
  axis: { times: number[]; bounds: (WordBound | null)[] },
  index: number
): number | null => {
  const bound = axis.bounds[index]
  if (bound) {
    const [start, end, size] = bound
    if (isHeldNote(start, end, size)) return end
  }
  const time = axis.times[index]
  return typeof time === 'number' ? time : null
}

/**
 * 逐行贪心定位（旧实现），只在矩阵过大时兜底用。
 *
 * 保留它是因为极长的歌（几百行 × 上千字）全矩阵会吃掉几十 MB 内存，
 * 宁可掉一点精度也不能让低端机 OOM。
 */
const greedyBaseTimes = (
  refs: RefLine[],
  axis: { chars: string[]; times: number[]; bounds: (WordBound | null)[] }
): (number | null)[] => {
  const base: (number | null)[] = []
  let cursor = 0
  for (const line of refs) {
    const ref = charsOf(norm(line.text))
    if (!ref.length) {
      base.push(null)
      continue
    }

    const sub = {
      chars: axis.chars.slice(cursor),
      times: axis.times.slice(cursor),
      bounds: axis.bounds.slice(cursor),
    }
    const time = locate(ref, sub.chars, sub.times, sub.bounds)
    if (time === null) {
      base.push(null)
      continue
    }
    base.push(time)

    // 游标推到这次命中的位置之后。用时间反查比让 locate 再返回一次下标省事；
    // 相同时间戳的连续字在这里不会死循环，因为下面至少前进一格。
    let next = cursor
    while (next < axis.times.length && axis.times[next] < time - 1e-6) next += 1
    cursor = Math.min(next + 1, axis.chars.length)
  }
  return base
}

/**
 * 词级直连对齐（云端引擎专用）。
 *
 * 和 `alignLyric` 的区别只在**对齐的粒度**：那边是「参考句 → ASR 段」的句级 DTW，
 * 前提是 ASR 的断句和歌词行大致对得上；云端模型用的是 VAD 断句，
 * 唱得连绵的段落可能整段并成一句，句级 DTW 就全落到同一个段上，时间轴整片错位。
 *
 * 这里干脆不看断句：把全曲的词级时间戳摊成一条字符轴（`buildCharAxis`），
 * 再把参考歌词的字摊成另一条轴，两边做**全局单调对齐**，每行的起唱时间就是
 * 该行首字在轴上落到的那个字的时刻。定位不到的行交给 `assignTimes` 按字数插值。
 */
export const alignByWordAxis = (refRaw: string, asr: AsrResult, offset = 0): AlignOutput => {
  const refs = parseRefLyric(refRaw)
  const segs = buildAlignSegments(asr)
  if (!refs.length || !segs.length) return alignLyric(refRaw, asr, offset)

  const axis = buildCharAxis(segs, 0, segs.length - 1)
  if (!axis.chars.length) return alignLyric(refRaw, asr, offset)

  // 参考歌词摊平成一条字符轴，同时记下每行首字的位置
  const refChars: string[] = []
  const starts: number[] = []
  for (const line of refs) {
    starts.push(refChars.length)
    for (const ch of charsOf(norm(line.text))) refChars.push(ch)
  }
  if (!refChars.length) return alignLyric(refRaw, asr, offset)

  let base: (number | null)[]
  let matched = 0
  if ((refChars.length + 1) * (axis.chars.length + 1) <= MAX_DP_CELLS) {
    const dtw = charDtw(refChars, axis.chars)
    matched = dtw.matched
    const map = dtw.map
    base = starts.map((from, k) => {
      const to = k + 1 < starts.length ? starts[k + 1] : refChars.length
      for (let i = from; i < to; i++) {
        const at = map[i]
        if (at == null) continue
        return axisTimeAt(axis, at)
      }
      return null
    })
  } else {
    base = greedyBaseTimes(refs, axis)
    matched = base.filter((item) => item !== null).length
  }

  // 参考歌词和识别文本根本对不上（B 站曲目常见：自动配到同歌手另一首歌的歌词）。
  // 对不上的时候对齐出来的文字全是别人的歌词，时间也只是按字数摊出来的假时间，
  // 播放时看着像「歌词乱跳」。这种情况直接用识别文本成行 —— 有同音字，但至少是这首歌。
  if (refChars.length && matched / refChars.length < MIN_REF_HIT_RATIO) {
    const fallback = alignLyric('', asr, offset)
    if (fallback.lrc.trim()) return fallback
  }

  const hit = base.filter((item) => item !== null).length
  // 一个字都没对上（语言不对、纯伴奏、识别基本是噪声）时，全曲插值出来的时间是平的，
  // 所有行会挤在一起被当成同一句。这种情况退回到句级 DTW，至少按段起点分得开。
  if (!hit) return alignLyric(refRaw, asr, offset)
  const lines = assignTimes(refs, base, offset)
  return toOutput(lines, { total: refs.length, hit, refined: hit, moved: 0 })
}
