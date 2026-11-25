import { useCallback, useState } from 'react'
import { Keyboard, View } from 'react-native'
import Vertical from './Vertical'
import type { SettingScreenIds } from './catalog'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
import commonState from '@/store/common/state'
import { setNavActiveId } from '@/core/common'
import { createStyle } from '@/utils/tools'

export type { SettingScreenIds } from './catalog'

export default () => {
  const [activeId, setActiveId] = useState<SettingScreenIds | null>(null)

  const openCategory = useCallback((id: SettingScreenIds) => {
    Keyboard.dismiss()
    global.lx.settingActiveId = id
    setActiveId(id)
  }, [])

  const backToOverview = useCallback(() => {
    Keyboard.dismiss()
    setActiveId(null)
  }, [])

  useBackHandler(useCallback(() => {
    if (commonState.componentIds.length !== 1 || commonState.navActiveId !== 'nav_setting') {
      return false
    }
    if (activeId) backToOverview()
    else setNavActiveId(commonState.lastNavActiveId)
    return true
  }, [activeId, backToOverview]))

  return (
    <View style={styles.container}>
      <Vertical activeId={activeId} onChangeId={openCategory} onBack={backToOverview} />
    </View>
  )
}

const styles = createStyle({ container: { flex: 1 } })
