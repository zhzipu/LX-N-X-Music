export interface HotBoard {
  id: string
  name: string
  source: LX.OnlineSource
}

export const DEFAULT_BOARDS: HotBoard[] = [
  { id: 'kw__93', name: '飙升榜', source: 'kw' },
  { id: 'kw__16', name: '热歌榜', source: 'kw' },
  { id: 'kw__17', name: '新歌榜', source: 'kw' },
]

export function readHotBoards(value: string): HotBoard[] {
  if (!value) return DEFAULT_BOARDS
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return DEFAULT_BOARDS
    const seen = new Set<string>()
    return parsed.filter((board): board is HotBoard => {
      if (!board || typeof board.id !== 'string' || typeof board.name !== 'string' ||
        typeof board.source !== 'string' || !board.id.startsWith(board.source + '__') || seen.has(board.id)) return false
      seen.add(board.id)
      return true
    })
  } catch {
    return DEFAULT_BOARDS
  }
}
