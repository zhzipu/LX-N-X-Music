import { useState } from 'react'
import { TouchableOpacity } from 'react-native'

import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { useI18n } from '@/lang'
import Panel from './Panel'

/** 搜索页头部的「听歌识曲」入口，点击展开识别面板 */
export default () => {
  const t = useI18n()
  const theme = useTheme()
  const [visible, setVisible] = useState(false)

  return (
    <>
      <TouchableOpacity
        style={styles.btn}
        accessibilityLabel={t('music_recognition')}
        onPress={() => setVisible(true)}
      >
        <SvgIcon name="recognize" size={19} color={theme['c-font']} />
      </TouchableOpacity>
      {visible ? <Panel onClose={() => setVisible(false)} /> : null}
    </>
  )
}

const styles = createStyle({
  btn: {
    flexGrow: 0,
    flexShrink: 0,
    width: 30,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
