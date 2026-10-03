import { pause } from '@/core/player/player'
import playerState from '@/store/player/state'
import { onMediaVolumeChange } from '@/utils/nativeModules/utils'

let removeMediaVolumeListener: (() => void) | null = null

export default () => {
  if (removeMediaVolumeListener) return

  removeMediaVolumeListener = onMediaVolumeChange(({ volume }) => {
    if (volume != 0 || !playerState.isPlay) return
    void pause()
  })
}
