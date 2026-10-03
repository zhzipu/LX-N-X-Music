/**
 * 酷狗识别引擎（备用）。
 *
 * 与 Shazam 不同，酷狗这条链路不需要本地指纹：直接把 8kHz 单声道 s16le 的原始 PCM
 * 作为请求体上传即可，所以它不依赖 FFT，在手机上几乎不占 CPU，作为兜底引擎很合适。
 */
import { md5Concat, md5Text } from '../vendor/md5'
import { createRequestSignal, hexToDecimalString, resampleTo8kBytes } from '../utils'
import { RecognitionError, type RecognitionResult } from '../types'

const REQUEST_TIMEOUT_MS = 10000
// 酷狗 Android 正式版客户端里的固定串，用于请求签名
const ANDROID_KEY = 'OIlwieks28dk2k092lksi2UIkp'
const APP_ID = 1005
const CLIENT_VERSION = 20489

// 酷狗正式版把 MD5 设备标识当成无符号大整数解释，直接用随机 hex 会被判非法
const getDeviceIdentity = () => {
  const dfid = '-'
  const mid = hexToDecimalString(md5Text(dfid))
  return { dfid, mid, uuid: md5Text(`${dfid}${mid}`) }
}

interface KugouMatchItem {
  songid?: number | string
  song_id?: number | string
  mixsongid?: number | string
  songname?: string
  song_name?: string
  songNameSuffix?: string
  song_name_suffix?: string
  singername?: string
  singer_name?: string
  authors?: Array<{ name?: string; author_name?: string }>
  union_cover?: string
  hash_128?: string
  hash128?: string
  album_name?: string
  album?:
    | Array<{ albumname?: string; album_name?: string; name?: string }>
    | { albumname?: string; album_name?: string; name?: string }
    | string
}

const mapItem = (item: KugouMatchItem): RecognitionResult | null => {
  const baseName = item.songname ?? item.song_name ?? ''
  if (!baseName) return null
  const nameSuffix = item.songNameSuffix ?? item.song_name_suffix
  const suffix = nameSuffix ? ` (${nameSuffix})` : ''
  const authors = Array.isArray(item.authors) ? item.authors : []
  const album = Array.isArray(item.album) ? item.album[0] : item.album
  const albumName =
    typeof album === 'string'
      ? album
      : (album?.albumname ?? album?.album_name ?? album?.name ?? item.album_name ?? '')
  const trackId = item.mixsongid ?? item.songid ?? item.song_id ?? item.hash_128 ?? item.hash128 ?? baseName
  return {
    id: `kg_${trackId}:${Date.now()}`,
    title: `${baseName}${suffix}`,
    artist:
      item.singername ??
      item.singer_name ??
      authors
        .map((author) => author.name ?? author.author_name)
        .filter(Boolean)
        .join('、'),
    album: albumName || undefined,
    // union_cover 里带 {size} 占位符
    coverUrl: item.union_cover ? item.union_cover.replace('{size}', '400') : undefined,
    engine: 'kugou',
    providerTrackId: `kg:${String(trackId)}`,
    recognizedAt: Date.now(),
  }
}

export interface KugouEngineOptions {
  signal?: AbortSignal
  /** 回报服务端返回码等诊断信息，用于面板上的调试信息 */
  onDetail?: (text: string) => void
}

export const recognizeByKugou = async (
  samples: Int16Array,
  options: KugouEngineOptions = {}
): Promise<RecognitionResult[]> => {
  const { signal, onDetail } = options
  const body = resampleTo8kBytes(samples)
  if (!body.length) {
    onDetail?.('无有效 PCM，未发起请求')
    return []
  }

  const clienttime = Math.floor(Date.now() / 1000)
  const device = getDeviceIdentity()
  const params: Record<string, string | number> = {
    ...device,
    appid: APP_ID,
    clientver: CLIENT_VERSION,
    clienttime,
    fpid: Date.now(),
    area_code: 1,
    include_unpublish: 1,
    useid: 0,
    multi_result: 1,
  }

  // 签名 = MD5(key + 按参数名排序的 name=value 拼接 + 原始请求体 + key)
  const paramsString = Object.keys(params)
    .sort()
    .map((name) => `${name}=${String(params[name])}`)
    .join('')
  const signature = md5Concat([ANDROID_KEY, paramsString, body, ANDROID_KEY])

  const query = Object.keys(params)
    .map((name) => `${encodeURIComponent(name)}=${encodeURIComponent(String(params[name]))}`)
    .join('&')

  const request = createRequestSignal(signal, REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(
      `https://gateway.kugou.com/fingerprint.service/v1/music_trackid_mulit?${query}&signature=${signature}`,
      {
        method: 'POST',
        signal: request.signal,
        headers: {
          'content-type': 'application/octet-stream',
          'user-agent': 'KuGou/11490 (Android)',
          dfid: '-',
          mid: device.mid,
          clienttime: String(clienttime),
          'kg-rc': '1',
          'kg-thash': '5d816a0',
          'kg-rec': '1',
          'kg-rf': 'B9EDA08A64250DEFFBCADDEE00F8F25F',
        },
        // RN 的 fetch 支持 ArrayBufferView 作为 body
        body,
      }
    )
  } catch (err: any) {
    if (signal?.aborted) throw err
    throw new RecognitionError('酷狗听歌识曲网络请求失败')
  } finally {
    request.cleanup()
  }

  if (!response.ok) throw new RecognitionError(`酷狗听歌识曲服务请求失败（${response.status}）`)

  const data: any = await response.json()
  if (data?.status !== 1) {
    const detail = `HTTP ${response.status} status=${data?.status ?? '-'} code=${data?.error_code ?? '-'} msg=${data?.error_msg ?? data?.msg ?? '-'} pcm=${data?.pcm_second ?? '-'}s`
    console.log('[识曲] 酷狗返回异常：', detail)
    onDetail?.(detail)
    return []
  }
  const items: KugouMatchItem[] = Array.isArray(data.data)
    ? data.data
    : (data.data?.list ?? data.data?.songs ?? [])
  const mapped = items
    .map(mapItem)
    .filter((item): item is RecognitionResult => item != null)
    .slice(0, 5)
  onDetail?.(
    `HTTP ${response.status} status=1 命中=${mapped.length} pcm=${data?.pcm_second ?? '-'}s`
  )
  return mapped
}
