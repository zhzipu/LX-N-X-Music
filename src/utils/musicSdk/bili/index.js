import leaderboard from './leaderboard'
import musicSearch from './musicSearch'
import comment from './comment'
import artist from './artist'

/**
 * 小哔音乐（B 站视频）源。
 * 提供排行榜 + 搜索 + 评论 + UP 主主页能力（播放走 core/music 里的 bili 分支）。
 */
const bili = {
  leaderboard,
  musicSearch,
  comment,
  artist,
}

export default bili
