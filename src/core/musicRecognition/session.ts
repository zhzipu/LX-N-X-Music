/**
 * 「边录边提交」的识曲会话。
 *
 * 与 `recognize()` 的区别：录音**不中断**，到预设时间点（默认第 3 / 7 / 10 / 13 秒）
 * 就把「当前已经录到的音频」送去识别一次。录音越往后越长，后面的轮次自然拿到更完整的片段，
 * 前几轮没识别出来不代表失败。
 *
 * 结果按引擎累积：同一引擎后一轮命中会覆盖前一轮，没命中则保留已有结果 ——
 * 所以列表只会越补越全，不会因为某一轮失手就把已经识别到的歌抹掉。
 *
 * **通道退场**：某个引擎一旦给出结果，结果就直接贴在列表上，该引擎**不再参与后续提交**
 * （既省掉重复的网络请求，也避免同一通道的同一首歌在列表里反复刷新）。
 * 只有还没出结果的引擎会继续在后面的轮次里被提交。
 *
 * 结束条件（先满足先结束）：
 * 1. 某一轮跑完后三个引擎都已给出结果 —— 没有可提交的通道了，立刻停录音；
 * 2. 跑到最后一个时间点，用完整音频提交后结束；
 * 3. 用户点「完成」—— 停录音并用完整音频补一轮（先等在跑的轮次跑完）。
 *
 * 轮次之间允许重叠（一轮要跑好几个网络请求，按时间点顺序等会白白丢掉后面的机会）。
 * 重叠时的取舍：同一引擎只采纳**轮次号更大**的那个结果，旧轮次的迟到结果直接丢弃。
 */
import {
  CAPTURE_SAMPLE_RATE,
  MIN_ROUND_SECONDS,
  SUBMIT_AT_SECONDS,
  type CaptureResult,
} from './capture'
import { ENGINE_ORDER } from './decision'
import { buildOutcome, recognize, type SettledEngine } from './index'
import type { EngineReport, RecognitionEngine, RecognitionOutcome, RecognitionResult } from './types'

/** 面板刷新间隔：既驱动倒计时，也用来判断是否到了提交时间点 */
const TICK_MS = 250
/** 提交时间点过去超过这个秒数就不补跑了（音频是累积的，下一个点更完整） */
const STALE_SUBMIT_GRACE = 3

export interface SessionTick {
  /** 已录制秒数 */
  elapsedSeconds: number
  /** 距最后一个提交点还剩几秒 */
  remainingSeconds: number
  /** 已经发起的轮次数 */
  startedRounds: number
  /** 计划总轮数 */
  totalRounds: number
  /** 麦克风是否还在录 */
  recording: boolean
  /** 是否还有轮次在识别中 */
  recognizing: boolean
}

export interface RecognitionRound {
  /** 第几轮，从 1 开始（按发起顺序） */
  index: number
  /** 触发该轮的时间点（秒）；手动「完成」触发时是实际录制的秒数 */
  atSecond: number
  /** 该轮用的是完整音频（录音已停） */
  last: boolean
  /** 该轮提交的音频时长（秒） */
  audioSeconds: number
  /** 该轮实际提交的引擎（已出结果的通道不在此列） */
  engines: RecognitionEngine[]
  /** 该轮耗时（毫秒） */
  durationMs: number
  /** 该轮跑完后三个引擎是否都已给出结果 */
  allMatched: boolean
  /** 该轮没能正常跑完的原因（音频太短、录音已停等），排查用 */
  error?: string
}

export interface RecognitionSessionEvents {
  /** 累积结果变化（每轮内每个引擎返回都会触发一次） */
  onUpdate: (outcome: RecognitionOutcome) => void
  onTick?: (tick: SessionTick) => void
  /** 每一轮拿到的音频（采样统计，用于面板上的诊断信息） */
  onStats?: (captured: CaptureResult, round: RecognitionRound) => void
  /** 一轮结束 */
  onRoundDone?: (round: RecognitionRound) => void
  /** 会话正常结束（含提前命中、跑完全部时间点、用户点完成） */
  onEnd?: (outcome: RecognitionOutcome) => void
}

export interface RecognitionSessionCapture {
  /** 读取当前已录到的音频，不停止录音 */
  peek: () => Promise<CaptureResult>
  /** 停止录音并拿到完整音频 */
  finish: () => Promise<CaptureResult>
  /** 停录音并丢弃音频 */
  abort: () => Promise<void>
}

export interface RecognitionSession {
  /** 会话结束（与 `onEnd` 是同一件事的两条通知路径，方便 await） */
  done: Promise<void>
  /** 用户点「完成」 */
  finishNow: () => void
  /** 关闭面板：停录音，不再提交 */
  abort: () => void
}

export const createRecognitionSession = (
  capture: RecognitionSessionCapture,
  events: RecognitionSessionEvents,
  options: { points?: number[] } = {}
): RecognitionSession => {
  const points = options.points?.length ? options.points : SUBMIT_AT_SECONDS
  const lastPoint = points[points.length - 1] ?? 0
  const startedAt = Date.now()

  /** 每个引擎的累积状态（= 最后一次被采纳的轮次结果） */
  const slots = new Map<RecognitionEngine, SettledEngine>()
  /** 每个引擎最后一次被采纳的轮次号，用来丢弃旧轮次的迟到结果 */
  const appliedRound = new Map<RecognitionEngine, number>()

  let stopped = false
  let aborted = false
  let settled = false
  /** 用户已点「完成」，正在收尾（防止连点触发两次 stop） */
  let finishing = false
  let activeRounds = 0
  let startedRounds = 0
  let nextIndex = 0
  let timer: ReturnType<typeof setInterval> | null = null
  let resolveDone: () => void = () => {}

  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const currentOutcome = (): RecognitionOutcome =>
    buildOutcome(ENGINE_ORDER.filter((engine) => slots.has(engine)).map((engine) => slots.get(engine)!))

  /**
   * 还没给出结果的引擎。
   * 已经出过结果的通道直接退场，不再参与后续提交。
   */
  const pendingEngines = (): RecognitionEngine[] =>
    ENGINE_ORDER.filter((engine) => !slots.get(engine)?.results.length)

  /** 三个通道都已给出结果 → 再录下去不会有新信息 */
  const allMatched = (): boolean => pendingEngines().length === 0

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const settle = () => {
    if (settled) return
    settled = true
    stopTimer()
    events.onEnd?.(currentOutcome())
    resolveDone()
  }

  /** 录音已停且没有轮次在跑 = 会话结束 */
  const maybeEnd = () => {
    if (settled || aborted) return
    // 收尾中（点了「完成」，正在等收尾那一轮起来）先别结束
    if (finishing) return
    if (!stopped || activeRounds > 0) return
    settle()
  }

  /**
   * 采纳某个引擎的结果。`roundIndex` 用来防「旧轮次覆盖新轮次」：
   * 并发时先发起的轮次可能后返回，它的结论应该被丢掉。
   */
  const applyEngine = (report: EngineReport, results: RecognitionResult[], roundIndex: number) => {
    const applied = appliedRound.get(report.engine)
    if (applied != null && applied > roundIndex) return
    appliedRound.set(report.engine, roundIndex)

    const prev = slots.get(report.engine)
    if (results.length) {
      slots.set(report.engine, { engine: report.engine, results, report })
      return
    }
    if (prev?.results.length) {
      // 这一轮没命中，但之前命中过：保住结果，只刷新诊断信息
      slots.set(report.engine, {
        engine: report.engine,
        results: prev.results,
        report: {
          ...prev.report,
          detail: report.detail ?? prev.report.detail,
          durationMs: report.durationMs,
        },
      })
      return
    }
    slots.set(report.engine, { engine: report.engine, results: [], report })
  }

  const runRound = async (atSecond: number, last: boolean, preset?: CaptureResult) => {
    // 录音已经停了（提前命中 / 用户点了完成）：非收尾轮次直接放弃，
    // 否则 peek 会撞上已经释放的麦克风
    if (aborted || settled || (stopped && !last)) return

    // 只把「还没给出结果的通道」送去提交；已经出结果的通道从此不再参与
    const engines = pendingEngines()
    // 没有可提交的通道：非收尾轮直接跳过，不必白读一次音频；
    // 收尾轮仍要走完 —— 它负责把麦克风关掉
    if (!engines.length && !last) return

    startedRounds += 1
    const index = startedRounds
    const beganAt = Date.now()
    activeRounds += 1
    // finish() 一调用麦克风就释放了，先置位，避免这一轮中途又被当成「还在录」
    if (last) stopped = true

    let audioSeconds = 0
    let error: string | undefined

    try {
      const captured = preset ?? (last ? await capture.finish() : await capture.peek())
      audioSeconds = captured.samples.length / CAPTURE_SAMPLE_RATE
      events.onStats?.(captured, {
        index,
        atSecond,
        last,
        audioSeconds,
        engines,
        durationMs: 0,
        allMatched: false,
      })

      if (!engines.length) {
        error = '所有通道都已给出结果，本轮无通道可提交'
      } else if (audioSeconds < MIN_ROUND_SECONDS) {
        error = `音频太短（${audioSeconds.toFixed(1)}s），跳过本轮`
      } else {
        // 传 engines：已出结果的通道从一开始就不参与，不再产生重复请求
        await recognize(captured.samples, {
          engines,
          onEngineDone: (report, results) => {
            applyEngine(report, results, index)
            if (!aborted) events.onUpdate(currentOutcome())
          },
        })
      }
    } catch (err: any) {
      // 采集失败（例如刚好撞上 stop）不算致命，记进轮次信息给调试框看
      error = err?.message ?? '识别失败'
    } finally {
      activeRounds -= 1
      events.onRoundDone?.({
        index,
        atSecond,
        last,
        audioSeconds,
        engines,
        durationMs: Date.now() - beganAt,
        allMatched: allMatched(),
        error,
      })

      if (!aborted && !settled && !stopped && allMatched()) {
        // 三个通道都给到结果了，没必要继续录
        nextIndex = points.length
        stopped = true
        void capture
          .abort()
          .catch(() => undefined)
          .then(maybeEnd)
      } else {
        maybeEnd()
      }
    }
  }

  const tick = () => {
    if (aborted || settled) return
    const elapsed = (Date.now() - startedAt) / 1000
    events.onTick?.({
      elapsedSeconds: elapsed,
      remainingSeconds: Math.max(0, lastPoint - elapsed),
      startedRounds,
      totalRounds: points.length,
      recording: !stopped,
      // 收尾中（点了「完成」，收尾那一轮还没起来）也算「识别中」，别让 UI 闪一下「完成」
      recognizing: activeRounds > 0 || finishing,
    })

    if (stopped) return
    while (nextIndex < points.length && elapsed >= points[nextIndex]) {
      const index = nextIndex
      nextIndex += 1
      const last = index === points.length - 1
      // 时间点已经过去很久（App 被切到后台之类）：没必要补跑，音频是累积的，
      // 下一个时间点拿到的片段只会更完整。但**最后一个点必须跑** —— 它负责停录音。
      if (!last && elapsed - points[index] > STALE_SUBMIT_GRACE) continue
      void runRound(points[index], last)
    }
  }

  /** 等所有在跑的轮次结束（用户点「完成」时先用完整音频收尾） */
  const waitIdle = () =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (activeRounds === 0) resolve()
        else setTimeout(check, 50)
      }
      check()
    })

  const finishNow = () => {
    if (aborted || settled || stopped || finishing) return
    finishing = true
    // 立刻置位：提交点不再触发，UI 马上从「录制中」切到「识别中」
    stopped = true
    nextIndex = points.length
    const atSecond = (Date.now() - startedAt) / 1000

    // 先关麦克风（别让用户点完「完成」还在录），音频留着给收尾那一轮用
    void capture
      .finish()
      .then((captured) =>
        waitIdle().then(() => {
          if (aborted || settled) return
          finishing = false
          void runRound(atSecond, true, captured)
        })
      )
      .catch(() => {
        // 拿不到收尾音频（按得太早、时长不足等）：停录音，用已有结果结束
        finishing = false
        void capture
          .abort()
          .catch(() => undefined)
          .then(maybeEnd)
      })
  }

  const abort = () => {
    if (aborted) return
    aborted = true
    stopped = true
    nextIndex = points.length
    stopTimer()
    void capture
      .abort()
      .catch(() => undefined)
      .then(() => {
        settled = true
        resolveDone()
      })
  }

  timer = setInterval(tick, TICK_MS)
  tick()

  return { done, finishNow, abort }
}
