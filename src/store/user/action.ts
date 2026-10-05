import state, {
  FollowedArtistInfo,
  SubscribedAlbumInfo,
  SubscribedPlaylistInfo,
  BiliFavoriteArtistInfo,
  BiliFavoriteAlbumInfo,
  BiliFavoritesStorage,
  BILI_FAVORITES_STORAGE_KEY,
} from './state'
import { getData, saveData } from '@/plugins/storage'
import { log } from '@/utils/log'


export const setWyUid = (uid: string) => {
  state.wy_uid = uid
}
export const setWyVipType = (type: number) => {
  state.wy_vip_type = type
}
export const setWyLikedSongs = (ids: (string | number)[]) => {
  state.wy_liked_song_ids = new Set(ids.map(String))
  global.state_event.wyLikedListChanged()
}
export const addWyLikedSong = (id: string | number) => {
  const strId = String(id)
  if (state.wy_liked_song_ids.has(strId)) return
  state.wy_liked_song_ids.add(strId)
  global.state_event.wyLikedListChanged()
}
export const removeWyLikedSong = (id: string | number) => {
  const strId = String(id)
  if (!state.wy_liked_song_ids.has(strId)) return
  state.wy_liked_song_ids.delete(strId)
  global.state_event.wyLikedListChanged()
}

export const setWyFollowedArtists = (artists: FollowedArtistInfo[]) => {
  state.wy_followed_artists = artists
  global.state_event.wyFollowedListChanged()
}

export const addWyFollowedArtist = (artist: FollowedArtistInfo) => {
  if (state.wy_followed_artists.some(a => String(a.id) === String(artist.id))) return
  // 创建一个新数组，而不是修改原数组
  state.wy_followed_artists = [artist, ...state.wy_followed_artists]
  global.state_event.wyFollowedListChanged()
}

export const removeWyFollowedArtist = (id: string | number) => {
  const strId = String(id)
  const index = state.wy_followed_artists.findIndex(a => String(a.id) === strId)
  if (index < 0) return
  // 创建一个新数组，而不是修改原数组
  const newList = [...state.wy_followed_artists]
  newList.splice(index, 1)
  state.wy_followed_artists = newList
  global.state_event.wyFollowedListChanged()
}

export const setWySubscribedAlbums = (albums: SubscribedAlbumInfo[]) => {
  state.wy_subscribed_albums = albums;
  global.state_event.wySubscribedAlbumsChanged();
};

export const addWySubscribedAlbum = (album: SubscribedAlbumInfo) => {
  if (state.wy_subscribed_albums.some(a => String(a.id) === String(album.id))) return;
  state.wy_subscribed_albums = [album, ...state.wy_subscribed_albums];
  global.state_event.wySubscribedAlbumsChanged();
};

export const removeWySubscribedAlbum = (id: string | number) => {
  const strId = String(id);
  const index = state.wy_subscribed_albums.findIndex(a => String(a.id) === strId);
  if (index < 0) return;
  const newList = [...state.wy_subscribed_albums];
  newList.splice(index, 1);
  state.wy_subscribed_albums = newList;
  global.state_event.wySubscribedAlbumsChanged();
};

export const setWySubscribedPlaylists = (playlists: SubscribedPlaylistInfo[]) => {
  state.wy_subscribed_playlists = playlists;
  global.state_event.wySubscribedPlaylistsChanged();
};

export const addWySubscribedPlaylist = (playlist: SubscribedPlaylistInfo) => {
  if (state.wy_subscribed_playlists.some(p => String(p.id) === String(playlist.id))) return;
  state.wy_subscribed_playlists = [playlist, ...state.wy_subscribed_playlists];
  global.state_event.wySubscribedPlaylistsChanged();
};

export const removeWySubscribedPlaylist = (id: string | number) => {
  const strId = String(id);
  const index = state.wy_subscribed_playlists.findIndex(p => String(p.id) === strId);
  if (index < 0) return;
  const newList = [...state.wy_subscribed_playlists];
  newList.splice(index, 1);
  state.wy_subscribed_playlists = newList;
  global.state_event.wySubscribedPlaylistsChanged();
};

export const updateWySubscribedPlaylist = (id: string | number, details: Partial<SubscribedPlaylistInfo>) => {
  const strId = String(id)
  const index = state.wy_subscribed_playlists.findIndex(p => String(p.id) === strId)
  if (index > -1) {
    const updatedPlaylist = { ...state.wy_subscribed_playlists[index], ...details }
    const newList = [...state.wy_subscribed_playlists]
    newList.splice(index, 1, updatedPlaylist)
    state.wy_subscribed_playlists = newList
    global.state_event.wySubscribedPlaylistsChanged()
  }
}
export const updateWySubscribedPlaylistTrackCount = (id: string | number, change: number) => {
  const strId = String(id);
  const index = state.wy_subscribed_playlists.findIndex(p => String(p.id) === strId);

  if (index > -1) {
    const updatedPlaylist = {
      ...state.wy_subscribed_playlists[index],
      trackCount: state.wy_subscribed_playlists[index].trackCount + change,
    };
    const newList = [...state.wy_subscribed_playlists];
    newList.splice(index, 1, updatedPlaylist);

    state.wy_subscribed_playlists = newList;
    global.state_event.wySubscribedPlaylistsChanged();
  }
};

// ---------------------------------------------------------------- bili 本地收藏

/**
 * 网易云的收藏是「登录后拉全量」的镜像，bili 没有对应入口（B 站的收藏夹/关注列表
 * 是另一套页面），所以 bili 这边的本地收藏要自己持久化。
 *
 * 写盘是异步的，这里做 300ms 合并：连点几下心形只写一次 AsyncStorage。
 */
let biliPersistTimer: ReturnType<typeof setTimeout> | null = null
const persistBiliFavorites = () => {
  if (biliPersistTimer) clearTimeout(biliPersistTimer)
  biliPersistTimer = setTimeout(() => {
    biliPersistTimer = null
    const payload: BiliFavoritesStorage = {
      likedSongIds: Array.from(state.bili_liked_song_ids),
      followedArtists: state.bili_followed_artists,
      subscribedAlbums: state.bili_subscribed_albums,
    }
    void saveData(BILI_FAVORITES_STORAGE_KEY, payload).catch((err: any) => {
      log.error('bili favorites save failed:', err?.message ?? err)
    })
  }, 300)
}

/** 启动时把本地 bili 收藏读回内存（幂等，重复调用只生效一次） */
export const initBiliFavorites = async () => {
  if (state.bili_favorites_loaded) return
  try {
    const saved = await getData<BiliFavoritesStorage>(BILI_FAVORITES_STORAGE_KEY)
    if (saved) {
      state.bili_liked_song_ids = new Set((saved.likedSongIds ?? []).map(String))
      state.bili_followed_artists = saved.followedArtists ?? []
      state.bili_subscribed_albums = saved.subscribedAlbums ?? []
      global.state_event.biliLikedListChanged()
      global.state_event.biliFollowedListChanged()
      global.state_event.biliSubscribedAlbumsChanged()
    }
  } catch (err: any) {
    log.error('bili favorites load failed:', err?.message ?? err)
  }
  state.bili_favorites_loaded = true
}

export const addBiliLikedSong = (id: string | number) => {
  const strId = String(id)
  if (!strId || state.bili_liked_song_ids.has(strId)) return
  state.bili_liked_song_ids.add(strId)
  global.state_event.biliLikedListChanged()
  persistBiliFavorites()
}

export const removeBiliLikedSong = (id: string | number) => {
  const strId = String(id)
  if (!state.bili_liked_song_ids.delete(strId)) return
  global.state_event.biliLikedListChanged()
  persistBiliFavorites()
}

export const addBiliFollowedArtist = (artist: BiliFavoriteArtistInfo) => {
  if (state.bili_followed_artists.some(a => String(a.id) === String(artist.id))) return
  state.bili_followed_artists = [artist, ...state.bili_followed_artists]
  global.state_event.biliFollowedListChanged()
  persistBiliFavorites()
}

export const removeBiliFollowedArtist = (id: string | number) => {
  const strId = String(id)
  const index = state.bili_followed_artists.findIndex(a => String(a.id) === strId)
  if (index < 0) return
  const newList = [...state.bili_followed_artists]
  newList.splice(index, 1)
  state.bili_followed_artists = newList
  global.state_event.biliFollowedListChanged()
  persistBiliFavorites()
}

export const addBiliSubscribedAlbum = (album: BiliFavoriteAlbumInfo) => {
  if (state.bili_subscribed_albums.some(a => String(a.id) === String(album.id))) return
  state.bili_subscribed_albums = [album, ...state.bili_subscribed_albums]
  global.state_event.biliSubscribedAlbumsChanged()
  persistBiliFavorites()
}

export const removeBiliSubscribedAlbum = (id: string | number) => {
  const strId = String(id)
  const index = state.bili_subscribed_albums.findIndex(a => String(a.id) === strId)
  if (index < 0) return
  const newList = [...state.bili_subscribed_albums]
  newList.splice(index, 1)
  state.bili_subscribed_albums = newList
  global.state_event.biliSubscribedAlbumsChanged()
  persistBiliFavorites()
}
