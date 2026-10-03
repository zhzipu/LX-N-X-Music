/**
 * 听歌识曲（移植自 lx-music-desktop-enhanced 的 musicRecognition 模块）。
 *
 * 与桌面版的差异：
 * - 引擎：Shazam（纯 JS 本地指纹）、酷狗（上传原始 PCM，需联网）、网易云
 *   （AFP 指纹由隐藏 WebView 本地算，直连网易云，**不需要任何服务端** ——
 *   指纹算法是 WebAssembly，Hermes 跑不了，而 WebView 的 V8 可以）。
 * - 采集从「系统内录 / 麦克风」简化为麦克风（原生 AudioRecord）。
 *
 * 用法：
 * ```ts
 * await startCapture()
 * const samples = await finishCapture()   // 或 abortCapture()
 * const outcome = await recognize(samples)
 * ```
 */
import { recognizeByKugou } from './engines/kugou'
import { recognizeByNetease } from './engines/netease'
import { recognizeByShazam } from './engines/shazam'
import { isAmbiguousRecognition, mergeResults, summarizeReports } from './decision'
import { RecognitionError } from './types'
import type {
  EngineReport,
  RecognitionEngine,
  RecognitionOutcome,
  RecognitionResult,
} from './types'

export * from './types'
export {
  startCapture,
  finishCapture,
  abortCapture,
  ensureRecordPermission,
  CAPTURE_SECONDS,
  CAPTURE_SAMPLE_RATE,
  MIN_CAPTURE_SECONDS,
} from './capture'
export { selectConsensusKey, isAmbiguousRecognition, mergeResults } from './decision'
export type { CaptureStats, CaptureResult } from './capture'
export { searchRecognitionResult, buildSearchKeyword } from './search'

interface EngineTask {
  engine: RecognitionEngine
  run: (signal?: AbortSignal, onDetail?: (text: string) => void) => Promise<RecognitionResult[]>
}

const runEngine = async (
  task: EngineTask,
  signal: AbortSignal | undefined
): Promise<{ engine: RecognitionEngine; results: RecognitionResult[]; report: EngineReport }> => {
  const startedAt = Date.now()
  let detail: string | undefined
  try {
    const results = await task.run(signal, (text) => {
      detail = text
    })
    return {
      engine: task.engine,
      results,
      report: {
        engine: task.engine,
        status: results.length ? 'matched' : 'no_match',
        detail,
        durationMs: Date.now() - startedAt,
      },
    }
  } catch (err: any) {
    return {
      engine: task.engine,
      results: [],
      report: {
        engine: task.engine,
        status: 'error',
        message: err instanceof RecognitionError ? err.message : (err?.message ?? '识别失败'),
        detail,
        durationMs: Date.now() - startedAt,
      },
    }
  }
}

export interface RecognizeOptions {
  signal?: AbortSignal
  /** 每个引擎返回后的回调，用于在 UI 上逐个点亮结果 */
  onEngineDone?: (report: EngineReport, results: RecognitionResult[]) => void
}

/**
 * 对采集到的采样点做识别。采样点必须是 16kHz / 单声道 / s16le。
 * 各引擎并行执行，任一引擎失败不影响其它引擎。
 */
export const recognize = async (
  samples: Int16Array,
  options: RecognizeOptions = {}
): Promise<RecognitionOutcome> => {
  const { signal, onEngineDone } = options
  const tasks: EngineTask[] = [
    {
      engine: 'shazam',
      run: (taskSignal, onDetail) => recognizeByShazam(samples, { signal: taskSignal, onDetail }),
    },
    {
      engine: 'netease',
      run: (taskSignal, onDetail) => recognizeByNetease(samples, { signal: taskSignal, onDetail }),
    },
    {
      engine: 'kugou',
      run: (taskSignal, onDetail) => recognizeByKugou(samples, { signal: taskSignal, onDetail }),
    },
  ]

  const settled = await Promise.all(
    tasks.map(async (task) => {
      const outcome = await runEngine(task, signal)
      onEngineDone?.(outcome.report, outcome.results)
      return outcome
    })
  )

  const merged = mergeResults(settled.map((item) => ({ engine: item.engine, results: item.results })))
  const reports = settled.map((item) => item.report)
  const { matched } = summarizeReports(reports)

  return {
    match: merged[0] ?? null,
    alternatives: merged.slice(1),
    ambiguous: matched.length > 0 && isAmbiguousRecognition(matched),
    reports,
  }
}
