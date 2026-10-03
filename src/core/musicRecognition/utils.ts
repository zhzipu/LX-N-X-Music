/** 把「外部取消信号」和「超时」合成一个 AbortSignal，并负责清理定时器 */
export interface RequestSignal {
  signal: AbortSignal
  cleanup: () => void
}

export const createRequestSignal = (external: AbortSignal | undefined, timeoutMs: number): RequestSignal => {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  if (external) {
    if (external.aborted) controller.abort()
    else external.addEventListener('abort', onAbort)
  }
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onAbort)
    },
  }
}

export const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Error('已取消')
}

/** 生成 RFC4122 v4 格式的 UUID（Hermes 没有 crypto.randomUUID） */
export const randomUuid = (uppercase = false): string => {
  let out = ''
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-'
    } else if (i === 14) {
      out += '4'
    } else if (i === 19) {
      out += ((Math.floor(Math.random() * 4) + 8) & 0xf).toString(16)
    } else {
      out += Math.floor(Math.random() * 16).toString(16)
    }
  }
  return uppercase ? out.toUpperCase() : out
}

/** 16kHz 单声道 s16le → 8kHz（按相邻两点取平均降采样） */
export const resampleTo8kBytes = (samples: Int16Array): Uint8Array => {
  const outSamples = Math.floor(samples.length / 2)
  const out = new Uint8Array(outSamples * 2)
  const view = new DataView(out.buffer)
  for (let i = 0; i < outSamples; i++) {
    const a = samples[i * 2]
    const b = i * 2 + 1 < samples.length ? samples[i * 2 + 1] : a
    const mixed = Math.max(-32768, Math.min(32767, Math.round((a + b) / 2)))
    view.setInt16(i * 2, mixed, true)
  }
  return out
}

/** 16kHz 单声道 s16le → 8kHz Float32（[-1, 1)） */
export const resampleTo8kFloat32 = (samples: Int16Array): Float32Array => {
  const outSamples = Math.floor(samples.length / 2)
  const out = new Float32Array(outSamples)
  for (let i = 0; i < outSamples; i++) {
    const a = samples[i * 2]
    const b = i * 2 + 1 < samples.length ? samples[i * 2 + 1] : a
    out[i] = (a + b) / 2 / 32768
  }
  return out
}

/** 把任意长度的 PCM 字节（s16le / 单声道）拆成 Int16Array */
export const bytesToInt16 = (bytes: Uint8Array): Int16Array => {
  const count = bytes.length >> 1
  const out = new Int16Array(count)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < count; i++) out[i] = view.getInt16(i * 2, true)
  return out
}

/**
 * 十六进制字符串按「无符号大整数」转成十进制字符串。
 * Hermes 虽已支持 BigInt，但这里用纯字符串运算实现，避免依赖引擎特性。
 */
export const hexToDecimalString = (hex: string): string => {
  const digits: number[] = [0]
  for (let i = 0; i < hex.length; i++) {
    let carry = parseInt(hex[i], 16)
    for (let j = 0; j < digits.length; j++) {
      const current = digits[j] * 16 + carry
      digits[j] = current % 10
      carry = Math.floor(current / 10)
    }
    while (carry > 0) {
      digits.push(carry % 10)
      carry = Math.floor(carry / 10)
    }
  }
  return digits.reverse().join('')
}
