import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'
import { createStyle } from '@/utils/tools'
import { isBiliLoggedIn } from '@/core/bilibili/auth'
import Login from './Login'
import UserPanel from './UserPanel'

/**
 * Bilibili 页：未登录时先展示登录页，登录后展示账号页。
 * 登录状态直接由设置项 common.bili_cookie 推导，登录/退出后会自动切换。
 */
export default memo(() => {
  const cookie = useSettingValue('common.bili_cookie')

  return <View style={styles.container}>{isBiliLoggedIn(cookie) ? <UserPanel /> : <Login />}</View>
})

const styles = createStyle({
  container: {
    flex: 1,
  },
})
