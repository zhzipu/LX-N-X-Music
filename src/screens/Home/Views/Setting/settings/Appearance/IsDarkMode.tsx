import { memo } from 'react'
import { View } from 'react-native'

import CheckBoxItem from '../../components/CheckBoxItem'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import { updateSetting } from '@/core/common'
import { useSettingValue } from '@/store/setting/hook'
import { useTheme } from '@/store/theme/hook'
import { getTheme } from '@/theme/themes'
import { applyTheme } from '@/core/theme'

export default memo(() => {
  const t = useI18n()
  const isAutoAppearance = useSettingValue('common.isAutoTheme')
  const theme = useTheme()
  const setIsDarkMode = (isDarkMode: boolean) => {
    // 明暗与配色是两件事：这里只改明暗，13 套配色方案会自动换成对应的亮/暗调色板
    updateSetting({ 'theme.darkMode': isDarkMode })
    void getTheme().then(applyTheme)
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        // 跟随系统时明暗由系统决定，这个开关不生效
        disabled={isAutoAppearance}
        check={theme.isDark}
        label={t('setting_basic_appearance_dark_mode')}
        onChange={setIsDarkMode}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
    // marginBottom: 5,
  },
})
