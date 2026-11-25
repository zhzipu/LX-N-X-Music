/**
 * 「音乐 → 歌单详情」是否打开。
 *
 * 详情页需要占满整屏（隐藏主页的大标题），但 Header 在另一个组件里，
 * 所以用一个极小的全局状态 + 订阅来联动，避免把状态一路往下传。
 *
 * 用**引用计数**而不是布尔值：详情组件若被连续挂载两次（父级重渲染、页面复用等），
 * 布尔值会在先挂载的那个卸载时被置回 false，导致「详情还在、大标题却冒出来」。
 */

import { useEffect, useState } from 'react'

let openCount = 0
const listeners = new Set<(open: boolean) => void>()

const notify = () => {
  const open = openCount > 0
  for (const listener of listeners) listener(open)
}

export const pushMusicDetail = () => {
  openCount++
  notify()
}

export const pushHomeDetail = pushMusicDetail

export const popMusicDetail = () => {
  if (openCount > 0) openCount--
  notify()
}

export const popHomeDetail = popMusicDetail

export const getMusicDetailOpen = () => openCount > 0

export const useMusicDetailOpen = () => {
  const [open, setOpen] = useState(openCount > 0)
  useEffect(() => {
    listeners.add(setOpen)
    setOpen(openCount > 0)
    return () => {
      listeners.delete(setOpen)
    }
  }, [])
  return open
}
