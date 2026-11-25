/**
 * 容错的 JSON 解析。
 *
 * 网络（WebDAV / 同步服务 / 网盘）和本地可能存着非 JSON 内容（HTML 错误页、'ok'、被截断的文件…），
 * 裸 `JSON.parse` 抛出的 SyntaxError 会被全局兜底渲染成「Fatal: JSON Parse error」弹窗。
 * 这里统一收口：解析失败返回 undefined 并打日志，由调用方决定跳过还是提示。
 */
export const safeJsonParse = <T = unknown>(text: string | null | undefined, tag = 'safeJsonParse'): T | undefined => {
  if (text == null) return undefined
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed) as T
  } catch (err) {
    console.warn(`[${tag}] JSON 解析失败，已跳过:`, (err as Error).message, '| 前 80 字符:', trimmed.slice(0, 80))
    return undefined
  }
}
