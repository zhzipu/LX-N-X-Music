import { useWindowDimensions } from 'react-native'
import { isHorizontalMode } from '../tools'

export default () => {
  const windowSize = useWindowDimensions()

  return isHorizontalMode(windowSize.width, windowSize.height)
}
