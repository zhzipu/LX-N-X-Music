import { TouchableOpacity, View } from 'react-native'

import Text from '@/components/common/Text'
import { SvgIcon } from '@/components/common/SvgIcon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { LYRIC_SPEED_STEP, MAX_LYRIC_SPEED, MIN_LYRIC_SPEED } from '@/core/lyricAdjust'

export interface LyricAdjustBarProps {
  visible: boolean
  /** 当前偏移（毫秒，正数=歌词延后） */
  offset: number
  /** 当前歌词倍速（1 = 原速） */
  speed: number
  /** 调倍速：传入 ±0.1 这样的步进量 */
  onSpeedChange: (delta: number) => void
  onReset: () => void
  onCancel: () => void
  onConfirm: () => void
}

const formatOffset = (offset: number) => {
  if (!offset) return '无延迟'
  return `${offset > 0 ? '+' : '-'}${(Math.abs(offset) / 1000).toFixed(1)}s`
}

const formatSpeed = (speed: number) => `${speed.toFixed(1)}x`

/**
 * 「调节歌词」模式下歌词右侧的操作条（纯图标）：倍速 / 偏移 / 取消 / 重置 / 确定。
 * 倍速调的是歌词时间轴，音频不受影响。
 */
export default ({
  visible,
  offset,
  speed,
  onSpeedChange,
  onReset,
  onCancel,
  onConfirm,
}: LyricAdjustBarProps) => {
  const theme = useTheme()
  if (!visible) return null

  const canSlowDown = speed > MIN_LYRIC_SPEED + 1e-6
  const canSpeedUp = speed < MAX_LYRIC_SPEED - 1e-6

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={{ ...styles.speedBox, backgroundColor: theme['c-primary-alpha-200'] }}>
        <TouchableOpacity
          style={styles.speedBtn}
          activeOpacity={0.7}
          disabled={!canSlowDown}
          onPress={() => onSpeedChange(-LYRIC_SPEED_STEP)}
        >
          <View style={{ opacity: canSlowDown ? 1 : 0.3 }}>
            <SvgIcon name="minus" size={12} color={theme['c-font']} />
          </View>
        </TouchableOpacity>
        <Text size={11} color={theme['c-font']} style={styles.speedLabel} numberOfLines={1}>
          {formatSpeed(speed)}
        </Text>
        <TouchableOpacity
          style={styles.speedBtn}
          activeOpacity={0.7}
          disabled={!canSpeedUp}
          onPress={() => onSpeedChange(LYRIC_SPEED_STEP)}
        >
          <View style={{ opacity: canSpeedUp ? 1 : 0.3 }}>
            <SvgIcon name="plus" size={12} color={theme['c-font']} />
          </View>
        </TouchableOpacity>
      </View>
      {/* 倍速不为 1 时，偏移里含有「(倍速-1) × 对齐位置」这一大块（长歌后段能到几十秒），
          显示出来只会误导，这时以倍速标签为准 */}
      {speed === 1 ? (
        <View style={{ ...styles.badge, backgroundColor: theme['c-primary-alpha-200'] }}>
          <Text size={11} color={theme['c-font']} numberOfLines={1}>
            {formatOffset(offset)}
          </Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={{ ...styles.button, ...styles.item, backgroundColor: theme['c-primary-alpha-200'] }}
        activeOpacity={0.7}
        onPress={onCancel}
      >
        <SvgIcon name="cross" size={18} color={theme['c-font']} />
      </TouchableOpacity>
      <TouchableOpacity
        style={{ ...styles.button, ...styles.item, backgroundColor: theme['c-primary-alpha-200'] }}
        activeOpacity={0.7}
        onPress={onReset}
      >
        <SvgIcon name="refresh" size={18} color={theme['c-font']} />
      </TouchableOpacity>
      <TouchableOpacity
        style={{ ...styles.button, ...styles.item, backgroundColor: theme['c-primary-alpha-200'] }}
        activeOpacity={0.7}
        onPress={onConfirm}
      >
        <SvgIcon name="check" size={18} color={theme['c-font']} />
      </TouchableOpacity>
    </View>
  )
}

const styles = createStyle({
  container: {
    position: 'absolute',
    top: 0,
    right: 4,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  speedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 11,
    paddingLeft: 2,
    paddingRight: 2,
    marginBottom: 6,
  },
  speedBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedLabel: {
    minWidth: 30,
    textAlign: 'center',
  },
  badge: {
    paddingLeft: 6,
    paddingRight: 6,
    paddingTop: 2,
    paddingBottom: 2,
    borderRadius: 8,
    marginBottom: 4,
    maxWidth: 56,
  },
  item: {
    marginTop: 10,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
