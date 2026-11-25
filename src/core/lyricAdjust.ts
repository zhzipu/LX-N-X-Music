/**
 * 单曲歌词调整：手动匹配到的歌词 + 时间偏移。
 *
 * 数据按歌曲 id 存到 AsyncStorage（wy_xxx / tx_xxx / bili_BVxxx / local_xxx …），
 * 应用点在 core/lyric.ts：歌词文本优先用手动匹配的，偏移交给 lrc 解析器的时间基准，
 * 只有桌面歌词（原生自行解析时间轴）才把偏移直接改写进 `[mm:ss]`。
 */
import { getData, saveData } from '@/plugins/storage'
import { repairCrammedLyric } from '@/core/lyricRepair'
import { log } from '@/utils/log'

const STORAGE_KEY = 'lyric_adjust_v1'
/** 与 `core/asr/autoAlign` 的 AUTO_PROVIDER 一致：只修「自动识别」产出的歌词 */
const AUTO_PROVIDER = '自动识别'
/** 落盘防抖，拖动滑块时不会每一下都写一次 */
const SAVE_DELAY = 300
/** 偏移上限（毫秒），再大就不是「对齐」而是「换歌」了 */
export const MAX_ABS_OFFSET = 30_000
/** 兜底上限：只是防止存进离谱的值，正常写入都会先按下面的公式夹过 */
const SAFE_ABS_OFFSET = 3_600_000
/** 歌词倍速：默认 1，最慢 0.5，最快 2.0，精度 0.1 */
export const MIN_LYRIC_SPEED = 0.5
export const MAX_LYRIC_SPEED = 2
export const LYRIC_SPEED_STEP = 0.1
/** 不知道歌曲时长时按 15 分钟估算 */
const FALLBACK_DURATION = 15 * 60 * 1000

/**
 * 偏移的允许范围。
 *
 * 倍速是「歌词时间 = 播放位置 × 倍速 + 常量」，常量里必然含有 `(倍速 - 1) × 对齐位置`，
 * 在长歌的中后段调倍速时这个值轻易就超过 30 秒。所以倍速不为 1 时上限要按
 * 倍速偏差 × 歌曲时长放宽，否则对齐结果会被夹掉、听起来就是「怎么调都不准」。
 */
export const getLyricOffsetLimit = (speed: number, durationMs = 0): number => {
  if (speed === 1) return MAX_ABS_OFFSET
  const duration = durationMs > 0 ? durationMs : FALLBACK_DURATION
  return MAX_ABS_OFFSET + Math.round(Math.abs(speed - 1) * duration)
}

export interface LyricAdjustItem {
  /** 手动匹配的歌词（带时间轴） */
  lrc?: string
  /** 手动匹配的翻译 */
  tlrc?: string
  /** 手动匹配的音译 */
  rlrc?: string
  /** 时间偏移（毫秒），正数表示歌词延后显示 */
  offset?: number
  /** 歌词倍速，1 表示按原速（不存该字段） */
  speed?: number
  /** 匹配来源，仅用于界面回显 */
  provider?: string
  /** 匹配到的歌曲描述，仅用于界面回显 */
  source?: string
}

let store: Record<string, LyricAdjustItem> = {}
let isLoaded = false
let loadingPromise: Promise<void> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * 调整内容变化的监听：手表同步（core/lxxwear）靠它知道「歌词改了，清单该重算」。
 * 不复用 app_event.lyricUpdated——那个会重建当前歌词列表，拖动时太重。
 */
type AdjustListener = () => void
const listeners = new Set<AdjustListener>()

/** 订阅歌词调整的变化，返回取消订阅的函数 */
export const onLyricAdjustChange = (listener: AdjustListener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const notifyChange = () => {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (err: any) {
      log.error('lyric adjust listener error:', err?.message ?? err)
    }
  })
}

/** djb2，只用来做「内容变了没有」的指纹，不需要抗碰撞 */
const hashText = (value: string): string => {
  let hash = 5381
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0
  return (hash >>> 0).toString(16)
}

const saveNow = () => {
  void saveData(STORAGE_KEY, store).catch((err: any) => {
    log.error('lyric adjust save error:', err?.message ?? err)
  })
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveNow()
  }, SAVE_DELAY)
}

/**
 * 修一次旧识别结果里「被压扁」的时间轴。
 *
 * 早期版本对齐时，一个有问题的词级时间戳会让后面二十行歌词被 +0.05s 一路顶过去，
 * 播放时表现为「滚到某句就不动了」。生成端已经修好，但已经落盘的结果不会自己变好，
 * 这里按字数比例把它们摊回前后两个可信锚点之间（近似，重新识别才是精确的）。
 */
const repairRecognizedLyrics = () => {
  let changed = 0
  for (const item of Object.values(store)) {
    if (item.provider !== AUTO_PROVIDER || !item.lrc) continue
    const fixed = repairCrammedLyric(item.lrc, item.tlrc ?? '')
    if (!fixed) continue
    if (fixed.lrc !== item.lrc) item.lrc = fixed.lrc
    if (fixed.tlrc !== (item.tlrc ?? '')) item.tlrc = fixed.tlrc || undefined
    changed += 1
  }
  if (changed) {
    saveNow()
    log.info(`修复了 ${changed} 首识别歌词的时间轴（旧版本的挤压 bug）`)
  }
}

/** 从存储恢复，App 启动时调用一次 */
export const initLyricAdjust = async () => {
  if (isLoaded) return
  if (!loadingPromise) {
    loadingPromise = getData<Record<string, LyricAdjustItem>>(STORAGE_KEY)
      .then((data) => {
        store = data && typeof data === 'object' ? data : {}
        repairRecognizedLyrics()
      })
      .catch((err: any) => {
        log.error('lyric adjust load error:', err?.message ?? err)
      })
      .finally(() => {
        isLoaded = true
        loadingPromise = null
      })
  }
  await loadingPromise
}

export const getLyricAdjust = (id?: string | null): LyricAdjustItem | undefined =>
  id ? store[id] : undefined

/** 取当前歌曲的歌词偏移（毫秒） */
export const getLyricOffset = (id?: string | null): number => (id ? store[id]?.offset ?? 0 : 0)

/** 把倍速夹到 [0.5, 2.0] 并按 0.1 取整 */
export const normalizeLyricSpeed = (speed: number): number => {
  if (!Number.isFinite(speed)) return 1
  return Math.max(MIN_LYRIC_SPEED, Math.min(MAX_LYRIC_SPEED, Math.round(speed * 10) / 10))
}

/** 取当前歌曲的歌词倍速（1 表示原速） */
export const getLyricSpeed = (id?: string | null): number =>
  normalizeLyricSpeed((id ? store[id]?.speed : undefined) ?? 1)

/**
 * 这首歌「歌词内容 + 时间轴」的指纹。
 *
 * 手表端（LXXWear）本地已经有歌词时默认不再重拉，手机这边把指纹放进清单，
 * 手表比对不上才会重新取一份——用户调过歌词/换过匹配，手表跟着变。
 * 没调整过的歌返回空串，这样清单里不会多出字段，手表行为完全不变。
 */
export const getLyricAdjustRevision = (id?: string | null): string => {
  if (!id) return ''
  const item = store[id]
  if (!item) return ''
  const lrc = item.lrc ?? ''
  const tlrc = item.tlrc ?? ''
  const rlrc = item.rlrc ?? ''
  const offset = item.offset ?? 0
  const speed = normalizeLyricSpeed(item.speed ?? 1)
  if (!lrc && !tlrc && !rlrc && !offset && speed === 1) return ''
  // 偏移与倍速单独参与，不用把歌词整段塞进哈希串
  return `${hashText(`${lrc}\u0001${tlrc}\u0001${rlrc}`)}-${offset}-${speed}`
}

const writeItem = (id: string, item: LyricAdjustItem) => {
  // 去掉值为 undefined 的键，避免存一堆空条目
  const next: LyricAdjustItem = {}
  for (const [key, value] of Object.entries(item)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value
  }
  if (Object.keys(next).length) store[id] = next
  else delete store[id]
  scheduleSave()
  notifyChange()
}

/** 写入手动匹配的歌词 */
export const setLyricOverride = (
  id: string,
  item: Pick<LyricAdjustItem, 'lrc' | 'tlrc' | 'rlrc' | 'provider' | 'source'>
) => {
  const prev = store[id] ?? {}
  writeItem(id, { ...prev, ...item })
  global.app_event.lyricUpdated()
}

/**
 * 写入时间偏移（毫秒），传 0 表示清除偏移。
 * 只落盘、不触发歌词重建：调节模式下由调用方接着调 refreshLyricOffset() 实时生效。
 * 这里只做「别存离谱值」的兜底，正常取值范围由调用方按 getLyricOffsetLimit() 决定。
 */
export const setLyricOffset = (id: string, offset: number) => {
  const prev = store[id] ?? {}
  const safeOffset = Number.isFinite(offset)
    ? Math.max(-SAFE_ABS_OFFSET, Math.min(SAFE_ABS_OFFSET, Math.round(offset)))
    : 0
  writeItem(id, { ...prev, offset: safeOffset === 0 ? undefined : safeOffset })
}

/**
 * 写入歌词倍速（1 表示原速）。
 * 与偏移一样只落盘、不重建歌词：调节模式下由调用方接着调 refreshLyricOffset() 实时生效。
 */
export const setLyricSpeed = (id: string, speed: number) => {
  const prev = store[id] ?? {}
  const next = normalizeLyricSpeed(speed)
  writeItem(id, { ...prev, speed: next === 1 ? undefined : next })
}

/** 清除该歌曲的所有手动调整，回到音源自带的歌词 */
export const clearLyricAdjust = (id: string) => {
  if (!store[id]) return
  delete store[id]
  scheduleSave()
  notifyChange()
  global.app_event.lyricUpdated()
}

// ---------------------------------------------------------------- 时间轴偏移

/** 匹配 `[mm:ss]`、`[mm:ss.x]`、`[mm:ss.xxx]`，一行里可能有多个 */
const TIME_TAG_RXP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

const pad = (value: number, length: number) => String(value).padStart(length, '0')

/**
 * 把歌词里的时间轴整体平移 offsetMs 毫秒（正数=延后）。
 * 没有偏移时原样返回，避免无谓地改写文本格式。
 */
export const shiftLyricTime = (lyric?: string | null, offsetMs = 0): string => {
  if (!lyric) return ''
  if (!offsetMs) return lyric
  return lyric.replace(TIME_TAG_RXP, (_match, min: string, sec: string, ms?: string) => {
    const total =
      Number(min) * 60000 +
      Number(sec) * 1000 +
      (ms == null ? 0 : Number(ms.padEnd(3, '0').slice(0, 3)))
    const next = Math.max(0, total + offsetMs)
    return `[${pad(Math.floor(next / 60000), 2)}:${pad(Math.floor((next % 60000) / 1000), 2)}.${pad(
      next % 1000,
      3
    )}]`
  })
}

/**
 * 把歌词里的每个时间戳乘以 factor（放大/缩小整条时间轴）。
 * factor === 1 时原样返回，避免无谓地改写文本格式。
 */
export const scaleLyricTime = (lyric?: string | null, factor = 1): string => {
  if (!lyric) return ''
  if (factor === 1) return lyric
  return lyric.replace(TIME_TAG_RXP, (_match, min: string, sec: string, ms?: string) => {
    const total =
      Number(min) * 60000 +
      Number(sec) * 1000 +
      (ms == null ? 0 : Number(ms.padEnd(3, '0').slice(0, 3)))
    const next = Math.max(0, Math.round((total * factor) / 10) * 10)
    return `[${pad(Math.floor(next / 60000), 2)}:${pad(Math.floor((next % 60000) / 1000), 2)}.${pad(
      next % 1000,
      3
    )}]`
  })
}

/**
 * 把偏移与倍速直接改写进 `[mm:ss]`。
 *
 * 桌面歌词、蓝牙歌词与手表端（LXXWear）自己解析时间轴，拿不到 JS 解析器的 offset / 速率，
 * 只能提前算好：先加偏移，再按倍速缩放——倍速是「歌词时间轴相对播放位置」的缩放，
 * 所以某一行的实际播放时刻是 `(词时间 + 偏移) / 倍速`。倍速为 1 时与只加偏移完全一致。
 */
export const bakeLyricTime = (lyric?: string | null, speed = 1, offsetMs = 0): string => {
  if (!lyric) return ''
  const shifted = shiftLyricTime(lyric, offsetMs)
  return speed === 1 ? shifted : scaleLyricTime(shifted, 1 / speed)
}

/** 取当前歌曲可用的歌词（手动匹配优先）、偏移与倍速 */
export const resolveLyric = (musicInfo: {
  id?: string | null
  lrc?: string | null
  tlrc?: string | null
  rlrc?: string | null
}) => {
  const adjust = getLyricAdjust(musicInfo.id)
  const offset = adjust?.offset ?? 0
  const speed = normalizeLyricSpeed(adjust?.speed ?? 1)
  const lyric = adjust?.lrc ?? musicInfo.lrc
  if (!lyric) return { lyric: '', tlrc: '', rlrc: '', offset, speed }
  return {
    lyric,
    tlrc: adjust?.tlrc ?? musicInfo.tlrc ?? '',
    rlrc: adjust?.rlrc ?? musicInfo.rlrc ?? '',
    offset,
    speed,
  }
}
