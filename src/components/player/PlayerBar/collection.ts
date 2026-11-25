import { addListMusics, getListMusics, removeListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import playerState from '@/store/player/state'
import { toast } from '@/utils/tools'

let pending: Promise<unknown> = Promise.resolve()

/** Snapshot the song at release and serialize opposite swipes in gesture order. */
export const setCurrentMusicCollected = (collected: boolean): Promise<void> => {
  const playing = playerState.playMusicInfo.musicInfo
  const music = playing && ('progress' in playing ? playing.metadata.musicInfo : playing)
  if (!music) return Promise.resolve()
  const task = pending.then(async () => {
    const list = await getListMusics(LIST_IDS.LOVE)
    const exists = list.some(item => item.id === music.id)
    if (collected && !exists) await addListMusics(LIST_IDS.LOVE, [music], 'top')
    else if (!collected && exists) await removeListMusics(LIST_IDS.LOVE, [music.id])
    toast(global.i18n.t(collected ? 'collect_success' : 'collect_remove'))
  })
  // One failed operation must not prevent later swipes from working.
  pending = task.catch(() => {})
  return task
}
