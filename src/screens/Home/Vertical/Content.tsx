import { useEffect, useRef } from 'react'
import type { GestureResponderEvent } from 'react-native'
// import { getWindowSise, onDimensionChange } from '@/utils/tools'
import DrawerNav from './DrawerNav'
import Header from './Header'
import Main from './Main'
import { useSettingValue } from '@/store/setting/hook'
import { COMPONENT_IDS } from '@/config/constant'
import DrawerLayoutFixed, {
  type DrawerLayoutFixedType,
} from '@/components/common/DrawerLayoutFixed'
import { scaleSizeW } from '@/utils/pixelRatio'

const MAX_WIDTH = scaleSizeW(300)

interface ContentProps {
  onTouchStartCapture?: (event: GestureResponderEvent) => void
  onTouchMoveCapture?: (event: GestureResponderEvent) => void
  onTouchEndCapture?: (event: GestureResponderEvent) => void
  onTouchCancelCapture?: (event: GestureResponderEvent) => void
}

const Content = ({
  onTouchStartCapture,
  onTouchMoveCapture,
  onTouchEndCapture,
  onTouchCancelCapture,
}: ContentProps) => {
  const drawer = useRef<DrawerLayoutFixedType>(null)
  const drawerLayoutPosition = useSettingValue('common.drawerLayoutPosition')

  useEffect(() => {
    const changeVisible = (visible: boolean) => {
      if (visible) {
        drawer.current?.openDrawer()
      } else {
        drawer.current?.closeDrawer()
      }
    }

    global.app_event.on('changeMenuVisible', changeVisible)

    return () => {
      global.app_event.off('changeMenuVisible', changeVisible)
    }
  }, [])

  const navigationView = () => <DrawerNav />
  // console.log('render drawer content')

  return (
    <DrawerLayoutFixed
      ref={drawer}
      widthPercentage={0.7}
      widthPercentageMax={MAX_WIDTH}
      visibleNavNames={[COMPONENT_IDS.home]}
      // drawerWidth={width}
      drawerPosition={drawerLayoutPosition}
      renderNavigationView={navigationView}
      // 把抽屉的真实开合状态广播出去：点遮罩 / 侧滑关闭时不会走 changeMenuVisible，
      // 这里补上，底部浮层才能可靠地隐藏/恢复（Home/Vertical 订阅这个事件）。
      onDrawerOpen={() => global.app_event.changeMenuVisible(true)}
      onDrawerClose={() => global.app_event.changeMenuVisible(false)}
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
      onTouchCancelCapture={onTouchCancelCapture}
    >
      <Header />
      <Main />
      {/* <View style={styles.container}>
      </View> */}
    </DrawerLayoutFixed>
  )
}

// const styles = createStyle({
//   container: {
//     flex: 1,
//   },
// })

export default Content
