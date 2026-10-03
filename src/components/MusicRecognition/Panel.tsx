import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native'

import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { createStyle, toast } from '@/utils/tools'
import { useI18n } from '@/lang'
import { BorderWidths } from '@/theme'
import {
  MIN_CAPTURE_SECONDS,
  type CaptureStats,
  type EngineReport,
  type RecognitionEngine,
  type RecognitionOutcome,
  type RecognitionResult,
} from '@/core/musicRecognition'
import { CAPTURE_SECONDS, abortCapture, finishCapture, recognize, startCapture } from '@/core/musicRecognition'
import { searchRecognitionResult } from '@/core/musicRecognition/search'
import AfpHidden from './AfpHidden'

type Stage = 'starting' | 'recording' | 'recognizing' | 'done' | 'error'

const ENGINE_LABEL: Record<RecognitionEngine, string> = {
  shazam: 'Shazam',
  netease: '网易云',
  kugou: '酷狗',
}

/** 固定展示顺序：引擎按完成先后回调，chip 顺序若跟着回调走会来回跳 */
const ENGINE_ORDER: RecognitionEngine[] = ['shazam', 'netease', 'kugou']

/**
 * 引擎状态标签。`report` 为空 = 该引擎还在跑（识别中），
 * 这样用户能看出「已经有结果了，但还有平台没返回」，而不是以为已经跑完。
 */
const EngineChip = ({ engine, report }: { engine: RecognitionEngine; report?: EngineReport }) => {
  const t = useI18n()
  const theme = useTheme()
  const name = ENGINE_LABEL[engine]
  const color = report?.status === 'matched' ? theme['c-primary-font'] : theme['c-font-label']
  const label = !report
    ? t('music_recognition_engine_pending', { engine: name })
    : report.status === 'matched'
      ? t('music_recognition_engine_matched', { engine: name })
      : report.status === 'error'
        ? t('music_recognition_engine_error', { engine: name })
        : t('music_recognition_engine_no_match', { engine: name })

  return (
    <View
      style={{
        ...styles.chip,
        borderColor: theme['c-border-background'],
        opacity: report ? 1 : 0.55,
      }}
    >
      <Text size={11} color={color} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

const ResultRow = ({
  result,
  onPress,
  highlight,
}: {
  result: RecognitionResult
  onPress: (result: RecognitionResult) => void
  highlight?: boolean
}) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      style={{ ...styles.resultRow, borderBottomColor: theme['c-border-background'] }}
      onPress={() => onPress(result)}
    >
      {result.coverUrl ? (
        <Image source={{ uri: result.coverUrl }} style={styles.cover} />
      ) : (
        <View
          style={{ ...styles.cover, backgroundColor: theme['c-primary-background'], ...styles.coverEmpty }}
        >
          <SvgIcon name="recognize" size={20} color={theme['c-font-label']} />
        </View>
      )}
      <View style={styles.resultInfo}>
        <Text size={highlight ? 16 : 14} numberOfLines={1}>
          {result.title}
        </Text>
        <Text size={12} color={theme['c-font-label']} numberOfLines={1}>
          {[result.artist, result.album].filter(Boolean).join(' · ') || '未知歌手'}
        </Text>
      </View>
      <Text size={11} color={theme['c-font-label']} style={styles.engineTag}>
        {ENGINE_LABEL[result.engine]}
      </Text>
    </TouchableOpacity>
  )
}

export default ({ onClose }: { onClose: () => void }) => {
  const t = useI18n()
  const theme = useTheme()
  const [stage, setStage] = useState<Stage>('starting')
  const [remaining, setRemaining] = useState(CAPTURE_SECONDS)
  const [outcome, setOutcome] = useState<RecognitionOutcome | null>(null)
  const [captureStats, setCaptureStats] = useState<CaptureStats | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const mountedRef = useRef(true)
  const busyRef = useRef(false)
  const deadlineRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pulse = useRef(new Animated.Value(0)).current
  const recognizing = stage === 'recognizing'

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  const handleSearch = useCallback(
    (result: RecognitionResult) => {
      const keyword = searchRecognitionResult(result)
      toast(`${t('music_recognition_result')}：${keyword}`)
      onClose()
    },
    [onClose, t]
  )

  /** 停止采集 → 跑所有引擎 */
  const stopAndRecognize = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    clearTimer()
    if (mountedRef.current) setStage('recognizing')

    try {
      const { samples, stats } = await finishCapture()
      if (!mountedRef.current) return
      setCaptureStats(stats)
      // 整段全静音：没有任何识别价值，直接给「没听到声音」的提示，不发请求（也避免服务端做无谓的指纹计算）
      if (stats.silent) {
        setOutcome({ match: null, alternatives: [], ambiguous: false, reports: [] })
        setStage('done')
        return
      }
      // 先到先展示：任一引擎返回就刷新一次列表，后面的引擎返回后再并进来
      const result = await recognize(samples, {
        onPartial: (partial) => {
          if (!mountedRef.current) return
          setOutcome(partial)
        },
      })
      if (!mountedRef.current) return
      setOutcome(result)
      setStage('done')
    } catch (err: any) {
      if (!mountedRef.current) return
      setErrorMessage(err?.message ?? t('music_recognition_failed'))
      setStage('error')
    } finally {
      busyRef.current = false
    }
  }, [t])

  /** 开始一次采集，到点自动停止 */
  const beginCapture = useCallback(async () => {
    setOutcome(null)
    setCaptureStats(null)
    setErrorMessage('')
    setStage('starting')
    setRemaining(CAPTURE_SECONDS)

    try {
      await startCapture()
    } catch (err: any) {
      if (!mountedRef.current) return
      setErrorMessage(err?.message ?? t('music_recognition_failed'))
      setStage('error')
      return
    }
    if (!mountedRef.current) {
      void abortCapture()
      return
    }

    setStage('recording')
    deadlineRef.current = Date.now() + CAPTURE_SECONDS * 1000
    clearTimer()
    timerRef.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000))
      if (mountedRef.current) setRemaining(left)
      if (left <= 0) {
        clearTimer()
        void stopAndRecognize()
      }
    }, 250)
  }, [stopAndRecognize, t])

  useEffect(() => {
    mountedRef.current = true
    void beginCapture()
    return () => {
      mountedRef.current = false
      clearTimer()
      // 面板关闭时如果还在录音，必须把麦克风释放掉
      void abortCapture()
    }
    // 只在挂载时启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (stage !== 'recording') {
      pulse.setValue(0)
      return
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    )
    loop.start()
    return () => loop.stop()
  }, [pulse, stage])

  const handleClose = () => {
    clearTimer()
    if (stage === 'recording' || stage === 'starting') void abortCapture()
    onClose()
  }

  const canFinish = CAPTURE_SECONDS - remaining >= MIN_CAPTURE_SECONDS

  // 所有引擎都报错（多为断网）时不要提示「没识别到」，直接把错误原因给用户
  const allEnginesFailed =
    !!outcome && outcome.reports.length > 0 && outcome.reports.every((report) => report.status === 'error')

  const renderBody = () => {
    if (stage === 'starting') {
      return (
        <View style={styles.center}>
          <Loading size={30} />
          <Text style={styles.stateText} color={theme['c-font-label']}>
            {t('music_recognition_listening')}
          </Text>
        </View>
      )
    }

    if (stage === 'recording') {
      return (
        <View style={styles.center}>
          <View style={styles.micWrap}>
            <Animated.View
              style={{
                ...styles.pulseRing,
                borderColor: theme['c-primary-font'],
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [
                  { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) },
                ],
              }}
            />
            <View style={{ ...styles.micCircle, backgroundColor: theme['c-primary-background'] }}>
              <SvgIcon name="recognize" size={34} color={theme['c-primary-font']} />
            </View>
          </View>
          <Text size={17} style={styles.stateText}>
            {t('music_recognition_listening')}
          </Text>
          <Text size={12} color={theme['c-font-label']} style={styles.hintText}>
            {remaining > 0
              ? t('music_recognition_countdown', { second: remaining })
              : t('music_recognition_listening_hint')}
          </Text>
        </View>
      )
    }

    if (stage === 'error') {
      return (
        <View style={styles.center}>
          <Icon name="music_time" size={30} color={theme['c-font-label']} />
          <Text size={15} style={styles.stateText}>
            {t('music_recognition_failed')}
          </Text>
          <Text size={12} color={theme['c-font-label']} style={styles.hintText}>
            {errorMessage}
          </Text>
        </View>
      )
    }

    // 识别中但还没有任何平台返回 → 先转圈；只要有平台先返回，
    // 就落到下面的结果列表，边展示边等其它平台
    if (stage === 'recognizing' && !outcome?.match) {
      return (
        <View style={styles.center}>
          <Loading size={30} />
          <Text size={15} style={styles.stateText}>
            {t('music_recognition_recognizing')}
          </Text>
        </View>
      )
    }

    if (!outcome?.match) {
      return (
        <View style={styles.center}>
          <Icon name="search-2" size={30} color={theme['c-font-label']} />
          <Text size={14} color={theme['c-font-label']} style={styles.hintText}>
            {allEnginesFailed
              ? (outcome?.reports.find((report) => report.message)?.message ??
                t('music_recognition_failed'))
              : captureStats?.silent
                ? t('music_recognition_silent')
                : captureStats?.lowSignal
                  ? t('music_recognition_low_signal')
                  : t('music_recognition_no_match')}
          </Text>
        </View>
      )
    }

    return (
      <ScrollView style={styles.resultScroll} keyboardShouldPersistTaps="always">
        {/* 还在识别中就先不提「可能误识别」—— 更高优先级的引擎可能还没返回 */}
        {outcome.ambiguous && stage === 'done' ? (
          <Text size={12} color={theme['c-font-label']} style={styles.ambiguousTip}>
            {t('music_recognition_ambiguous')}
          </Text>
        ) : null}
        <ResultRow result={outcome.match} onPress={handleSearch} highlight />
        {outcome.alternatives.length ? (
          <>
            <Text size={12} color={theme['c-font-label']} style={styles.sectionTitle}>
              {t('music_recognition_other_results')}
            </Text>
            {outcome.alternatives.map((item) => (
              // 用 providerTrackId 当 key：它跨增量刷新是稳定的，能避免列表重挂载
              <ResultRow key={item.providerTrackId} result={item} onPress={handleSearch} />
            ))}
          </>
        ) : null}
        {stage === 'recognizing' ? (
          <View style={styles.pendingRow}>
            <Loading size={12} />
            <Text size={11} color={theme['c-font-label']} style={styles.pendingText}>
              {t('music_recognition_partial_hint')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    )
  }

  const engineReports = outcome?.reports ?? []
  // 识别中即使还没有引擎返回，也把三个 chip 摆出来（显示「识别中」）
  const showEngineReports = stage === 'recognizing' || engineReports.length > 0

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.mask}>
        {/* 隐藏的 WebView：网易云 AFP 指纹靠它在本机算（Hermes 跑不了 wasm） */}
        <AfpHidden />
        <View style={{ ...styles.panel, backgroundColor: theme['c-content-background'] }}>
          <View style={{ ...styles.header, borderBottomColor: theme['c-border-background'] }}>
            <SvgIcon name="recognize" size={18} color={theme['c-primary-font']} />
            <Text size={16} style={styles.headerTitle}>
              {t('music_recognition')}
            </Text>
            <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
              <Icon name="close" size={16} color={theme['c-font-label']} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>{renderBody()}</View>

          {showEngineReports ? (
            <View style={styles.chipRow}>
              {ENGINE_ORDER.map((engine) => (
                <EngineChip
                  key={engine}
                  engine={engine}
                  report={engineReports.find((report) => report.engine === engine)}
                />
              ))}
            </View>
          ) : null}

          {__DEV__ &&
          (captureStats || engineReports.some((report) => report.detail || report.message)) ? (
            <View style={styles.debugBox}>
              {captureStats ? (
                <Text size={10} color={theme['c-font-label']} style={styles.debugText}>
                  {`采集 ${captureStats.durationMs}ms / ${(captureStats.samples / 16000).toFixed(1)}s 音源=${captureStats.source} 峰值=${captureStats.peak}(原生${captureStats.nativePeak}) RMS=${captureStats.rms} 零占比=${(captureStats.zeroRatio * 100).toFixed(0)}%(最长${(captureStats.maxZeroRunMs / 1000).toFixed(1)}s) ${captureStats.silent ? '静音!' : captureStats.lowSignal ? '低信号!' : '有声'}`}
                </Text>
              ) : null}
              {captureStats?.probe ? (
                <Text size={10} color={theme['c-font-label']} style={styles.debugText}>
                  {`试采 ${captureStats.probe}`}
                </Text>
              ) : null}
              {engineReports
                .filter((report) => report.detail || report.message)
                .map((report) => (
                  <Text
                    key={report.engine}
                    size={10}
                    color={theme['c-font-label']}
                    style={styles.debugText}
                  >
                    {report.status === 'error'
                      ? `${report.engine}: 错误 - ${report.detail ? report.detail + ' / ' : ''}${report.message ?? '未知'}`
                      : `${report.engine}: ${report.detail ?? ''}`}
                  </Text>
                ))}
            </View>
          ) : null}

          <View style={{ ...styles.footer, borderTopColor: theme['c-border-background'] }}>
            {stage === 'recording' ? (
              <TouchableOpacity
                style={{
                  ...styles.primaryBtn,
                  backgroundColor: theme['c-button-background-selected'],
                  opacity: canFinish ? 1 : 0.4,
                }}
                disabled={!canFinish}
                onPress={() => {
                  void stopAndRecognize()
                }}
              >
                <Text size={14} color={theme['c-button-font-selected']}>
                  {t('music_recognition_finish')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{ ...styles.primaryBtn, backgroundColor: theme['c-button-background'] }}
                disabled={recognizing}
                onPress={() => {
                  void beginCapture()
                }}
              >
                <Text size={14} color={theme['c-button-font']}>
                  {recognizing ? t('music_recognition_recognizing') : t('music_recognition_retry')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text size={10} color={theme['c-font-label']} style={styles.footerTip}>
            {t('music_recognition_tip')}
          </Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = createStyle({
  mask: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingBottom: 12,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 14,
    paddingBottom: 14,
    borderBottomWidth: BorderWidths.normal,
  },
  headerTitle: {
    flex: 1,
    paddingLeft: 8,
  },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    minHeight: 210,
  },
  center: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 24,
    paddingRight: 24,
  },
  micWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  pulseRing: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
  },
  micCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateText: {
    paddingTop: 10,
    textAlign: 'center',
  },
  hintText: {
    paddingTop: 8,
    textAlign: 'center',
    lineHeight: 18,
  },
  resultScroll: {
    maxHeight: 320,
  },
  ambiguousTip: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  sectionTitle: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  pendingText: {
    paddingLeft: 6,
    lineHeight: 16,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    paddingTop: 9,
    paddingBottom: 9,
    borderBottomWidth: BorderWidths.normal,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: 4,
  },
  coverEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultInfo: {
    flex: 1,
    paddingLeft: 10,
    paddingRight: 8,
  },
  engineTag: {
    paddingLeft: 6,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
  },
  chip: {
    borderWidth: BorderWidths.normal,
    borderRadius: 10,
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: 3,
    paddingBottom: 3,
    marginRight: 8,
    marginBottom: 6,
  },
  debugBox: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
  },
  debugText: {
    lineHeight: 14,
  },
  footer: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 12,
    borderTopWidth: BorderWidths.normal,
  },
  primaryBtn: {
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerTip: {
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 10,
    lineHeight: 14,
  },
})
