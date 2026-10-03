/**
 * 纯 JS MD5（RFC 1321）。
 *
 * 不用 react-native-quick-md5 的原因：酷狗签名要算的是「key + 参数字符串 + 二进制 body + key」
 * 拼接后的摘要，需要在一个 Buffer 上做一次性摘要，而该库导出的是字符串 MD5；
 * 自己实现可以同时避免对 JSI 原生模块的依赖，Hermes 下也确定可跑。
 */

// 每轮左移位数
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
  20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
  10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

// K[i] = floor(abs(sin(i + 1)) * 2^32)，硬编码而不是用 Math.sin 现算：
// 各 JS 引擎的三角函数末位可能有差异，会导致摘要不可复现。
const K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

const HEX = '0123456789abcdef'

const toHex = (value: number): string => {
  let out = ''
  for (let i = 0; i < 4; i++) {
    const byte = (value >>> (i * 8)) & 0xff
    out += HEX[(byte >>> 4) & 0x0f] + HEX[byte & 0x0f]
  }
  return out
}

/**
 * 计算字节数组的 MD5，返回 32 位小写十六进制字符串
 */
export const md5 = (input: Uint8Array): string => {
  const originalLength = input.length
  // 补一个 0x80，再补零到 (length % 64 === 56)，最后 8 字节写入原始比特长度（小端）
  const paddedLength = (((originalLength + 8) >> 6) + 1) << 6
  const bytes = new Uint8Array(paddedLength)
  bytes.set(input)
  bytes[originalLength] = 0x80

  const bitLengthLow = (originalLength << 3) >>> 0
  const bitLengthHigh = Math.floor(originalLength / 536870912) // 原始长度 >> 29，超过 2^32 bit 时的高位
  const view = new DataView(bytes.buffer)
  view.setUint32(paddedLength - 8, bitLengthLow, true)
  view.setUint32(paddedLength - 4, bitLengthHigh, true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < paddedLength; offset += 64) {
    const m = new Array<number>(16)
    for (let i = 0; i < 16; i++) m[i] = view.getUint32(offset + i * 4, true)

    let a = a0
    let b = b0
    let c = c0
    let d = d0

    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + m[g]) | 0
      a = d
      d = c
      c = b
      const shift = SHIFTS[i]
      b = (b + ((f << shift) | (f >>> (32 - shift)))) | 0
    }

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)
}

/** UTF-8 编码（不依赖 TextEncoder，Hermes 下并非所有版本都提供） */
export const utf8Bytes = (value: string): Uint8Array => {
  const out: number[] = []
  for (let i = 0; i < value.length; i++) {
    let code = value.charCodeAt(i)
    if (code < 0x80) {
      out.push(code)
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // 代理对，合成完整码点后再编 4 字节
      const next = value.charCodeAt(++i)
      code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00)
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      )
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    }
  }
  return Uint8Array.from(out)
}

/** 字符串 MD5（按 UTF-8 编码） */
export const md5Text = (value: string): string => md5(utf8Bytes(value))

/** 拼接多段二进制后取 MD5，用于酷狗「key + params + body + key」这类签名 */
export const md5Concat = (parts: Array<Uint8Array | string>): string => {
  const chunks = parts.map((part) => (typeof part === 'string' ? utf8Bytes(part) : part))
  let total = 0
  for (const chunk of chunks) total += chunk.length
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return md5(merged)
}
