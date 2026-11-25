import { memo, useState, type ReactNode } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native'
import Slider from '@/components/common/Slider'
import { useTheme } from '@/store/theme/hook'
import LiquidTabs, { LiquidTabsBackdrop } from './LiquidTabs'
import { type GlassTabsParams } from './glassTabsParams'
import { GLASS_TARGETS, type GlassTarget } from './glassControlSettings'
import GlassSurface from './GlassSurface'
import GlassOverlay from './GlassOverlay'
import GlassIconButton from './GlassIconButton'
import { glassSurfaceParams } from './glassSurfaceParams'
import { Icon } from '@/components/common/Icon'

interface Props {
  target: GlassTarget
  onTargetChange: (target: GlassTarget) => void
  params: GlassTabsParams
  onChange: (next: GlassTabsParams) => void
  onApplyToTargets: (targets: GlassTarget[]) => void
  onClose: () => void
  onReset: () => void
}

const CONTAINER_PRESETS = ['#FFFFFF', '#0A0A0A', '#1E1E1E', '#0A84FF', '#FF375F']
const ACCENT_PRESETS = ['#FFFFFF', '#0088FF', '#0091FF', '#FFD60A', '#34C759']
const SHADOW_PRESETS = ['#000000', '#FFFFFF', '#0A84FF', '#FF375F']
const PREVIEW_TABS = ['home', 'search-2', 'album', 'menu']

const fmt = (value: number, digits = 2) => {
  const text = value.toFixed(digits)
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

const ParamSlider = memo(({
  label,
  value,
  min,
  max,
  step,
  digits = 2,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  digits?: number
  suffix?: string
  onChange: (value: number) => void
}) => (
  <View style={styles.param}>
    <View style={styles.paramHead}>
      <Text style={styles.paramLabel}>{label}</Text>
      <Text style={styles.paramValue}>{fmt(value, digits)}{suffix ?? ''}</Text>
    </View>
    <Slider
      value={value}
      minimumValue={min}
      maximumValue={max}
      step={step}
      onValueChange={onChange}
    />
  </View>
))

const ToggleRow = memo(({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (value: boolean) => void
}) => (
  <View style={styles.toggleRow}>
    <View style={styles.toggleText}>
      <Text style={styles.paramLabel}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ false: 'rgba(255,255,255,0.18)', true: '#FFFFFF' }}
      thumbColor="#111114"
    />
  </View>
))

const Segment = memo(({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
}) => (
  <View style={styles.segmentRow}>
    <Text style={styles.paramLabel}>{label}</Text>
    <View style={styles.segment}>
      {options.map(option => {
        const selected = option.value === value
        return (
          <Pressable
            key={option.value}
            style={[styles.segmentItem, selected && styles.segmentItemActive]}
            onPress={() => { onChange(option.value) }}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  </View>
))

const ColorRow = memo(({
  label,
  value,
  presets,
  onChange,
}: {
  label: string
  value: string
  presets: string[]
  onChange: (value: string) => void
}) => (
  <View style={styles.colorRow}>
    <Text style={styles.paramLabel}>{label}</Text>
    <View style={styles.swatches}>
      {presets.map(color => {
        const selected = color.toLowerCase() === value.toLowerCase()
        return (
          <Pressable
            key={color}
            onPress={() => { onChange(color) }}
            style={[
              styles.swatch,
              { backgroundColor: color },
              selected && styles.swatchSelected,
            ]}
          />
        )
      })}
    </View>
  </View>
))

const Section = memo(({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    <View style={styles.card}>{children}</View>
  </View>
))

/** The preview uses the same native composite and gestures as the actual bar. */
const Preview = memo(({ target, params, onChange }: { target: GlassTarget, params: GlassTabsParams, onChange: (next: GlassTabsParams) => void }) => {
  const theme = useTheme()
  const items = PREVIEW_TABS.map((icon, index) => ({ id: icon, icon, label: '标签 ' + (index + 1) }))
  return (
    <View style={styles.previewWrap}>
      <View style={styles.previewHead}>
        <Text style={styles.previewTitle}>控件示例</Text>
        <Text style={styles.previewHint}>{target === 'tabs' ? '按住或拖动选中胶囊' : '调整参数，实时查看效果'}</Text>
      </View>
      <LiquidTabsBackdrop style={styles.previewStage}>
        {params.previewBackground === 'aurora' ? <>
          <View style={[styles.previewBlob, styles.blobPurple]} />
          <View style={[styles.previewBlob, styles.blobCyan]} />
          <View style={[styles.previewBlob, styles.blobOrange]} />
        </> : null}
        {params.previewBackground === 'wallpaper' ? <>
          <View style={[styles.previewBlob, styles.blobWallpaperA]} />
          <View style={[styles.previewBlob, styles.blobWallpaperB]} />
        </> : null}
        {params.previewBackground === 'checker' ? <View style={styles.checker}>
          {Array.from({ length: 72 }, (_, index) => <View key={index} style={[styles.checkerCell, { backgroundColor: (Math.floor(index / 12) + index % 12) % 2 ? '#394355' : '#CAD2DF' }]} />)}
        </View> : null}
        {params.previewBackground === 'solid' ? <View style={styles.previewSolid} /> : null}
        {target === 'tabs' ? <LiquidTabs
          style={styles.previewBar}
          items={items}
          params={params}
          dark={theme.isDark}
          selectedIndex={params.tabsSelectedIndex}
          onSelect={index => { onChange({ ...params, tabsSelectedIndex: index }) }}
        /> : target === 'miniPlayer' ? (
          <GlassOverlay style={styles.miniPreview}>
            <GlassSurface pointerEvents="none" style={StyleSheet.absoluteFill} {...glassSurfaceParams(params, 999)} />
            <View style={styles.previewCover}><Icon name="album" rawSize={24} color="#FFFFFF" /></View>
            <View style={styles.previewSong}>
              <Text style={styles.previewSongTitle}>歌曲预览</Text>
              <Text style={styles.previewSongArtist}>mini 播放器</Text>
            </View>
            <Icon name="play" rawSize={24} color="#FFFFFF" />
            <Icon name="nextMusic" rawSize={24} color="#FFFFFF" />
            <Icon name="list-loop" rawSize={22} color="#FFFFFF" />
          </GlassOverlay>
        ) : (
          <View style={styles.buttonsPreview}>
            {(target === 'header' ? ['chevron-left', 'dots-vertical'] : target === 'modeFavorite' ? ['list-loop', 'love'] : ['prevMusic', 'nextMusic']).map((icon, index) => (
              <GlassIconButton
                key={icon}
                icon={icon}
                glassParams={params}
                circleSize={target === 'skip' ? 36 : 44}
                hitSize={target === 'skip' ? 40 : 48}
                size={target === 'skip' ? 20 : 24}
                accessibilityLabel={`${GLASS_TARGETS.find(item => item.id === target)?.label} 预览 ${index + 1}`}
              />
            ))}
          </View>
        )}
      </LiquidTabsBackdrop>
    </View>
  )
})

const GlassTabBarSettings = ({
  target,
  onTargetChange,
  params,
  onChange,
  onApplyToTargets,
  onClose,
  onReset,
}: Props) => {
  const [applyOpen, setApplyOpen] = useState(false)
  const [applyTargets, setApplyTargets] = useState<GlassTarget[]>([])
  const update = <K extends keyof GlassTabsParams>(key: K, value: GlassTabsParams[K]) => {
    onChange({ ...params, [key]: value })
  }

  return (
      <View style={styles.root}>
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="返回" style={styles.backButton} onPress={onClose}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <View style={styles.heading}>
              <Text style={styles.title}>液态玻璃设置</Text>
              <Text style={styles.subtitle}>独立设置 · 实时预览 · 自动保存</Text>
            </View>
          </View>

          <View style={styles.targetPicker}>
            {GLASS_TARGETS.map(item => (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: target === item.id }}
                onPress={() => {
                  setApplyOpen(false)
                  setApplyTargets([])
                  onTargetChange(item.id)
                }}
                style={[styles.targetItem, target === item.id && styles.targetItemActive]}
              >
                <Text style={[styles.targetText, target === item.id && styles.targetTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.previewFixed}>
            <Preview target={target} params={params} onChange={onChange} />
          </View>

          <ScrollView
            key={target}
            style={styles.scroll}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <Section title={GLASS_TARGETS.find(item => item.id === target)?.label ?? '液态玻璃'}>
              {target === 'tabs' ? <><ParamSlider
                label="选中索引"
                value={params.tabsSelectedIndex}
                min={0}
                max={PREVIEW_TABS.length - 1}
                step={1}
                digits={0}
                onChange={value => { update('tabsSelectedIndex', Math.round(value)) }}
              />
              <ColorRow
                label="强调色"
                value={params.tabsAccentColor}
                presets={ACCENT_PRESETS}
                onChange={value => { update('tabsAccentColor', value) }}
              />
              </> : null}
              <ColorRow
                label="容器色"
                value={params.containerColor}
                presets={CONTAINER_PRESETS}
                onChange={value => { update('containerColor', value) }}
              />
              <ParamSlider
                label="容器透明度"
                value={params.containerAlpha}
                min={0}
                max={1}
                step={0.005}
                digits={3}
                onChange={value => { update('containerAlpha', value) }}
              />
            </Section>

            <Section title="形状">
              <Segment
                label="形状"
                value={params.shape}
                options={[
                  { value: 'capsule', label: '胶囊' },
                  { value: 'rounded', label: '圆角' },
                ]}
                onChange={value => { update('shape', value as GlassTabsParams['shape']) }}
              />
              {params.shape === 'rounded' ? (
                <ParamSlider
                  label="圆角半径"
                  value={params.cornerRadius}
                  min={0}
                  max={80}
                  step={1}
                  digits={0}
                  suffix=" dp"
                  onChange={value => { update('cornerRadius', value) }}
                />
              ) : null}
            </Section>

            <Section title="效果">
              <ToggleRow
                label="鲜艳度 Vibrancy"
                value={params.vibrancy}
                onChange={value => { update('vibrancy', value) }}
              />
              <ToggleRow
                label="颜色控制"
                value={params.colorControlsEnabled}
                onChange={value => { update('colorControlsEnabled', value) }}
              />
              {params.colorControlsEnabled ? (
                <>
                  <ParamSlider
                    label="亮度"
                    value={params.brightness}
                    min={-1}
                    max={1}
                    step={0.005}
                    digits={3}
                    onChange={value => { update('brightness', value) }}
                  />
                  <ParamSlider
                    label="对比度"
                    value={params.contrast}
                    min={0}
                    max={2}
                    step={0.005}
                    digits={3}
                    onChange={value => { update('contrast', value) }}
                  />
                  <ParamSlider
                    label="饱和度"
                    value={params.saturation}
                    min={0}
                    max={3}
                    step={0.005}
                    digits={3}
                    onChange={value => { update('saturation', value) }}
                  />
                </>
              ) : null}
              <ToggleRow
                label="模糊"
                value={params.blurEnabled}
                onChange={value => { update('blurEnabled', value) }}
              />
              {params.blurEnabled ? (
                <>
                  <ParamSlider
                    label="模糊半径"
                    value={params.blurRadius}
                    min={0}
                    max={48}
                    step={0.1}
                    suffix=" dp"
                    onChange={value => { update('blurRadius', value) }}
                  />
                  <Segment
                    label="平铺模式"
                    value={params.blurTileMode}
                    options={[
                      { value: 'clamp', label: '裁切' },
                      { value: 'decal', label: '贴片' },
                      { value: 'repeat', label: '重复' },
                      { value: 'mirror', label: '镜像' },
                    ]}
                    onChange={value => {
                      update('blurTileMode', value as GlassTabsParams['blurTileMode'])
                    }}
                  />
                </>
              ) : null}
              <ParamSlider
                label="折射高度"
                value={params.refractionHeight}
                min={0}
                max={48}
                step={0.1}
                suffix=" dp"
                onChange={value => { update('refractionHeight', value) }}
              />
              <ParamSlider
                label="折射强度"
                value={params.refractionAmount}
                min={0}
                max={64}
                step={0.1}
                suffix=" dp"
                onChange={value => { update('refractionAmount', value) }}
              />
              <ToggleRow
                label="深度效果"
                value={params.depthEffect}
                onChange={value => { update('depthEffect', value) }}
              />
              <ToggleRow
                label="色散"
                value={params.chromaticAberration}
                onChange={value => { update('chromaticAberration', value) }}
              />
              <ParamSlider
                label="不透明度"
                value={params.opacity}
                min={0}
                max={1}
                step={0.005}
                digits={3}
                onChange={value => { update('opacity', value) }}
              />
            </Section>

            <Section title="高光">
              <ToggleRow
                label="启用"
                value={params.highlightEnabled}
                onChange={value => { update('highlightEnabled', value) }}
              />
              {params.highlightEnabled ? (
                <>
                  <Segment
                    label="类型"
                    value={params.highlightKind}
                    options={[
                      { value: 'default', label: '默认' },
                      { value: 'ambient', label: '环境' },
                      { value: 'plain', label: '纯色' },
                    ]}
                    onChange={value => {
                      update('highlightKind', value as GlassTabsParams['highlightKind'])
                    }}
                  />
                  {params.highlightKind !== 'ambient' ? (
                    <ColorRow
                      label="颜色"
                      value={params.highlightColor}
                      presets={['#FFFFFF', '#0A84FF', '#FFD60A', '#FF375F']}
                      onChange={value => { update('highlightColor', value) }}
                    />
                  ) : null}
                  <ParamSlider
                    label="宽度"
                    value={params.highlightWidth}
                    min={0}
                    max={4}
                    step={0.05}
                    suffix=" dp"
                    onChange={value => { update('highlightWidth', value) }}
                  />
                  <ParamSlider
                    label="模糊半径"
                    value={params.highlightBlur}
                    min={0}
                    max={8}
                    step={0.05}
                    suffix=" dp"
                    onChange={value => { update('highlightBlur', value) }}
                  />
                  <ParamSlider
                    label="透明度"
                    value={params.highlightAlpha}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={value => { update('highlightAlpha', value) }}
                  />
                  {params.highlightKind === 'default' ? (
                    <>
                      <ParamSlider
                        label="角度"
                        value={params.highlightAngle}
                        min={0}
                        max={360}
                        step={1}
                        digits={0}
                        suffix="°"
                        onChange={value => { update('highlightAngle', value) }}
                      />
                      <ParamSlider
                        label="衰减"
                        value={params.highlightFalloff}
                        min={0}
                        max={4}
                        step={0.05}
                        onChange={value => { update('highlightFalloff', value) }}
                      />
                    </>
                  ) : null}
                  {params.highlightKind === 'ambient' ? (
                    <ParamSlider
                      label="强度"
                      value={params.highlightIntensity}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={value => { update('highlightIntensity', value) }}
                    />
                  ) : null}
                </>
              ) : null}
            </Section>

            <Section title="外阴影">
              <ToggleRow
                label="启用"
                value={params.shadowEnabled}
                onChange={value => { update('shadowEnabled', value) }}
              />
              {params.shadowEnabled ? (
                <>
                  <ParamSlider
                    label="半径"
                    value={params.shadowRadius}
                    min={0}
                    max={64}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('shadowRadius', value) }}
                  />
                  <ParamSlider
                    label="X 偏移"
                    value={params.shadowOffsetX}
                    min={-32}
                    max={32}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('shadowOffsetX', value) }}
                  />
                  <ParamSlider
                    label="Y 偏移"
                    value={params.shadowOffsetY}
                    min={-32}
                    max={32}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('shadowOffsetY', value) }}
                  />
                  <ParamSlider
                    label="透明度"
                    value={params.shadowAlpha}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={value => { update('shadowAlpha', value) }}
                  />
                  <ColorRow
                    label="颜色"
                    value={params.shadowColor}
                    presets={SHADOW_PRESETS}
                    onChange={value => { update('shadowColor', value) }}
                  />
                  <Segment
                    label="混合模式"
                    value={params.shadowBlendMode}
                    options={[
                      { value: 'normal', label: '正常' },
                      { value: 'plus', label: '叠加' },
                      { value: 'screen', label: '滤色' },
                      { value: 'multiply', label: '正片叠底' },
                    ]}
                    onChange={value => {
                      update('shadowBlendMode', value as GlassTabsParams['shadowBlendMode'])
                    }}
                  />
                </>
              ) : null}
            </Section>

            <Section title="内阴影">
              <ToggleRow
                label="启用"
                value={params.innerShadowEnabled}
                onChange={value => { update('innerShadowEnabled', value) }}
              />
              {params.innerShadowEnabled ? (
                <>
                  <ParamSlider
                    label="半径"
                    value={params.innerShadowRadius}
                    min={0}
                    max={64}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('innerShadowRadius', value) }}
                  />
                  <ParamSlider
                    label="X 偏移"
                    value={params.innerShadowOffsetX}
                    min={-32}
                    max={32}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('innerShadowOffsetX', value) }}
                  />
                  <ParamSlider
                    label="Y 偏移"
                    value={params.innerShadowOffsetY}
                    min={-32}
                    max={32}
                    step={0.5}
                    suffix=" dp"
                    onChange={value => { update('innerShadowOffsetY', value) }}
                  />
                  <ParamSlider
                    label="透明度"
                    value={params.innerShadowAlpha}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={value => { update('innerShadowAlpha', value) }}
                  />
                  <ColorRow
                    label="颜色"
                    value={params.innerShadowColor}
                    presets={SHADOW_PRESETS}
                    onChange={value => { update('innerShadowColor', value) }}
                  />
                  <Segment
                    label="混合模式"
                    value={params.innerShadowBlendMode}
                    options={[
                      { value: 'normal', label: '正常' },
                      { value: 'plus', label: '叠加' },
                      { value: 'screen', label: '滤色' },
                      { value: 'multiply', label: '正片叠底' },
                    ]}
                    onChange={value => {
                      update(
                        'innerShadowBlendMode',
                        value as GlassTabsParams['innerShadowBlendMode'],
                      )
                    }}
                  />
                </>
              ) : null}
            </Section>

            <Section title="预览背景">
              <Segment
                label="背景"
                value={params.previewBackground}
                options={[
                  { value: 'wallpaper', label: '壁纸' },
                  { value: 'aurora', label: '极光' },
                  { value: 'checker', label: '棋盘' },
                  { value: 'solid', label: '纯色' },
                ]}
                onChange={value => {
                  update('previewBackground', value as GlassTabsParams['previewBackground'])
                }}
              />
            </Section>

            <View style={styles.footer}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: applyOpen }}
                style={styles.applyButton}
                onPress={() => {
                  setApplyOpen(open => !open)
                  setApplyTargets([])
                }}
              >
                <Text style={styles.applyButtonText}>把该设置应用到其他控件</Text>
                <Icon name={applyOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#FFFFFF" />
              </Pressable>
              {applyOpen ? (
                <View style={styles.applyPicker}>
                  {GLASS_TARGETS.filter(item => item.id !== target).map(item => {
                    const selected = applyTargets.includes(item.id)
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                        style={styles.applyTargetRow}
                        onPress={() => {
                          setApplyTargets(current => selected
                            ? current.filter(id => id !== item.id)
                            : [...current, item.id])
                        }}
                      >
                        <Icon name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={selected ? '#FFFFFF' : 'rgba(255,255,255,0.55)'} />
                        <Text style={styles.applyTargetText}>{item.label}</Text>
                      </Pressable>
                    )
                  })}
                  <Pressable
                    accessibilityRole="button"
                    disabled={applyTargets.length === 0}
                    style={[styles.applyConfirm, applyTargets.length === 0 && styles.applyConfirmDisabled]}
                    onPress={() => {
                      onApplyToTargets(applyTargets)
                      setApplyTargets([])
                      setApplyOpen(false)
                    }}
                  >
                    <Text style={styles.applyConfirmText}>应用设置</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable style={styles.resetButton} onPress={onReset}>
                <Text style={styles.resetText}>恢复当前控件默认预设</Text>
              </Pressable>
              <Text style={styles.footerHint}>双击底栏最后一个 tab 可再次打开</Text>
            </View>
          </ScrollView>
      </View>
  )
}

const styles = StyleSheet.create({
  applyButton: { minHeight: 48, alignSelf: 'stretch', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)' },
  applyButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  applyPicker: { alignSelf: 'stretch', marginTop: 8, padding: 12, borderRadius: 12, backgroundColor: '#1E1E22' },
  applyTargetRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  applyTargetText: { color: '#F2F2F7', fontSize: 14 },
  applyConfirm: { minHeight: 44, marginTop: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#FFFFFF' },
  applyConfirmDisabled: { opacity: 0.4 },
  applyConfirmText: { color: '#151518', fontSize: 14, fontWeight: '600' },
  targetPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  targetItem: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: '#29292E' },
  targetItemActive: { backgroundColor: '#FFFFFF' },
  targetText: { fontSize: 12, color: '#D6D6DB' },
  targetTextActive: { color: '#151518', fontWeight: '600' },
  buttonsPreview: { position: 'absolute', left: 12, right: 12, top: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
  miniPreview: { position: 'absolute', left: 12, right: 12, top: 44, height: 56, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewCover: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78657B' },
  previewSong: { flex: 1 },
  previewSongTitle: { color: '#FFFFFF', fontSize: 13 },
  previewSongArtist: { color: '#C7C7CC', fontSize: 10, marginTop: 3 },
  root: {
    flex: 1,
    backgroundColor: '#151518',
  },
  heading: { flex: 1 },
  backButton: { width: 40, height: 48, justifyContent: 'center' },
  backText: { color: '#FFFFFF', fontSize: 36, lineHeight: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 3,
  },
  scroll: {
    flex: 1,
  },
  previewFixed: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionSubtitle: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    marginTop: -5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1E1E22',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  param: {
    paddingVertical: 4,
  },
  paramHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  paramLabel: {
    color: '#F2F2F7',
    fontSize: 14,
  },
  paramValue: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 12,
  },
  toggleText: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    padding: 2,
  },
  segmentItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  segmentItemActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#111114',
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  swatches: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  previewWrap: {
    marginBottom: 12,
  },
  previewHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
    marginLeft: 4,
    marginRight: 4,
  },
  previewTitle: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  previewHint: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
  },
  previewStage: {
    height: 144,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0B0B0E',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobPurple: {
    width: 150,
    height: 150,
    top: -34,
    left: -24,
    backgroundColor: '#7C4DFF',
    opacity: 0.6,
  },
  blobCyan: {
    width: 170,
    height: 170,
    top: 4,
    right: -42,
    backgroundColor: '#00D4FF',
    opacity: 0.42,
  },
  blobOrange: {
    width: 160,
    height: 160,
    bottom: -58,
    left: 72,
    backgroundColor: '#FF8A00',
    opacity: 0.42,
  },
  blobWallpaperA: {
    width: 240,
    height: 240,
    top: -80,
    left: -40,
    backgroundColor: '#3A4C6B',
    opacity: 0.85,
  },
  blobWallpaperB: {
    width: 220,
    height: 220,
    bottom: -90,
    right: -30,
    backgroundColor: '#7C5C46',
    opacity: 0.75,
  },
  previewSolid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1A1A1F',
  },
  previewFrost: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  checker: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkerCell: {
    width: '8.3333%',
    height: '16.6666%',
  },
  previewBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 40,
    height: 64,
  },
  previewGlass: {
    ...StyleSheet.absoluteFillObject,
  },
  previewRefraction: {
    ...StyleSheet.absoluteFillObject,
  },
  previewInnerShadow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  previewPill: {
    position: 'absolute',
    top: 4,
    height: 56,
    borderRadius: 28,
  },
  previewRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewItem: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  resetButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  resetText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  footerHint: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 10,
  },
})

export default memo(GlassTabBarSettings)
