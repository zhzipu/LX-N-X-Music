import { memo } from 'react'
import { View } from 'react-native'

import CheckBoxItem from '../../components/CheckBoxItem'
import { createStyle, getIsSupportedAutoTheme } from '@/utils/tools'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { useSettingValue } from '@/store/setting/hook'
import { getTheme } from '@/theme/themes'
import { applyTheme } from '@/core/theme'
import themeState from '@/store/theme/state'

const isSupportedAutoTheme = getIsSupportedAutoTheme()

export default memo(() => {
  const t = useI18n()
  const isAutoAppearance = useSettingValue('common.isAutoTheme')
  const setIsAutoAppearance = (isAutoAppearance: boolean) => {
    updateSetting({
      // 关闭「跟随系统」时把手动明暗固定成当前实际生效的明暗，避免外观突然反转
      ...(isAutoAppearance ? {} : { 'theme.darkMode': themeState.theme.isDark }),
      'common.isAutoTheme': isAutoAppearance,
    })
    void getTheme().then(applyTheme)
  }

  return isSupportedAutoTheme ? (
    <View style={styles.content}>
      <CheckBoxItem
        check={isAutoAppearance}
        label={t('setting_basic_appearance_auto_theme')}
        onChange={setIsAutoAppearance}
      />
    </View>
  ) : null
})

const styles = createStyle({
  content: {
    marginTop: 5,
    // marginBottom: 5,
  },
})
