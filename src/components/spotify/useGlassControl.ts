import { useEffect, useSyncExternalStore } from 'react'
import { areGlassSettingsReady, getGlassProfile, loadGlassSettings, subscribeGlassSettings, type GlassTarget } from './glassControlSettings'

export function useGlassControl(target: GlassTarget) {
  useEffect(() => { void loadGlassSettings() }, [])
  return useSyncExternalStore(subscribeGlassSettings, () => getGlassProfile(target))
}
export function useGlassSettingsReady() {
  useEffect(() => { void loadGlassSettings() }, [])
  return useSyncExternalStore(subscribeGlassSettings, areGlassSettingsReady)
}
