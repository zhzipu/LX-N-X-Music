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
  CAPTURE_SECONDS,
  ENGINE_ORDER,
  MIN_CAPTURE_SECONDS,
  SUBMIT_AT_SECONDS,
  abortCapture,
  finishCapture,
  peekCapture,
  startCapture,
  type CaptureStats,
  type EngineReport,
  type RecognitionEngine,
  type RecognitionOutcome,
  type RecognitionResult,
} from '@/core/musicRecognition'
import {
  createRecognitionSession,
  type RecognitionRound,
  type RecognitionSession,
} from '@/core/musicRecognition/session'
import { searchRecognitionResult } from '@/core/musicRecognition/search'
import AfpHidden from './AfpHidden'

type Stage = 'starting' | 'recording' | 'recognizing' | 'done' | 'error'

const ENGINE_LABEL: Record<RecognitionEngine, string> = {
  shazam: 'Shazam',
  netease: '网易云',
  kugou: '酷狗',
}

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
  const [round, setRound] = useState<RecognitionRound | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const mountedRef = useRef(true)
  const sessionRef = useRef<RecognitionSession | null>(null)

  const pulse = useRef(new Animated.Value(0)).current
  const recording = stage === 'recording'
  const recognizing = stage === 'recognizing'

  const handleSearch = useCallback(
    (result: RecognitionResult) => {
      const keyword = searchRecognitionResult(result)
      toast(`${t('music_recognition_result')}：${keyword}`)
      onClose()
    },
    [onClose, t]
  )

  /**
   * 开始一次识别：录音不中断，到第 3/7/10/13 秒各自动提交一次，
   * 任一平台先出结果就先展示，后续平台的结果再补进列表（细节见 core/session.ts）。
   */
  const beginCapture = useCallback(async () => {
    // 上一次会话可能还在（用户点「重新识别」），先把它连同麦克风一起收掉
    sessionRef.current?.abort()
    sessionRef.current = null

    setOutcome(null)
    setCaptureStats(null)
    setRound(null)
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

    const session = createRecognitionSession(
      { peek: peekCapture, finish: finishCapture, abort: abortCapture },
      {
        onUpdate: (next) => {
          if (mountedRef.current) setOutcome(next)
        },
        onStats: (captured, info) => {
          if (!mountedRef.current) return
          setRound(info)
          // 整段全静音就没必要往下发请求了，但轮次会继续，UI 照常展示提示
          setCaptureStats(captured.stats)
        },
        onRoundDone: (info) => {
          if (!mountedRef.current) return
          setRound(info)
          if (info.allMatched) setRemaining(0)
        },
        onTick: (tick) => {
          if (!mountedRef.current) return
          setRemaining(Math.ceil(tick.remainingSeconds))
          setStage(tick.recording ? 'recording' : tick.recognizing ? 'recognizing' : 'done')
        },
        onEnd: () => {
          if (mountedRef.current) setStage('done')
        },
      }
    )
    sessionRef.current = session
    setStage('recording')
  }, [t])

  useEffect(() => {
    mountedRef.current = true
    void beginCapture()
    return () => {
      mountedRef.current = false
      // 面板关闭时如果还在录音，必须把麦克风释放掉
      if (sessionRef.current) {
        sessionRef.current.abort()
        sessionRef.current = null
      } else {
        void abortCapture()
      }
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
    // 卸载时的 cleanup 也会兜底，这里先收一次，避免麦克风多占一会儿
    if (sessionRef.current) {
      sessionRef.current.abort()
      sessionRef.current = null
    } else {
      void abortCapture()
    }
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

    // 录音中但还没有任何平台返回结果 → 显示麦克风动画与倒计时；
    // 一旦有平台先出结果，就落到下面的结果列表，边展示边继续录
    if (recording && !outcome?.match) {
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

    if (!outcome?.match) {
      // 还没跑完 → 转圈等；确实结束了才报「没有识别到」
      if (stage !== 'done') {
        return (
          <View style={styles.center}>
            <Loading size={30} />
            <Text size={15} style={styles.stateText}>
              {t('music_recognition_recognizing')}
            </Text>
          </View>
        )
      }
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
        {/* 还在录 / 还在识别时先不提「可能误识别」—— 更高优先级的引擎可能还没返回 */}
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
        {recording || recognizing ? (
          <View style={styles.pendingRow}>
            <Loading size={12} />
            <Text size={11} color={theme['c-font-label']} style={styles.pendingText}>
              {recording
                ? t('music_recognition_recording_hint', { second: remaining })
                : t('music_recognition_partial_hint')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    )
  }

  const engineReports = outcome?.reports ?? []
  // 录音/识别期间即使还没有引擎返回，也把三个 chip 摆出来（显示「识别中」）
  const showEngineReports = recording || recognizing || engineReports.length > 0

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
          (round || captureStats || engineReports.some((report) => report.detail || report.message)) ? (
            <View style={styles.debugBox}>
              {round ? (
                <Text size={10} color={theme['c-font-label']} style={styles.debugText}>
                  {`第 ${round.index}/${SUBMIT_AT_SECONDS.length} 轮 · 提交于 ${round.atSecond.toFixed(1)}s · 音频 ${round.audioSeconds.toFixed(1)}s${round.error ? ` · ${round.error}` : ''}`}
                </Text>
              ) : null}
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
                  // 停录音 + 用完整音频再补一轮（等正在跑的轮次先跑完）
                  sessionRef.current?.finishNow()
                }}
              >
                <Text size={14} color={theme['c-button-font-selected']}>
                  {t('music_recognition_finish')}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={{ ...styles.primaryBtn, backgroundColor: theme['c-button-background'] }}
                onPress={() => {
                  void beginCapture()
                }}
              >
                <Text size={14} color={theme['c-button-font']}>
                  {t('music_recognition_retry')}
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
