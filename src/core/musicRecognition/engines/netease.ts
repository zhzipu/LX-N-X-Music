/**
 * 网易云识别引擎（指纹本地算，直连网易云）。
 *
 * 网易云只认它自家的 AFP 指纹（`algorithmCode=shazam_v2`，8kHz 输入）。指纹算法是
 * WebAssembly，Hermes 跑不了，所以交给隐藏 WebView 在设备本地计算（见 `../afp.ts`
 * 与 `android/app/src/main/assets/afp/`）；拿到指纹后直接请求网易云官方接口，
 * **整条链路不需要任何中转服务器**。
 *
 * 实测（2026-10-03）：网易云 matcher 只对官方扩展那套**固定 6 秒窗口**稳定命中，
 * 5s/5.5s/7s/8s/10s 全不中，6 秒窗口在任意起点 12/12 命中。所以指纹统一按
 * 「中间 6 秒」计算，`duration` 也填 6。详见 `../afp.ts` 的 `AFP_WINDOW_SECONDS`。
 */
import { AFP_WINDOW_SECONDS, computeAfpFingerprint } from '../afp'
import { createRequestSignal, resampleTo8kBytes } from '../utils'
import { RecognitionError, type RecognitionResult } from '../types'

const REQUEST_TIMEOUT_MS = 15000
const MATCH_ENDPOINT = 'https://interface.music.163.com/api/music/audio/match'
/** 官方 Chrome 扩展使用的固定 sessionId */
const SESSION_ID = '441df692-afea-4a54-8aff-f5f20fd34f12'

interface NeteaseSong {
  id?: number | string
  name?: string
  artists?: Array<{ name?: string }>
  ar?: Array<{ name?: string }>
  album?: { name?: string; picUrl?: string }
  al?: { name?: string; picUrl?: string }
}

interface NeteaseMatchItem {
  song?: NeteaseSong
}

const mapItem = (item: NeteaseMatchItem): RecognitionResult | null => {
  const song = item?.song
  if (!song?.id || !song.name) return null
  const artists = song.artists ?? song.ar ?? []
  const album = song.album ?? song.al
  return {
    id: `wy_${song.id}:${Date.now()}`,
    title: song.name,
    artist: artists
      .map((author) => author?.name)
      .filter(Boolean)
      .join('、'),
    album: album?.name || undefined,
    coverUrl: album?.picUrl || undefined,
    engine: 'netease',
    providerTrackId: `wy:${String(song.id)}`,
    recognizedAt: Date.now(),
  }
}

export interface NeteaseEngineOptions {
  signal?: AbortSignal
  /** 回报诊断信息（指纹长度、命中数、返回码等），用于面板上的调试信息 */
  onDetail?: (text: string) => void
}

export const recognizeByNetease = async (
  samples: Int16Array,
  options: NeteaseEngineOptions = {}
): Promise<RecognitionResult[]> => {
  const { signal, onDetail } = options
  // 16kHz → 8kHz：既是指纹要求的采样率，也让送进 WebView 的数据量减半
  const bytes = resampleTo8kBytes(samples)
  if (!bytes.length) {
    onDetail?.('无有效 PCM，未发起请求')
    return []
  }

  let fingerprint = ''
  try {
    fingerprint = await computeAfpFingerprint(bytes)
  } catch (err: any) {
    const message = err?.message ?? '未知错误'
    console.log('[识曲] 网易云指纹计算失败：', message)
    onDetail?.(`指纹失败：${message}`)
    throw new RecognitionError(`网易云识曲指纹计算失败（${message}）`)
  }
  if (signal?.aborted) throw new Error('已取消')
  if (!fingerprint) {
    onDetail?.('指纹为空，未发起请求')
    return []
  }

  const seconds = AFP_WINDOW_SECONDS
  const url = [
    MATCH_ENDPOINT,
    `?sessionId=${SESSION_ID}&algorithmCode=shazam_v2`,
    `&duration=${seconds}`,
    `&rawdata=${encodeURIComponent(fingerprint)}`,
    '&times=2&decrypt=1',
  ].join('')

  const request = createRequestSignal(signal, REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: request.signal,
      headers: {
        Referer: 'https://music.163.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      },
    })
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new RecognitionError('网易云听歌识曲网络请求失败')
  } finally {
    request.cleanup()
  }

  if (!response.ok) {
    // 把接口返回的 msg 带出来，否则面板上只有一句「不可用」没法排查
    let reason = ''
    try {
      const body: any = await response.json()
      if (body?.msg) reason = `：${body.msg}`
    } catch {
      // 响应体不是 JSON 就忽略
    }
    console.log('[识曲] 网易云请求失败：', response.status, reason)
    onDetail?.(`HTTP ${response.status}${reason}`)
    throw new RecognitionError(`网易云听歌识曲请求失败（${response.status}${reason}）`)
  }

  let json: any
  try {
    json = await response.json()
  } catch {
    onDetail?.('响应不是 JSON')
    throw new RecognitionError('网易云听歌识曲返回异常')
  }

  const payload = json?.data
  if (json?.code !== 200 || !payload) {
    onDetail?.(`code=${json?.code ?? '-'} msg=${json?.msg ?? json?.message ?? '-'}`)
    return []
  }

  // 没匹配到时 result 是 null，命中时是数组
  const items: NeteaseMatchItem[] = Array.isArray(payload.result) ? payload.result : []
  const mapped = items
    .map(mapItem)
    .filter((item): item is RecognitionResult => item != null)
    .slice(0, 5)
  onDetail?.(
    `命中=${mapped.length} 窗口=${seconds}s 指纹=${Math.round(fingerprint.length / 1024)}KB ` +
      `noMatch=${payload.noMatchReason ?? '-'}`
  )
  return mapped
}
