import { memo } from 'react'
import { Pressable, View } from 'react-native'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'

export const NUMBERED_TRACK_HEIGHT = scaleSizeH(70)
export interface NumberedTrackRowProps {
  music: LX.Music.MusicInfo
  index: number
  selected: boolean
  duration: string
  onPress: (music: LX.Music.MusicInfo, index: number) => void
  onLongPress: (music: LX.Music.MusicInfo) => void
}

// Only the changed row re-renders; offscreen rows stay virtualized.
export default memo(function NumberedTrackRow({ music, index, selected, duration, onPress, onLongPress }: NumberedTrackRowProps) {
  const sp = getSP(useTheme().isDark)
  return <Pressable
    style={[styles.row, selected && { backgroundColor: sp.colors.interactivePressed }]}
    accessibilityState={{ selected }}
    delayLongPress={300}
    onLongPress={() => onLongPress(music)}
    onPress={() => onPress(music, index)}
  >
    <Text size={13} style={[styles.index, { color: sp.colors.textTertiary }]} allowFontScaling={false}>{index + 1}</Text>
    <View style={styles.body}>
      <Text size={15} numberOfLines={1} color={sp.colors.text} allowFontScaling={false}>{music.name}</Text>
      <Text size={12} numberOfLines={1} style={styles.subtitle} color={sp.colors.textSecondary} allowFontScaling={false}>{music.singer}</Text>
    </View>
    <Text size={12} color={sp.colors.textTertiary} allowFontScaling={false}>{duration}</Text>
  </Pressable>
})

const styles = createStyle({
  row: { flexDirection: 'row', alignItems: 'center', height: 70, paddingHorizontal: 16 },
  index: { width: 24 },
  body: { flex: 1, paddingRight: 12 },
  subtitle: { paddingTop: 2 },
})
