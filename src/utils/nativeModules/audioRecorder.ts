import { NativeModules } from 'react-native'

const { AudioRecorderModule } = NativeModules

export interface RecordingStartResult {
  sampleRate: number
  channels: number
  /** 实际采用的音源名，如 UNPROCESSED / VOICE_RECOGNITION / MIC */
  source?: string
  sourceValue?: number
}

export interface RecordingStopResult {
  /** 16kHz / 单声道 / s16le 的原始采样，base64 编码 */
  base64: string
  sampleRate: number
  channels: number
  bytes: number
  /** 采集时长（毫秒） */
  duration: number
  /** 实际采用的音源名 */
  source?: string
  /** 整段音频的最大绝对值，0 表示整段静音 */
  peak?: number
  /** 整段音频的 RMS（均方根），判断采集音量用 */
  rms?: number
  /** 所有候选音源试采都是静音时为 true */
  silenceProbeFailed?: boolean
  /** 各音源的试采结论，如 `MIC:4/4 UNPROCESSED:1/4`（排查音源选择用） */
  probe?: string
}

const ensureModule = () => {
  if (!AudioRecorderModule) {
    throw new Error('录音模块不可用，请重新编译安装应用')
  }
  return AudioRecorderModule
}

export const isAudioRecorderAvailable = (): boolean => !!AudioRecorderModule

export const startRecording = (sampleRate: number): Promise<RecordingStartResult> =>
  ensureModule().start(sampleRate)

export const stopRecording = (): Promise<RecordingStopResult> => ensureModule().stop()

export const cancelRecording = (): Promise<boolean> => ensureModule().cancel()

export const isRecording = (): Promise<boolean> => ensureModule().isRecording()
