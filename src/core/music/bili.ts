/**
 * B 站音频源的 URL / 封面 / 歌词获取。
 * 音频直链有时效（约 60 秒），因此不走 URL 缓存，每次实时获取。
 */
import { getAudioStream, getVideoPages } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'
import { getBiliLyric } from '@/core/lyricMatch/bili'
import { getPlayerLyric, saveLyric } from '@/utils/data'
import { parseDurationText } from '@/core/lyricMatch/match'
import { buildLyricInfo } from './utils'

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

export const getLyricInfo = async ({
  musicInfo,
  isRefresh = false,
}: {
  musicInfo: LX.Music.MusicInfo_bili
  isRefresh?: boolean
}): Promise<LX.Player.LyricInfo> => {
  // 命中缓存（含用户手动编辑过的歌词）直接返回，避免每次播放都去搜一遍
  if (!isRefresh) {
    const cached = await getPlayerLyric(musicInfo)
    if (cached.lyric) return cached
  }

  let { bvid, cid } = musicInfo.meta
  // cid 未预取时，懒加载第一个分 P 的 cid（与 getMusicUrl 一致）
  if (!cid) {
    try {
      const pages = await getVideoPages(bvid, getBiliCookie())
      if (pages.length) {
        cid = pages[0].cid
        musicInfo.meta.cid = cid
      }
    } catch (error) {
      console.log('bili 歌词：获取分 P 信息失败:', error)
    }
  }

  const lyricInfo = await getBiliLyric({
    bvid,
    cid,
    title: musicInfo.name,
    duration: parseDurationText(musicInfo.interval),
  })

  const result: LX.Music.LyricInfo = {
    lyric: lyricInfo.lyric,
    tlyric: lyricInfo.tlyric ?? null,
    rlyric: lyricInfo.rlyric ?? null,
    lxlyric: lyricInfo.lxlyric ?? null,
  }
  // 缓存到与其它音源相同的存储位（key 为 musicInfo.id，即 bili_<bvid>）
  void saveLyric(musicInfo, result)
  return buildLyricInfo(result)
}
