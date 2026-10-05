export interface FollowedArtistInfo {
  id: string | number
  name: string
  alias: string[] | null
  albumSize: number
  picUrl: string
  img1v1Url: string
}
export interface SubscribedAlbumInfo {
  id: string | number
  name: string
  picUrl: string
  artists: Array<{ id: string | number, name: string }>
  publishTime: number
  size: number
}
export interface SubscribedPlaylistInfo {
  id: string | number
  userId: number
  name: string
  coverImgUrl: string
  trackCount: number
  description?: string
}

/** bili 本地收藏的 UP 主（B 站无法同步时用来兜住按钮状态） */
export interface BiliFavoriteArtistInfo {
  id: string | number
  name: string
  picUrl: string
}

/** bili 本地收藏的合集（专辑） */
export interface BiliFavoriteAlbumInfo {
  id: string | number
  name: string
  picUrl: string
  /** 合集内视频数 */
  size: number
}

/** bili 本地收藏的歌曲（视频）—— 记 bvid */
export interface InitState {
  wy_uid: string | null
  wy_liked_song_ids: Set<string>
  wy_followed_artists: FollowedArtistInfo[]
  wy_subscribed_albums: SubscribedAlbumInfo[]
  wy_subscribed_playlists: SubscribedPlaylistInfo[]
  wy_vip_type: number
  /** 下面三项是 bili 的本地收藏镜像，会持久化到 AsyncStorage */
  bili_liked_song_ids: Set<string>
  bili_followed_artists: BiliFavoriteArtistInfo[]
  bili_subscribed_albums: BiliFavoriteAlbumInfo[]
  /** 本地收藏是否已从存储恢复完成 */
  bili_favorites_loaded: boolean
}
const state: InitState = {
  wy_uid: null,
  wy_liked_song_ids: new Set(),
  wy_followed_artists: [],
  wy_subscribed_albums: [],
  wy_subscribed_playlists: [],
  wy_vip_type: 0,
  bili_liked_song_ids: new Set(),
  bili_followed_artists: [],
  bili_subscribed_albums: [],
  bili_favorites_loaded: false,
}

export const BILI_FAVORITES_STORAGE_KEY = 'bili_local_favorites'

export interface BiliFavoritesStorage {
  likedSongIds: string[]
  followedArtists: BiliFavoriteArtistInfo[]
  subscribedAlbums: BiliFavoriteAlbumInfo[]
}

export default state
