type Music = LX.Music.MusicInfo
export interface Options {
  listId?: string
  scopeKey?: string
  onRemove?: (songs: Music[]) => Promise<void> | void
}
export interface Selection extends Options { owner: symbol; songs: Music[] }

/** Synchronous snapshots keep rapid taps correct before React commits. */
export function createSelectionStore() {
  let current: Selection | null = null
  const listeners = new Set<() => void>()
  const get = () => current
  const change = (value: Selection | null) => {
    if (value === current) return
    current = value
    listeners.forEach(listener => listener())
  }
  return {
    get, change,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    clear: (owner?: symbol) => {
      if (!owner || current?.owner === owner) change(null)
    },
    start: (owner: symbol, song: Music, options: Options) => {
      if (current) return false
      change({ ...options, owner, songs: [song] })
      return true
    },
    toggle: (owner: symbol, song: Music, list: Music[]) => {
      if (current?.owner !== owner) return false
      const ids = new Set(current.songs.map(item => item.id))
      if (!ids.delete(song.id)) ids.add(song.id)
      change({ ...current, songs: list.filter(item => ids.has(item.id)) })
      return true
    },
  }
}
