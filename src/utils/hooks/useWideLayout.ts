import { Dimensions, useWindowDimensions } from 'react-native'

/**
 * Match MainActivity's portrait lock using full-screen dp, not the window
 * shortened by status/navigation bars or the keyboard.
 */
export const isPortraitPhoneScreen = (width: number, height: number) =>
  width > 0 && height > 0 && Math.min(width, height) < 600 &&
  Math.max(width, height) * 9 > Math.min(width, height) * 16

export const isWideWindow = (
  width: number,
  height: number,
  screen: { width: number, height: number } = Dimensions.get('screen'),
) => !isPortraitPhoneScreen(screen.width, screen.height) &&
  (width > height || Math.min(width, height) >= 600)

export default () => {
  const { width, height } = useWindowDimensions()
  return isWideWindow(width, height)
}
