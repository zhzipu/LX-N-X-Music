/**
 * 极简 FFT，只实现指纹算法用到的那部分 fft.js 接口：
 * `new FFT(size)` / `createComplexArray()` / `realTransform(out, data)`。
 *
 * 相比 fft.js 的差异（不影响算法正确性，但更快）：
 * - 旋转因子、位反转表在构造时算一次并复用，不在每次变换里重建；
 * - 内部用 Float64Array 复用缓冲，realTransform 对实数输入做等价的全谱复数 FFT
 *   （实数序列的 DFT 本身即 fft.js 的 realTransform 输出），幅度谱一致。
 */
export class FFT {
  readonly size: number
  private readonly cosTable: Float64Array
  private readonly sinTable: Float64Array
  private readonly rev: Uint32Array
  private readonly re: Float64Array
  private readonly im: Float64Array

  constructor(size: number) {
    if (size <= 1 || (size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two and bigger than 1')
    }
    this.size = size
    const half = size >> 1
    this.cosTable = new Float64Array(half)
    this.sinTable = new Float64Array(half)
    for (let i = 0; i < half; i++) {
      const angle = (-2 * Math.PI * i) / size
      this.cosTable[i] = Math.cos(angle)
      this.sinTable[i] = Math.sin(angle)
    }
    this.rev = new Uint32Array(size)
    const bits = Math.round(Math.log2(size))
    for (let i = 0; i < size; i++) {
      let value = i
      let reversed = 0
      for (let b = 0; b < bits; b++) {
        reversed = (reversed << 1) | (value & 1)
        value >>= 1
      }
      this.rev[i] = reversed
    }
    this.re = new Float64Array(size)
    this.im = new Float64Array(size)
  }

  createComplexArray(): number[] {
    return new Array(this.size * 2).fill(0)
  }

  /**
   * 实数序列 → 复数谱（交错存放 re/im），写入 out，长度为 size * 2。
   * out 的长度按调用方预期保留，不做截断。
   */
  realTransform(out: number[], data: ArrayLike<number>): void {
    const n = this.size
    const re = this.re
    const im = this.im
    const rev = this.rev

    for (let i = 0; i < n; i++) {
      const j = rev[i]
      re[j] = i < data.length ? data[i] : 0
      im[j] = 0
    }

    const cos = this.cosTable
    const sin = this.sinTable
    const half = n >> 1

    for (let len = 2; len <= n; len <<= 1) {
      const halfLen = len >> 1
      const step = n / len
      for (let start = 0; start < n; start += len) {
        for (let k = 0; k < halfLen; k++) {
          const twiddle = k * step
          const wr = cos[twiddle]
          const wi = sin[twiddle]
          const a = start + k
          const b = a + halfLen
          const xr = re[b] * wr - im[b] * wi
          const xi = re[b] * wi + im[b] * wr
          re[b] = re[a] - xr
          im[b] = im[a] - xi
          re[a] += xr
          im[a] += xi
        }
      }
    }

    // 旋转因子表以 n 为周期建立，第 len 级第 k 个蝶形取的是 cos/sin[k * (n / len)]
    for (let i = 0; i < n; i++) {
      out[i * 2] = re[i]
      out[i * 2 + 1] = im[i]
    }
  }
}

export const pyMod = (a: number, b: number): number => ((a % b) >= 0 ? a % b : b + (a % b))

/** 让出 JS 线程，避免长任务把 UI 卡死 */
export const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
