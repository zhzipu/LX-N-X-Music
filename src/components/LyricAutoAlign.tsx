import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Text from '@/components/common/Text'
import Loading from '@/components/common/Loading'
import {
  getAlignState,
  recognizedLyricInfo,
  resetAlign,
  startAutoAlign,
  subscribeAlign,
  translateRecognizedLyric,
  type AlignStage,
  type AlignState,
} from '@/core/asr/autoAlign'
import playerState from '@/store/player/state'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle, toast } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

export interface LyricAutoAlignType {
  show: () => void
}

interface Step {
  stage: AlignStage
  title: string
  hint: string
}

/** 顺序与 `autoAlign` 的执行顺序一致，用来判断「已完成 / 进行中 / 未开始」 */
const STEPS: Step[] = [
  { stage: 'audio', title: '准备音频', hint: '本地曲目直接读，B 站等在线曲目先下载整首' },
  { stage: 'recognize', title: '识别歌声', hint: '云端识别（阿里云百炼），整首歌会上传' },
  { stage: 'align', title: '生成歌词', hint: '有现成歌词就对准时间，没有就用识别文本成行' },
]

const indexOfStage = (stage: AlignStage) => STEPS.findIndex((step) => step.stage === stage)

const stageHint = (state: AlignState): string => {
  switch (state.stage) {
    case 'audio':
      return state.ratio !== null && state.ratio < 1 ? '正在下载音频' : '正在读取音频文件'
    case 'recognize':
      return '云端识别通常十几秒，长歌一般也不超过一分钟'
    case 'align':
      return state.detail || '正在把每一句的起唱时间算出来'
    default:
      return ''
  }
}

export default forwardRef<LyricAutoAlignType, {}>((_props, ref) => {
  const theme = useTheme()
  const showTranslate = useSettingValue('player.isShowLyricTranslation')
  const popupRef = useRef<PopupType>(null)
  const [visible, setVisible] = useState(false)
  const [state, setState] = useState<AlignState>(getAlignState())

  useEffect(() => {
    // 任务在模块级单例里跑，面板只是它的一个观察者：关掉面板不会中断识别
    return subscribeAlign(() => {
      setState(getAlignState())
    })
  }, [])

  useImperativeHandle(ref, () => ({
    show() {
      const musicId = String(playerState.musicInfo.id ?? '')
      if (!musicId) {
        toast('当前没有正在播放的歌曲')
        return
      }
      setState(getAlignState())
      // 和「匹配歌词」一样：Popup 是条件渲染的，首次 show 时 ref 还没挂上，
      // 必须等这一帧渲染完再 setVisible，否则弹不出来
      const open = () => {
        popupRef.current?.setVisible(true)
      }
      if (visible) {
        open()
      } else {
        setVisible(true)
        requestAnimationFrame(open)
      }

      const current = getAlignState()
      // 正在跑、或这首歌刚跑完 → 只是把面板打开看状态；换了歌才重新开始
      if (current.running || current.musicId === musicId) return
      // 这首歌已经有识别结果：不再自动重跑（识别要下载整首、上传云端、还花钱），
      // 结果落盘后播放时本来就优先用它，这里只把陈旧的面板状态清成待机
      if (recognizedLyricInfo(musicId).lines > 0) resetAlign()
      else startAutoAlign()
    },
  }))

  const handleHide = useCallback(() => {
    setVisible(false)
  }, [])

  const currentIndex = indexOfStage(state.stage)
  const finished = state.stage === 'done'
  const failed = state.stage === 'error'
  // 当前这首的识别结果概况：句数 / 是不是中文 / 有没有译文
  const recognized = recognizedLyricInfo(String(playerState.musicInfo.id ?? ''))
  const existingLines = recognized.lines
  const idle = !state.running && !finished && !failed
  // 待机且已有识别结果时，三步流程没有意义（什么都没跑），换成一句说明
  const showSteps = !idle || existingLines === 0
  // 歌词不是中文、还没有译文、用户又开着「显示歌词翻译」时，给一个补翻的入口
  const canTranslate =
    existingLines > 0 && !recognized.chinese && !recognized.translated && showTranslate

  const retry = () => {
    startAutoAlign()
  }

  return visible ? (
    <Popup ref={popupRef} title="自动识别歌词" onHide={handleHide}>
      <View style={styles.content}>
        {showSteps ? (
          STEPS.map((step, index) => {
            const done = finished || (currentIndex > index && !failed)
            const active = !finished && !failed && currentIndex === index
            const color = done || active ? theme['c-primary-font'] : theme['c-350']
            return (
              <View key={step.stage} style={styles.step}>
                <View
                  style={{
                    ...styles.dot,
                    borderColor: color,
                    backgroundColor: done ? color : 'transparent',
                  }}
                >
                  {done ? <Text size={9} color={theme['c-primary-background']}>✓</Text> : null}
                </View>
                <View style={styles.stepInfo}>
                  <Text size={14} color={active || done ? theme['c-font'] : theme['c-350']}>
                    {step.title}
                  </Text>
                  <Text size={11} color={theme['c-font-label']} numberOfLines={2}>
                    {active ? stageHint(state) || step.hint : step.hint}
                  </Text>
                </View>
                {active ? <Loading size={14} /> : null}
              </View>
            )
          })
        ) : (
          <View style={styles.recognized}>
            <Text size={13} color={theme['c-font']}>
              {`这首歌已经识别过（${existingLines} 句）`}
            </Text>
            <Text size={11} color={theme['c-font-label']} style={styles.recognizedHint}>
              下次播放会优先使用识别出的歌词，不用再识别一遍。重新识别会覆盖现在这份。
            </Text>
            {canTranslate ? (
              <TouchableOpacity
                style={styles.translateButton}
                activeOpacity={0.7}
                onPress={translateRecognizedLyric}
              >
                <Text size={12} color={theme['c-primary-font']}>
                  歌词不是中文，生成中文翻译
                </Text>
              </TouchableOpacity>
            ) : recognized.translated ? (
              <Text size={11} color={theme['c-font-label']} style={styles.recognizedHint}>
                已生成中文翻译，打开「显示歌词翻译」即可看到
              </Text>
            ) : !recognized.chinese && !showTranslate ? (
              <Text size={11} color={theme['c-font-label']} style={styles.recognizedHint}>
                歌词不是中文，打开「显示歌词翻译」后可以生成中文翻译
              </Text>
            ) : null}
          </View>
        )}

        {state.ratio !== null && !finished ? (
          <View style={{ ...styles.barBg, backgroundColor: theme['c-primary-alpha-100'] }}>
            <View
              style={{
                ...styles.barFill,
                width: `${Math.min(100, Math.max(2, Math.round(state.ratio * 100)))}%`,
                backgroundColor: theme['c-primary-font'],
              }}
            />
          </View>
        ) : null}

        {state.detail ? (
          <Text size={11} color={theme['c-font-label']} style={styles.detail}>
            {state.detail}
          </Text>
        ) : null}

        {failed ? (
          <Text size={12} color={theme['c-primary-font']} style={styles.result}>
            {state.error || '识别失败'}
          </Text>
        ) : null}

        {finished ? (
          <Text size={12} color={theme['c-font-label']} style={styles.result}>
            {state.summary}
          </Text>
        ) : null}

        {/* 识别在后台跑（面板关掉也不中断），所以进行中不给「取消」，
            只提示可以关掉面板让它自己跑完 */}
        {state.running ? (
          <Text size={11} color={theme['c-font-label']} style={styles.tip}>
            可以关掉这个面板，识别会在后台继续，完成后自动替换歌词
          </Text>
        ) : (
          <TouchableOpacity
            style={{ ...styles.button, backgroundColor: theme['c-button-background'] }}
            activeOpacity={0.7}
            onPress={retry}
          >
            <Text size={14} color={theme['c-button-font']}>
              {failed ? '重试' : finished || existingLines > 0 ? '重新识别' : '开始识别'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Popup>
  ) : null
})

const styles = createStyle({
  content: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 9,
    paddingBottom: 9,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 12,
    paddingRight: 8,
  },
  barBg: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  detail: {
    paddingTop: 6,
  },
  result: {
    paddingTop: 10,
    lineHeight: 18,
  },
  recognized: {
    paddingTop: 10,
    paddingBottom: 2,
  },
  recognizedHint: {
    paddingTop: 6,
    lineHeight: 17,
  },
  translateButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  tip: {
    paddingTop: 14,
    lineHeight: 16,
  },
  button: {
    marginTop: 14,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
