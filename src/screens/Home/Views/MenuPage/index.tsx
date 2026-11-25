import { memo } from 'react'
import { View } from 'react-native'
import DrawerNav from '@/screens/Home/Vertical/DrawerNav'
import { createStyle } from '@/utils/tools'

/**
 * 「菜单」页：底部 Tab 最右一格进入这里，内容就是左侧抽屉的那份列表。
 *
 * 直接复用 [DrawerNav]：抽屉和页面是同一份菜单，避免两处维护。
 * DrawerNav 里的条目本来就会 `changeMenuVisible(false)`（关抽屉），在页面里是无害的空操作。
 */
export default memo(() => {
  return (
    <View style={styles.container}>
      <DrawerNav asPage />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 1,
  },
})
