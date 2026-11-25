import wyApi from '@/utils/musicSdk/wy/user'
import userState from '@/store/user/state'
import { removeWyLikedSong, updateWySubscribedPlaylistTrackCount } from '@/store/user/action'
import { clearListDetailCache } from '@/core/songlist'

export async function removeOwnedPlaylistSongs(id: string, songs: LX.Music.MusicInfo[]) {
  const songIds = songs.filter(song => song.source === 'wy').map(song => song.meta.songId)
  if (songIds.length !== songs.length) throw new Error('歌单歌曲来源不匹配')
  await wyApi.manipulatePlaylistTracks('del', id, songIds)
  const playlist = userState.wy_subscribed_playlists.find(list => String(list.id) === id)
  const creator = (playlist as any)?.creator
  if (creator?.nickname && playlist?.name === `${creator.nickname}喜欢的音乐`) songIds.forEach(removeWyLikedSong)
  updateWySubscribedPlaylistTrackCount(id, -songIds.length)
  clearListDetailCache('wy', id)
  global.app_event.playlist_updated({ source: 'wy', listId: id })
}
