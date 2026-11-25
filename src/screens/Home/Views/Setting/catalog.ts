export const SETTING_GROUPS = [
  { title: 'setting_group_personal', screens: ['appearance', 'basic'] },
  { title: 'setting_group_music', screens: ['player', 'lyric_desktop', 'list', 'download'] },
  { title: 'setting_group_data', screens: ['services', 'sync', 'backup'] },
  { title: 'setting_group_app', screens: ['other', 'version', 'about'] },
] as const

export type SettingScreenIds = (typeof SETTING_GROUPS)[number]['screens'][number]

export const SETTING_SCREENS: SettingScreenIds[] = SETTING_GROUPS.flatMap(
  group => [...group.screens] as SettingScreenIds[]
)

export const SETTING_META = {
  appearance: { icon: 'slider', description: 'setting_desc_appearance' },
  basic: { icon: 'setting', description: 'setting_desc_basic' },
  player: { icon: 'play-outline', description: 'setting_desc_player' },
  lyric_desktop: { icon: 'lyric-on', description: 'setting_desc_lyric_desktop' },
  list: { icon: 'list-order', description: 'setting_desc_list' },
  download: { icon: 'download-2', description: 'setting_desc_download' },
  services: { icon: 'album', description: 'setting_desc_services' },
  sync: { icon: 'list-loop', description: 'setting_desc_sync' },
  backup: { icon: 'sd-card', description: 'setting_desc_backup' },
  other: { icon: 'eraser', description: 'setting_desc_other' },
  version: { icon: 'available_updates', description: 'setting_desc_version' },
  about: { icon: 'help', description: 'setting_desc_about' },
} as const satisfies Record<SettingScreenIds, { icon: string; description: string }>

