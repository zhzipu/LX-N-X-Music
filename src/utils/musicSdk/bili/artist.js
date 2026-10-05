import { formatPlayTime } from '@/utils/common'
import {
  getMemberInfo,
  getMemberArchives,
  getMemberSeasons,
  normalizeBiliImageUrl,
} from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'

/**
 * 小哔音乐（B 站）UP 主主页。
 * 点歌手进入 UP 主主页：头像/简介来自 UP 主详情，歌曲=UP 主所有作品，专辑=UP 主合集。
 * 接口契约与 wy/artist.js 对齐，供 ArtistDetail 页面复用。
 */

/** UP 主作品 → new music info（带 meta.bvid，播放走 bili 链路） */
const archiveToMusicInfo = (v, name, mid) => ({
  id: `bili_${v.bvid}`,
  name: v.title,
  singer: name,
  artists: [{ id: mid, name }],
  source: 'bili',
  interval: formatPlayTime(v.duration || 0),
  meta: {
    songId: v.bvid,
    albumName: 'Bilibili',
    picUrl: normalizeBiliImageUrl(v.pic),
    bvid: v.bvid,
    aid: v.aid, // avid：收藏（/x/v3/fav/resource/deal）时用
    cid: 0, // 播放时懒加载
    qualitys: [],
    _qualitys: {},
  },
})

export default {
  /**
   * 获取 UP 主详情。
   * @param id UP 主 mid
   * @returns { artist: { id, name, avatar, cover, briefDesc, alias } }
   */
  async getDetail(id, retryNum = 0) {
    const cookie = getBiliCookie()
    try {
      const info = await getMemberInfo(Number(id), cookie)
      return {
        artist: {
          id: String(info.mid),
          name: info.name,
          avatar: info.face,
          cover: info.face,
          briefDesc: info.sign || '',
          alias: [],
        },
      }
    } catch (error) {
      if (retryNum < 2) return this.getDetail(id, retryNum + 1)
      throw error
    }
  },

  /**
   * 获取 UP 主所有作品（歌曲）。
   * @param id UP 主 mid
   * @param order 排序：hot=播放量（热门），time=投稿时间（时间）
   * @param limit 每页数量
   * @param offset 偏移（换算成页码）
   */
  async getSongs(id, order = 'hot', limit = 100, offset = 0, retryNum = 0) {
    const cookie = getBiliCookie()
    const page = Math.floor(offset / limit) + 1
    // 映射到 B 站 App 接口的 order 值：click=播放量，pubdate=投稿时间
    const biliOrder = order === 'time' ? 'pubdate' : 'click'
    try {
      const { list, count } = await getMemberArchives(Number(id), page, limit, cookie, biliOrder)
      // 回填 UP 主名（archive 接口不返回 UP 主名，从详情拿，失败用空名兜底）
      let name = ''
      try {
        name = (await this.getDetail(id)).artist.name
      } catch {
        name = ''
      }
      const songs = list.map((v) => archiveToMusicInfo(v, name, Number(id)))
      return {
        list: songs,
        total: count,
        hasMore: page * limit < count,
      }
    } catch (error) {
      if (retryNum < 2) return this.getSongs(id, order, limit, offset, retryNum + 1)
      throw error
    }
  },

  /**
   * 获取 UP 主合集（专辑）。
   * @param id UP 主 mid
   */
  async getAlbums(id, limit = 100, offset = 0, retryNum = 0) {
    const cookie = getBiliCookie()
    try {
      const { list, hasMore } = await getMemberSeasons(Number(id), Math.floor(offset / limit) + 1, limit, cookie)
      const hotAlbums = list.map((s) => ({
        id: String(s.id),
        name: s.title,
        picUrl: normalizeBiliImageUrl(s.cover),
        size: s.total || 0,
        publishTime: 0,
        briefDesc: '',
        artist: { name: '', id: 0 },
        // bili 扩展：标记这是 UP 主合集（season），点击跳合集详情
        source: 'bili',
        type: 'collection',
      }))
      return { hotAlbums, hasMore }
    } catch (error) {
      if (retryNum < 2) return this.getAlbums(id, limit, offset, retryNum + 1)
      throw error
    }
  },
}
