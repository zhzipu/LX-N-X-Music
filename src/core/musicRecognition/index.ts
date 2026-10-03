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
import { ENGINE_ORDER, isAmbiguousRecognition, mergeResults, summarizeReports } from './decision'
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
  peekCapture,
  abortCapture,
  ensureRecordPermission,
  CAPTURE_SECONDS,
  CAPTURE_SAMPLE_RATE,
  MIN_CAPTURE_SECONDS,
  MIN_ROUND_SECONDS,
  SUBMIT_AT_SECONDS,
} from './capture'
export { selectConsensusKey, isAmbiguousRecognition, mergeResults, ENGINE_ORDER } from './decision'
export type { CaptureStats, CaptureResult } from './capture'
export { searchRecognitionResult, buildSearchKeyword } from './search'

/** 每个引擎的调用入口，集中一处，便于按需挑选要跑哪些引擎 */
const ENGINE_RUNNERS: Record<
  RecognitionEngine,
  (
    samples: Int16Array,
    signal?: AbortSignal,
    onDetail?: (text: string) => void
  ) => Promise<RecognitionResult[]>
> = {
  shazam: (samples, signal, onDetail) => recognizeByShazam(samples, { signal, onDetail }),
  netease: (samples, signal, onDetail) => recognizeByNetease(samples, { signal, onDetail }),
  kugou: (samples, signal, onDetail) => recognizeByKugou(samples, { signal, onDetail }),
}

interface EngineTask {
  engine: RecognitionEngine
  run: (signal?: AbortSignal, onDetail?: (text: string) => void) => Promise<RecognitionResult[]>
}

export interface SettledEngine {
  engine: RecognitionEngine
  results: RecognitionResult[]
  report: EngineReport
}

const runEngine = async (
  task: EngineTask,
  signal: AbortSignal | undefined
): Promise<SettledEngine> => {
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

/**
 * 用「已返回的引擎」算一次结果。
 * 增量场景下每个引擎返回都会调用一次，所以这里必须是纯函数、不能有副作用。
 *
 * `session.ts` 的多轮累积也复用它 —— 把「每个引擎的最新状态」当成一次结果即可。
 */
export const buildOutcome = (items: SettledEngine[]): RecognitionOutcome => {
  const merged = mergeResults(items.map((item) => ({ engine: item.engine, results: item.results })))
  const reports = items.map((item) => item.report)
  const { matched } = summarizeReports(reports)

  return {
    match: merged[0] ?? null,
    alternatives: merged.slice(1),
    ambiguous: matched.length > 0 && isAmbiguousRecognition(matched),
    reports,
  }
}

export interface RecognizeOptions {
  signal?: AbortSignal
  /**
   * 只跑这些引擎（顺序无关，结果仍按 `ENGINE_ORDER` 优先级排序）。
   * 缺省跑全部三个。多轮会话用它把「已经出过结果的通道」排除在后续提交之外。
   */
  engines?: RecognitionEngine[]
  /** 每个引擎返回后的回调，用于在 UI 上逐个点亮结果 */
  onEngineDone?: (report: EngineReport, results: RecognitionResult[]) => void
  /**
   * 增量结果回调：任一引擎返回后，立刻用「已返回的引擎」重算一次并回调。
   * 用于让 UI 先把先到的平台结果列出来，后续平台返回时再补进同一个列表。
   *
   * 触发顺序是**引擎完成顺序**（不是优先级顺序），因此同一首歌可能先以
   * `netease` 的身份出现、后又被更高优先级的 `shazam` 顶上 —— 这是预期行为。
   * 最后一个引擎返回时不再触发（此时 `recognize()` 的返回值就是最终结果）。
   */
  onPartial?: (outcome: RecognitionOutcome) => void
}

/**
 * 对采集到的采样点做识别。采样点必须是 16kHz / 单声道 / s16le。
 * 各引擎并行执行，任一引擎失败不影响其它引擎。
 *
 * 默认跑全部三个引擎；传 `engines` 可以只跑其中一部分（多轮会话里
 * 「已出结果的通道」不再参与后续提交，就是靠这个做到的）。
 */
export const recognize = async (
  samples: Int16Array,
  options: RecognizeOptions = {}
): Promise<RecognitionOutcome> => {
  const { signal, onEngineDone, onPartial, engines } = options
  const tasks: EngineTask[] = (engines ?? ENGINE_ORDER).map((engine) => ({
    engine,
    run: (taskSignal, onDetail) => ENGINE_RUNNERS[engine](samples, taskSignal, onDetail),
  }))

  // 一个引擎都没有（调用方已经没东西可提交了）：直接给空结果，别让它误判成「识别完成」
  if (!tasks.length) return buildOutcome([])

  const settled: SettledEngine[] = []
  await Promise.all(
    tasks.map(async (task) => {
      const outcome = await runEngine(task, signal)
      settled.push(outcome)
      onEngineDone?.(outcome.report, outcome.results)
      // 还有引擎没返回 → 先把当前这批结果推给 UI，别让用户干等最慢的那个
      if (settled.length < tasks.length) onPartial?.(buildOutcome(settled))
    })
  )

  return buildOutcome(settled)
}

