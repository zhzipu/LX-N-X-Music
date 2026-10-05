import { formatPlayTime } from '@/utils/common'
import {
  getRankingVideos,
  getLatestMusicRankId,
  getMusicRankList,
  normalizeBiliImageUrl,
} from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'

/**
 * 小哔音乐（B 站）排行榜。
 * 四个榜单：
 *   - 排行榜（bangid 0）：音乐区视频榜，/v/popular/rank/music，走 ranking/v2?rid=1003
 *   - 鬼畜榜（bangid 119）：鬼畜区视频榜，走 ranking/v2?rid=119
 *   - 热歌榜（bangid 1）：音频榜单 list_type=1，取最新一期，播放关联的二创视频
 *   - 二创榜（bangid 3）：音频榜单 list_type=3，取最新一期，播放关联的二创视频
 */

const boardList = [
  { id: 'bili__0', name: '排行榜', bangid: '0' },
  { id: 'bili__119', name: '鬼畜榜', bangid: '119' },
  { id: 'bili__1', name: '热歌榜', bangid: '1' },
  { id: 'bili__3', name: '二创榜', bangid: '3' },
]

/** 把榜单里的视频项转成 old music info（带 bvid/aid/cid，供 toNewMusicInfo 转换） */
const toOldMusicInfo = ({ bvid, aid, cid, title, cover, nickname, mid, duration }) => ({
  songmid: bvid,
  name: title,
  singer: nickname || 'Bilibili',
  artists: [{ id: mid || 0, name: nickname || 'Bilibili' }],
  interval: formatPlayTime(duration || 0),
  img: normalizeBiliImageUrl(cover),
  source: 'bili',
  types: [],
  _types: {},
  // bili 扩展字段，toNewMusicInfo 的 bili 分支会转进 meta
  bvid,
  aid: aid || 0, // avid：收藏时用（缺了收藏会 -400）
  cid: cid || 0,
})

export default {
  limit: 100,

  async getBoards() {
    return {
      list: boardList,
      source: 'bili',
    }
  },

  /**
   * @param bangid '0' 排行榜 / '119' 鬼畜榜 / '1' 热歌榜 / '3' 二创榜
   * @param page 页码（本实现一次拉全量，忽略分页）
   */
  async getList(bangid, page) {
    const cookie = getBiliCookie()
    let list = []

    if (bangid === '0' || bangid === '119') {
      // 分区视频排行榜：音乐区 rid=1003 / 鬼畜区 rid=119
      const rid = bangid === '119' ? 119 : 1003
      const videos = await getRankingVideos(rid, cookie)
      list = videos.map((v) =>
        toOldMusicInfo({
          bvid: v.bvid,
          aid: v.aid,
          cid: v.cid,
          title: v.title,
          cover: v.pic,
          nickname: v.owner?.name,
          mid: v.owner?.mid,
          duration: v.duration,
        })
      )
    } else {
      // 音频榜单（热歌榜 list_type=1 / 二创榜 list_type=3），播放关联的二创视频
      const listType = Number(bangid)
      const listId = await getLatestMusicRankId(listType, cookie)
      const items = await getMusicRankList(listId, cookie)
      if (listType === 3) {
        // 二创榜：顶层 creation_* 为空，真正的二创视频在 arc_list 里，逐个展开
        list = []
        for (const it of items) {
          const arcs = it.arc_list ?? []
          for (const arc of arcs) {
            if (!arc.bvid) continue
            list.push(
              toOldMusicInfo({
                bvid: arc.bvid,
                aid: arc.aid,
                cid: arc.first_cid,
                // 用二创视频标题（歌曲名作歌手名前缀，见下）
                title: arc.title || it.music_title,
                cover: arc.cover || it.mv_cover,
                nickname: arc.up_name || it.singer,
                mid: arc.mid,
                duration: arc.duration,
              })
            )
          }
        }
      } else {
        // 热歌榜：顶层 creation_bvid 有值
        list = items
          .filter((it) => it.creation_bvid) // 过滤掉没有关联二创视频的纯音频项（无法用视频播放器播放）
          .map((it) =>
            toOldMusicInfo({
              bvid: it.creation_bvid,
              cid: it.creation_first_cid,
              // 优先展示歌曲名，视频名作补充（列表里用歌曲名更直观）
              title: it.music_title || it.creation_title,
              cover: it.creation_cover || it.mv_cover,
              nickname: it.creation_nickname || it.singer,
              mid: it.creation_up,
              duration: it.creation_duration,
            })
          )
      }
    }

    return {
      total: list.length,
      list,
      limit: list.length || this.limit,
      page,
      source: 'bili',
    }
  },
}
