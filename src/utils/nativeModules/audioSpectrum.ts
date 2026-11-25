import { NativeModules, Platform } from 'react-native'
import playerState from '@/store/player/state'

export interface SpectrumFrame {
  sequence: number
  bands: number[]
}

interface SpectrumModule {
  setAudioSpectrumEnabled: (enabled: boolean) => Promise<void>
  getAudioSpectrum: () => Promise<SpectrumFrame | null>
}

const player = NativeModules.TrackPlayerModule as Partial<SpectrumModule> | undefined

/** Old native builds and other platforms stay silent instead of synthesising fake audio. */
export const audioSpectrum = Platform.OS === 'android' &&
  typeof player?.setAudioSpectrumEnabled === 'function' && typeof player?.getAudioSpectrum === 'function'
  ? player as SpectrumModule
  : null

type Listener = (bands: number[] | null) => void
const listeners = new Set<Listener>()
let session = 0
let enabled = false
let timer: ReturnType<typeof setTimeout> | undefined
let stopTimer: ReturnType<typeof setTimeout> | undefined

// The native switch belongs to the player, so all visible surfaces share one poller.
export const subscribeSpectrum = (listener: Listener) => {
  const native = audioSpectrum
  if (!native) return
  clearTimeout(stopTimer)
  listeners.add(listener)
  if (!enabled) {
    enabled = true
    const current = ++session
    let sequence = -1
    const poll = async () => {
      if (current !== session) return
      if (!playerState.isPlay) {
        timer = setTimeout(() => { void poll() }, 100)
        return
      }
      try {
        const frame = await native.getAudioSpectrum()
        if (current !== session) return
        if (!frame || frame.sequence !== sequence) {
          sequence = frame?.sequence ?? -1
          for (const notify of listeners) notify(frame?.bands ?? null)
        }
      } catch {
        if (current === session) for (const notify of listeners) notify(null)
      }
      if (current === session) timer = setTimeout(() => { void poll() }, 33)
    }
    void native.setAudioSpectrumEnabled(true).then(poll).catch(error => {
      if (current === session) console.warn('Audio spectrum unavailable:', error)
    })
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size) return
    // Allow the next screen to take ownership within the same navigation update.
    stopTimer = setTimeout(() => {
      if (listeners.size) return
      session++
      enabled = false
      clearTimeout(timer)
      void native.setAudioSpectrumEnabled(false).catch(error => console.warn('Audio spectrum cleanup:', error))
    }, 0)
  }
}
