/**
 * 歌词识别（ASR）的类型与入口。
 *
 * 引擎只有一套：阿里云百炼 `qwen-audio-3.1-asr-flash`（见 `./qwen`）。
 * 端侧 whisper 那套已经删掉 —— base 模型的打轴精度撑不起歌词对齐，
 * 而且 57MB 模型 + native 库把包体撑到 78MB，换云端之后整块都省了。
 *
 * 调用方先看 `isConfigured`：没填 API Key 就别往下走，免得白下载一遍整首歌。
 */

export interface AsrToken {
  /** token 起始时刻（秒） */
  t: number
  /** token 结束时刻（秒）。歌词对齐靠它判断拖长音 */
  e?: number
  /** token 文本 */
  s: string
}

export interface AsrSegment {
  t0: number
  t1: number
  text: string
  tokens: AsrToken[]
}

export interface AsrResult {
  /** 音频时长（秒） */
  duration: number
  /** 时间戳是否来自模型原生对齐。云端恒为 true，字段留着是为了兼容旧逻辑 */
  dtw: boolean
  segments: AsrSegment[]
}

/** 设置里填的 Key 是否可用 */
export const isConfigured = (apiKey?: string | null): boolean => !!apiKey?.trim()

export { MODEL, MAX_AUDIO_SECONDS, transcribeByQwen } from './qwen'
