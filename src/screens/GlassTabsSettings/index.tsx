import { useEffect, useState } from 'react'
import { ActivityIndicator, AppState, View } from 'react-native'
import { Navigation } from 'react-native-navigation'
import { COMPONENT_IDS } from '@/config/constant'
import commonActions from '@/store/common/action'
import GlassTabBarSettings from '@/components/spotify/GlassTabBarSettings'
import { copyGlassProfileToTargets, flushGlassSettings, resetGlassProfile, updateGlassProfile, type GlassTarget } from '@/components/spotify/glassControlSettings'
import { useGlassControl, useGlassSettingsReady } from '@/components/spotify/useGlassControl'

interface Props {
  componentId: string
}

export default function GlassTabsSettings({ componentId }: Props) {
  const [target, setTarget] = useState<GlassTarget>('tabs')
  const params = useGlassControl(target)
  const ready = useGlassSettingsReady()
  useEffect(() => {
    commonActions.setComponentId(COMPONENT_IDS.glassTabsSettings, componentId)
    const flush = () => { void flushGlassSettings().catch(error => { console.warn('Unable to save glass settings', error) }) }
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') flush() })
    return () => {
      commonActions.removeComponentId(componentId)
      subscription.remove()
      flush()
    }
  }, [componentId])

  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: '#151518' }}><ActivityIndicator /></View>

  return <GlassTabBarSettings
    params={params}
    target={target}
    onTargetChange={setTarget}
    onChange={next => { updateGlassProfile(target, next) }}
    onApplyToTargets={targets => { copyGlassProfileToTargets(target, targets) }}
    onClose={() => { void Navigation.pop(componentId) }}
    onReset={() => { resetGlassProfile(target) }}
  />
}
