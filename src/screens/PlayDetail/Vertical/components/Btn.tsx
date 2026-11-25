import { TouchableOpacity } from 'react-native'
import { Icon } from '@/components/common/Icon'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT as _HEADER_HEIGHT } from '@/config/constant'
import { MS_SIZE } from '@/theme/myspotify/tokens'

export const HEADER_HEIGHT = scaleSizeH(_HEADER_HEIGHT)

/** 图标 22，横向命中区域取 44（不小于无障碍最小可点区域） */
const TAB_AREA = Math.max(HEADER_HEIGHT, MS_SIZE.tapArea)
const ICON_SIZE = MS_SIZE.playerBarIcon

export default ({
  icon,
  color,
  onPress,
}: {
  icon: string
  color?: string
  onPress: () => void
}) => {
  return (
    <TouchableOpacity onPress={onPress} style={{ ...styles.button, width: TAB_AREA }}>
      <Icon name={icon} color={color} size={ICON_SIZE} />
    </TouchableOpacity>
  )
}

const styles = createStyle({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    flex: 0,
  },
})
