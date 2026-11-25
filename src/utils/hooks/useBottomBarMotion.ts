import { useCallback, useEffect, useRef } from 'react'
import { Animated, Easing, type GestureResponderEvent } from 'react-native'

// The two home controls animate independently: the tab bar leaves the
// viewport completely, while the mini player settles into the bottom slot.
export const HOME_BOTTOM_BAR_HIDE_OFFSET = 128
export const HOME_MINI_PLAYER_HIDE_OFFSET = 80
export const DETAIL_PLAYER_BAR_HIDE_OFFSET = 96

interface Options {
  initialHidden?: boolean
  offset?: number
  listen?: boolean
  broadcast?: boolean
}

export default function useBottomBarMotion({
  initialHidden = false,
  offset = HOME_BOTTOM_BAR_HIDE_OFFSET,
  listen = false,
  broadcast = false,
}: Options = {}) {
  const translateY = useRef(new Animated.Value(initialHidden ? offset : 0)).current
  const hiddenRef = useRef(initialHidden)
  const startTouchY = useRef<number | null>(null)
  const lastTouchY = useRef<number | null>(null)
  const accumulatedDy = useRef(0)
  const gestureDirection = useRef<'up' | 'down' | null>(null)

  const setHidden = useCallback((hidden: boolean, force = false) => {
    if (!force && hiddenRef.current === hidden) return
    hiddenRef.current = hidden
    if (broadcast) global.app_event.setBottomBarHidden(hidden)
    translateY.stopAnimation()
    Animated.timing(translateY, {
      toValue: hidden ? offset : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start()
  }, [broadcast, offset, translateY])

  useEffect(() => {
    if (!listen) return
    const handle = (hidden: boolean) => setHidden(hidden)
    global.app_event.on('setBottomBarHidden', handle)
    return () => global.app_event.off('setBottomBarHidden', handle)
  }, [listen, setHidden])

  useEffect(() => {
    setHidden(initialHidden, true)
    return () => {
      if (broadcast) global.app_event.setBottomBarHidden(false)
    }
  }, [broadcast, initialHidden, setHidden])

  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const pageY = event.nativeEvent.pageY ?? event.nativeEvent.touches?.[0]?.pageY
    startTouchY.current = pageY
    lastTouchY.current = pageY
    accumulatedDy.current = 0
    gestureDirection.current = null
  }, [])

  const onTouchMove = useCallback((event: GestureResponderEvent) => {
    const y = event.nativeEvent.pageY ?? event.nativeEvent.touches?.[0]?.pageY
    if (y == null) return
    const previousY = lastTouchY.current
    lastTouchY.current = y
    if (previousY == null) return
    const deltaY = y - previousY
    accumulatedDy.current += deltaY
    if (accumulatedDy.current <= -10 && gestureDirection.current !== 'up') {
      accumulatedDy.current = 0
      gestureDirection.current = 'up'
      setHidden(true)
    } else if (accumulatedDy.current >= 10 && gestureDirection.current !== 'down') {
      accumulatedDy.current = 0
      gestureDirection.current = 'down'
      setHidden(false)
    }
  }, [setHidden])

  const onTouchEnd = useCallback((event?: GestureResponderEvent) => {
    const endY = event?.nativeEvent.pageY ?? event?.nativeEvent.touches?.[0]?.pageY
    const startY = startTouchY.current
    if (startY != null && endY != null && gestureDirection.current == null) {
      const totalDy = endY - startY
      if (totalDy <= -10) setHidden(true)
      else if (totalDy >= 10) setHidden(false)
    }
    startTouchY.current = null
    lastTouchY.current = null
    accumulatedDy.current = 0
    gestureDirection.current = null
  }, [setHidden])

  return { translateY, setHidden, onTouchStart, onTouchMove, onTouchEnd }
}
