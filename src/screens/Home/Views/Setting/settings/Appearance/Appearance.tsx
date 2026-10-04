import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { View, TouchableOpacity, type ImageSourcePropType } from 'react-native'
import { setTheme } from '@/core/theme'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'

import SubTitle from '../../components/SubTitle'
import {
  BG_IMAGES,
  getAllThemes,
  THEME_SCHEME_IDS,
  type LocalTheme,
} from '@/theme/themes'
import Text from '@/components/common/Text'
import { createStyle } from '@/utils/tools'
import { scaleSizeH } from '@/utils/pixelRatio'
import { Icon } from '@/components/common/Icon'
import ImageBackground from '@/components/common/ImageBackground'

const AppearanceItem = ({
  id,
  name,
  color,
  image,
  setTheme,
  showAll,
}: {
  id: string
  name: string
  color: string
  showAll: boolean
  image?: ImageSourcePropType
  setTheme: (id: string) => void
}) => {
  const theme = useTheme()
  // 高亮「实际生效」的主题。跟随系统时可能与点选的那一项不同
  //（例如暗色模式下点浅色主题，实际生效的是同方案的深色变体）
  const isActive = theme.id == id

  return showAll || isActive ? (
    <TouchableOpacity
      style={{ ...styles.item, width: scaleSizeH(ITEM_HEIGHT) }}
      activeOpacity={0.5}
      onPress={() => {
        setTheme(id)
      }}
    >
      <View
        style={{
          ...styles.colorContent,
          width: scaleSizeH(COLOR_ITEM_HEIGHT),
          borderColor: isActive ? color : 'transparent',
        }}
      >
        {image ? (
          <ImageBackground
            style={{
              ...styles.imageContent,
              width: scaleSizeH(IMAGE_HEIGHT),
              backgroundColor: color,
            }}
            imageStyle={{ borderRadius: 4 }}
            source={image}
          />
        ) : (
          <View
            style={{
              ...styles.imageContent,
              width: scaleSizeH(IMAGE_HEIGHT),
              backgroundColor: color,
            }}
          ></View>
        )}
      </View>
      <Text
        style={styles.name}
        size={12}
        color={isActive ? color : theme['c-font']}
        numberOfLines={1}
      >
        {name}
      </Text>
    </TouchableOpacity>
  ) : null
}

const MoreBtn = ({
  showAll,
  setShowAll,
}: {
  showAll: boolean
  setShowAll: (showAll: boolean) => void
}) => {
  const theme = useTheme()
  const t = useI18n()

  return showAll ? null : (
    <TouchableOpacity
      style={styles.moreBtn}
      activeOpacity={0.5}
      onPress={() => {
        setShowAll(!showAll)
      }}
    >
      <Text size={14} color={theme['c-primary-font']} numberOfLines={1}>
        {t('setting_basic_appearance_more_btn_show')}
      </Text>
      <Icon name="chevron-right" size={12} color={theme['c-primary-font']} />
    </TouchableOpacity>
  )
}

interface AppearanceInfo {
  themes: Readonly<LocalTheme[]>
  userThemes: LX.Theme[]
  dataPath: string
}
const initInfo: AppearanceInfo = { themes: [], userThemes: [], dataPath: '' }

interface SchemeItem {
  id: string
  name: string
  color: string
  image?: ImageSourcePropType
}

export default memo(() => {
  const [showAll, setShowAll] = useState(false)
  const t = useI18n()
  const theme = useTheme()
  const [appearanceInfo, setAppearanceInfo] = useState(initInfo)
  const setThemeId = useCallback((id: string) => {
    requestAnimationFrame(() => {
      setTheme(id)
    })
  }, [])

  useEffect(() => {
    void getAllThemes().then(setAppearanceInfo)
  }, [])

  // 13 套配色方案。themes.ts 里每套方案有亮/暗两个调色板变体，
  // 这里按方案收敛成一项，色块取当前明暗对应的那个变体。
  const schemeItems = useMemo(() => {
    const variantMap = new Map(appearanceInfo.themes.map((item) => [item.id, item]))
    const suffix = theme.isDark ? 'dark' : 'light'
    const items: SchemeItem[] = []
    for (const schemeId of THEME_SCHEME_IDS) {
      const variant = variantMap.get(`${schemeId}_${suffix}`)
      if (!variant) continue
      const bgImage = variant.config.extInfo['bg-image']
      items.push({
        id: schemeId,
        name: t(`theme_${schemeId}`),
        color: variant.config.themeColors['c-theme'],
        image: bgImage ? BG_IMAGES[bgImage] : undefined,
      })
    }
    return items
  }, [appearanceInfo.themes, theme.isDark, t])

  return (
    <SubTitle title={t('setting_basic_appearance')}>
      <View style={styles.list}>
        {schemeItems.map(({ id, name, color, image }) => {
          return (
            <AppearanceItem
              key={id}
              color={color}
              image={image}
              showAll={showAll}
              id={id}
              name={name}
              setTheme={setThemeId}
            />
          )
        })}
        {appearanceInfo.userThemes.map(({ id, name, config }) => {
          return (
            <AppearanceItem
              key={id}
              color={config.themeColors['c-theme']}
              // image={undefined}
              showAll={showAll}
              id={id}
              name={name}
              setTheme={setThemeId}
            />
          )
        })}
        <MoreBtn showAll={showAll} setShowAll={setShowAll} />
      </View>
    </SubTitle>
  )
})

const ITEM_HEIGHT = 62
const COLOR_ITEM_HEIGHT = 36
const IMAGE_HEIGHT = 29
const styles = createStyle({
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 5,
  },
  item: {
    // marginRight: 15,
    alignItems: 'center',
    // marginTop: 5,
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  colorContent: {
    height: COLOR_ITEM_HEIGHT,
    borderRadius: 4,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
    // backgroundColor: 'rgba(0,0,0,0.2)',
  },
  imageContent: {
    height: IMAGE_HEIGHT,
    borderRadius: 4,
    // elevation: 1,
  },
  name: {
    marginTop: 2,
  },
  moreBtn: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    // justifyContent: 'center',
    gap: 8,
  },
})
