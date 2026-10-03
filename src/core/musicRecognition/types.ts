/** 参与识曲的引擎标识 */
export type RecognitionEngine = 'shazam' | 'netease' | 'kugou'

/** 单条识别结果 */
export interface RecognitionResult {
  /** 本地唯一 id */
  id: string
  title: string
  artist: string
  album?: string
  coverUrl?: string
  engine: RecognitionEngine
  /** 形如 `kg:123456`，用于跨引擎去重 */
  providerTrackId: string
  recognizedAt: number
}

export type EngineStatus = 'matched' | 'no_match' | 'error'

export interface EngineReport {
  engine: RecognitionEngine
  status: EngineStatus
  /** 失败或未命中时的原因，直接展示给用户 */
  message?: string
  /**
   * 调试用的原始响应摘要（HTTP 状态、服务端返回码、匹配数等）。
   * 只在开发构建里展示，用来区分「音频是静音」和「接口返回了但没匹配上」。
   */
  detail?: string
  durationMs: number
}

export interface RecognitionOutcome {
  /** 置信度最高的一条 */
  match: RecognitionResult | null
  /** 其它候选（已与 match 去重） */
  alternatives: RecognitionResult[]
  /**
   * 是否为「可能结果」。
   * 只有单引擎命中时置 true —— 没有第二个引擎交叉印证，存在误识别可能。
   */
  ambiguous: boolean
  reports: EngineReport[]
}

export class RecognitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecognitionError'
  }
}

/** 采集/权限相关错误，UI 需要据此给出不同的引导 */
export class CapturePermissionError extends RecognitionError {
  constructor(message = '未获得录音权限') {
    super(message)
    this.name = 'CapturePermissionError'
  }
}

export class CaptureTooShortError extends RecognitionError {
  constructor(message = '采集到的音频太短，请重新识别') {
    super(message)
    this.name = 'CaptureTooShortError'
  }
}
