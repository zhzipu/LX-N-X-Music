/**
 * B 站音源 → 歌词。
 *
 * B 站视频本身没有歌词，所以做法是：拿一个尽量精确的「歌名」，
 * 再去有歌词的音源（网易云 / QQ音乐 / 酷狗）里按「歌名 + 时长」搜一首最像的。
 * 参考 BBPlayer：https://github.com/bbplayer-app/BBPlayer
 *
 * 歌名优先级：
 *  1. B 站自己从视频里识别出的 BGM（/x/player/wbi/v2 的 bgm_info.music_title）
 *     —— 最准，常见于音乐区/有官方曲库关联的视频；
 *  2. 清洗后的视频标题（去掉【】《》等补充说明）。
 */
import { getWebPlayerInfo, type BiliWebPlayerInfo, BiliApiError } from '@/core/bilibili/api'
import { getBiliCookie } from '@/core/bilibili/auth'
import { findLyricByKeyword, type LyricResult } from './match'

/** B 站视频 → 歌词匹配所需的输入 */
export interface BiliLyricTrack {
  bvid: string
  cid: number
  /** 视频标题 */
  title: string
  /** 时长（秒），用于校验歌词是否对得上，0 表示不校验 */
  duration: number
}

/** BGM 名解析结果的会话级缓存（bvid → 歌名），避免反复请求播放器信息接口 */
const bgmTitleCache = new Map<string, string | null>()
const BGM_CACHE_LIMIT = 200

/** 从标题里提取精确歌名的优先标记（BBPlayer 同款策略） */
const PRIORITY_PATTERN = /《(.+?)》|「(.+?)」/
/** 需要整段剔除的补充说明（【】、“”、（）等） */
const NOISE_PATTERN = /【.*?】|“.*?”|\(.*?\)|（.*?）/g

/**
 * 清洗视频标题当搜索关键词。
 * 有《》/「」时直接取里面的内容（标题里带书名号的一般就是歌名）；
 * 否则去掉补充说明后返回。
 */
export const cleanMusicKeyword = (title: string): string => {
  const source = String(title ?? '')
  const priority = PRIORITY_PATTERN.exec(source)
  if (priority) {
    const picked = (priority[1] || priority[2] || '').trim()
    if (picked) return picked
  }
  const replaced = source.replace(NOISE_PATTERN, '').trim()
  return replaced || source.trim()
}

/** 从 bgm_info.music_title 里取歌名（B 站常给「《歌名》 - 歌手」这种格式） */
const pickPreciseName = (musicTitle: string): string => cleanMusicKeyword(musicTitle)

/** 取播放器信息里的精确歌名；拿不到或请求失败都返回 null（不阻断流程） */
export const fetchPreciseMusicName = async (
  bvid: string,
  cid: number
): Promise<string | null> => {
  if (!bvid || !cid) return null
  if (bgmTitleCache.has(bvid)) return bgmTitleCache.get(bvid) ?? null

  let result: string | null = null
  try {
    const info: BiliWebPlayerInfo = await getWebPlayerInfo(bvid, cid, getBiliCookie())
    const musicTitle = info.bgm_info?.music_title
    result = musicTitle ? pickPreciseName(musicTitle) || null : null
  } catch (error) {
    // 该接口对未登录/部分视频会返回风控或错误码，属于预期内的「没有 BGM 信息」
    console.log(
      'bili 歌词：获取播放器 BGM 信息失败:',
      error instanceof BiliApiError ? `${error.message}（${error.code}）` : error
    )
    result = null
  }

  if (bgmTitleCache.size >= BGM_CACHE_LIMIT) bgmTitleCache.clear()
  bgmTitleCache.set(bvid, result)
  return result
}

/**
 * 给一首 B 站视频匹配歌词。
 * @throws 所有音源都没有结果时抛错，由上层决定是否提示（播放器会显示「歌词加载失败」）
 */
export const getBiliLyric = async (track: BiliLyricTrack): Promise<LyricResult> => {
  const preciseName = await fetchPreciseMusicName(track.bvid, track.cid)
  const keyword = preciseName ?? cleanMusicKeyword(track.title)
  if (!keyword) throw new Error('没有可用于搜索歌词的歌名')

  const duration = Math.max(track.duration, 0)
  console.log(
    `bili 歌词匹配: bvid=${track.bvid} keyword=${JSON.stringify(keyword)}` +
      `${preciseName ? '（来自 BGM 识别）' : '（来自视频标题）'} duration=${duration}s`
  )

  const lyric = await findLyricByKeyword(keyword, duration)
  console.log(`bili 歌词匹配成功: ${JSON.stringify(keyword)} → ${lyric.lyric.split('\n').length} 行`)
  return lyric
}

/** 仅供测试/调试：清空 BGM 名缓存 */
export const clearBiliLyricCache = () => bgmTitleCache.clear()
