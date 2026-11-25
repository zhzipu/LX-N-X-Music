export interface PlaylistMatch {
  listId: string
  listName: string
  music: LX.Music.MusicInfo
}

export function filterPlaylistSongs(entries: PlaylistMatch[], query: string): PlaylistMatch[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  return entries.filter(({ music }) => {
    const text = `${music.name} ${music.singer} ${music.meta?.albumName ?? ''}`.toLocaleLowerCase()
    return terms.every(term => text.includes(term))
  })
}
