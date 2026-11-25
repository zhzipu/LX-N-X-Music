import { memo } from 'react'
import { View } from 'react-native'

import InputItem, { type InputItemProps } from '../../components/InputItem'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'

/**
 * 歌词翻译用的百度翻译开放平台凭据。
 *
 * 「自动识别」出来的歌词不是中文时，会用「大模型翻译」翻成中文，
 * 只在用户开着「显示歌词翻译」时才会调用。接口要两个东西：控制台里的 APPID（17 位数字，
 * 放在请求体里）+ 密钥（老控制台，走 MD5 签名）或 API KEY（新版控制台，走 Bearer 头）。
 */
export default memo(() => {
  const appId = useSettingValue('common.translateAppId')
  const apiKey = useSettingValue('common.translateApiKey')

  const handleChangedAppId: InputItemProps['onChanged'] = (text, callback) => {
    callback(text)
    updateSetting({ 'common.translateAppId': text.trim() })
  }
  const handleChangedKey: InputItemProps['onChanged'] = (text, callback) => {
    callback(text)
    updateSetting({ 'common.translateApiKey': text.trim() })
  }

  return (
    <View style={styles.content}>
      <InputItem
        value={appId}
        label="歌词翻译 APPID"
        onChanged={handleChangedAppId}
        placeholder="百度翻译开放平台「开发者信息」里的 APPID（17 位数字），必填"
      />
      <InputItem
        value={apiKey}
        label="歌词翻译密钥 / API KEY"
        onChanged={handleChangedKey}
        placeholder="同一个页面的「密钥」，或控制台创建的 API KEY，用于把非中文歌词翻成中文"
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    // 和上面的输入项保持同样的间距
  },
})
