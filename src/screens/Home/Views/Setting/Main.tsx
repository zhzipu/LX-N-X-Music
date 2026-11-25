import Basic from './settings/Basic'
import Appearance from './settings/Appearance'
import Services from './settings/Services'
import Player from './settings/Player'
import LyricDesktop from './settings/LyricDesktop'
import List from './settings/List'
import Download from './settings/Download'
import Sync from './settings/Sync'
import Backup from './settings/Backup'
import Other from './settings/Other'
import Version from './settings/Version'
import About from './settings/About'
import type { SettingScreenIds } from './catalog'

export { SETTING_SCREENS, type SettingScreenIds } from './catalog'

const SCREENS = {
  basic: Basic,
  appearance: Appearance,
  services: Services,
  player: Player,
  lyric_desktop: LyricDesktop,
  list: List,
  download: Download,
  sync: Sync,
  backup: Backup,
  other: Other,
  version: Version,
  about: About,
} satisfies Record<SettingScreenIds, React.ComponentType>

export default ({ id }: { id: SettingScreenIds }) => {
  const Screen = SCREENS[id]
  return <Screen />
}
