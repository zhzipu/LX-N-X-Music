const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 字节数组 → 标准 base64（不依赖 Buffer / 原生 base64 模块） */
export const bytesToBase64 = (bytes: ArrayLike<number>): string => {
  let out = ''
  const length = bytes.length
  let i = 0
  for (; i + 2 < length; i += 3) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out +=
      CHARS[(chunk >> 18) & 63] +
      CHARS[(chunk >> 12) & 63] +
      CHARS[(chunk >> 6) & 63] +
      CHARS[chunk & 63]
  }
  const rest = length - i
  if (rest === 1) {
    const chunk = bytes[i] << 16
    out += CHARS[(chunk >> 18) & 63] + CHARS[(chunk >> 12) & 63] + '=='
  } else if (rest === 2) {
    const chunk = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += CHARS[(chunk >> 18) & 63] + CHARS[(chunk >> 12) & 63] + CHARS[(chunk >> 6) & 63] + '='
  }
  return out
}

const LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1)
  for (let i = 0; i < CHARS.length; i++) table[CHARS.charCodeAt(i)] = i
  return table
})()

/** 标准 base64 → 字节数组 */
export const base64ToBytes = (value: string): Uint8Array => {
  let clean = ''
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code === 61 /* = */ || LOOKUP[code] >= 0) clean += value[i]
  }
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  const outLength = (clean.length / 4) * 3 - padding
  const out = new Uint8Array(outLength)
  let outIndex = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]
    const b = LOOKUP[clean.charCodeAt(i + 1)]
    const c = LOOKUP[clean.charCodeAt(i + 2)]
    const d = LOOKUP[clean.charCodeAt(i + 3)]
    if (outIndex < outLength) out[outIndex++] = (a << 2) | (b >> 4)
    if (outIndex < outLength) out[outIndex++] = ((b & 15) << 4) | (c >> 2)
    if (outIndex < outLength) out[outIndex++] = ((c & 3) << 6) | d
  }
  return out
}
