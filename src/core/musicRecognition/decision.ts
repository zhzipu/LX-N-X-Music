/**
 * 识曲判定（纯函数，无 IO）。
 * 判定思路移植自 lx-music-desktop-enhanced 的 decision.ts。
 */
import type { EngineReport, RecognitionEngine, RecognitionResult } from './types'

/**
 * Shazam 的防误报：同一段音频切分后多次请求，同一个 track key 至少出现 2 次才算数。
 * 短视频、变速、翻唱导致的偶发误命中就是靠这个压掉的。
 */
export const selectConsensusKey = (keys: string[]): string | null => {
  const counts = new Map<string, number>()
  for (const key of keys) {
    const count = (counts.get(key) ?? 0) + 1
    if (count >= 2) return key
    counts.set(key, count)
  }
  return null
}

/**
 * 只有平台类引擎（酷狗、网易云）命中、没有 Shazam 这类本地强指纹引擎交叉印证时，
 * 视为「可能结果」，UI 上需要提示用户确认。
 */
export const isAmbiguousRecognition = (matchedEngines: RecognitionEngine[]): boolean =>
  !matchedEngines.includes('shazam')

const DEFAULT_PRIORITY: RecognitionEngine[] = ['shazam', 'netease', 'kugou']

export interface MergeOptions {
  /** 引擎优先级，越靠前越可信 */
  priority?: RecognitionEngine[]
  /** 最多保留的候选数 */
  limit?: number
}

/**
 * 多引擎结果合并：先按 `providerTrackId` 去重，再按引擎优先级排序，最后截断。
 * 排序稳定，同引擎内部保持接口返回顺序。
 */
export const mergeResults = (
  groups: Array<{ engine: RecognitionEngine; results: RecognitionResult[] }>,
  options: MergeOptions = {}
): RecognitionResult[] => {
  const { priority = DEFAULT_PRIORITY, limit = 8 } = options
  const rankOf = (engine: RecognitionEngine) => {
    const index = priority.indexOf(engine)
    return index < 0 ? priority.length : index
  }

  const seen = new Set<string>()
  const flattened: RecognitionResult[] = []
  for (const group of groups) {
    for (const result of group.results) {
      if (seen.has(result.providerTrackId)) continue
      seen.add(result.providerTrackId)
      flattened.push(result)
    }
  }

  return flattened
    .map((result, index) => ({ result, index }))
    .sort((a, b) => rankOf(a.result.engine) - rankOf(b.result.engine) || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.result)
}

/** 汇总各引擎命中情况，供 UI 展示「谁识别到了 / 谁不可用」 */
export const summarizeReports = (reports: EngineReport[]) => {
  const matched: RecognitionEngine[] = []
  const failed: EngineReport[] = []
  for (const report of reports) {
    if (report.status === 'matched') matched.push(report.engine)
    else failed.push(report)
  }
  return { matched, failed }
}
