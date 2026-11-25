import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Button from '@/components/common/Button'
import Input from '@/components/common/Input'
import Checkbox from '@/components/common/CheckBox/Checkbox'
import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { createStyle, toast } from '@/utils/tools'
import {
  clearPairing,
  loadPairing,
  pairWithWatch,
  parseQrPayload,
  savePairing,
  type WatchPairing,
} from '@/core/lxxwear/pairing'
import { scanFromLibrary, scanWithCamera } from '@/core/lxxwear/scanner'
import { getDeviceToken } from '@/core/lxxwear/token'
import {
  SYNC_QUALITY_LIST,
  hasAutoPlaylist,
  loadConfig,
  saveConfig,
  setPlaylistAuto,
  updatePlaylistState,
  type LxxWearConfig,
} from '@/core/lxxwear/config'
import { loadPlaylistOptions, getPlaylistOptions, type PlaylistOption } from '@/core/lxxwear/playlists'
import {
  adoptConfig,
  applyConfig,
  changeQuality,
  getActiveConfig,
  getSyncRuntime,
  loadSyncCandidates,
  retrySong,
  startSync,
  stopSync,
  subscribeSync,
  syncRuntimeFromNative,
  type SyncCandidate,
  type SyncRuntime,
  type SyncWorkerSlot,
} from '@/core/lxxwear/sync'
import SongPicker from './SongPicker'

const DEFAULT_PORT = '8688'

/** 通道条里两段的固定色：蓝＝从音源下载到手机，橙＝手机往手表传 */
const DOWNLOAD_COLOR = '#4c8dff'
const TRANSFER_COLOR = '#ff9f45'

const slotText = (slot: SyncWorkerSlot): string => {
  if (slot.stage === 0) return '空闲'
  if (slot.stage === 1) return `下载 ${Math.round(slot.download * 100)}%`
  if (slot.stage === 3) return '完成'
  return slot.transfer > 0 ? `传输 ${Math.round(slot.transfer * 100)}%` : '待传输'
}

/**
 * 同步信息上的 6 根进度条：
 * 第 1 根是总进度，一条单色；其余 5 根对应 5 个并行进程，
 * 每根条左半是「下载到手机」、右半是「传给手表」，两段各用一种颜色。
 */
const SyncProgress = memo(({ overall, workers, theme }: {
  overall: number
  workers: SyncWorkerSlot[]
  theme: any
}) => {
  const labelColor = theme['c-font-label'] as string
  const trackColor = theme['c-border-background'] as string
  const percent = Math.max(0, Math.min(1, overall)) * 100
  return (
    <View style={styles.progressBlock}>
      <View style={styles.progressHead}>
        <Text size={10} color={labelColor}>总进度</Text>
        <Text size={10} color={labelColor}>{`${Math.round(percent)}%`}</Text>
      </View>
      <View style={[styles.totalTrack, { backgroundColor: trackColor }]}>
        <View style={[styles.totalFill, { width: `${percent}%`, backgroundColor: theme['c-primary'] }]} />
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.legendDot, { backgroundColor: DOWNLOAD_COLOR }]} />
        <Text size={9} color={labelColor}>下载到手机</Text>
        <View style={[styles.legendDot, { backgroundColor: TRANSFER_COLOR, marginLeft: 10 }]} />
        <Text size={9} color={labelColor}>传到手表</Text>
      </View>
      {workers.map(slot => (
        <View key={slot.index} style={styles.workerRow}>
          <Text size={9} color={labelColor} style={styles.workerNo}>{slot.index + 1}</Text>
          <View style={styles.workerBody}>
            <Text size={9} color={labelColor} numberOfLines={1} style={styles.workerName}>
              {slot.name || '等待任务'}
            </Text>
            <View style={[styles.workerTrack, { backgroundColor: trackColor }]}>
              <View style={[styles.workerFillLeft, { width: `${slot.download * 50}%`, backgroundColor: DOWNLOAD_COLOR }]} />
              <View style={[styles.workerFillRight, { width: `${slot.transfer * 50}%`, backgroundColor: TRANSFER_COLOR }]} />
            </View>
          </View>
          <Text size={9} color={labelColor} style={styles.workerState}>{slotText(slot)}</Text>
        </View>
      ))}
    </View>
  )
})

const stateText = (state: number): string => {
  if (state === 2) return '已就绪'
  if (state === 1) return '准备中'
  if (state === 3) return '失败'
  if (state === 4) return '手表已有'
  return '待准备'
}

const formatSize = (bytes: number): string => {
  if (bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * LXXWear：手表端 LX-N-XW-Music 的局域网同步入口。
 * 手机侧作为服务端：勾选歌单、选音质，点「开始同步」后手表就能连过来把音频和歌词拉走。
 */
export default memo(() => {
  const theme = useTheme()
  const [pairing, setPairing] = useState<WatchPairing | null>(null)
  const [ip, setIp] = useState('')
  const [port, setPort] = useState(DEFAULT_PORT)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const [config, setConfig] = useState<LxxWearConfig>({
    playlistIds: [],
    quality: '320k',
    autoSync: false,
    playlists: {},
  })
  // 连续点多个歌单时 setState 还没生效，用 ref 拿最新值，避免后一次覆盖前一次
  const configRef = useRef(config)
  const [options, setOptions] = useState<PlaylistOption[]>([])
  const [runtime, setRuntime] = useState<SyncRuntime>(getSyncRuntime)
  const [showSongs, setShowSongs] = useState(false)

  // 选歌弹窗：按「单个歌单」打开，选的就是这个歌单要同步到手表的内容
  const [pickerVisible, setPickerVisible] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerScope, setPickerScope] = useState<{ key: string; name: string; newlyChecked: boolean } | null>(null)
  const [candidates, setCandidates] = useState<SyncCandidate[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const pickedSet = useMemo(() => new Set(picked), [picked])

  useEffect(() => {
    void loadPairing().then(setPairing)
    void loadConfig().then(loaded => {
      // 可同步的歌单只剩「我的列表」：以前勾过的网易云歌单要顺手清掉，
      // 否则「开始同步」会一直卡在「某个歌单还没选歌」
      const valid = new Set(getPlaylistOptions().map(item => item.key))
      const playlistIds = loaded.playlistIds.filter(key => valid.has(key))
      const next = playlistIds.length === loaded.playlistIds.length
        ? loaded
        : { ...loaded, playlistIds, autoSync: hasAutoPlaylist({ ...loaded, playlistIds }) }
      configRef.current = next
      setConfig(next)
      if (next !== loaded) void saveConfig(next)
    })
    void loadPlaylistOptions().then(setOptions)
    return subscribeSync(setRuntime)
  }, [])

  // 服务在跑的时候偶尔对一次真实状态（文件大小、失败原因以原生为准）
  useEffect(() => {
    if (!runtime.running) return
    const timer = setInterval(() => {
      void syncRuntimeFromNative()
      // 自动同步会往歌单状态里写 autoSynced，这里顺手把界面上的状态对齐
      const active = getActiveConfig()
      if (active && active.playlists !== configRef.current.playlists) {
        const merged = {
          ...configRef.current,
          playlists: active.playlists,
          autoSync: hasAutoPlaylist(active),
        }
        configRef.current = merged
        setConfig(merged)
      }
    }, 2000)
    return () => { clearInterval(timer) }
  }, [runtime.running])

  const handleRefreshOptions = useCallback(() => {
    void loadPlaylistOptions().then(list => {
      setOptions(list)
      toast('已刷新歌单列表')
    })
  }, [])

  /**
   * 落盘一份配置。
   * @param apply 服务在跑时是否立刻按新配置重建清单（勾上但还没选歌的中间态不 apply，
   *              否则手表上会先冒出一个空歌单）
   */
  const persistConfig = useCallback(async (next: LxxWearConfig, apply = true) => {
    configRef.current = next
    setConfig(next)
    try {
      await saveConfig(next)
      // apply=false 的中间态（勾了歌单但还没选歌）也要让运行中的会话知道，
      // 否则后面选完歌确认时会拿旧配置当基线，把这次勾选覆盖掉
      adoptConfig(next)
      if (apply) await applyConfig(next)
    } catch (e: any) {
      toast(e?.message ?? '保存同步设置失败')
    }
  }, [])

  /**
   * 打开某个歌单的选歌弹窗。
   * - 还没同步过的歌单：默认全选（刚勾上时就是这个感觉）；
   * - 同步过的歌单：回显上次选中的歌，加上自动同步带进来的那些。
   */
  const openPickerFor = useCallback(async (key: string, newlyChecked: boolean) => {
    // 服务在跑时以内存里的配置为准（自动同步会往状态里写 autoSynced）
    const state = (getActiveConfig() ?? configRef.current).playlists[key]
    const name = options.find(item => item.key === key)?.name ?? '歌单'
    setPickerScope({ key, name, newlyChecked })
    setPickerVisible(true)
    setPickerLoading(true)
    setCandidates([])
    setPicked([])
    try {
      const result = await loadSyncCandidates([key])
      if (result.failed > 0) {
        setPickerVisible(false)
        setPickerScope(null)
        toast('歌单没读出来，检查网络或网易云登录后再试')
        return
      }
      if (result.songs.length === 0) {
        setPickerVisible(false)
        setPickerScope(null)
        toast('这个歌单里还没有歌曲')
        return
      }
      setCandidates(result.songs)
      const all = result.songs.map(item => item.key)
      // 刚勾上的歌单：一律默认全选。哪怕它以前同步过、库里还留着旧的选择，
      // 也按这次重新勾上的意思办（否则用户看到的是上次那份旧选择，不是全选）
      if (newlyChecked || !state?.synced) {
        setPicked(all)
      } else if (state) {
        // 已勾选的歌单点标题：回显上次保存的选择，加上自动同步补进来的歌
        const keep = new Set([...state.selected, ...state.autoSynced])
        const restored = result.songs.filter(item => keep.has(item.key)).map(item => item.key)
        setPicked(restored.length > 0 ? restored : all)
      } else {
        setPicked(all)
      }
    } catch (e: any) {
      setPickerVisible(false)
      setPickerScope(null)
      toast(e?.message ?? '读取歌单失败')
    } finally {
      setPickerLoading(false)
    }
  }, [options])

  /** 勾上一个歌单：先记下勾选，再让它选歌（默认全选） */
  const checkAndPick = useCallback(async (key: string) => {
    const current = getActiveConfig() ?? configRef.current
    if (!current.playlistIds.includes(key)) {
      const playlistIds = [...current.playlistIds, key]
      const next = { ...current, playlistIds }
      await persistConfig({ ...next, autoSync: hasAutoPlaylist(next) }, false)
    }
    await openPickerFor(key, true)
  }, [openPickerFor, persistConfig])

  /**
   * 点复选框：
   * - 没勾 → 勾上，并弹出这个歌单的选歌列表（默认全选）
   * - 已勾 → 取消勾选（手表下次同步会把它连音频、歌词一起删掉）
   */
  const handleCheckboxPress = useCallback(async (key: string) => {
    const current = getActiveConfig() ?? configRef.current
    if (!current.playlistIds.includes(key)) {
      await checkAndPick(key)
      return
    }
    const playlistIds = current.playlistIds.filter(item => item !== key)
    const next = { ...current, playlistIds }
    await persistConfig({ ...next, autoSync: hasAutoPlaylist(next) })
    if (playlistIds.length === 0) {
      toast('已取消全部勾选：点「开始同步」会把手表上的歌全部删掉')
    } else {
      const name = options.find(item => item.key === key)?.name ?? '歌单'
      toast(`已取消「${name}」：手表下次同步会把它删掉`)
    }
  }, [checkAndPick, options, persistConfig])

  /**
   * 点歌单名字：
   * - 没勾 → 勾上，并弹出选歌列表（默认全选）
   * - 已勾 → 不动勾选状态，只改这个歌单要同步哪些歌
   */
  const handleTitlePress = useCallback(async (key: string) => {
    const checked = (getActiveConfig() ?? configRef.current).playlistIds.includes(key)
    if (!checked) {
      await checkAndPick(key)
      return
    }
    await openPickerFor(key, false)
  }, [checkAndPick, openPickerFor])

  /** 单个歌单的自动同步开关：必须先选过一次歌 */
  const handleTogglePlaylistAuto = useCallback(async (key: string) => {
    // 服务在跑时以内存里的配置为准（自动同步会往状态里写 autoSynced）
    const prev = getActiveConfig() ?? configRef.current
    const state = prev.playlists[key]
    if (!state?.synced) {
      toast('这个歌单还没选过歌：先点它的名字选好歌，之后才能开自动同步')
      return
    }
    const auto = !state.auto
    let next = setPlaylistAuto(prev, key, auto)
    next = { ...next, autoSync: hasAutoPlaylist(next) }
    configRef.current = next
    setConfig(next)
    try {
      await saveConfig(next)
      if (!auto) {
        toast('已关闭自动同步：已经同步下来的歌保留，只是不再跟着歌单更新')
        await applyConfig(next)
        return
      }
      // 开着自动同步就当场把服务拉起来，不用再点一次「开始同步」
      await applyConfig(next)
      toast('已开启自动同步：这个歌单以后新加的歌会自动补到手表')
    } catch (e: any) {
      toast(e?.message ?? '自动同步设置失败')
    }
  }, [])

  const handleSelectQuality = useCallback(async (quality: LX.Quality) => {
    const next: LxxWearConfig = { ...configRef.current, quality }
    configRef.current = next
    setConfig(next)
    try {
      await changeQuality(quality)
      if (getSyncRuntime().running) toast('音质已切换，手表下次同步会重新拉音频')
    } catch (e: any) {
      toast(e?.message ?? '切换音质失败')
    }
  }, [])

  const handleTogglePick = useCallback((key: string) => {
    setPicked(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key])
  }, [])

  const handleToggleAllPick = useCallback((check: boolean) => {
    setPicked(check ? candidates.map(item => item.key) : [])
  }, [candidates])

  /** 顺序往后多选 N 首：从第一首还没选中的开始，按列表顺序勾 */
  const handleAddMorePick = useCallback((count: number) => {
    const set = new Set(picked)
    const next = [...picked]
    let added = 0
    for (const item of candidates) {
      if (added >= count) break
      if (set.has(item.key)) continue
      set.add(item.key)
      next.push(item.key)
      added++
    }
    if (added > 0) setPicked(next)
  }, [candidates, picked])

  /** 确认：这次的选择写进这个歌单的基线，自动同步之后只补新加的歌 */
  const handleConfirmPick = useCallback(async () => {
    const scope = pickerScope
    if (!scope) return
    if (picked.length === 0) {
      toast('至少选一首歌；整个歌单都不想同步就取消勾选它')
      return
    }
    const all = candidates.map(item => item.key)
    const pickedNow = new Set(picked)
    // 基准里必须带着这个歌单。正常路径下勾选已经写进会话了，但「刚勾上、还没 apply」
    // 的中间态以前只落到界面这份配置里，拿会话当基线会把这次勾选覆盖掉——确认完歌单
    // 又变回没勾选，下一轮清单还会把它清掉。这里兜一层。
    let base = getActiveConfig() ?? configRef.current
    if (!base.playlistIds.includes(scope.key)) {
      base = {
        ...base,
        playlistIds: configRef.current.playlistIds.includes(scope.key)
          ? configRef.current.playlistIds
          : [...base.playlistIds, scope.key],
      }
    }
    let next = updatePlaylistState(base, scope.key, {
      synced: true,
      syncedAt: Date.now(),
      selected: all.filter(key => pickedNow.has(key)),
      snapshot: all,
      autoSynced: [],
    })
    next = { ...next, autoSync: hasAutoPlaylist(next) }
    setPickerVisible(false)
    setPickerScope(null)
    await persistConfig(next)
    const running = getSyncRuntime().running
    toast(running
      ? `「${scope.name}」已选 ${picked.length} 首，手表下轮同步会增删歌曲`
      : `「${scope.name}」已选 ${picked.length} 首，点「开始同步」生效`)
  }, [pickerScope, picked, candidates, persistConfig])

  /** 关闭弹窗：刚勾上的歌单取消掉，避免留下「勾着但没选歌」的死状态 */
  const handleCancelPick = useCallback(() => {
    const scope = pickerScope
    setPickerVisible(false)
    setPickerScope(null)
    if (!scope?.newlyChecked) return
    const current = getActiveConfig() ?? configRef.current
    if (!current.playlistIds.includes(scope.key)) return
    const next = { ...current, playlistIds: current.playlistIds.filter(key => key !== scope.key) }
    void persistConfig({ ...next, autoSync: hasAutoPlaylist(next) }, false)
  }, [pickerScope, persistConfig])

  /** 开始同步：直接按上面的设置下发清单，不再弹选歌窗 */
  const handleStartSync = useCallback(async () => {
    const current = getActiveConfig() ?? configRef.current
    // 一个歌单都没勾：直接下发空清单，手表清空
    if (current.playlistIds.length === 0) {
      setBusy(true)
      try {
        const effective = await startSync(current)
        configRef.current = effective
        setConfig(effective)
        toast('没有勾选歌单：手表会把本地歌曲全部删掉')
      } catch (e: any) {
        toast(e?.message ?? '同步启动失败')
      } finally {
        setBusy(false)
      }
      return
    }
    // 勾了但还没选过歌的歌单（旧配置遗留）：不下发空清单，让他先去选歌
    const pendingKey = current.playlistIds.find(key => !current.playlists[key]?.synced)
    if (pendingKey) {
      const name = options.find(item => item.key === pendingKey)?.name ?? '有歌单'
      toast(`「${name}」还没选过歌：点它的名字选好要同步的歌曲，再点「开始同步」`)
      return
    }
    setBusy(true)
    try {
      const effective = await startSync(current)
      configRef.current = effective
      setConfig(effective)
      toast(`已开始同步 ${getSyncRuntime().total} 首，手表连上同一 Wi-Fi 就会来取`)
    } catch (e: any) {
      toast(e?.message ?? '同步启动失败')
    } finally {
      setBusy(false)
    }
  }, [options])

  const handleStop = useCallback(async () => {
    setBusy(true)
    try {
      await stopSync()
      toast('已停止同步')
    } finally {
      setBusy(false)
    }
  }, [])

  /** 失败的那首重新来一遍：清原生失败标记 + 重新排队下载 */
  const handleRetry = useCallback(async (id: string) => {
    try {
      await retrySong(id)
      toast('已重新排队')
    } catch (e: any) {
      toast(e?.message ?? '重试失败')
    }
  }, [])

  const handleIpChange = useCallback((text: string) => {
    // 允许直接粘贴手表二维码里的整串内容
    if (text.includes('lxnx://') || text.includes('?')) {
      const info = parseQrPayload(text)
      if (info) {
        setIp(info.ip)
        setPort(String(info.port))
        if (info.code) setCode(info.code)
        return
      }
    }
    setIp(text.trim())
  }, [])

  const doPair = useCallback(async (host: string, portNum: number, pairCode: string) => {
    const deviceToken = await getDeviceToken()
    const result = await pairWithWatch(host, portNum, pairCode, deviceToken)
    const next: WatchPairing = {
      ip: host,
      port: portNum,
      token: result.token,
      watchName: result.watchName,
      pairedAt: Date.now(),
    }
    await savePairing(next)
    setPairing(next)
    setCode('')
    toast('配对成功')
  }, [])

  const handleScan = useCallback(async (mode: 'camera' | 'library') => {
    if (busy) return
    setBusy(true)
    try {
      const text = mode === 'camera' ? await scanWithCamera() : await scanFromLibrary()
      if (text === null) return // 用户取消
      if (!text) {
        toast('没识别到二维码，靠近一点重试')
        return
      }
      const info = parseQrPayload(text)
      if (!info) {
        const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text
        toast(`这不是手表的配对二维码（扫到：${preview}）`)
        return
      }
      setIp(info.ip)
      setPort(String(info.port))
      setCode(info.code)
      if (!info.code) {
        toast('已识别地址，请手动补填配对码')
        return
      }
      await doPair(info.ip, info.port, info.code)
    } catch (e: any) {
      toast(e?.message ?? '扫码失败')
    } finally {
      setBusy(false)
    }
  }, [busy, doPair])

  const handlePair = useCallback(async () => {
    const host = ip.trim()
    const portNum = Number(port.trim())
    const pairCode = code.trim()
    if (!host) {
      toast('先填手表的 IP')
      return
    }
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
      toast('端口不对')
      return
    }
    if (!pairCode) {
      toast('先填手表上的 6 位配对码')
      return
    }
    setBusy(true)
    try {
      await doPair(host, portNum, pairCode)
    } catch (e: any) {
      toast(e?.message ?? '配对失败')
    } finally {
      setBusy(false)
    }
  }, [ip, port, code, doPair])

  const handleUnpair = useCallback(async () => {
    await clearPairing()
    setPairing(null)
    toast('已解除配对')
  }, [])

  const selectedCount = config.playlistIds.length
  const autoCount = config.playlistIds.filter(key => {
    const state = config.playlists[key]
    return !!state && state.synced && state.auto
  }).length
  const progressText = useMemo(() => {
    if (runtime.starting) return '正在读取歌单…'
    if (runtime.error) return runtime.error
    // 手表已经报过这一轮结束：直接显示结果摘要
    if (runtime.phase === 'done' && runtime.summary) return runtime.summary
    if (!runtime.running) return ''
    if (runtime.total === 0) return '未勾选歌单，手表会把本地歌曲全部删掉'
    const done = runtime.readyCount + runtime.skippedCount
    const base = `已处理 ${done}/${runtime.total}`
    const percent = runtime.currentTotal > 0
      ? Math.floor(runtime.currentDone * 100 / runtime.currentTotal)
      : 0
    if (runtime.activeCount > 1) return `${base} · 并行 ${runtime.activeCount} 首 · ${percent}%`
    if (runtime.currentName) return `${base} · 《${runtime.currentName}》${percent}%`
    return base
  }, [runtime])

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <SvgIcon name="watch" size={26} color={theme['c-primary-font']} />
          <View style={styles.headerText}>
            <Text size={18} color={theme['c-primary-font']}>LXXWear</Text>
            <Text size={11} color={theme['c-font-label']}>与手表端局域网同步歌曲</Text>
          </View>
        </View>

        <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
          <View style={styles.rowBetween}>
            <Text size={13} color={theme['c-primary-font']}>同步歌单</Text>
            <TouchableOpacity onPress={handleRefreshOptions} activeOpacity={0.5}>
              <Text size={11} color={theme['c-primary-font']}>刷新列表</Text>
            </TouchableOpacity>
          </View>
          <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
            {'点歌单名字或复选框就把这个歌单勾上，同时弹出它的歌曲列表让你挑（默认全选），选完点「保存」。\n'
              + '已勾选的歌单再点名字＝重新挑这个歌单要同步哪些歌（列表里打勾的就是当前要同步的）；'
              + '点复选框＝取消勾选，手表下次同步会把它连同音频、歌词一起删掉。\n'
              + '歌单选过一次歌之后可以单独打开它的「自动」开关——以后往这个歌单里新加的歌会自动补到手表，'
              + '而当初没选的歌不会被自动带上。\n'
              + '「开始同步」按上面设置好的内容直接同步，不再弹选歌窗。播放顺序按勾选顺序拼接。'}
          </Text>

          {options.length === 0
            ? (
                <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
                  还没有可选歌单。先在「我的列表」里建一个歌单，或者登录网易云后再回来。
                </Text>
              )
            : options.map(option => {
                const checked = config.playlistIds.includes(option.key)
                const state = config.playlists[option.key]
                const pickedCount = state?.synced
                  ? state.selected.length + state.autoSynced.length
                  : 0
                return (
                  <View key={option.key} style={styles.optionRow}>
                    <View style={styles.optionLine}>
                      <Checkbox
                        status={checked ? 'checked' : 'unchecked'}
                        onPress={() => { void handleCheckboxPress(option.key) }}
                        tintColors={{ true: theme['c-primary'], false: theme['c-600'] }}
                        size={0.9}
                      />
                      <TouchableOpacity
                        style={styles.optionTitle}
                        activeOpacity={0.6}
                        onPress={() => { void handleTitlePress(option.key) }}
                      >
                        <Text size={14} numberOfLines={1}>
                          {`${option.name}（${option.count} 首）`}
                        </Text>
                        <Text size={9} color={theme['c-font-label']} numberOfLines={1} style={styles.optionSub}>
                          {state?.synced
                            ? `已选 ${pickedCount} 首${state.autoSynced.length > 0 ? `（含自动补 ${state.autoSynced.length} 首）` : ''} · 点这里改`
                            : '点这里选要同步到手表上的歌'}
                        </Text>
                      </TouchableOpacity>
                      {checked && (
                        <TouchableOpacity
                          activeOpacity={0.6}
                          onPress={() => { void handleTogglePlaylistAuto(option.key) }}
                          style={[
                            styles.autoChip,
                            {
                              borderColor: state?.auto ? theme['c-primary-font'] : theme['c-border-background'],
                              backgroundColor: state?.auto ? theme['c-primary-light-200-alpha-700'] : 'transparent',
                              opacity: state?.synced ? 1 : 0.55,
                            },
                          ]}
                        >
                          <Text size={10} color={theme['c-primary-font']}>
                            {state?.auto ? '自动 · 开' : '自动 · 关'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                )
              })}

          <Text size={10} color={theme['c-font-label']} style={styles.hint}>
            这里只列「我的列表」里的歌单（默认列表、我喜欢、自建歌单）。
          </Text>
        </View>

        <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
          <Text size={13} color={theme['c-primary-font']}>同步音质</Text>
          <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
            音质决定传到手表上的音频文件。改完音质，手表那边会重新拉一遍音频。
          </Text>
          <View style={styles.chipRow}>
            {SYNC_QUALITY_LIST.map(item => {
              const active = config.quality === item.id
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => { void handleSelectQuality(item.id) }}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? theme['c-primary-font'] : theme['c-border-background'],
                      backgroundColor: active ? theme['c-primary-light-200-alpha-700'] : 'transparent',
                    },
                  ]}
                >
                  <Text size={11} color={theme['c-primary-font']}>{item.name}</Text>
                  <Text size={9} color={theme['c-font-label']}>{item.desc}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
          <Text size={13} color={theme['c-primary-font']}>同步控制</Text>

          <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
            {autoCount > 0
              ? `${autoCount} 个歌单开着自动同步：打开 App 会自动开始服务，歌单里新加的歌会自己补到手表。`
              : '还没有歌单开自动同步。歌单选过一次歌之后，可以在上面的歌单列表里单独打开它的「自动」开关。'}
          </Text>

          <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
            {runtime.running
              ? runtime.phase === 'done'
                ? `上一轮已经同步完，服务还在运行：${runtime.ip || '本机地址'}:${runtime.port}`
                : `服务已启动：${runtime.ip || '本机地址'}:${runtime.port}${pairing ? '' : '（未配对，手表也能连，但不校验身份）'}`
              : selectedCount === 0
                ? '未勾选歌单 · 点「开始同步」会把手表上的歌曲全部删掉'
                : `已选 ${selectedCount} 个歌单 · 点「开始同步」按上面设置好的歌直接对外提供文件`}
          </Text>

          {!!progressText && (
            <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>{progressText}</Text>
          )}

          {/* 一轮同步收工后进度条回到初始状态：这里直接不画，摘要文字留在上面 */}
          {runtime.running && runtime.phase === 'running' && runtime.total > 0 && (
            <SyncProgress overall={runtime.overall} workers={runtime.workers} theme={theme} />
          )}

          {runtime.running && (
            <>
              <Button
                style={[styles.actionBtn, { borderColor: theme['c-border-background'] }]}
                disabled={busy}
                onPress={() => { void handleStop() }}
              >
                <Text size={13} color={theme['c-primary-font']}>停止同步</Text>
              </Button>
              <TouchableOpacity
                activeOpacity={0.5}
                onPress={() => { void handleStartSync() }}
                style={styles.linkRow}
              >
                <Text size={11} color={theme['c-primary-font']}>按上面的设置重新同步</Text>
              </TouchableOpacity>
            </>
          )}

          {!runtime.running && (
            <Button
              style={{
                ...styles.pairBtn,
                backgroundColor: theme['c-button-background'],
                opacity: busy ? 0.5 : 1,
              }}
              disabled={busy}
              onPress={() => { void handleStartSync() }}
            >
              <Text size={13} color={theme['c-button-font']}>
                {busy ? '处理中…' : '开始同步'}
              </Text>
            </Button>
          )}

          {(runtime.running || runtime.phase === 'done') && (
            <TouchableOpacity
              activeOpacity={0.5}
              onPress={() => { setShowSongs(value => !value) }}
              style={styles.linkRow}
            >
              <Text size={11} color={theme['c-primary-font']}>
                {showSongs ? '收起歌曲列表' : `查看歌曲列表（${runtime.total} 首）`}
              </Text>
            </TouchableOpacity>
          )}
          {showSongs && runtime.songs.length === 0 && (
            <Text size={10} color={theme['c-font-label']} style={styles.paragraph}>
              当前清单是空的，手表同步后本地歌曲会被删掉。
            </Text>
          )}
          {showSongs && runtime.songs.map(song => (
            <View key={song.id} style={styles.songRow}>
              <Text size={10} color={theme['c-font-label']} numberOfLines={1} style={styles.songName}>
                {song.name}
              </Text>
              <Text
                size={10}
                color={theme['c-font-label']}
                numberOfLines={1}
                style={styles.songState}
              >
                {stateText(song.state)}
                {song.state === 2 ? ` · ${formatSize(song.size)}` : ''}
                {song.state === 3 && song.error ? ` · ${song.error}` : ''}
              </Text>
              {runtime.running && song.state === 3 && (
                <TouchableOpacity
                  activeOpacity={0.6}
                  onPress={() => { void handleRetry(song.id) }}
                  style={[styles.retryBtn, { borderColor: theme['c-primary-font'] }]}
                >
                  <Text size={10} color={theme['c-primary-font']}>重试</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}

          <Text size={10} color={theme['c-font-label']} style={styles.hint}>
            手表连上同一 Wi-Fi 后会自己来找手机：手机这边开始同步后，手表熄屏时最多等一两分钟会开始拉取；
            也可以在手表的「连接手机」页点「重新同步」立刻开始。同步中途断开会保留已完成的歌，下次接着传。
            服务开着的时候，手机端歌单里删歌、改勾选、改选歌、开自动同步都会同步到手表（大约一分钟内生效）。
            一个歌单都不勾就点「开始同步」＝让手表清空本地歌曲。
          </Text>
        </View>

        <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
          <Text size={13} color={theme['c-primary-font']}>连接状态</Text>
          {pairing
            ? (
                <>
                  <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
                    {'已配对：'}{pairing.watchName}{'\n'}
                    {pairing.ip}{':'}{pairing.port}
                  </Text>
                  <Button
                    style={[styles.smallBtn, { borderColor: theme['c-border-background'] }]}
                    onPress={handleUnpair}
                  >
                    <Text size={12} color={theme['c-primary-font']}>解除配对</Text>
                  </Button>
                </>
              )
            : (
                <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
                  未配对。不配对也能同步，但建议配一次：配对后手表只认这台手机，
                  同一个 Wi-Fi 下不会连到别人的手机。
                </Text>
              )}
        </View>

        {!pairing && (
          <>
            <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
              <Text size={13} color={theme['c-primary-font']}>扫码配对</Text>
              <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
                点「扫描二维码」，把相机对准手表「配对手机」页上的二维码，
                扫到后会自己填好地址和配对码并直接配对。
              </Text>

              <Button
                style={{
                  ...styles.pairBtn,
                  backgroundColor: theme['c-button-background'],
                  opacity: busy ? 0.5 : 1,
                }}
                disabled={busy}
                onPress={() => { void handleScan('camera') }}
              >
                <Text size={13} color={theme['c-button-font']}>
                  {busy ? '处理中…' : '扫描二维码'}
                </Text>
              </Button>

              <Button
                style={[styles.scanSubBtn, { borderColor: theme['c-border-background'] }]}
                disabled={busy}
                onPress={() => { void handleScan('library') }}
              >
                <Text size={12} color={theme['c-primary-font']}>从相册选二维码</Text>
              </Button>
            </View>

            <View style={[styles.card, { borderColor: theme['c-border-background'] }]}>
              <Text size={13} color={theme['c-primary-font']}>手动配对</Text>
              <Text size={11} color={theme['c-font-label']} style={styles.paragraph}>
                手表：主界面左滑两次到控制台 → 点局域网同步图标 → 页面底部「配对手机」，
                屏幕上会显示二维码，二维码下方是 IP:端口 · 6位配对码。扫不出来时可以照着填。
              </Text>

              <View style={[styles.field, { borderColor: theme['c-border-background'] }]}>
                <Text size={11} color={theme['c-font-label']} style={styles.label}>手表 IP</Text>
                <Input
                  value={ip}
                  onChangeText={handleIpChange}
                  placeholder="192.168.1.23（也可粘贴二维码整串内容）"
                  keyboardType="numbers-and-punctuation"
                />
              </View>

              <View style={[styles.field, { borderColor: theme['c-border-background'] }]}>
                <Text size={11} color={theme['c-font-label']} style={styles.label}>端口</Text>
                <Input
                  value={port}
                  onChangeText={setPort}
                  placeholder={DEFAULT_PORT}
                  keyboardType="number-pad"
                />
              </View>

              <View style={[styles.field, { borderColor: theme['c-border-background'] }]}>
                <Text size={11} color={theme['c-font-label']} style={styles.label}>配对码</Text>
                <Input
                  value={code}
                  onChangeText={setCode}
                  placeholder="手表上显示的 6 位数字"
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>

              <Button
                style={[styles.scanSubBtn, { borderColor: theme['c-border-background'] }]}
                disabled={busy}
                onPress={() => { void handlePair() }}
              >
                <Text size={12} color={theme['c-primary-font']}>
                  {busy ? '处理中…' : '开始配对'}
                </Text>
              </Button>
            </View>
          </>
        )}
      </ScrollView>

      <SongPicker
        visible={pickerVisible}
        loading={pickerLoading}
        title={pickerScope?.name}
        playlistTotal={options.find(item => item.key === pickerScope?.key)?.count}
        songs={candidates}
        picked={pickedSet}
        onToggle={handleTogglePick}
        onToggleAll={handleToggleAllPick}
        onAddMore={handleAddMorePick}
        onCancel={handleCancelPick}
        onConfirm={() => { void handleConfirmPick() }}
      />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    // Home 底部浮层（迷你播放条 + Tab 栏）不占布局，留出滚动空间
    paddingBottom: 40 + HOME_BOTTOM_OVERLAY_HEIGHT,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    marginLeft: 12,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paragraph: {
    marginTop: 6,
    lineHeight: 18,
  },
  optionRow: {
    marginTop: 8,
  },
  optionLine: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionTitle: {
    flex: 1,
    marginLeft: 6,
    paddingVertical: 2,
  },
  optionSub: {
    marginTop: 2,
  },
  autoChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  songRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  songName: {
    flex: 1,
    marginRight: 8,
  },
  // 失败原因可能很长，给个上限免得把歌名挤没
  songState: {
    flexShrink: 1,
    maxWidth: '55%',
    textAlign: 'right',
  },
  retryBtn: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  progressBlock: {
    marginTop: 10,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  totalTrack: {
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
  },
  totalFill: {
    height: '100%',
    borderRadius: 4,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 3,
  },
  workerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  workerNo: {
    width: 12,
  },
  workerBody: {
    flex: 1,
    marginRight: 6,
  },
  workerName: {
    marginBottom: 2,
  },
  workerTrack: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  workerFillLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  workerFillRight: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
  },
  workerState: {
    width: 54,
    textAlign: 'right',
  },
  linkRow: {
    marginTop: 10,
    alignItems: 'center',
  },
  field: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 2,
    marginTop: 8,
  },
  label: {
    marginBottom: 2,
  },
  pairBtn: {
    marginTop: 12,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    marginTop: 12,
    height: 38,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanSubBtn: {
    marginTop: 8,
    height: 36,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    marginTop: 8,
    lineHeight: 16,
  },
})
