/**
 * 「自动识别」：长按歌词 → 云端 Qwen-Audio-3.1-ASR-Flash 听一遍整首歌 → 把当前歌词文本对齐出时间轴。
 *
 * 任务做成模块级单例而不是组件内的状态，是因为一次识别要下载音频 + 上传识别，
 * 用户很可能中途关掉面板去干别的：关面板不取消任务，完成时直接落盘 + toast。
 * 再打开面板看到的是实时状态，而不是又从头开始。
 *
 * 精度：云端给的是模型原生词级时间戳（不是 whisper 那种 DTW 估算），
 * 有参考歌词时文字 100% 正确，时间轴由 `alignByWordAxis` 逐行定位。
 * 无参考歌词时直接用识别文本成行，会有同音字错误。
 */
import playerState from '@/store/player/state'
import settingState from '@/store/setting/state'
import { temporaryDirectoryPath } from '@/utils/fs'
import {
  getLyricAdjust,
  resolveLyric,
  setLyricOffset,
  setLyricOverride,
  setLyricSpeed,
} from '@/core/lyricAdjust'
import { toast } from '@/utils/tools'
import { log } from '@/utils/log'
import { setLyric as rebuildPlayerLyric } from '@/core/lyric'
import { getCurrentLines } from '@/plugins/lyric'
import { isConfigured, MAX_AUDIO_SECONDS, transcribeByQwen, type AsrResult } from './index'
import { alignByWordAxis, isRefUsable, retimeAuxLyric, type AlignReport } from './align'
import { hasTranslateKey, isChineseLyric, translateLyricToChinese } from './translate'
import { releaseAudio, resolveAudio, type AudioSource } from './audio'

export type AlignStage = 'idle' | 'audio' | 'recognize' | 'align' | 'done' | 'error'

/** 写进歌词覆盖记录的来源标记：重新识别时靠它认出「这是我自己的产物」 */
export const AUTO_PROVIDER = '自动识别'

export interface AlignState {
  stage: AlignStage
  /** 当前阶段的进度 0~1；null 表示估不出来（转写阶段就是这样） */
  ratio: number | null
  /** 附加说明：下载百分比 / 已识别秒数 */
  detail: string
  /** 完成后的结果摘要 */
  summary: string
  /** 失败原因 */
  error: string
  /** 有任务在跑（面板关掉也还是 true） */
  running: boolean
  /** 这次结果属于哪首歌：切歌后再打开面板要能重新开始，而不是显示上一首的结果 */
  musicId: string
}

const INITIAL: AlignState = {
  stage: 'idle',
  ratio: null,
  detail: '',
  summary: '',
  error: '',
  running: false,
  musicId: '',
}

let state: AlignState = INITIAL
const listeners = new Set<() => void>()

const emit = (patch: Partial<AlignState>) => {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export const getAlignState = () => state

export const subscribeAlign = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const resetAlign = () => emit({ ...INITIAL })

export interface RecognizedLyricInfo {
  /** 识别出的歌词句数，0 表示这首歌还没识别过 */
  lines: number
  /** 歌词本身是不是中文（是就不用翻译） */
  chinese: boolean
  /** 是否已经有译文（识别时顺手翻的，或后来补翻的） */
  translated: boolean
}

/**
 * 这首歌的识别结果概况。
 *
 * 有识别结果时不该再自动跑一遍识别 —— 识别要下载音频、把整首上传云端、还要花钱，
 * 而结果早就落盘了，播放时 `resolveLyric` 会把它排在音源歌词前面。
 */
export const recognizedLyricInfo = (id?: string | null): RecognizedLyricInfo => {
  const item = getLyricAdjust(id)
  if (item?.provider !== AUTO_PROVIDER || !item.lrc) {
    return { lines: 0, chinese: true, translated: false }
  }
  let lines = 0
  for (const line of item.lrc.split('\n')) if (line.trim()) lines++
  return { lines, chinese: isChineseLyric(item.lrc), translated: !!item.tlrc?.trim() }
}

export const recognizedLyricLines = (id?: string | null): number => recognizedLyricInfo(id).lines

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback

const fail = (message: string) => {
  emit({ stage: 'error', ratio: null, detail: '', error: message, running: false })
  toast(message)
}

/** `03:05` → 185。元信息没给时长时返回 0（就当作不知道，不做上限拦截） */
const intervalSeconds = (interval?: string | null): number => {
  if (!interval) return 0
  const parts = interval.split(':').map((item) => Number(item))
  if (!parts.length || parts.some((item) => !Number.isFinite(item))) return 0
  return parts.reduce((sum, item) => sum * 60 + item, 0)
}

const summarize = (report: AlignReport, costSeconds: number, hasRef: boolean) => {
  if (!hasRef) return `识别出 ${report.total} 句歌词（用时 ${costSeconds} 秒）`
  return `对齐 ${report.hit}/${report.total} 句（用时 ${costSeconds} 秒）`
}

/**
 * 要不要顺手翻一份中文：用户开着「显示歌词翻译」，而识别出来的歌词不是中文。
 * 没填密钥就不翻，只提醒一句——识别本身不该因为这个失败。
 */
const shouldTranslate = (lrc: string): boolean => {
  if (!settingState.setting['player.isShowLyricTranslation']) return false
  if (isChineseLyric(lrc)) return false
  if (!hasTranslateKey()) {
    log.warn('歌词不是中文，但没配好百度翻译的 APPID / 密钥，跳过翻译')
    toast('歌词不是中文，配好百度翻译的 APPID 与密钥后可以自动翻译（设置 → 基础设置）')
    return false
  }
  return true
}

/** 从 lrc 里取出纯文本行，用于核对解析器里装的是不是这一份 */
const lrcTextsOf = (lrc: string): string[] =>
  lrc
    .split('\n')
    .map((line) => line.replace(/^\[[^\]]*\]/, '').trim())
    .filter(Boolean)

/**
 * 新歌词是否真的进了播放器的解析器。
 *
 * 不用「行数严格相等」当唯一判据：解析器会把同一时间戳的多行并成一行
 * （文本进 extendedLyrics），行数可能少一两行。首尾两行对上就算换上了。
 */
const isApplied = (texts: string[]): boolean => {
  const lines = getCurrentLines()
  if (!lines.length || !texts.length) return false
  if (lines[0].text !== texts[0]) return false
  if (lines.length === texts.length) return true
  return lines[lines.length - 1].text === texts[texts.length - 1]
}

/**
 * 等解析器把新歌词吃下去。
 *
 * `setLyric` 是异步的（内部还要写桌面歌词），返回时解析器未必已经重建完；
 * 采样几次比盲等一会儿更稳，正常情况下第一次就能对上。
 */
const settleLyric = async (texts: string[]) => {
  for (let i = 0; i < 10; i++) {
    if (isApplied(texts)) return true
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  return isApplied(texts)
}

const run = async () => {
  // 两个对象别混用：
  //   playerState.musicInfo 是「播放态」，只有 id/name/歌词，没有 source/meta；
  //   playerState.playMusicInfo.musicInfo 才是音源那份完整结构，取音频要走它。
  // 之前把前者强转成 LX.Music.MusicInfo 交给 resolveAudio，`getMusicUrl` 读
  // `meta._full` 时直接炸在「准备音频」这一步。
  const musicInfo = playerState.musicInfo
  if (!musicInfo.id || !musicInfo.name) {
    fail('当前没有正在播放的歌曲')
    return
  }
  const playingRaw = playerState.playMusicInfo.musicInfo
  const playing = (playingRaw && 'progress' in playingRaw
    ? playingRaw.metadata.musicInfo
    : playingRaw) as LX.Music.MusicInfo | null
  if (!playing) {
    fail('当前没有正在播放的歌曲')
    return
  }

  const apiKey = settingState.setting['common.asrApiKey']
  if (!isConfigured(apiKey)) {
    fail('还没填 DashScope API Key：设置 → 基础设置 → 歌词识别')
    return
  }

  const totalSeconds = intervalSeconds((playing as { interval?: string | null }).interval ?? (musicInfo as { interval?: string | null }).interval)
  if (totalSeconds > MAX_AUDIO_SECONDS) {
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = Math.round(totalSeconds % 60)
    fail(`这首歌 ${minutes} 分 ${seconds} 秒，超过云端单次识别的 5 分钟上限`)
    return
  }

  // 参考歌词：手动匹配过的优先（resolveLyric 已经处理），没有就只能拿 ASR 文本凑
  //
  // 上一次由本功能生成的歌词**不能**当参考：它本身就是 ASR 文本，
  // 再拿去做 DTW 只会把上次的同音字错误原样复刻一遍，用户点第二次会以为「识别没反应」。
  const previous = getLyricAdjust(musicInfo.id)
  const isOwnResult = previous?.provider === AUTO_PROVIDER && !!previous?.lrc
  const resolved = resolveLyric(musicInfo)
  const sourceLyric = isOwnResult ? '' : resolved.lyric
  // 音源给的「歌词」有时整块都是词/曲/编曲署名，或者只有寥寥几行 ——
  // 拿去对齐出来的东西跟原样一模一样，看起来就是「识别完了没替换」。这种直接弃用，
  // 改用识别文本成行；翻译/音译也跟着一起丢（行数对不上，留着只会错位）。
  const refOk = isRefUsable(sourceLyric, totalSeconds)
  const refLyric = refOk ? sourceLyric : ''
  const tlrc = refOk ? resolved.tlrc : ''
  const rlrc = refOk ? resolved.rlrc : ''
  const hasRef = !!refLyric.trim()
  if (!hasRef) {
    toast(
      sourceLyric.trim() ? '现有歌词只有制作信息，改用识别出的文本' : '将从音频识别歌词，没有现成文本可对齐'
    )
  }

  // 1) 音频落盘
  emit({ stage: 'audio', ratio: 0, detail: '' })
  let audio: AudioSource | null = null
  try {
    audio = await resolveAudio(playing, (progress) => {
      emit({
        ratio: progress.ratio,
        detail: progress.note ?? (progress.ratio >= 1 ? '' : '正在下载音频'),
      })
    })
  } catch (err) {
    fail(errorText(err, '音频准备失败'))
    return
  }

  let succeeded = false
  try {
    // 2) 上传识别（云端逐句推流回来，进度能实时显示）
    emit({ stage: 'recognize', ratio: totalSeconds ? 0 : null, detail: '0 秒' })
    const beganAt = Date.now()
    let result: AsrResult
    try {
      result = await transcribeByQwen(audio.path, {
        apiKey,
        // 参考歌词当前 400 字作为上下文，能压掉一批同音字
        context: hasRef ? refLyric : '',
        onProgress: (seconds) => {
          emit({
            ratio: totalSeconds ? Math.min(1, seconds / totalSeconds) : null,
            detail: `已识别 ${Math.round(seconds)} 秒`,
          })
        },
        dumpPath: `${temporaryDirectoryPath}/asr-last.json`,
      })
    } catch (err) {
      fail(errorText(err, '识别失败'))
      return
    }
    const cost = Math.max(1, Math.round((Date.now() - beganAt) / 1000))

    // 4) 对齐
    emit({ stage: 'align', ratio: null, detail: '' })
    // 词级时间戳直接摊成字符轴再逐行定位，不依赖云端 VAD 的断句
    const { lrc, report, times, fromAsr } = alignByWordAxis(refLyric, result)
    if (!lrc.trim()) {
      fail('没有识别到可用的人声，换一首试试')
      return
    }

    // 4.5) 歌词不是中文、用户又开着「显示歌词翻译」时，顺手翻一份中文
    let translated = ''
    if (shouldTranslate(lrc)) {
      emit({ stage: 'align', ratio: null, detail: '正在翻译歌词' })
      try {
        translated = await translateLyricToChinese(lrc)
      } catch (err: any) {
        // 翻译失败不能拖累识别本身：歌词已经打好了时间轴，照常落盘
        log.warn(`歌词翻译失败: ${err?.message ?? err}`)
        toast(`歌词已生成，但翻译失败：${errorText(err, '未知错误')}`)
      }
    }

    // 5) 落盘
    //
    // 顺序很关键：setLyricOverride 会触发 lyricUpdated 重建歌词，
    // 旧的偏移/倍速必须在那之前清掉 —— 时间轴是重新算的，接着用旧值只会整体偏。
    // 翻译按新时间轴逐行改写；行数对不上就丢弃（错位的翻译比没有更糟）。
    // 识别结果自己翻出来的译文按同一批时间轴走，直接用它盖掉音源那份翻译。
    setLyricOffset(musicInfo.id, 0)
    setLyricSpeed(musicInfo.id, 1)
    setLyricOverride(musicInfo.id, {
      lrc,
      tlrc: translated || retimeAuxLyric(tlrc, times),
      rlrc: retimeAuxLyric(rlrc, times),
      provider: AUTO_PROVIDER,
      source: musicInfo.name,
    })

    // 再显式重建一次：`lyricUpdated` 是异步广播，识别完成的瞬间如果正好在切歌、
    // 播放器重建歌词，这次广播会被后面那次覆盖掉，表现就是「识别完了歌词还是旧的」。
    // 直接调一次既保证顺序，也让下面这段校验有意义。
    await rebuildPlayerLyric().catch((err) => {
      log.warn(`歌词重建失败: ${err?.message ?? err}`)
    })
    if (getLyricAdjust(musicInfo.id)?.lrc !== lrc) {
      fail('歌词已写入但没能重新加载，回到播放页重进一次试试')
      return
    }

    // 真正判定「歌词换上了没有」要看解析器里的内容，而不是「setLyric 没抛错」。
    // setLyric 内部是异步的，异常会被上面的 catch 吞掉；只要解析器没吃下新歌词，
    // 界面就还是旧的。这里等一拍再核对，不对就再推一次。
    const texts = lrcTextsOf(lrc)
    if (!(await settleLyric(texts))) {
      log.warn(
        `歌词未生效: 期望 ${texts.length} 行, 解析器 ${getCurrentLines().length} 行, ` +
          `当前曲目 ${playerState.musicInfo.id}, 写入曲目 ${musicInfo.id}, ` +
          `首行 ${JSON.stringify(getCurrentLines()[0]?.text ?? '')}`
      )
      // 用户识别途中切了歌：新歌词是给原来那首歌的，当前页面自然是别的歌词，不算失败
      if (playerState.musicInfo.id !== musicInfo.id) {
        emit({ stage: 'done', ratio: 1, detail: '', summary: '', error: '', running: false })
        toast('已识别并保存，回到这首歌时会用新歌词')
        succeeded = true
        return
      }
      await rebuildPlayerLyric().catch(() => {})
      if (!(await settleLyric(texts))) {
        fail('歌词已生成，但播放器没换上（可先切到别的歌再切回来）')
        return
      }
    }

    // 参考歌词被判定为「不是这首歌」（配错歌词）时，实际用的是识别文本，
    // 提示语要说清楚，否则用户会以为是歌词识别错了。
    const usedRef = hasRef && !fromAsr
    const summary = `${usedRef ? summarize(report, cost, true) : summarize(report, cost, false)}${
      translated ? '，已翻译成中文' : ''
    }`
    emit({ stage: 'done', ratio: 1, detail: '', summary, error: '', running: false })
    if (!hasRef) toast('已识别出歌词')
    else if (fromAsr) toast('现有歌词和这首歌对不上，已改用识别出的文本')
    else toast('歌词时间轴已生成')
    succeeded = true
  } finally {
    // 成功就删掉临时音频；失败则留着 —— 重试时不用再下一遍整首
    // （缓存目录在下次下载别的歌时会被清空，不会长期堆积）
    if (succeeded) await releaseAudio(audio)
  }
}

/** 开始一次识别。重复点击会被忽略（同一时间只跑一个任务） */
export const startAutoAlign = () => {
  if (state.running) return
  const id = String(playerState.musicInfo.id ?? '')
  emit({ ...INITIAL, running: true, stage: 'audio', musicId: id })
  void run()
    .catch((err) => {
      fail(errorText(err, '识别失败'))
    })
    .finally(() => {
      if (state.running) emit({ running: false })
    })
}

/**
 * 给已经识别过的歌词补一份中文翻译（面板上的「生成翻译」）。
 *
 * 只补翻译，不动歌词本体和时间轴：译文用同一批时间戳，逐行对应原文，
 * 所以不用重跑识别、也不花识别的钱。
 */
export const translateRecognizedLyric = () => {
  if (state.running) return
  const musicId = String(playerState.musicInfo.id ?? '')
  const item = getLyricAdjust(musicId)
  if (item?.provider !== AUTO_PROVIDER || !item.lrc) {
    toast('这首歌还没有识别结果')
    return
  }
  if (!hasTranslateKey()) {
    toast('还没配好百度翻译的 APPID / 密钥：设置 → 基础设置')
    return
  }
  const lrc = item.lrc
  emit({ ...INITIAL, running: true, stage: 'align', musicId, detail: '正在翻译歌词' })
  void translateLyricToChinese(lrc)
    .then((tlrc) => {
      if (!tlrc.trim()) throw new Error('翻译结果为空')
      setLyricOverride(musicId, {
        lrc,
        tlrc,
        provider: AUTO_PROVIDER,
        source: item.source,
      })
      emit({ stage: 'done', ratio: 1, detail: '', summary: '已生成中文翻译', error: '', running: false })
      toast('已生成中文翻译')
    })
    .catch((err) => {
      fail(`翻译失败：${errorText(err, '未知错误')}`)
    })
}
