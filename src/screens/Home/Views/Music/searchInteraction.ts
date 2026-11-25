const listeners = new Set<() => void>()

export const clearSearchHighlight = () => { listeners.forEach(listener => listener()) }
export const subscribeSearchInteraction = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
