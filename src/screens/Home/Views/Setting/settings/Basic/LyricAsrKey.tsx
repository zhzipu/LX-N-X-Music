import { memo } from 'react'
import { View } from 'react-native'

import InputItem, { type InputItemProps } from '../../components/InputItem'
import { useSettingValue } from '@/store/setting/hook'
import { updateSetting } from '@/core/common'
import { createStyle } from '@/utils/tools'

/**
 * 歌词识别（自动打轴）用的 DashScope API Key。
 *
 * 识别走阿里云百炼的 qwen-audio-3.1-asr-flash：整首歌的音频会上传过去，
 * 按 token 计费（一首歌大约几分钱），所以这里填的是用户自己的 Key。
 */
export default memo(() => {
  const apiKey = useSettingValue('common.asrApiKey')

  const handleChanged: InputItemProps['onChanged'] = (text, callback) => {
    callback(text)
    updateSetting({ 'common.asrApiKey': text.trim() })
  }

  return (
    <View style={styles.content}>
      <InputItem
        value={apiKey}
        label="歌词识别 API Key"
        onChanged={handleChanged}
        placeholder="阿里云百炼 DashScope Key（sk- 开头），用于长按歌词自动打轴"
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    // 和上面的输入项保持同样的间距
  },
})
