/**
 * 把 B 站媒体项（收藏夹/合集里的视频）转成本项目播放器认识的曲目对象。
 * source 为 'bili'，播放时通过 getAudioStream 实时取音频直链。
 */
import type { BiliMediaItem } from './api'
import { normalizeBiliImageUrl } from './api'
import { formatPlayTime } from '@/utils/common'

export const toBiliMusicInfo = (item: BiliMediaItem): LX.Music.MusicInfo_bili => {
  const duration = item.duration ?? 0
  return {
    id: `bili_${item.bvid}`,
    name: item.title,
    singer: item.upper?.name ?? 'Bilibili',
    artists: [{ id: item.upper?.mid ?? 0, name: item.upper?.name ?? 'Bilibili' }],
    source: 'bili',
    interval: formatPlayTime(duration),
    meta: {
      songId: item.bvid,
      albumName: 'Bilibili',
      picUrl: normalizeBiliImageUrl(item.cover),
      bvid: item.bvid,
      cid: 0, // 播放时懒加载拿 cid
      qualitys: [],
      _qualitys: {},
    },
  }
}
