/**
 * 修复「被压扁」的识别歌词时间轴。
 *
 * 这是 2026-11 那个对齐 bug 留下的伤疤：ASR 词表里个别词的时间戳离谱
 * （一句「你说」被标成 47.5s→82.6s），对齐后一整段歌词被定位到同一个时刻，
 * 后面的行又被「强制单调」按 +0.05s 一句顶过去 —— 20 行歌词挤进 1 秒。
 * 播放时看到的就是「滚到某句就不动了」，隔一分钟突然闪过去。
 *
 * 生成端已经修好（`core/asr/qwen.ts` 的词表体检 + `core/asr/align.ts` 的锚点筛选），
 * 但**已经落盘的旧结果不会自己变好**：那些行原本的正确时间在生成时就丢掉了。
 * 这里按字数比例把它们摊回「前后两个可信锚点」之间：不求精确，
 * 先把「卡住不动」变成「略有偏差但能跟着走」；重新识别一次才是精确结果。
 *
 * 只在明确的故障特征上动手：连续 ≥4 行、相邻间隔 ≤60ms —— 真人演唱不可能这么密集，
 * 出现这个模式只可能是上面那个 +0.05s 的产物。
 */

/** `[mm:ss]` / `[mm:ss.x]` / `[mm:ss.xxx]` 开头的一行 */
const ROW_RE = /^\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\](.*)$/

/** 相邻两行间隔不超过这个值（秒），视为「被 +0.05s 顶出来的」 */
const FLAT_GAP = 0.06
/** 连续这么多行挤在一起才算故障 */
const MIN_RUN = 4
/** 摊开时两行之间至少留这么久，避免又粘在一起 */
const MIN_STEP = 0.25

interface Row {
  time: number
  text: string
}

const toSeconds = (sec: string): number => {
  const value = Number(sec.replace(':', '.'))
  return Number.isFinite(value) ? value : 0
}

const formatTime = (sec: number): string => {
  const s = Math.max(0, sec)
  const m = Math.floor(s / 60)
  return `[${String(m).padStart(2, '0')}:${(s - m * 60).toFixed(2).padStart(5, '0')}]`
}

const parseRows = (lyric: string): { rows: Row[]; total: number } => {
  const rows: Row[] = []
  let total = 0
  for (const line of lyric.split('\n')) {
    const text = line.trim()
    if (!text) continue
    total += 1
    const match = ROW_RE.exec(text)
    if (!match) continue
    rows.push({ time: Number(match[1]) * 60 + toSeconds(match[2]), text: match[3] })
  }
  return { rows, total }
}

const textLength = (text: string): number => Math.max(1, text.replace(/\s/g, '').length)

/**
 * 摊开挤压段，返回新的 lrc；没发现故障、或格式不是我们生成的那种，返回 null。
 *
 * `tlrc` 传进来时若行数对得上会一起改写时间轴（不然翻译会整体错位）。
 */
export const repairCrammedLyric = (
  lrc: string,
  tlrc = ''
): { lrc: string; tlrc: string } | null => {
  const { rows, total } = parseRows(lrc)
  // 只处理「每行都带时间轴」的生成结果，其它格式一律不动
  if (rows.length < MIN_RUN * 2 || rows.length !== total) return null

  let repaired = 0
  let i = 0
  while (i < rows.length - 1) {
    let j = i
    while (j + 1 < rows.length) {
      const gap = rows[j + 1].time - rows[j].time
      if (gap > FLAT_GAP || gap < 0) break
      j += 1
    }
    if (j - i + 1 < MIN_RUN) {
      i = j + 1
      continue
    }

    // 挤压段的第一行就是那个「被顶歪的锚点」（后面的行是它 +0.05s 累加出来的），
    // 所以整段一起重排；边界取它前面、后面那两行当作可信锚点。
    const fromRow = i - 1
    const toRow = j + 1
    if (fromRow < 0 || toRow >= rows.length) {
      i = j + 1
      continue
    }
    const from = rows[fromRow].time
    const to = rows[toRow].time
    if (to - from <= 0) {
      i = j + 1
      continue
    }

    const block = rows.slice(i, j + 1)
    const lens = block.map((row) => textLength(row.text))
    const sum = lens.reduce((a, b) => a + b, 0)
    let used = 0
    for (let k = 0; k < block.length; k++) {
      // 取这一行「份额的中心」，第一行才不会和前一个锚点撞在同一时刻
      const center = used + lens[k] / 2
      block[k].time = Math.min(from + ((to - from) * center) / sum, to - MIN_STEP)
      used += lens[k]
    }
    // 单调兜底：区间太窄时上面会算出并列时间
    for (let k = 1; k < block.length; k++) {
      if (block[k].time < block[k - 1].time + MIN_STEP) {
        block[k].time = block[k - 1].time + MIN_STEP
      }
    }
    repaired += block.length
    i = j + 1
  }

  if (!repaired) return null

  const nextLrc = rows.map((row) => `${formatTime(row.time)}${row.text}`).join('\n')
  let nextTlrc = tlrc
  if (tlrc) {
    const trans = tlrc
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (trans.length === rows.length) {
      nextTlrc = trans
        .map((line, k) => {
          const match = ROW_RE.exec(line)
          return `${formatTime(rows[k].time)}${match ? match[3] : line}`
        })
        .join('\n')
    }
  }
  return { lrc: nextLrc, tlrc: nextTlrc }
}
