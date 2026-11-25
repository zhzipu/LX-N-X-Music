/**
 * 云端语音识别：阿里云百炼 `qwen-audio-3.1-asr-flash`。
 *
 * 为什么换成云端：端侧 whisper base 的歌词打轴精度不够（同音字、拖长音都靠猜），
 * 而 Qwen-Audio-3.1-ASR-Flash 原生支持**歌唱识别**，并且直接返回词级毫秒时间戳，
 * 正好是歌词对齐需要的东西 —— 拿到 `words[]` 之后，`align.ts` 那套 DTW 一句都不用改。
 *
 * 限制（官方文档，同步调用）：
 *  - 单文件 ≤ 2GB、时长 ≤ 5 分钟。超长的歌调 `Math` 也救不了，直接报错让用户知道。
 *  - 走 SSE 拿增量结果：非流式响应只保证 `output.sentence.text`，
 *    词级时间戳在流式事件里才是稳定可用的（`words[i].fixed`）。
 *
 * 鉴权：用户自己在设置里填 DashScope API Key（明文存在本机设置里）。
 */
import { readFile, stat, temporaryDirectoryPath, writeFile } from '@/utils/fs'

import type { AsrResult, AsrSegment, AsrToken } from './index'

/** 老域名，北京地域的通用入口；{WorkspaceId} 专属域名不是每个人都能拿到 */
export const DEFAULT_ENDPOINT =
  'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation'

export const MODEL = 'qwen-audio-3.1-asr-flash'

/** 同步调用的硬限制，超了服务端会拒 */
export const MAX_AUDIO_SECONDS = 5 * 60

/** 超出这个体积就不传 base64 了（base64 会把体积抬 1/3，256MB 的请求没人受得了） */
const MAX_BASE64_BYTES = 40 * 1024 * 1024

const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  amr: 'audio/amr',
  wma: 'audio/x-ms-wma',
}

interface QwenWord {
  text?: string
  begin_time?: number
  end_time?: number
  punctuation?: string
  fixed?: boolean
}

interface QwenSentence {
  sentence_id?: number
  text?: string
  begin_time?: number
  end_time?: number
  words?: QwenWord[]
}

export interface TranscribeOptions {
  apiKey: string
  /** 参考歌词前 400 字，作为上下文喂给模型，能压掉一批同音字错误 */
  context?: string
  /** 已处理音频的秒数，用来在面板上显示进度 */
  onProgress?: (processedSeconds: number) => void
  /** 把原始返回另存一份，方便 adb 拉回来对账 */
  dumpPath?: string
}

const extOf = (path: string): string => {
  const match = /\.([a-zA-Z0-9]{1,5})$/.exec(path)
  return match ? match[1].toLowerCase() : 'mp3'
}

const buildBody = (base64: string, format: string, context?: string) => {
  const content: Record<string, unknown>[] = []
  const text = context?.trim()
  if (text) {
    // 上下文消息必须排在音频之前，且总长 ≤ 400 字（超出会被服务端截断）
    content.push({ type: 'input_text', text: text.slice(0, 400) })
  }
  content.push({
    type: 'input_audio',
    input_audio: { data: `data:${MIME[format] ?? 'audio/mpeg'};base64,${base64}` },
  })

  return {
    model: MODEL,
    input: { messages: [{ role: 'user', content }] },
    parameters: { format },
  }
}

/** 把一条 SSE 事件里的句子收进 map（同一 sentence_id 以最后一次为准） */
const mergeSentence = (map: Map<number, QwenSentence>, sentence: QwenSentence) => {
  const id = sentence.sentence_id ?? map.size
  const previous = map.get(id)
  map.set(id, {
    ...previous,
    ...sentence,
    // 流式过程中 words 会逐条追加，不能拿空数组覆盖已有的
    words: sentence.words?.length ? sentence.words : previous?.words,
  })
}

/**
 * 发请求并收集 SSE 事件。
 *
 * RN 的 fetch 拿不到响应流，所以这里用 XHR 的 `onprogress` 增量读 `responseText`，
 * 按行切出 `data:` 开头的 JSON。整段 JSON 几百 KB，累积在内存里没问题。
 */
const stream = async (
  endpoint: string,
  apiKey: string,
  body: unknown,
  onSentence: (sentence: QwenSentence) => void,
  onProcessed: (seconds: number) => void
): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', endpoint)
    xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.setRequestHeader('X-DashScope-SSE', 'enable')
    xhr.timeout = 180 * 1000

    let consumed = 0
    let pending = ''

    const handleLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) return
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') return
      try {
        const data = JSON.parse(payload)
        const sentence: QwenSentence | undefined = data?.output?.sentence
        if (sentence) onSentence(sentence)
        const duration = data?.usage?.duration
        if (typeof duration === 'number') onProcessed(duration)
      } catch {
        // 半截行（事件被 TCP 切开）在这里解析失败很正常，等下一次 progress 补全
      }
    }

    const drain = () => {
      const text = xhr.responseText ?? ''
      if (text.length <= consumed) return
      pending += text.slice(consumed)
      consumed = text.length
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      for (const line of lines) handleLine(line)
    }

    xhr.onprogress = drain
    xhr.onload = () => {
      drain()
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      let message = `HTTP ${xhr.status}`
      try {
        const data = JSON.parse(xhr.responseText ?? '{}')
        if (data?.message) message = `${message}：${data.message}`
        else if (data?.code) message = `${message}：${data.code}`
      } catch {
        // 保持 HTTP 状态码
      }
      reject(new Error(message))
    }
    xhr.onerror = () => { reject(new Error('网络请求失败')) }
    xhr.ontimeout = () => { reject(new Error('识别超时（3 分钟）')) }
    xhr.send(JSON.stringify(body))
  })
}

/** 上一条快照的词表是不是这一条的前缀 —— 判断「全量快照」还是「增量分句」 */
const isPrefix = (prev: string[], next: string[]): boolean =>
  prev.length > 0 &&
  next.length >= prev.length &&
  prev.every((text, i) => next[i] === text)

/**
 * 把流式快照还原成「一句一段」的 segments。
 *
 * 关键事实（2026-11 实测，`qwen-audio-3.1-asr-flash` 流式）：
 * 每条 `output.sentence` 都是**从头到当前的全量快照**，不是新的一句 ——
 * `text` 是整首歌目前为止的全部文字，`words[]` 也是累积词表，
 * `begin_time` 恒为首字的时刻（30 条事件全是 1520ms）。
 *
 * 之前把每条快照当成独立句子，一首 30 行的歌就会拼出 30+29+…+1 = 465 行，
 * 每行的文字是「前面所有行 + 当前行」，时间还都挤在同一个起点附近。
 * 播放时一过歌词行就往下跳七八行，正是这个重复。
 *
 * 所以这里按前缀判断取增量：新增的词表 / 新增的文本才是当前这一段。
 * 万一服务端将来改成真正的增量返回（前缀判断不成立），就退回「一条事件一段」的老逻辑。
 */
/**
 * 词表时间体检。
 *
 * 实测（2026-11，bili_BV1r9Ts6ZE8B）：流式快照的词表里会插进几个时间戳离谱的词 ——
 * 「你说」被标成 47.5s→82.6s（两字跨 35 秒），紧接着「你」「不」标到 87.8s / 93.0s，
 * 然后下一个词又回到 29.4s。**词表时间在倒退**。
 *
 * 这种词不是文字错了（文字顺序是对的），是**时间**错了。它们会让字符轴的时间倒流：
 * 对齐时一整段（20 行）歌词都被定位到那个错误的时刻，之后的行又被「强制单调」
 * 一路顶过去。播放时看到的就是「滚到某一句就不动了」，隔一分钟突然闪过去。
 *
 * 处理办法（只动时间、不动文字顺序）：
 *  1. 扫出时间倒退的位置，把倒退点**之前**那些比它还晚的词丢掉 —— 少几个字，DTW 会
 *     当成插入/删除扛过去；留着会把整首歌的时间带偏。
 *  2. 词尾不许越过下一个词的词头，否则「你的手」这种被拉长到 8 秒的词会再次造成倒流。
 */
const sanitizeTokens = (segments: AsrSegment[]): AsrSegment[] => {
  const flat: AsrToken[] = []
  for (const seg of segments) flat.push(...seg.tokens)

  const dropped = new Set<AsrToken>()
  for (let i = 1; i < flat.length; i++) {
    if (flat[i].t >= flat[i - 1].t) continue
    for (let j = i - 1; j >= 0; j--) {
      if (flat[j].t <= flat[i].t) break
      dropped.add(flat[j])
    }
  }

  for (let i = 0; i < flat.length - 1; i++) {
    const token = flat[i]
    const next = flat[i + 1]
    if (token.e === undefined || dropped.has(token)) continue
    if (next.t > token.t && token.e > next.t) token.e = next.t
  }

  if (!dropped.size) return segments
  for (const seg of segments) {
    if (!seg.tokens.some((token) => dropped.has(token))) continue
    seg.tokens = seg.tokens.filter((token) => !dropped.has(token))
    // 段的时间范围也跟着收缩，否则「段尾」还停在那个被丢掉的错误时间上
    if (seg.tokens.length) {
      seg.t0 = seg.tokens[0].t
      seg.t1 = Math.max(seg.tokens[seg.tokens.length - 1].e ?? seg.t0, seg.t0)
    }
  }
  return segments
}

const toSegments = (sentences: QwenSentence[]): AsrSegment[] => {
  const segments: AsrSegment[] = []
  let prevWords: string[] = []
  let prevText = ''

  for (const sentence of sentences) {
    const words = (sentence.words ?? []).filter((word) => (word.text ?? '').length > 0)
    const wordTexts = words.map((word) => word.text ?? '')
    const fresh = isPrefix(prevWords, wordTexts) ? words.slice(prevWords.length) : words

    const fullText = (sentence.text ?? '').trim()
    let text = fullText
    if (prevText && fullText.startsWith(prevText)) text = fullText.slice(prevText.length).trim()
    if (!text) {
      text = fresh.map((word) => `${word.text ?? ''}${word.punctuation ?? ''}`).join('')
    }

    prevWords = wordTexts.length >= prevWords.length ? wordTexts : prevWords
    if (fullText) prevText = fullText
    if (!text) continue

    const tokens: AsrToken[] = fresh
      .map((word) => ({
        t: (word.begin_time ?? 0) / 1000,
        e: (word.end_time ?? 0) / 1000,
        s: `${word.text ?? ''}${word.punctuation ?? ''}`,
      }))
      .filter((token) => token.s.length > 0)

    const t0 = (fresh[0]?.begin_time ?? sentence.begin_time ?? 0) / 1000
    const firstToken = tokens[0]?.t
    const lastToken = tokens[tokens.length - 1]?.e
    const t1 = (fresh[fresh.length - 1]?.end_time ?? sentence.end_time ?? 0) / 1000 || lastToken || t0

    segments.push({
      t0: typeof firstToken === 'number' && firstToken > 0 ? firstToken : t0,
      t1: Math.max(t1, t0),
      text,
      tokens,
    })
  }
  return sanitizeTokens(segments)
}

export const transcribeByQwen = async (
  audioPath: string,
  options: TranscribeOptions
): Promise<AsrResult> => {
  const apiKey = options.apiKey.trim()
  if (!apiKey) throw new Error('还没填写 DashScope API Key')

  const format = extOf(audioPath)
  const size = Number((await stat(audioPath)).size) || 0
  if (!size) throw new Error('音频文件是空的')
  if (size > MAX_BASE64_BYTES) throw new Error(`音频太大（${Math.round(size / 1024 / 1024)}MB），暂不支持`)

  const base64 = await readFile(audioPath, 'base64')
  const body = buildBody(base64, format, options.context)

  const map = new Map<number, QwenSentence>()
  await stream(
    DEFAULT_ENDPOINT,
    apiKey,
    body,
    (sentence) => { mergeSentence(map, sentence) },
    (seconds) => { options.onProgress?.(seconds) }
  )

  const sentences = Array.from(map.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, sentence]) => sentence)

  if (options.dumpPath) {
    void writeFile(options.dumpPath, JSON.stringify({ endpoint: DEFAULT_ENDPOINT, sentences }))
      .catch(() => {})
  }

  const segments = toSegments(sentences)
  if (!segments.length) throw new Error('没有识别到可用的人声，换一首试试')

  const last = segments[segments.length - 1]
  return {
    duration: Math.round(last.t1),
    // 云端给的是模型原生词级时间戳，不存在「DTW 没跑」的退化情况
    dtw: true,
    segments,
  }
}

/** 失败时把手上有的东西落盘，方便排查（外部临时目录，adb 能拉） */
export const dumpFailure = async (name: string, data: unknown) => {
  try {
    const path = `${temporaryDirectoryPath}/asr-fail-${name}.json`
    await writeFile(path, JSON.stringify(data, null, 2))
    return path
  } catch {
    return ''
  }
}
