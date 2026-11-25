/** Display smoothing for both players. Targets come from the native PCM analyser. */
export const BAND_COUNT = 96
const STALE_MS = 180

export const createSpectrumEngine = () => {
  const values = new Float32Array(BAND_COUNT)
  const target = new Float32Array(BAND_COUNT)
  let receivedAt = -Infinity
  let idle = true

  return {
    values,
    get idle() { return idle },
    accept(bands: readonly number[], now: number) {
      if (bands.length !== BAND_COUNT || bands.some(value => !Number.isFinite(value))) return
      for (let i = 0; i < BAND_COUNT; i++) target[i] = Math.max(0, Math.min(1, bands[i]))
      receivedAt = now
      idle = false
    },
    clear() {
      target.fill(0)
      receivedAt = -Infinity
    },
    step(dt: number, playing: boolean, now: number) {
      const fresh = playing && now - receivedAt <= STALE_MS
      const attack = 1 - Math.exp(-dt / 0.025)
      const release = 1 - Math.exp(-dt / 0.09)
      let max = 0
      for (let i = 0; i < BAND_COUNT; i++) {
        const next = fresh ? target[i] : 0
        values[i] += (next - values[i]) * (next > values[i] ? attack : release)
        max = Math.max(max, values[i])
      }
      idle = max < 0.004 && (!fresh || target.every(value => value === 0))
      if (idle) values.fill(0)
      return values
    },
  }
}
