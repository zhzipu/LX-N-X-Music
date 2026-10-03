/**
 * 识别结果 → 搜索。
 *
 * 这里不做「跨音源换源播放」，而是把「歌名 + 歌手」写进搜索框并直接发起搜索：
 * 识别只是给一个可搜索的候选，具体在哪个音源、哪个版本播放，交给现有的搜索链路。
 */
import { setSearchText } from '@/core/search/search'
import type { RecognitionResult } from './types'

/** 去掉标题里的括号后缀（翻唱 / 伴奏 / Live 等版本标记），提高搜索命中率 */
export const cleanRecognitionTitle = (title: string): string =>
  title
    .replace(/[（(【\[][^）)】\]]*[）)】\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

export const buildSearchKeyword = (result: RecognitionResult): string => {
  const title = cleanRecognitionTitle(result.title) || result.title
  return result.artist ? `${title} ${result.artist}` : title
}

/** 触发搜索并返回实际使用的关键词 */
export const searchRecognitionResult = (result: RecognitionResult): string => {
  const keyword = buildSearchKeyword(result)
  setSearchText(keyword)
  global.app_event.triggerSearch(keyword)
  return keyword
}
