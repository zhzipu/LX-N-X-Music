import listState from '@/store/list/state'
import userState from '@/store/user/state'
import settingState from '@/store/setting/state'
import { getListDetailAll } from '@/core/songlist'
import { getListMusics } from '@/utils/listManage'

/**
 * 可同步的歌单：只取 App 内「我的列表」——默认列表、我喜欢、自建歌单。
 * 网易云账号里收藏的歌单不在同步范围内（见 getPlaylistOptions 里的说明）。
 */

export type PlaylistSource = 'local' | 'wy'

export interface PlaylistOption {
  key: string
  name: string
  source: PlaylistSource
  /** 歌单 id（local 为列表 id，wy 为网易云歌单 id） */
  id: string
  count: number
}

export const localKey = (id: string) => `local:${id}`
export const wyKey = (id: string | number) => `wy:${id}`

const fromKey = (key: string): { source: PlaylistSource; id: string } | null => {
  const index = key.indexOf(':')
  if (index <= 0) return null
  const source = key.slice(0, index)
  if (source !== 'local' && source !== 'wy') return null
  return { source, id: key.slice(index + 1) }
}

export const isWyLoggedIn = (): boolean => {
  return !!(settingState.setting['common.wy_cookie'] && userState.wy_uid)
}

/** 从本地库读到的真实曲目数，避免每次重建列表都退回到 0。 */
const loadedCounts = new Map<string, number>()

export const getPlaylistOptions = (): PlaylistOption[] => {
  const options: PlaylistOption[] = []

  // 只列「我的列表」里的歌单：默认列表、我喜欢、自建歌单。
  // 网易云账号收藏的歌单不再参与同步——它每次都要走在线接口拉曲目，
  // 断网、风控、未登录都会让整轮同步读不全，进而触发「避免误删」的取消。
  const locals: Array<{ id: string; name: string }> = [
    { id: listState.defaultList.id, name: listState.defaultList.name },
    { id: listState.loveList.id, name: listState.loveList.name },
    ...listState.userList.map(item => ({ id: item.id, name: item.name })),
  ]
  for (const item of locals) {
    options.push({
      key: localKey(item.id),
      name: item.name,
      source: 'local',
      id: item.id,
      count: loadedCounts.get(item.id) ?? listState.allMusicList.get(item.id)?.length ?? 0,
    })
  }
  return options
}

export const getPlaylistSongs = async (option: PlaylistOption): Promise<LX.Music.MusicInfo[]> => {
  if (option.source === 'local') {
    return await getListMusics(option.id)
  }
  return await getListDetailAll('wy', option.id, true) as LX.Music.MusicInfo[]
}

/**
 * 曲目数要从本地库里读，内存里的 allMusicList 只在列表被打开过之后才有数据，
 * 所以启动后直接读会全是 0 首。这里并发加载一次，把真实数量补上。
 */
export const loadPlaylistOptions = async (): Promise<PlaylistOption[]> => {
  const options = getPlaylistOptions()
  await Promise.all(options.map(async item => {
    if (item.source !== 'local') return
    try {
      const songs = await getListMusics(item.id)
      loadedCounts.set(item.id, songs.length)
      item.count = songs.length
    } catch {
      // 某个列表读失败就保持原样，不影响其它列表
    }
  }))
  return options
}

export const resolvePlaylists = (keys: string[]): PlaylistOption[] => {
  const all = getPlaylistOptions()
  return keys
    .map(key => all.find(item => item.key === key))
    .filter((item): item is PlaylistOption => !!item)
}

export const fromPlaylistKey = fromKey
