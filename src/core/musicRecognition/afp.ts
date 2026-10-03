/**
 * 网易云 AFP 指纹的本地计算桥。
 *
 * 指纹算法是 WebAssembly（`afp.wasm`），Hermes 跑不了，所以交给一个隐藏的
 * WebView（V8 原生支持 wasm）计算 —— 资源在 `android/app/src/main/assets/afp/`，
 * 协议见那里的 `index.html`。这样整条识曲链路**不需要任何服务端**：
 * 本地出指纹 → 直接请求网易云。
 *
 * 用法：`AfpHidden` 组件挂载时 `attachAfpHost`，卸载时 `detachAfpHost`，
 * 引擎侧调用 `computeAfpFingerprint`。
 */
import { bytesToBase64 } from './vendor/base64'
import { RecognitionError } from './types'

/**
 * 网易云 matcher 的窗口长度。必须与官方 Chrome 扩展一致（固定 6 秒）：
 * 实测 5s / 5.5s / 7s / 8s / 10s 全不命中，而 6 秒窗口在任意起点 12/12 命中。
 */
export const AFP_WINDOW_SECONDS = 6

/** 指纹采样率：算法只接受 8kHz */
const AFP_SAMPLE_RATE = 8000

/** 单次计算（含 wasm 首次实例化）的超时 */
const COMPUTE_TIMEOUT_MS = 20000

type Poster = (payload: string) => void

interface PendingTask {
  resolve: (fp: string) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

let poster: Poster | null = null
let ready = false
let readyDetail = '未挂载'
const readyListeners = new Set<() => void>()
const pending = new Map<string, PendingTask>()
let seq = 0

/** WebView 挂载完成，注册发送通道 */
export const attachAfpHost = (next: Poster) => {
  poster = next
  ready = false
  readyDetail = '初始化中'
}

/** WebView 卸载 */
export const detachAfpHost = () => {
  poster = null
  ready = false
  readyDetail = '未挂载'
  pending.forEach((task) => {
    clearTimeout(task.timer)
    task.reject(new RecognitionError('指纹模块已卸载'))
  })
  pending.clear()
}

export const isAfpReady = () => ready

/** 处理来自 WebView 的消息，返回是否已被识别 */
export const handleAfpMessage = (raw: string) => {
  let msg: any
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'ready') {
    ready = msg.ok === true
    readyDetail = typeof msg.detail === 'string' ? msg.detail : ''
    if (ready) {
      readyListeners.forEach((listener) => listener())
      readyListeners.clear()
    }
    return
  }

  if (msg.type === 'fp' && typeof msg.id === 'string') {
    const task = pending.get(msg.id)
    if (!task) return
    pending.delete(msg.id)
    clearTimeout(task.timer)
    if (msg.ok && typeof msg.fp === 'string' && msg.fp) task.resolve(msg.fp)
    else task.reject(new RecognitionError(`指纹计算失败${msg.error ? `：${msg.error}` : ''}`))
  }
}

const waitForReady = () =>
  new Promise<void>((resolve, reject) => {
    if (ready) return resolve()
    if (!poster) return reject(new RecognitionError('指纹模块未挂载'))
    const done = () => {
      clearTimeout(timer)
      readyListeners.delete(onReady)
    }
    const onReady = () => {
      done()
      resolve()
    }
    readyListeners.add(onReady)
    const timer = setTimeout(() => {
      done()
      reject(new RecognitionError(`指纹模块初始化超时（${readyDetail || '无响应'}）`))
    }, COMPUTE_TIMEOUT_MS)
  })

/**
 * 计算 AFP 指纹。
 *
 * @param pcmBytes 8kHz / 单声道 / s16le 的裸 PCM（长度任意，内部会截取中间 6 秒）
 * @returns base64 指纹，直接作为网易云接口的 `rawdata`
 */
export const computeAfpFingerprint = async (pcmBytes: Uint8Array): Promise<string> => {
  await waitForReady()

  const send = poster
  if (!send) throw new RecognitionError('指纹模块未挂载')

  const total = pcmBytes.length >> 1
  if (!total) throw new RecognitionError('没有可用的音频')

  // 与服务端一致：固定 6 秒窗口、从中间取，避开录音首尾可能存在的静音/点击声
  const frames = Math.min(total, AFP_WINDOW_SECONDS * AFP_SAMPLE_RATE)
  const start = Math.max(0, Math.floor((total - frames) / 2))
  const window = pcmBytes.subarray(start * 2, (start + frames) * 2)

  const id = `afp-${++seq}`
  const task = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new RecognitionError('指纹计算超时'))
    }, COMPUTE_TIMEOUT_MS)
    pending.set(id, { resolve, reject, timer })
  })

  send(JSON.stringify({ type: 'fp', id, pcm: bytesToBase64(window) }))
  return task
}
