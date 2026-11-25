import { Dimensions, StatusBar } from 'react-native'
import { getWindowSize as getWindowSizeRaw } from './nativeModules/utils'
// import { log } from './log'

export type SizeHandler = (size: { width: number; height: number }) => void
let dimensionsSubscription: ReturnType<typeof Dimensions.addEventListener> | null = null
let dimensionsRevision = 0

export const getWindowSize = async () => {
  return getWindowSizeRaw().then((size) => {
    const scale = Dimensions.get('window').scale
    size.width = size.width / scale
    size.height = size.height / scale
    return size
  })
}

export const windowSizeTools = {
  size: {
    width: 0,
    height: 0,
  },
  listeners: [] as SizeHandler[],
  getSize() {
    return this.size
  },
  onSizeChanged(handler: SizeHandler) {
    this.listeners.push(handler)

    return () => {
      this.listeners.splice(this.listeners.indexOf(handler), 1)
    }
  },
  async init() {
    if (!dimensionsSubscription) {
      dimensionsSubscription = Dimensions.addEventListener('change', ({ window }) => {
        if (!window.width || !window.height) return
        dimensionsRevision++
        this.setWindowSize(window.width, window.height)
      })
    }
    const revisionAtStart = dimensionsRevision
    const size = await getWindowSize()
    // log.info('win size', size)
    if (size.width && dimensionsRevision === revisionAtStart) {
      this.size = size
    } else if (dimensionsRevision === revisionAtStart) {
      const window = Dimensions.get('window')
      // log.info('Dimensions window size', window)
      this.size = {
        width: Math.round(window.width),
        height: Math.round(window.height) + (StatusBar.currentHeight ?? 0),
      }
    }
    if (dimensionsRevision === revisionAtStart) {
      for (const handler of this.listeners) handler(this.size)
    }
    // console.log('init windowSizeTools')
    return size
  },
  setWindowSize(width: number, height: number) {
    this.size = {
      width: Math.round(width),
      height: Math.round(height),
    }
    for (const handler of this.listeners) handler(this.size)
  },
}
