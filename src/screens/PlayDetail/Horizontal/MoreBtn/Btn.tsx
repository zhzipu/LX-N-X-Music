import { StyleSheet, TouchableOpacity } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'
import { scaleSizeW } from '@/utils/pixelRatio'
import GlassOverlay from '@/components/spotify/GlassOverlay'
import ConfiguredGlassSurface from '@/components/spotify/ConfiguredGlassSurface'
import type { GlassTarget } from '@/components/spotify/glassControlSettings'

export const BTN_WIDTH = scaleSizeW(32)
export const BTN_ICON_SIZE = 22

export default ({
  icon,
  color,
  onPress,
  glassTarget,
}: {
  icon: string
  color?: string
  onPress: () => void
  glassTarget?: GlassTarget
}) => {
  const theme = useTheme()
  const button = (
    <TouchableOpacity
      style={{ ...styles.cotrolBtn, width: BTN_WIDTH, height: BTN_WIDTH }}
      activeOpacity={0.5}
      onPress={onPress}
    >
      {glassTarget ? <ConfiguredGlassSurface target={glassTarget} capsuleRadius={BTN_WIDTH / 2} style={StyleSheet.absoluteFill} pointerEvents="none" /> : null}
      {icon.startsWith('svg:') 
        ? <SvgIcon name={icon.replace('svg:', '')} color={color ?? theme['c-font-label']} size={BTN_ICON_SIZE} /> 
        : <Icon name={icon} color={color ?? theme['c-font-label']} size={BTN_ICON_SIZE} />
      }
    </TouchableOpacity>
  )
  return glassTarget ? <GlassOverlay>{button}</GlassOverlay> : button
}

const styles = createStyle({
  cotrolBtn: {
    marginBottom: 5,
    justifyContent: 'center',
    alignItems: 'center',

    // backgroundColor: '#ccc',
    shadowOpacity: 1,
    textShadowRadius: 1,
  },
})
