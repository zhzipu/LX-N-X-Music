import { memo } from 'react'
import { View } from 'react-native'

import Progress from '@/components/player/ProgressBar'
import Status from './Status'
import { useProgress } from '@/store/player/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { useBufferProgress } from '@/plugins/player'
import { getMS, MS_FONT, MS_SIZE, MS_SPACING } from '@/theme/myspotify/tokens'

/** 时间文字：11 / 0.38 透明度 */
const PlayTime = memo(({ timeStr, color }: { timeStr: string, color: string }) => {
  return (
    <Text style={styles.playTime} color={color} size={MS_FONT.caption} numberOfLines={1}>
      {timeStr}
    </Text>
  )
})

/**
 * 播放详情页的进度区：3dp 轨道 / 纯白填充 / 10dp 白色圆点，
 * 时间文字 11 号 0.38 透明度，进度条与时间之间留 8 的间距。
 */
export default memo(() => {
  const theme = useTheme()
  const ms = getMS(theme.isDark)
  const { maxPlayTimeStr, nowPlayTimeStr, progress, maxPlayTime } = useProgress()
  const buffered = useBufferProgress()

  return (
    <>
      <View style={styles.progress}>
        <Progress
          progress={progress}
          duration={maxPlayTime}
          buffered={buffered}
          trackColor={ms.colors.track}
          bufferedColor={ms.colors.trackBuffered}
          barColor={ms.colors.trackFill}
          thumbSize={MS_SIZE.progressThumb}
        />
      </View>
      <View style={styles.info}>
        <PlayTime timeStr={nowPlayTimeStr} color={ms.colors.textTertiary} />
        <View style={styles.status}>
          <Status />
        </View>
        <PlayTime timeStr={maxPlayTimeStr} color={ms.colors.textTertiary} />
      </View>
    </>
  )
})

const styles = createStyle({
  progress: {
    flexGrow: 1,
    flexShrink: 0,
    flexDirection: 'column',
    justifyContent: 'center',
  },
  info: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // Progress 容器自带 10 的上下内边距，进度条与时间文字的实际间距约 8
  },
  playTime: {
    fontWeight: MS_FONT.captionWeight,
  },
  status: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: MS_SPACING.md,
    paddingRight: MS_SPACING.md,
  },
})
