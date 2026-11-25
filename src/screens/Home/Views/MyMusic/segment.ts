/**
 * 「我的歌单」页的分段状态。
 *
 * 「我的列表」与「我的歌单」合并为一个导航项后，两个内容分别作为该页的两个分段：
 *  - local：本地列表（试听列表 / 我的收藏 / 自建歌单）
 *  - online：网易云账号的歌单
 *
 * 之所以放在模块级而不是 React state：`event/appEvent.ts` 的跳转逻辑（播放条长按、
 * 播放中列表定位）需要在页面之外把分段切到「本地列表」，而它不在组件树里。
 */
export type MyMusicSegment = 'local' | 'online'

let currentSegment: MyMusicSegment = 'local'

const listeners = new Set<(segment: MyMusicSegment) => void>()

export const getMyMusicSegment = () => currentSegment

export const setMyMusicSegment = (segment: MyMusicSegment) => {
  if (currentSegment === segment) return
  currentSegment = segment
  listeners.forEach((listener) => {
    listener(segment)
  })
}

export const subscribeMyMusicSegment = (listener: (segment: MyMusicSegment) => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
