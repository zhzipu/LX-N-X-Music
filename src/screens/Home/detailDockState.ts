import { useEffect, useSyncExternalStore } from 'react'

// Some in-page details retain the home header, but must collapse the dock.
// Each mounted detail owns a token so closing one cannot clear another.
const details = new Set<symbol>()
const listeners = new Set<() => void>()
const notify = () => { for (const listener of listeners) listener() }
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const snapshot = () => details.size > 0

export const useDetailDockOpen = () => useSyncExternalStore(subscribe, snapshot, snapshot)

export function useDetailDock(open: boolean) {
  useEffect(() => {
    if (!open) return
    const token = Symbol('detail')
    details.add(token)
    notify()
    return () => {
      details.delete(token)
      notify()
    }
  }, [open])
}
