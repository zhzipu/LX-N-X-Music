import { formatPlayTime } from '@/utils/common'
import { searchVideos, normalizeBiliImageUrl } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'

/**
 * 小哔音乐（B 站视频）搜索。
 * 走 B 站 /x/web-interface/search/type?search_type=video，返回视频列表，
 * 播放复用 bili 的视频播放链路（core/music 里的 bili 分支）。
 */

/** 去掉标题里的 <em class="keyword">xxx</em> 高亮标签，只保留纯文本 */
const stripEm = (text) =>
  (text || '')
    .replace(/<em[^>]*>/g, '')
    .replace(/<\/em>/g, '')
    .trim()

/**
 * B 站搜索返回的 duration 是 "分:秒" 或 "时:分:秒" 字符串（如 "222:28" / "7:32"），
 * 转成秒数。
 */
const parseDuration = (duration) => {
  if (!duration) return 0
  if (typeof duration === 'number') return duration
  const parts = String(duration)
    .split(':')
    .map((n) => parseInt(n, 10) || 0)
  let seconds = 0
  for (const p of parts) seconds = seconds * 60 + p
  return seconds
}

export default {
  limit: 30,

  /**
   * 搜索 B 站视频。
   * @param keyword 关键词
   * @param page 页码（从 1 开始）
   * @param limit 每页数量
   * @returns { list, allPage, total, limit, source }
   */
  async search(keyword, page = 1, limit, retryNum = 0) {
    if (limit == null) limit = this.limit
    const cookie = getBiliCookie()

    try {
      const result = await searchVideos(keyword, page, limit, cookie)
      const list = result.list.map((v) => ({
        songmid: v.bvid,
        name: stripEm(v.title),
        singer: v.author || 'Bilibili',
        artists: [{ id: v.mid || 0, name: v.author || 'Bilibili' }],
        interval: formatPlayTime(parseDuration(v.duration)),
        img: normalizeBiliImageUrl(v.pic),
        source: 'bili',
        types: [],
        _types: {},
        // bili 扩展字段，toNewMusicInfo 的 bili 分支会转进 meta
        bvid: v.bvid,
        cid: 0, // 播放时懒加载拿 cid
      }))

      const allPage = Math.max(1, result.pages || Math.ceil(result.total / limit))
      return {
        list,
        allPage,
        total: result.total,
        limit,
        source: 'bili',
      }
    } catch (error) {
      // 网络错误重试一次
      if (retryNum < 1) {
        return this.search(keyword, page, limit, retryNum + 1)
      }
      throw error
    }
  },
}
