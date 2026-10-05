/**
 * bili（B 站）收藏 / 关注的统一入口。
 *
 * 策略（用户选择「两者都要」）：
 *  1. **本地 store 永远是即时反馈的来源** —— 点下去立刻点亮心形，离线/未登录也能用；
 *  2. 已登录 B 站时再**尽力同步**到 B 站账号：
 *     - 歌曲（视频）→ 收藏进名为「音乐」的收藏夹（没有则自动创建）
 *     - 专辑（合集 / season）→ 收藏进同一个收藏夹
 *     - 歌手（UP 主）→ 关注
 *  3. 同步失败（未登录 / Cookie 缺 bili_jct / 接口报错）只提示，**不影响本地状态**。
 *
 * 注意：本地收藏是独立的一份记录（见 store/user/state.ts 的 bili_* 字段），
 * 没有从 B 站拉全量收藏回来，所以「在 B 站 App 里收藏过」不会自动点亮心形。
 */
import {
  BILI_FAV_TYPE_SEASON,
  BILI_FAV_TYPE_VIDEO,
  BILI_MUSIC_FOLDER_NAME,
  dealFavoriteResource,
  ensureMusicFavoriteFolder,
  getVideoInfo,
  hasBiliCsrf,
  modifyBiliRelation,
  requestUserInfo,
} from './api'
import { getBiliCookie, isBiliLoggedIn } from './auth'
import {
  addBiliFollowedArtist,
  addBiliLikedSong,
  addBiliSubscribedAlbum,
  removeBiliFollowedArtist,
  removeBiliLikedSong,
  removeBiliSubscribedAlbum,
} from '@/store/user/action'
import { log } from '@/utils/log'
import { toast } from '@/utils/tools'

/** 缓存当前登录用户的 mid，避免每点一次收藏都请求一遍 /nav */
let midCache: { cookie: string; mid: number } | null = null

const getLoggedInMid = async (cookie: string): Promise<number> => {
  if (midCache?.cookie === cookie) return midCache.mid
  const info = await requestUserInfo(cookie)
  if (!info?.mid) throw new Error('B 站登录已失效')
  midCache = { cookie, mid: info.mid }
  return midCache.mid
}

/**
 * 执行一次「尽力同步」。
 * @param task 实际要做的事
 * @param label 操作名（歌曲/专辑/歌手），只用于日志定位
 * @returns null 表示同步成功；返回字符串表示失败原因（用于提示）
 */
const syncToBili = async (
  task: (cookie: string, mid: number) => Promise<void>,
  label = ''
): Promise<string | null> => {
  const cookie = getBiliCookie()
  if (!isBiliLoggedIn(cookie)) return '未登录 B 站'
  if (!hasBiliCsrf(cookie)) return '登录信息缺少 bili_jct'
  try {
    const mid = await getLoggedInMid(cookie)
    await task(cookie, mid)
    return null
  } catch (err: any) {
    log.error('bili favorite sync failed:', label, err?.message ?? err)
    return err?.message ?? '同步失败'
  }
}

/** 收藏成功后统一提示：同步成功与只存本地的文案区分开 */
const notify = (action: 'add' | 'remove', reason: string | null) => {
  if (action === 'remove') {
    toast(reason ? `已取消收藏（未同步 B 站：${reason}）` : '已取消收藏')
    return
  }
  toast(reason ? `已收藏到本地（未同步 B 站：${reason}）` : `已收藏到 B 站「${BILI_MUSIC_FOLDER_NAME}」`)
}

/** 收藏 / 取消收藏一首 B 站歌曲（视频） */
export const toggleBiliSongFavorite = async (
  musicInfo: LX.Music.MusicInfoOnline,
  willFavorite: boolean
) => {
  const meta = musicInfo.meta as LX.Music.MusicInfoMeta_bili
  const bvid = meta?.bvid || String(meta?.songId ?? '')
  const key = bvid || musicInfo.id
  const aid = Number(meta?.aid) || 0
  log.info('bili fav song:', `bvid=${bvid}`, `aid=${aid}`, `willFav=${willFavorite}`)

  // 先落地本地状态，保证心形立刻响应
  if (willFavorite) addBiliLikedSong(key)
  else removeBiliLikedSong(key)

  if (!bvid && !aid) {
    notify(willFavorite ? 'add' : 'remove', '缺少视频 id')
    return
  }

  const reason = await syncToBili(async (cookie, mid) => {
    // 收藏接口（/x/v3/fav/resource/deal）按 **avid** 识别视频，传 bvid 会被 B 站判为
    // -400「请求错误」。歌手页与视频详情构造的曲目 meta 带 aid；
    // 但来自搜索结果 / 排行榜等旧格式数据的曲目可能没有，这里用 bvid 现场换一次 avid 兜底。
    let rid = aid
    if (!rid && bvid) rid = (await getVideoInfo(bvid, cookie))?.aid || 0
    log.info('bili fav song rid:', rid)
    if (!rid) throw new Error(`无法获取视频 avid（${bvid || '未知'}）`)
    const folderId = await ensureMusicFavoriteFolder(mid, cookie)
    await dealFavoriteResource(rid, BILI_FAV_TYPE_VIDEO, folderId, willFavorite, cookie)
  }, '歌曲')
  notify(willFavorite ? 'add' : 'remove', reason)
}

/** 收藏 / 取消收藏一个 UP 主合集（专辑） */
export const toggleBiliAlbumSubscribe = async (
  album: { id: string | number; name: string; picUrl?: string; size?: number },
  willSubscribe: boolean
) => {
  const seasonId = Number(album.id)
  log.info('bili fav album:', `id=${seasonId}`, `willSub=${willSubscribe}`)
  if (willSubscribe) {
    addBiliSubscribedAlbum({
      id: album.id,
      name: album.name,
      picUrl: album.picUrl ?? '',
      size: album.size ?? 0,
    })
  } else {
    removeBiliSubscribedAlbum(album.id)
  }

  if (!Number.isFinite(seasonId) || seasonId <= 0) {
    notify(willSubscribe ? 'add' : 'remove', '缺少合集 id')
    return
  }

  const reason = await syncToBili(async (cookie, mid) => {
    const folderId = await ensureMusicFavoriteFolder(mid, cookie)
    await dealFavoriteResource(seasonId, BILI_FAV_TYPE_SEASON, folderId, willSubscribe, cookie)
  }, '专辑')
  notify(willSubscribe ? 'add' : 'remove', reason)
}

/** 关注 / 取关一个 UP 主（歌手） */
export const toggleBiliArtistFollow = async (
  artist: { id: string | number; name: string; picUrl?: string },
  willFollow: boolean
) => {
  const mid = Number(artist.id)
  log.info('bili follow artist:', `mid=${mid}`, `willFollow=${willFollow}`)
  if (willFollow) {
    addBiliFollowedArtist({ id: artist.id, name: artist.name, picUrl: artist.picUrl ?? '' })
  } else {
    removeBiliFollowedArtist(artist.id)
  }

  if (!Number.isFinite(mid) || mid <= 0) {
    notify(willFollow ? 'add' : 'remove', '缺少 UP 主 id')
    return
  }

  const reason = await syncToBili(async (cookie) => {
    await modifyBiliRelation(mid, willFollow, cookie)
  }, '歌手')
  notify(willFollow ? 'add' : 'remove', reason)
}
