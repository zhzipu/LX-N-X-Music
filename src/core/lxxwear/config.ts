import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * LXXWear 同步配置：勾了哪些歌单、用什么音质、每个歌单同步过哪些歌。
 *
 * 每个勾选的歌单都有自己的一份状态：
 * - 必须选过一次歌（synced）才允许开「自动同步」；
 * - 选歌时勾中的曲目（selected）才是这个歌单的固定内容；
 * - 自动同步只把「选歌之后新加进歌单」的曲目带上（snapshot 是选歌那一刻的歌单全量）。
 */

export interface PlaylistSyncState {
  /** 选过歌（写入了 selected / snapshot） */
  synced: boolean
  /** 这个歌单是否跟着歌单变化自动同步新增曲目 */
  auto: boolean
  /** 选歌时勾中纳入的歌曲 key（`<source>-<songId>`，不含音质） */
  selected: string[]
  /** 选歌那一刻歌单里的全部歌曲，用来认出「后来新加的」 */
  snapshot: string[]
  /** 被自动同步带进来的新歌，关掉自动同步时转成正式选中，避免被删 */
  autoSynced: string[]
  /** 上次手动同步时间 */
  syncedAt: number
}

export interface LxxWearConfig {
  /** 选中的歌单 key：`local:<列表id>` 或 `wy:<歌单id>` */
  playlistIds: string[]
  /** 同步音质 */
  quality: LX.Quality
  /**
   * 旧版的全局自动同步开关。现在由「每个歌单的自动同步」决定，
   * 这里保留字段只为兼容已存的配置，写入时按 hasAutoPlaylist 回填。
   */
  autoSync: boolean
  /** 每个歌单各自的同步状态 */
  playlists: Record<string, PlaylistSyncState>
}

const STORAGE_KEY = 'lxx_wear_sync_config'

export const DEFAULT_QUALITY: LX.Quality = '320k'

export const emptyPlaylistState = (): PlaylistSyncState => ({
  synced: false,
  auto: false,
  selected: [],
  snapshot: [],
  autoSynced: [],
  syncedAt: 0,
})

export const DEFAULT_CONFIG: LxxWearConfig = {
  playlistIds: [],
  quality: DEFAULT_QUALITY,
  autoSync: false,
  playlists: {},
}

/** 可选的同步音质（按从低到高排列，界面上从高到低展示） */
export const SYNC_QUALITY_LIST: Array<{ id: LX.Quality; name: string; desc: string }> = [
  { id: 'master', name: 'Master', desc: '母带' },
  { id: 'hires', name: 'Hi-Res', desc: '高解析度' },
  { id: 'flac', name: 'FLAC', desc: '无损' },
  { id: '320k', name: '320k', desc: '高音质' },
  { id: '128k', name: '128k', desc: '标准' },
]

const stringList = (value: any): string[] =>
  Array.isArray(value) ? value.filter((item: any) => typeof item === 'string') : []

const parsePlaylistStates = (raw: any): Record<string, PlaylistSyncState> => {
  const states: Record<string, PlaylistSyncState> = {}
  if (!raw || typeof raw !== 'object') return states
  for (const key of Object.keys(raw)) {
    const item = raw[key]
    if (!item || typeof item !== 'object') continue
    states[key] = {
      synced: !!item.synced,
      auto: !!item.auto,
      selected: stringList(item.selected),
      snapshot: stringList(item.snapshot),
      autoSynced: stringList(item.autoSynced),
      syncedAt: Number(item.syncedAt) || 0,
    }
  }
  return states
}

export const getPlaylistState = (
  config: LxxWearConfig,
  key: string
): PlaylistSyncState | undefined => config.playlists[key]

/** 有任意一个勾选的歌单处于「已手动同步 + 开了自动同步」状态 */
export const hasAutoPlaylist = (config: LxxWearConfig): boolean =>
  config.playlistIds.some(key => {
    const state = config.playlists[key]
    return !!state && state.synced && state.auto
  })

export const updatePlaylistState = (
  config: LxxWearConfig,
  key: string,
  patch: Partial<PlaylistSyncState>
): LxxWearConfig => ({
  ...config,
  playlists: {
    ...config.playlists,
    [key]: { ...(config.playlists[key] ?? emptyPlaylistState()), ...patch },
  },
})

/**
 * 切换某个歌单的自动同步。
 * 关掉的时候，被自动同步带进来的新歌转成正式选中——只是不跟新了，已经下好的不删。
 */
export const setPlaylistAuto = (
  config: LxxWearConfig,
  key: string,
  auto: boolean
): LxxWearConfig => {
  const state = config.playlists[key]
  if (!state) return config
  if (auto) return updatePlaylistState(config, key, { auto: true })
  return updatePlaylistState(config, key, {
    auto: false,
    selected: Array.from(new Set([...state.selected, ...state.autoSynced])),
    autoSynced: [],
  })
}

export const loadConfig = async (): Promise<LxxWearConfig> => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG, playlists: {} }
    const data = JSON.parse(raw) as Partial<LxxWearConfig>
    return {
      playlistIds: stringList(data.playlistIds),
      quality: (data.quality ?? DEFAULT_QUALITY) as LX.Quality,
      autoSync: !!data.autoSync,
      playlists: parsePlaylistStates(data.playlists),
    }
  } catch {
    return { ...DEFAULT_CONFIG, playlists: {} }
  }
}

export const saveConfig = async (config: LxxWearConfig): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}
