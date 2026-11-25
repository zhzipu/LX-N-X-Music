import { useEffect, useRef } from 'react'
import { Navigation } from 'react-native-navigation'
// import { View, StyleSheet } from 'react-native'
import { useWideLayout } from '@/utils/hooks'

import Vertical from './Vertical'
import PageContent from '@/components/PageContent'
import StatusBar from '@/components/common/StatusBar'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { foldPage } from '@/navigation/foldPage'

export default ({ componentId, initialPage = 0 }: { componentId: string, initialPage?: 0 | 1 }) => {
  const isWideLayout = useWideLayout()
  const poppedForWideRef = useRef(false)

  useEffect(() => {
    foldPage.current = initialPage === 1 ? 'lyrics' : 'player'
    setComponentId(COMPONENT_IDS.playDetail, componentId)
    return () => {
      if (!poppedForWideRef.current) foldPage.current = 'home'
    }
  }, [componentId, initialPage])

  useEffect(() => {
    if (!isWideLayout || poppedForWideRef.current) return
    poppedForWideRef.current = true
    // A fold replaces the home/mini-player tree with the Pad rail. Shared
    // elements cannot return to that removed tree; this is a layout handoff,
    // not a user-initiated back transition.
    void Navigation.pop(componentId, { animations: { pop: { enabled: false } } }).catch(() => {
      poppedForWideRef.current = false
    })
  }, [componentId, isWideLayout])

  // Keep the native source hierarchy alive until RNN removes this screen.
  // Rendering null here can empty a parent before transition cleanup runs.

  return (
    <PageContent>
      <StatusBar />
      <Vertical componentId={componentId} initialPage={initialPage} />
    </PageContent>
  )
}
