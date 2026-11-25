import AsyncStorage from '@react-native-async-storage/async-storage'
import { DEFAULT_GLASS_TABS_PARAMS, loadGlassTabsParams, normalizeGlassTabsParams, type GlassTabsParams } from './glassTabsParams'

export const GLASS_TARGETS = [
  { id: 'tabs', label: '底栏' },
  { id: 'miniPlayer', label: 'mini 播放器' },
  { id: 'header', label: '返回 / 更多' },
  { id: 'modeFavorite', label: '循环 / 收藏' },
  { id: 'skip', label: '上一曲 / 下一曲' },
] as const
export type GlassTarget = typeof GLASS_TARGETS[number]['id']
export type GlassProfiles = Record<GlassTarget, GlassTabsParams>

// Defaults captured from the user's saved glass profiles on 2026-11-18.
const buttonDefaults: GlassTabsParams = {
  ...DEFAULT_GLASS_TABS_PARAMS,
  tabsAccentColor: '#0088FF',
  containerColor: '#0A0A0A', containerAlpha: 0.45,
  blurRadius: 10.3, refractionHeight: 13.2, refractionAmount: 13.2,
  chromaticAberration: true, saturation: 1,
  highlightWidth: 2, highlightBlur: 2.4, highlightAlpha: 0.42, highlightIntensity: 1,
  previewBackground: 'checker',
  shadowEnabled: false,
}
export const DEFAULT_GLASS_PROFILES: GlassProfiles = {
  tabs: DEFAULT_GLASS_TABS_PARAMS,
  miniPlayer: {
    ...DEFAULT_GLASS_TABS_PARAMS,
    tabsAccentColor: '#0088FF',
    containerColor: '#FFFFFF',
    containerAlpha: 0.4,
  },
  header: { ...buttonDefaults },
  modeFavorite: { ...buttonDefaults },
  skip: { ...buttonDefaults, blurRadius: 10.2, highlightBlur: 1.85 },
}
const STORAGE_KEY = 'lxnx.glassControls.v1'
let profiles: GlassProfiles = { ...DEFAULT_GLASS_PROFILES }
let hydrated = false
let loading: Promise<void> | undefined
let saveTimer: ReturnType<typeof setTimeout> | undefined
let writes: Promise<void> = Promise.resolve()
const listeners = new Set<() => void>()
const emit = () => { listeners.forEach(listener => { listener() }) }
export const subscribeGlassSettings = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export const getGlassProfile = (target: GlassTarget) => profiles[target]
export const areGlassSettingsReady = () => hydrated

export function loadGlassSettings(): Promise<void> {
  if (loading) return loading
  loading = (async () => {
    let stored: Partial<GlassProfiles> = {}
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : null
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed as Partial<GlassProfiles>
    } catch (error) {
      console.warn('Unable to read glass control settings', error)
    }
    const legacyTabs = stored.tabs ? undefined : await loadGlassTabsParams()
    const next = { ...DEFAULT_GLASS_PROFILES }
    for (const { id } of GLASS_TARGETS) {
      const value = stored[id] ?? (id === 'tabs' ? legacyTabs : undefined)
      next[id] = normalizeGlassTabsParams({ ...DEFAULT_GLASS_PROFILES[id], ...(value && typeof value === 'object' ? value : {}) })
    }
    profiles = next
    hydrated = true
    emit()
  })()
  return loading
}

/** Snapshot before queuing; serialize writes so an older slider value cannot win. */
export function flushGlassSettings(): Promise<void> {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = undefined
  if (!hydrated) return writes
  const json = JSON.stringify(profiles)
  writes = writes.catch(() => {}).then(async () => { await AsyncStorage.setItem(STORAGE_KEY, json) })
  return writes
}
export function updateGlassProfile(target: GlassTarget, next: GlassTabsParams) {
  if (!hydrated) return
  profiles = { ...profiles, [target]: normalizeGlassTabsParams(next) }
  emit()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void flushGlassSettings().catch(error => { console.warn('Unable to save glass control settings', error) }) }, 300)
}
export function resetGlassProfile(target: GlassTarget) {
  updateGlassProfile(target, DEFAULT_GLASS_PROFILES[target])
}

export function copyGlassProfileToTargets(source: GlassTarget, targets: GlassTarget[]) {
  if (!hydrated) return
  const params = normalizeGlassTabsParams(profiles[source])
  const next = { ...profiles }
  for (const target of targets) {
    if (target !== source && GLASS_TARGETS.some(item => item.id === target)) next[target] = { ...params }
  }
  profiles = next
  emit()
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { void flushGlassSettings().catch(error => { console.warn('Unable to save glass control settings', error) }) }, 300)
}
