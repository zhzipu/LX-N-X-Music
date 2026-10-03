/**
 * 音频采集。
 *
 * 采集来源是麦克风（对着外放采集），输出统一为 16kHz / 单声道 / s16le，
 * 这样后面的指纹算法与酷狗接口可以共用同一份数据。
 */
import { PermissionsAndroid, Platform } from 'react-native'
import {
  cancelRecording,
  peekRecording,
  startRecording,
  stopRecording,
  type RecordingStopResult,
} from '@/utils/nativeModules/audioRecorder'
import { base64ToBytes } from './vendor/base64'
import { bytesToInt16 } from './utils'
import { CapturePermissionError, CaptureTooShortError } from './types'

export const CAPTURE_SAMPLE_RATE = 16000
/**
 * 自动提交的时间点（秒）。到点就把「当前已录到的音频」送去识别一次，**录音不中断**，
 * 所以越靠后的轮次拿到的是越完整的片段。
 *
 * 注意：网易云的 AFP matcher 只认固定 **6 秒**窗口（见 `afp.ts`），
 * 所以 3 秒那一轮基本只有酷狗/Shazam 可能命中，网易云要到 7 秒那轮才有戏；
 * Shazam 需要同一 track 至少两段印证，10 秒以下只会发一段请求，实际也要 10 秒那轮。
 */
export const SUBMIT_AT_SECONDS = [3, 7, 10, 13]
/** 单次采集的最长时长：最后一个自动提交点之后停止录音 */
export const CAPTURE_SECONDS = SUBMIT_AT_SECONDS[SUBMIT_AT_SECONDS.length - 1]
/** 低于这个长度基本不可能识别成功，直接判失败 */
export const MIN_CAPTURE_SECONDS = 3
/** 单轮识别的音频太短就跳过（避免给引擎喂几百毫秒的碎片） */
export const MIN_ROUND_SECONDS = 1

/** 一次采集的体检数据，用来定位「采到静音」这类问题 */
export interface CaptureStats {
  /** 实际采用的音源 */
  source: string
  /** 采集时长（毫秒） */
  durationMs: number
  /** 采样点个数 */
  samples: number
  /** 原生侧统计的最大绝对值 */
  nativePeak: number
  /** 原生侧统计的 RMS */
  nativeRms: number
  /** 所有候选音源试采都是静音 */
  silenceProbeFailed: boolean
  /**
   * 各候选音源的试采结论，形如 `MIC:4/4 VOICE_RECOGNITION:1/4`。
   * 分母是试采窗口数（4 × 200ms），分子是「检测到持续信号」的窗口数；
   * 例如 `MIC:4/4 UNPROCESSED:1/4` 说明 MIC 全程有声、UNPROCESSED 只有开头一声（坏音源）。
   */
  probe: string
  /** JS 侧复算的最大绝对值（交叉验证，两者应一致） */
  peak: number
  /** JS 侧复算的 RMS */
  rms: number
  /** 是否整段静音（peak 为 0） */
  silent: boolean
  /**
   * 精确为 0 的采样点占比。
   * 真实麦克风录音（哪怕房间很安静）也会有量化底噪，这个值应接近 0；
   * 偏高说明系统在这些时刻给的是**数字静音**，不是「声音小」。实测 0.5 以上时
   * 服务端 AFP 指纹会算不出来（大段 0 样本会让 afp.wasm 抛错），识别必然失败。
   */
  zeroRatio: number
  /** 最长的一段连续数字静音时长（毫秒） */
  maxZeroRunMs: number
  /** 录音里几乎没有有效声音（有大段数字静音），识别基本不会成功 */
  lowSignal: boolean
}

export interface CaptureResult {
  samples: Int16Array
  stats: CaptureStats
}

export const ensureRecordPermission = async (): Promise<void> => {
  if (Platform.OS !== 'android') return
  const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
  const granted = await PermissionsAndroid.check(permission)
  if (granted) return
  const result = await PermissionsAndroid.request(permission, {
    title: '听歌识曲',
    message: '需要麦克风权限才能识别周围的音乐',
    buttonPositive: '允许',
    buttonNegative: '取消',
  })
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new CapturePermissionError(
      result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
        ? '麦克风权限已被拒绝，请到系统设置里为应用开启录音权限'
        : '未获得麦克风权限，无法听歌识曲'
    )
  }
}

export const startCapture = async (): Promise<void> => {
  await ensureRecordPermission()
  await startRecording(CAPTURE_SAMPLE_RATE)
}

const measureLevel = (samples: Int16Array): {
  peak: number
  rms: number
  zeroRatio: number
  maxZeroRunMs: number
} => {
  let peak = 0
  let squareSum = 0
  let zeroCount = 0
  let zeroRun = 0
  let maxZeroRun = 0
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i]
    const abs = value < 0 ? -value : value
    if (abs > peak) peak = abs
    squareSum += value * value
    if (value === 0) {
      zeroCount++
      zeroRun++
      if (zeroRun > maxZeroRun) maxZeroRun = zeroRun
    } else {
      zeroRun = 0
    }
  }
  const length = samples.length || 1
  return {
    peak,
    rms: Math.sqrt(squareSum / length),
    zeroRatio: zeroCount / length,
    maxZeroRunMs: (maxZeroRun / CAPTURE_SAMPLE_RATE) * 1000,
  }
}

/** 数字静音占比超过这个比例就认为这次录音没有可用信号 */
const LOW_SIGNAL_ZERO_RATIO = 0.5
/** 连续静音超过这个时长也认为不可用（哪怕整体占比不高） */
const LOW_SIGNAL_ZERO_RUN_MS = 3000

/** 把原生返回的 PCM 组装成 `CaptureResult`（不含长度校验，peek 与 stop 共用） */
const toCaptureResult = (result: RecordingStopResult): CaptureResult => {
  const decoded = base64ToBytes(result.base64 ?? '')
  const samples = bytesToInt16(decoded)
  const level = measureLevel(samples)
  const silent = level.peak === 0
  return {
    samples,
    stats: {
      source: result.source ?? 'unknown',
      durationMs: Math.round(result.duration ?? 0),
      samples: samples.length,
      nativePeak: result.peak ?? 0,
      nativeRms: Math.round(result.rms ?? 0),
      silenceProbeFailed: !!result.silenceProbeFailed,
      probe: result.probe ?? '',
      peak: level.peak,
      rms: Math.round(level.rms),
      silent,
      zeroRatio: level.zeroRatio,
      maxZeroRunMs: Math.round(level.maxZeroRunMs),
      lowSignal:
        !silent &&
        (level.zeroRatio > LOW_SIGNAL_ZERO_RATIO || level.maxZeroRunMs > LOW_SIGNAL_ZERO_RUN_MS),
    },
  }
}

/** 停止采集并把 PCM 转成采样点，数据不足时抛错 */
export const finishCapture = async (): Promise<CaptureResult> => {
  const captured = toCaptureResult(await stopRecording())
  if (captured.samples.length < MIN_CAPTURE_SECONDS * CAPTURE_SAMPLE_RATE) {
    throw new CaptureTooShortError()
  }
  return captured
}

/**
 * 读取当前已采集的音频，**不停止录音**（多轮提交时用）。
 * 不做长度校验：拿到的就是「那一刻的进度」，长度够不够交给调用方判断。
 */
export const peekCapture = async (): Promise<CaptureResult> => {
  return toCaptureResult(await peekRecording())
}

/** 主流程之外的中断（用户取消 / 页面离开） */
export const abortCapture = async (): Promise<void> => {
  try {
    await cancelRecording()
  } catch {
    // 未在录音时忽略即可
  }
}
