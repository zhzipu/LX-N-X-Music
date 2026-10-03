/**
 * Shazam 识别引擎（主引擎）。
 *
 * 与上游一致：本地算指纹（不上传原始音频），请求前会把同一段音频切成
 * 「头 6 秒 / 尾 6 秒 / 整段」分别请求，要求同一个 track key 至少命中 2 段才算有效。
 */
import { SignatureGenerator, type SignatureResult } from '../vendor/shazamSignature'
import { selectConsensusKey } from '../decision'
import { createRequestSignal, randomUuid } from '../utils'
import { RecognitionError, type RecognitionResult } from '../types'

const REQUEST_TIMEOUT_MS = 10000
/** 触发多段校验的最短音频长度（秒） */
const CONSENSUS_MIN_SECONDS = 10
const CONSENSUS_SEGMENT_SECONDS = 6
const SAMPLE_RATE = 16000

// 指纹计算是 CPU 密集且不可并发（共用缓冲），串行化
let generatorQueue: Promise<unknown> = Promise.resolve()

const computeSignature = (samples: Int16Array): Promise<SignatureResult> => {
  const task = generatorQueue.then(() => new SignatureGenerator().getSignature(samples))
  generatorQueue = task.then(
    () => undefined,
    () => undefined
  )
  return task as Promise<SignatureResult>
}

const getAlbum = (track: any): string | undefined => {
  const sections = Array.isArray(track?.sections) ? track.sections : []
  for (const section of sections) {
    if (section?.type !== 'SONG' || !Array.isArray(section.metadata)) continue
    const album = section.metadata.find((item: any) => item?.title === 'Album')
    if (typeof album?.text === 'string') return album.text
  }
  return undefined
}

const mapTrack = (track: any, timestamp: number): RecognitionResult => ({
  id: `${track.key}:${timestamp}`,
  title: track.title ?? '未知歌曲',
  artist: track.subtitle ?? '',
  album: getAlbum(track),
  coverUrl: track.images?.coverarthq ?? track.images?.coverart,
  engine: 'shazam',
  providerTrackId: `shazam:${String(track.key)}`,
  recognizedAt: timestamp,
})

const tagSamples = async (samples: Int16Array, signal?: AbortSignal): Promise<any | null> => {
  const signature = await computeSignature(samples)
  const timestamp = Date.now()
  const base = `https://amp.shazam.com/discovery/v5/zh/CN/android/-/tag/${randomUuid(true)}/${randomUuid()}`
  const query = new URLSearchParams({
    sync: 'true',
    webv3: 'true',
    sampling: 'true',
    connected: '',
    shazamapiversion: 'v3',
    sharehub: 'true',
    video: 'v3',
  }).toString()

  const request = createRequestSignal(signal, REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}?${query}`, {
      method: 'POST',
      signal: request.signal,
      headers: {
        'Content-Type': 'application/json',
        'Content-Language': 'zh_CN',
        'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 10; K)',
      },
      body: JSON.stringify({
        geolocation: { altitude: 300, latitude: 31.2, longitude: 121.5 },
        signature: {
          samplems: Math.round((signature.numberSamples / signature.sampleRateHz) * 1000),
          timestamp: timestamp >>> 0,
          uri: signature.uri,
        },
        timestamp: timestamp >>> 0,
        timezone: 'Asia/Shanghai',
      }),
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new RecognitionError('Shazam 网络请求失败')
  } finally {
    request.cleanup()
  }

  if (response.status === 429) throw new RecognitionError('Shazam 请求过于频繁，请稍后重试')
  if (!response.ok) throw new RecognitionError(`Shazam 服务请求失败（${response.status}）`)

  const body: any = await response.json()
  if (!Array.isArray(body?.matches) || body.matches.length === 0 || !body.track) return null
  return body
}

/**
 * 按上游规则切分：整段 + 头 6 秒 + 尾 6 秒。
 *
 * 顺序上把两个 6 秒片段放在前面：判据不变（同一个 track key 至少命中 2 段），
 * 但常见情况下第 2 次请求就能凑够共识，本机只需要算 2×6 秒的指纹而不是 12+6 秒，
 * 手机上能省掉约三分之一的 CPU。
 */
const getRecognitionSegments = (samples: Int16Array): Int16Array[] => {
  const total = samples.length
  if (total < CONSENSUS_MIN_SECONDS * SAMPLE_RATE) return [samples]
  const segment = CONSENSUS_SEGMENT_SECONDS * SAMPLE_RATE
  return [samples.slice(0, segment), samples.slice(total - segment), samples]
}

const SEGMENT_LABELS = ['头6s', '尾6s', '整段']

export interface ShazamEngineOptions {
  signal?: AbortSignal
  /** 每走一步回报一次进度文本，用于面板上的调试信息 */
  onDetail?: (text: string) => void
}

export const recognizeByShazam = async (
  samples: Int16Array,
  options: ShazamEngineOptions = {}
): Promise<RecognitionResult[]> => {
  const { signal, onDetail } = options
  const bodies = new Map<string, any>()
  const keys: string[] = []
  const trace: string[] = []
  const segments = getRecognitionSegments(samples)

  for (let index = 0; index < segments.length; index++) {
    const label = SEGMENT_LABELS[index] ?? `段${index}`
    if (signal?.aborted) {
      trace.push(`${label}:取消`)
      break
    }

    let body: any = null
    try {
      body = await tagSamples(segments[index], signal)
    } catch (err: any) {
      trace.push(`${label}:${err?.message ?? '请求失败'}`)
      onDetail?.(trace.join(' | '))
      throw err
    }

    if (!body?.track) {
      trace.push(`${label}:接口无匹配`)
      onDetail?.(trace.join(' | '))
      continue
    }

    const key = String(body.track.key)
    bodies.set(key, body)
    keys.push(key)
    trace.push(`${label}:命中${key}`)
    onDetail?.(trace.join(' | '))

    const consensusKey = selectConsensusKey(keys)
    if (consensusKey) {
      // 两段独立校验一致，可以给结论了
      onDetail?.(`${trace.join(' | ')} → 通过多段校验`)
      return [mapTrack(bodies.get(consensusKey)!.track, Date.now())]
    }
  }

  if (keys.length) {
    // 有结果但没有第二段印证，判定为不可信，整体丢弃
    const text = `${trace.join(' | ')} → 未通过多段校验`
    console.log(`[识曲] Shazam ${text}`)
    onDetail?.(text)
  } else if (!trace.length) {
    onDetail?.('未产生请求')
  }
  return []
}
