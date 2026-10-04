/**
 * B 站音频源的 URL / 封面 / 歌词获取。
 * 音频直链有时效（约 60 秒），因此不走 URL 缓存，每次实时获取。
 */
import { getAudioStream, getVideoPages } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'

export const getMusicUrl = async ({
  musicInfo,
}: {
  musicInfo: LX.Music.MusicInfo_bili
  isRefresh: boolean
  quality?: LX.Quality
}): Promise<string> => {
  const cookie = getBiliCookie()
  let { bvid, cid } = musicInfo.meta
  // cid 未预取时，懒加载第一个分 P 的 cid
  if (!cid) {
    const pages = await getVideoPages(bvid, cookie)
    if (!pages.length) throw new Error('该视频没有可播放的分 P')
    cid = pages[0].cid
    musicInfo.meta.cid = cid
  }
  const stream = await getAudioStream(bvid, cid, cookie)
  return stream.url
}

export const getPicUrl = async ({
  musicInfo,
}: {
  musicInfo: LX.Music.MusicInfo_bili
  isRefresh: boolean
}): Promise<string> => {
  // 封面直接存在 meta.picUrl（构造曲目时已写入），无需二次请求
  return musicInfo.meta.picUrl ?? ''
}

export const getLyricInfo = async (): Promise<LX.Player.LyricInfo> => {
  // B 站视频无歌词，返回空
  const empty: LX.Music.LyricInfo = {
    lyric: '',
    tlyric: null,
    rlyric: null,
    lxlyric: null,
  }
  return { ...empty, rawlrcInfo: empty }
}
