import { updateSetting } from '@/core/common'
import { setDesktopLyricColor } from '@/core/desktopLyric'
import { useI18n } from '@/lang'
import { memo } from 'react'
import { StyleSheet, View, TouchableOpacity } from 'react-native'

import SubTitle from '../../components/SubTitle'

const appearancePresets = [
  ['#08e664', 'rgba(0,0,0,0.6)'],
  ['#fffa12', 'rgba(0,0,0,0.6)'],
  ['#019ce4', 'rgba(0,0,0,0.6)'],
  ['#ff1222', 'rgba(0,0,0,0.6)'],
  ['#ef6976', 'rgba(0,0,0,0.6)'],
  ['#c851d4', 'rgba(0,0,0,0.6)'],
  ['#ffa600', 'rgba(0,0,0,0.6)'],
  ['#000000', '#ffffff'],
  ['#ffffff', 'rgba(0,0,0,0.6)'],
] as const
type AppearancePreset = (typeof appearancePresets)[number]

const AppearancePresetItem = ({ color, change }: { color: AppearancePreset; change: (color: AppearancePreset) => void }) => {
  return (
    <TouchableOpacity
      style={styles.item}
      activeOpacity={0.5}
      onPress={() => {
        change(color)
      }}
    >
      <View style={styles.colorContent}>
        <View style={{ ...styles.image, backgroundColor: color[0] }}></View>
      </View>
    </TouchableOpacity>
  )
}

export default memo(() => {
  const t = useI18n()

  const setLyricAppearance = (color: AppearancePreset) => {
    // const shadowColor = 'rgba(0,0,0,0.6)'
    void setDesktopLyricColor(null, color[0], color[1]).then(() => {
      updateSetting({
        'desktopLyric.style.lyricPlayedColor': color[0],
        'desktopLyric.style.lyricShadowColor': color[1],
      })
    })
  }

  return (
    <SubTitle title={t('setting_lyric_desktop_appearance')}>
      <View style={styles.list}>
        {appearancePresets.map((c, i) => (
          <AppearancePresetItem key={i.toString()} color={c} change={setLyricAppearance} />
        ))}
      </View>
    </SubTitle>
  )
})

const styles = StyleSheet.create({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  item: {
    marginRight: 15,
    marginTop: 5,
    alignItems: 'center',
    width: 26,
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  colorContent: {
    width: 26,
    height: 26,
    borderRadius: 4,
    // borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: 20,
    height: 20,
    borderRadius: 4,
    elevation: 1,
  },
})
