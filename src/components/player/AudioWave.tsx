import { memo, useEffect, useRef, useState } from 'react'
import { AppState, type LayoutChangeEvent, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { useIsPlay, usePlayerMusicInfo } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { getSP, SP_SPACING } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { useComponentIds } from '@/store/common/hook'
import { COMPONENT_IDS } from '@/config/constant'
import { subscribeSpectrum } from '@/utils/nativeModules/audioSpectrum'
import { BAND_COUNT, createSpectrumEngine } from './audioSpectrum'

/**
 * 播放页底部的音频频谱。
 *
 * 沿用 AMLL 的 `AudioFFTVisualizer`（packages/react-full/src/components）样式：
 * - 白色竖线、底部起画、圆头线帽；
 * - 底部 35% 白 → 顶部 95% 白的线性渐变；
 * - 线数按 宽度 / 间距 计算（间距 7dp，AMLL 是 8dp；手机屏窄，7dp 才有足够多的线），最多 96 根；
 *   降采样时取区间最大值，保住峰值形状；
 * - 每段先做 `norm ** 1.8` 感知整形，再映射到可用高度。
 *
 * 原生 ExoPlayer 按实际播放位置输出 PCM 的 96 段 FFT；这里仅平滑和绘制。
 * 无采样、静音或数据中断时归零，绝不使用模拟节拍补位。
 */

const WAVE_HEIGHT = 52
const BAR_SPACING = 7
const MAX_BAR_WIDTH = 4
/** Native FFT and React/SVG updates are capped at about 30fps. */
const FRAME_INTERVAL = 1000 / 30 - 2

interface Bars {
  d: string
  lineWidth: number
}

const EMPTY_BARS: Bars = { d: '', lineWidth: 1 }

/** AMLL 同款降采样：频段数多于线数时取区间最大值，保留峰值 */
const resampleMax = (src: Float32Array, dstLen: number): Float32Array => {
  const out = new Float32Array(dstLen)
  if (dstLen <= 0 || src.length === 0) return out

  for (let i = 0; i < dstLen; i++) {
    const start = Math.floor((i * src.length) / dstLen)
    const end = Math.max(start + 1, Math.floor(((i + 1) * src.length) / dstLen))
    let max = 0
    for (let j = start; j < end && j < src.length; j++) {
      if (src[j] > max) max = src[j]
    }
    out[i] = max
  }
  return out
}

const buildBars = (width: number, height: number, values: Float32Array, mini: boolean): Bars => {
  const desiredCount = Math.max(8, Math.floor(width / BAR_SPACING))
  const lineCount = Math.min(BAND_COUNT, desiredCount)
  if (lineCount === 0) return EMPTY_BARS

  const samples = lineCount === BAND_COUNT ? values : resampleMax(values, lineCount)
  const barWidth = width / lineCount
  // 上下各留一个 barWidth：底部是圆头线帽，顶部留白避免顶到容器边缘
  const lineWidth = Math.min(MAX_BAR_WIDTH, barWidth * 0.45)
  const inset = mini ? lineWidth / 2 : barWidth
  const baseline = height - inset
  const availableHeight = Math.max(0, height - inset * 2)

  let d = ''
  for (let i = 0; i < lineCount; i++) {
    const x = barWidth * (i + 0.5)
    const norm = Math.min(1, Math.max(0, samples[i]))
    if (mini && norm < 0.004) continue
    // AMLL 的固定感知曲线：不是自动增益，只是把高位窄区间拉开
    const shaped = norm ** 1.8
    const barHeight = Math.max(shaped * availableHeight, lineWidth * 0.5)
    d += `M${x.toFixed(1)} ${baseline.toFixed(1)}L${x.toFixed(1)} ${(baseline - barHeight).toFixed(1)}`
  }

  return { d, lineWidth }
}

const AudioWave = memo(({ height = scaleSizeH(WAVE_HEIGHT), miniScreenId, forceVisible = false }: { height?: number, miniScreenId?: string, forceVisible?: boolean }) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const isPlay = useIsPlay()
  const musicInfo = usePlayerMusicInfo()
  const hasMusic = Boolean(musicInfo.id)
  const mini = miniScreenId !== undefined
  const gradientId = mini ? 'miniAudioWaveFill' : 'playDetailAudioWaveFill'
  const componentIds = useComponentIds()
  const [appState, setAppState] = useState(AppState.currentState)
  const topScreen = componentIds[componentIds.length - 1]
  const visible = appState === 'active' && (forceVisible || (mini ? topScreen?.id === miniScreenId : topScreen?.name === COMPONENT_IDS.playDetail))
  const color = sp.colors.text

  const [width, setWidth] = useState(0)
  const [bars, setBars] = useState<Bars>(EMPTY_BARS)

  const engineRef = useRef<ReturnType<typeof createSpectrumEngine> | null>(null)
  if (!engineRef.current) engineRef.current = createSpectrumEngine()

  useEffect(() => { engineRef.current!.clear() }, [musicInfo.id])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState)
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    const engine = engineRef.current!
    engine.clear()
    if (!visible || !hasMusic) return
    return subscribeSpectrum(bands => {
      if (bands) engine.accept(bands, performance.now())
      else engine.clear()
    })
  }, [visible, hasMusic])

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    setWidth((prev) => (Math.abs(prev - nextWidth) > 0.5 ? nextWidth : prev))
  }

  useEffect(() => {
    if (width <= 0 || !visible) {
      setBars(EMPTY_BARS)
      return
    }

    const engine = engineRef.current!
    let raf = 0
    let lastTime = 0
    let lastDraw = 0

    const tick = (now: number) => {
      if (!lastTime) {
        lastTime = now
        // 首帧立即出图，不要等半个间隔
        lastDraw = now - FRAME_INTERVAL
      }
      const dt = Math.min((now - lastTime) / 1000, 0.064)
      lastTime = now

      const values = engine.step(dt, isPlay, now)

      if (now - lastDraw >= FRAME_INTERVAL) {
        lastDraw = now
        const next = buildBars(width, height, values, mini)
        setBars(prev => prev.d === next.d && prev.lineWidth === next.lineWidth ? prev : next)
      }

      // 暂停后谱线落零、引擎静止就停掉循环，不要在看不见的地方空转
      if (isPlay || !engine.idle) {
        raf = requestAnimationFrame(tick)
      } else {
        setBars(buildBars(width, height, values, mini))
        raf = 0
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [isPlay, width, height, visible, musicInfo.id, mini])

  return (
    <View
      style={[styles.container, mini && styles.mini, { height }]}
      onLayout={handleLayout}
      pointerEvents="none"
      accessible={false}
    >
      {width > 0 && bars.d.length > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            {/* 与 AMLL 一样：底部 35% 白，顶部 95% 白 */}
            <LinearGradient id={gradientId} x1="0%" y1="100%" x2="0%" y2="0%">
              <Stop offset="0" stopColor={color} stopOpacity={mini ? 0.19 : 0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={mini ? 0.08 : 0.95} />
            </LinearGradient>
          </Defs>

          <Path
            d={bars.d}
            stroke={`url(#${gradientId})`}
            strokeWidth={bars.lineWidth}
            strokeLinecap="round"
          />
        </Svg>
      )}
    </View>
  )
})

AudioWave.displayName = 'AudioWave'

export default AudioWave

const styles = createStyle({
  mini: { marginTop: 0 },
  container: {
    width: '100%',
    marginTop: SP_SPACING.xs,
    overflow: 'hidden',
  },
})
