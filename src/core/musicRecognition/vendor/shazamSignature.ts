/**
 * Shazam 音频指纹（算法与二进制签名格式）。
 *
 * 移植自 st-shazam 1.1.1 的 `src/algorithm.js` + `src/signature-format.js`（MIT）。
 * 原实现是为 Node 写的（依赖 fft.js / buffer / node:crypto），这里做三处改造：
 * 1. 换成内置的极简 FFT 与纯 JS base64，Hermes 下可直接运行；
 * 2. 环形缓冲、FFT 输出缓冲改为预分配的类型化数组并复用，避免每批 128 个采样都新建对象；
 * 3. 增加可让出 JS 线程的异步入口，12 秒音频约 1500 批 FFT，同步跑会把 UI 卡住数秒。
 *
 * 只保留编码路径（本地生成指纹 → 上传），上游的解码路径这里用不到，未移植。
 */
import { FFT, pyMod, yieldToEventLoop } from './fft'
import { HANNING_MATRIX } from './hanning'
import { bytesToBase64 } from './base64'

const SAMPLE_RATE_HZ = 16000
const FFT_SIZE = 2048
const MAX_SIGNATURE_SECONDS = 12
const PEAK_SPREAD_WARMUP = 46
const DATA_URI_PREFIX = 'data:audio/vnd.shazam.sig;base64,'

/** 与上游一致的频段枚举（数字即签名文件里的频段 ID 偏移） */
export const FrequencyBand = {
  _0_250: -1,
  _250_520: 0,
  _520_1450: 1,
  _1450_3500: 2,
  _3500_5500: 3,
} as const

const BAND_NAME: Record<number, string> = {
  [-1]: '_0_250',
  0: '_250_520',
  1: '_520_1450',
  2: '_1450_3500',
  3: '_3500_5500',
}

const BAND_ID: Record<string, number> = {
  _0_250: -1,
  _250_520: 0,
  _520_1450: 1,
  _1450_3500: 2,
  _3500_5500: 3,
}

// 采样率 → 签名文件里的采样率 ID
const SAMPLE_RATE_ID: Record<number, number> = {
  8000: 1,
  11025: 2,
  16000: 3,
  32000: 4,
  44100: 5,
  48000: 6,
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

const crc32 = (bytes: ArrayLike<number>): number => {
  let crc = 0 ^ -1
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

const writeUint32 = (out: number[], value: number) => {
  out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff)
}

const writeInt32 = (out: number[], value: number) => {
  const view = new DataView(new ArrayBuffer(4))
  view.setInt32(0, value, true)
  for (let i = 0; i < 4; i++) out.push(view.getUint8(i))
}

const writeInt16 = (out: number[], value: number) => {
  const view = new DataView(new ArrayBuffer(2))
  view.setInt16(0, value, true)
  for (let i = 0; i < 2; i++) out.push(view.getUint8(i))
}

interface RawSignatureHeader {
  magic1: number
  crc32: number
  sizeMinusHeader: number
  magic2: number
  shiftedSampleRateId: number
  numberSamplesPlusDividedSampleRate: number
  fixedValue: number
}

const writeRawSignatureHeader = (header: RawSignatureHeader): number[] => {
  const out: number[] = []
  writeUint32(out, header.magic1)
  writeUint32(out, header.crc32)
  writeUint32(out, header.sizeMinusHeader)
  writeUint32(out, header.magic2)
  writeUint32(out, 0)
  writeUint32(out, 0)
  writeUint32(out, 0)
  writeUint32(out, header.shiftedSampleRateId)
  writeUint32(out, 0)
  writeUint32(out, 0)
  writeUint32(out, header.numberSamplesPlusDividedSampleRate)
  writeUint32(out, header.fixedValue)
  return out
}

export class FrequencyPeak {
  constructor(
    readonly fftPassNumber: number,
    readonly peakMagnitude: number,
    readonly correctedPeakFrequencyBin: number,
    readonly sampleRateHz: number
  ) {}
}

export class DecodedMessage {
  sampleRateHz = SAMPLE_RATE_HZ
  numberSamples = 0
  frequencyBandToSoundPeaks: Record<string, FrequencyPeak[]> = {}

  encodeToBinary(): number[] {
    const header: RawSignatureHeader = {
      magic1: 0xcafe2580,
      magic2: 0x94119c00,
      shiftedSampleRateId: SAMPLE_RATE_ID[this.sampleRateHz] << 27,
      fixedValue: (15 << 19) + 0x40000,
      numberSamplesPlusDividedSampleRate: Math.round(
        this.numberSamples + this.sampleRateHz * 0.24
      ),
      crc32: -1,
      sizeMinusHeader: -1,
    }

    let contents: number[] = []
    const bands = Object.keys(this.frequencyBandToSoundPeaks)
      .map((name) => [BAND_ID[name], this.frequencyBandToSoundPeaks[name]] as const)
      .sort((a, b) => a[0] - b[0])

    for (const [bandId, peaks] of bands) {
      const peaksBuffer: number[] = []
      let fftPassNumber = 0
      for (const peak of peaks) {
        if (peak.fftPassNumber < fftPassNumber) throw new Error('Assert 5')
        if (peak.fftPassNumber - fftPassNumber >= 0xff) {
          peaksBuffer.push(0xff)
          writeInt32(peaksBuffer, peak.fftPassNumber)
          fftPassNumber = peak.fftPassNumber
        }
        peaksBuffer.push(peak.fftPassNumber - fftPassNumber)
        writeInt16(peaksBuffer, peak.peakMagnitude - 1)
        writeInt16(peaksBuffer, peak.correctedPeakFrequencyBin - 1)
        fftPassNumber = peak.fftPassNumber
      }
      writeInt32(contents, 0x60030040 + bandId)
      writeInt32(contents, peaksBuffer.length)
      contents = contents.concat(peaksBuffer)
      const paddingCount = 4 - (peaksBuffer.length % 4)
      if (paddingCount < 4) {
        for (let i = 0; i < paddingCount; i++) contents.push(0)
      }
    }

    header.sizeMinusHeader = contents.length + 8
    let buffer: number[] = []
    buffer.push(...writeRawSignatureHeader(header))
    writeInt32(buffer, 0x40000000)
    writeInt32(buffer, contents.length + 8)
    buffer = buffer.concat(contents)

    header.crc32 = crc32(buffer.slice(8))
    const newHeader = writeRawSignatureHeader(header)
    buffer.splice(0, newHeader.length, ...newHeader)
    return buffer
  }

  encodeToUri(): string {
    return DATA_URI_PREFIX + bytesToBase64(this.encodeToBinary())
  }
}

export interface SignatureResult {
  uri: string
  numberSamples: number
  sampleRateHz: number
  /** 上传时用的音频时长（毫秒） */
  sampleMs: number
}

export class SignatureGenerator {
  private readonly fft = new FFT(FFT_SIZE)
  private readonly ring = new Float64Array(FFT_SIZE)
  private readonly windowed = new Float64Array(FFT_SIZE)
  private readonly fftOut: number[] = new Array(FFT_SIZE * 2).fill(0)
  private ringPosition = 0

  private fftOutputs: Float32Array[] = []
  private fftOutputsPosition = 0
  private spreadFFTsOutput: Float32Array[] = []
  private spreadPosition = 0
  private nextSignature = new DecodedMessage()
  private numSpreadFftsDone = 0

  constructor() {
    this.initFields()
  }

  private initFields() {
    this.ringPosition = 0
    this.fftOutputs = new Array(256)
    this.spreadFFTsOutput = new Array(256)
    for (let i = 0; i < 256; i++) {
      this.fftOutputs[i] = new Float32Array(1025)
      this.spreadFFTsOutput[i] = new Float32Array(1025)
    }
    this.fftOutputsPosition = 0
    this.spreadPosition = 0
    this.nextSignature = new DecodedMessage()
    this.numSpreadFftsDone = 0
  }

  /**
   * @param samples 16kHz / 单声道 / s16le 的采样点
   * @param onProgress 归一化进度回调（0~1）
   */
  async getSignature(
    samples: Int16Array,
    onProgress?: (progress: number) => void
  ): Promise<SignatureResult> {
    const maxSamples = MAX_SIGNATURE_SECONDS * SAMPLE_RATE_HZ
    let input = samples
    if (input.length > maxSamples) {
      // 超长音频取中间 12 秒，两端的信息量最大
      const middle = Math.floor(input.length / 2)
      input = input.slice(middle - maxSamples / 2, middle + maxSamples / 2)
    }
    if (input.length > maxSamples) input = input.slice(0, maxSamples)

    this.nextSignature.numberSamples += input.length

    const totalPasses = Math.ceil(input.length / 128)
    for (let i = 0; i < input.length; i += 128) {
      this.doFFT(input, i, Math.min(128, input.length - i))
      this.doPeakSpreading()
      this.numSpreadFftsDone++
      if (this.numSpreadFftsDone >= PEAK_SPREAD_WARMUP) this.doPeakRecognition()
      const pass = (i / 128) | 0
      if ((pass & 31) === 0) {
        onProgress?.(totalPasses ? pass / totalPasses : 1)
        // 每 32 批（约 0.26 秒音频）让出一次线程，保证识别动画不卡
        await yieldToEventLoop()
      }
    }

    const signature = this.nextSignature
    const result: SignatureResult = {
      uri: signature.encodeToUri(),
      numberSamples: signature.numberSamples,
      sampleRateHz: signature.sampleRateHz,
      sampleMs: Math.round((signature.numberSamples / signature.sampleRateHz) * 1000),
    }
    this.initFields()
    onProgress?.(1)
    return result
  }

  private doFFT(batch: Int16Array, offset: number, count: number) {
    const ring = this.ring
    let position = this.ringPosition
    for (let i = 0; i < count; i++) ring[(position + i) & (FFT_SIZE - 1)] = batch[offset + i]
    position = (position + count) % FFT_SIZE
    this.ringPosition = position

    const windowed = this.windowed
    for (let i = 0; i < FFT_SIZE; i++) {
      windowed[i] = ring[(position + i) & (FFT_SIZE - 1)] * HANNING_MATRIX[i]
    }

    // 复用同一个输出数组，realTransform 会覆盖前 FFT_SIZE * 2 项
    this.fft.realTransform(this.fftOut, windowed)

    const results = this.fftOutputs[pyMod(this.fftOutputsPosition++, 256)]
    const out = this.fftOut
    for (let i = 0; i < 2050; i += 2) {
      const energy = (out[i] * out[i] + out[i + 1] * out[i + 1]) / (1 << 17)
      results[i / 2] = Math.max(0.0000000001, energy)
    }
  }

  private doPeakSpreading() {
    const originLastFFT = this.fftOutputs[pyMod(this.fftOutputsPosition - 1, 256)]
    const spreadLastFFT = this.spreadFFTsOutput[pyMod(this.spreadPosition, 256)]
    spreadLastFFT.set(originLastFFT)

    for (let position = 0; position <= 1022; position++) {
      const a = spreadLastFFT[position]
      const b = spreadLastFFT[position + 1]
      const c = spreadLastFFT[position + 2]
      spreadLastFFT[position] = a > b ? (a > c ? a : c) : b > c ? b : c
    }

    for (let position = 0; position <= 1024; position++) {
      const value = spreadLastFFT[position]
      for (const formerFftNum of [-1, -3, -6]) {
        const formerFftOutput = this.spreadFFTsOutput[pyMod(this.spreadPosition + formerFftNum, 256)]
        if (formerFftOutput[position] < value) formerFftOutput[position] = value
      }
    }

    this.spreadPosition++
  }

  private doPeakRecognition() {
    const fftMinus46 = this.fftOutputs[pyMod(this.fftOutputsPosition - 46, 256)]
    const fftMinus49 = this.spreadFFTsOutput[pyMod(this.spreadPosition - 49, 256)]

    for (let binPosition = 10; binPosition <= 1014; binPosition++) {
      if (fftMinus46[binPosition] < 1 / 64) continue
      if (fftMinus46[binPosition] < fftMinus49[binPosition - 1]) continue

      let maxNeighborInFftMinus49 = 0
      for (const neighborOffset of [-10, -7, -4, -3, 1, 2, 5, 8]) {
        const candidate = fftMinus49[binPosition + neighborOffset]
        if (maxNeighborInFftMinus49 < candidate) maxNeighborInFftMinus49 = candidate
      }
      if (fftMinus46[binPosition] <= maxNeighborInFftMinus49) continue

      let maxNeighborInOtherAdjacentFFTs = maxNeighborInFftMinus49
      for (const otherOffset of [
        -53, -45, 165, 172, 179, 186, 193, 200, 214, 221, 228, 235, 242, 249,
      ]) {
        const candidate =
          this.spreadFFTsOutput[pyMod(this.spreadPosition + otherOffset, 256)][binPosition - 1]
        if (maxNeighborInOtherAdjacentFFTs < candidate) maxNeighborInOtherAdjacentFFTs = candidate
      }
      if (fftMinus46[binPosition] <= maxNeighborInOtherAdjacentFFTs) continue

      // 确认为峰值，做抛物线插值得到更精确的频率位置
      const fftNumber = this.numSpreadFftsDone - 46
      const peakMagnitude = Math.log(Math.max(1 / 64, fftMinus46[binPosition])) * 1477.3 + 6144
      const peakMagnitudeBefore =
        Math.log(Math.max(1 / 64, fftMinus46[binPosition - 1])) * 1477.3 + 6144
      const peakMagnitudeAfter =
        Math.log(Math.max(1 / 64, fftMinus46[binPosition + 1])) * 1477.3 + 6144

      const peakVariation1 = peakMagnitude * 2 - peakMagnitudeBefore - peakMagnitudeAfter
      const peakVariation2 = ((peakMagnitudeAfter - peakMagnitudeBefore) * 32) / peakVariation1
      const correctedPeakFrequencyBin = ((binPosition * 64 + peakVariation2) & 0xffff) >>> 0

      const frequencyHz = correctedPeakFrequencyBin * (SAMPLE_RATE_HZ / 2 / 1024 / 64)
      let band: number
      if (frequencyHz < 250) continue
      else if (frequencyHz < 520) band = FrequencyBand._250_520
      else if (frequencyHz < 1450) band = FrequencyBand._520_1450
      else if (frequencyHz < 3500) band = FrequencyBand._1450_3500
      else if (frequencyHz <= 5500) band = FrequencyBand._3500_5500
      else continue

      const bandName = BAND_NAME[band]
      const bucket = this.nextSignature.frequencyBandToSoundPeaks[bandName]
      const peak = new FrequencyPeak(
        fftNumber,
        Math.round(peakMagnitude) & 0xffff,
        Math.round(correctedPeakFrequencyBin),
        SAMPLE_RATE_HZ
      )
      if (bucket) bucket.push(peak)
      else this.nextSignature.frequencyBandToSoundPeaks[bandName] = [peak]
    }
  }
}
