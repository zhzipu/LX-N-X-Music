import Text from '@/components/common/Text'
import { useI18n } from '@/lang'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'
import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'

interface BlankViewProps {
  onSearch: (keyword: string) => void
  hideWelcome?: boolean
}
type Source = LX.OnlineSource | 'all'

export interface BlankViewType {
  show: (source: Source) => void
}

export default forwardRef<BlankViewType, BlankViewProps>(({ onSearch, hideWelcome }, ref) => {
  // const [listType, setListType] = useState<SearchState['searchType']>('music')
  const [visible, setVisible] = useState(false)
  const t = useI18n()
  const theme = useTheme()
  const wyCookie = useSettingValue('common.wy_cookie')

  const handleShow = (_source: Source) => {
    // 历史搜索已改为「点搜索框时的下拉框」，页面空白区不再展示
  }

  useImperativeHandle(
    ref,
    () => ({
      show(source) {
        if (visible) handleShow(source)
        else {
          setVisible(true)
          requestAnimationFrame(() => {
            handleShow(source)
          })
        }
      },
    }),
    [visible]
  )

  if (hideWelcome) return null
  return visible ? (
    <View style={styles.welcome}>
      <Text size={22} color={theme['c-font-label']}>
        {t(wyCookie?.trim() ? 'search__welcome' : 'search__set_wy_cookie')}
      </Text>
    </View>
  ) : null
})

const styles = createStyle({
  content: {
    // paddingTop: 15,
    paddingBottom: 15,
    paddingLeft: 15,
    paddingRight: 15,
  },
  welcome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
