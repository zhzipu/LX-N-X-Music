import { dateFormat2 } from '../../index'
import { getReplyList, getVideoInfo } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'

/**
 * 小哔音乐（B 站视频）评论。
 * 播放器里点「评论」显示该作品（视频）页内的评论，与其他音源展示效果一致。
 *
 * 接口 /x/v2/reply/main 用 next 游标分页（mode=3 热度 / mode=2 时间），
 * 而老接口 /x/v2/reply 的 sort 参数只支持热度排序（时间排序已失效，两种 tab 会一样）。
 * 评论接口的 oid 需要 avid，而曲目里存的是 bvid，
 * 所以先走 /x/web-interface/view 拿 aid 再拉评论。
 */

/** bvid → aid 的内存缓存，避免反复请求 view 接口 */
const aidCache = new Map()

const getAidByBvid = async (bvid, cookie) => {
  if (aidCache.has(bvid)) return aidCache.get(bvid)
  const info = await getVideoInfo(bvid, cookie)
  aidCache.set(bvid, info.aid)
  return info.aid
}

/**
 * next 游标缓存：key = `${bvid}_${mode}`，value = Map<page, next>。
 * UI 按 (musicInfo, page) 拉评论，接口按游标翻页，这里做一层转换。
 */
const cursorCache = new Map()

const getCursorForPage = (key, page) => {
  let pages = cursorCache.get(key)
  if (!pages) {
    pages = new Map()
    cursorCache.set(key, pages)
  }
  return pages
}

const filterComment = (rawList) => {
  if (!rawList?.length) return []
  return rawList.map((item) => {
    const data = {
      id: item.rpid,
      text: item.content?.message ?? '',
      time: item.ctime ?? '',
      timeStr: item.ctime ? dateFormat2(item.ctime * 1000) : '',
      location: item.reply_control?.location ?? '',
      userName: item.member?.uname ?? '',
      avatar: item.member?.avatar ?? '',
      userId: item.member?.mid ?? '',
      likedCount: item.like ?? 0,
      reply: [],
    }
    return data
  })
}

const fetchComment = async (musicInfo, page, limit, mode) => {
  const cookie = getBiliCookie()
  const bvid = musicInfo?.meta?.bvid ?? musicInfo?.bvid ?? musicInfo?.songmid
  if (!bvid) throw new Error('缺少 bvid，无法获取评论')

  const aid = await getAidByBvid(bvid, cookie)
  const cacheKey = `${bvid}_${mode}`
  const pages = getCursorForPage(cacheKey, page)

  // page=1 从头开始；page>1 用上一页记录的游标；跳页（缓存缺失）则重头拉
  const next = page <= 1 ? 0 : (pages.get(page - 1) ?? 0)
  if (page <= 1) pages.clear()

  const { replies, count, next: nextCursor, isEnd } = await getReplyList(aid, mode, next, limit, cookie)
  if (nextCursor) pages.set(page <= 1 ? 1 : page, nextCursor)

  return {
    source: 'bili',
    comments: filterComment(replies),
    total: count,
    page,
    limit,
    // B 站是游标分页没有总页数：is_end 时当前页就是最后一页，否则还有下一页
    maxPage: isEnd ? page : page + 1,
  }
}

export default {
  /**
   * 获取评论（时间/最新排序，mode=2）。
   * @param musicInfo old music info，含 songmid(bvid) 或 meta.bvid
   */
  async getComment(musicInfo, page = 1, limit = 20) {
    return fetchComment(musicInfo, page, limit, 2)
  },

  /**
   * 获取热门评论（热度排序，mode=3）。
   */
  async getHotComment(musicInfo, page = 1, limit = 20) {
    return fetchComment(musicInfo, page, limit, 3)
  },
}
