import {View, TouchableOpacity, PanResponder} from 'react-native'
// import Button from '@/components/common/Button'
// import { navigations } from '@/navigation'
// import { BorderWidths } from '@/theme'
import { useTheme } from '@/store/theme/hook'
import { useNavActiveId, useStatusbarHeight } from '@/store/common/hook'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import StatusBar from '@/components/common/StatusBar'
import { useSettingValue } from '@/store/setting/hook'
import { scaleSizeH } from '@/utils/pixelRatio'
import { HEADER_HEIGHT } from '@/config/constant'
import { type InitState as CommonState } from '@/store/common/state'
import React, {useRef} from "react";
import { MS_SIZE } from '@/theme/myspotify/tokens'
import { SP_FONT } from '@/theme/spotify/tokens'
import { useMusicDetailOpen } from '@/screens/Home/Views/Music/detailState'
import HotSettingsButton from '../Views/Hot/SettingsButton'

/** 菜单按钮的命中区域不小于 44 */
const TAP_AREA = Math.max(HEADER_HEIGHT, MS_SIZE.tapArea)
const HEADER_CONTENT_HEIGHT = Math.max(HEADER_HEIGHT, SP_FONT.pageTitle + 22)

/** 搜索类型 chip 已移到搜索页自己的头下方（跟搜索框同一列），
 *  否则会和 34pt 大标题抢宽度、把「搜索」压成省略号 */
const headerComponents: Partial<Record<CommonState['navActiveId'], React.ReactNode>> = {}

// const LeftTitle = () => {
//   const id = useNavActiveId()
//   const t = useI18n()

//   return <Text style={styles.leftTitle} size={18}>{t(id)}</Text>
// }
const LeftHeader = () => {
  const theme = useTheme()
  const id = useNavActiveId()
  const t = useI18n()
  const statusBarHeight = useStatusbarHeight()

  const isSearchPage = id === 'nav_search'
  const openMenu = () => {
    global.app_event.changeMenuVisible(true)
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // 仅在水平滑动时捕获手势
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // 向右滑动超过40像素时打开菜单
        if (gestureState.dx > 40) {
          global.app_event.changeMenuVisible(true);
        }
      },
    }),
  ).current;
  return (
    <View
      style={{
        ...styles.container,
        height: scaleSizeH(HEADER_CONTENT_HEIGHT) + statusBarHeight,
        paddingTop: statusBarHeight,
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.left}>
        {/* 左上角的侧栏入口按钮已移除：底部 Tab 最右一格就是「菜单」页，
            抽屉仍可通过左边缘右滑打开。标题也不再作为隐藏的抽屉入口。 */}
        <View style={styles.titleBtn}>
          <Text style={styles.leftTitle} size={SP_FONT.pageTitle} numberOfLines={1}>
            {t(id)}
          </Text>
        </View>
      </View>
      {id === 'nav_hot' ? <HotSettingsButton /> : null}
      {/* 非搜索页不再挂全局搜索框：搜索已独立为底部 tab，
          常驻搜索框既挤占标题宽度（导致「每日推...」截断），又与 Spotify 的顶栏结构不符 */}
      {isSearchPage ? headerComponents[id] : null}

      {/* <TouchableOpacity style={styles.btn} onPress={openSetting}>
        <Icon style={{ ...styles.btnText, color: theme['c-font'] }} name="setting" size={styles.btnText.fontSize} />
      </TouchableOpacity> */}
    </View>
  )
}

// const RightTitle = () => {
//   const id = useNavActiveId()
//   const t = useI18n()

//   return <Text style={styles.rightTitle} size={18}>{t(id)}</Text>
// }
const RightHeader = () => {
  const theme = useTheme()
  const t = useI18n()
  const id = useNavActiveId()
  const statusBarHeight = useStatusbarHeight()

  const isSearchPage = id === 'nav_search'
  const openMenu = () => {
    global.app_event.changeMenuVisible(true)
  }
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // 仅在水平滑动时捕获手势
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10;
      },
      onPanResponderRelease: (evt, gestureState) => {
        // 向左滑动超过40像素时打开菜单
        if (gestureState.dx < -40) {
          global.app_event.changeMenuVisible(true);
        }
      },
    }),
  ).current;
  return (
    <View
      style={{
        ...styles.container,
        height: scaleSizeH(HEADER_CONTENT_HEIGHT) + statusBarHeight,
        paddingTop: statusBarHeight,
      }}
      {...panResponder.panHandlers}
    >
      <View style={styles.left}>
        <TouchableOpacity style={styles.titleBtn} onPress={openMenu}>
          <Text style={styles.rightTitle} size={SP_FONT.pageTitle} numberOfLines={1}>
            {t(id)}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 非搜索页不再挂全局搜索框：搜索已独立为底部 tab，
          常驻搜索框既挤占标题宽度（导致「每日推...」截断），又与 Spotify 的顶栏结构不符 */}
      {isSearchPage ? headerComponents[id] : null}
      {id === 'nav_hot' ? <HotSettingsButton /> : null}
      <TouchableOpacity style={styles.btn} onPress={openMenu}>
        <Icon color={theme['c-font']} name="menu" size={MS_SIZE.playerBarIcon} />
      </TouchableOpacity>
      {/* <TouchableOpacity style={styles.btn} onPress={openSetting}>
        <Icon style={{ ...styles.btnText, color: theme['c-font'] }} name="setting" size={styles.btnText.fontSize} />
      </TouchableOpacity> */}
    </View>
  )
}

const Header = () => {
  const drawerLayoutPosition = useSettingValue('common.drawerLayoutPosition')
  // 歌单详情页占满整屏：隐藏这里的大标题，详情页自己有返回钮
  const detailOpen = useMusicDetailOpen()

  return (
    <>
      <StatusBar />
      {detailOpen ? null : (drawerLayoutPosition == 'left' ? <LeftHeader /> : <RightHeader />)}
    </>
  )
}

const styles = createStyle({
  container: {
    // width: '100%',
    paddingRight: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // backgroundColor: 'rgba(0,0,0,0.1)',
    zIndex: 10,
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    paddingLeft: 5,
    alignItems: 'center',
    height: '100%',
  },
  btn: {
    width: TAP_AREA,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  titleBtn: {
    // 让标题宽度贴合文字，右侧留给听歌识曲入口
    flexGrow: 0,
    flexShrink: 1,
    height: '100%',
    justifyContent: 'center',
  },
  leftTitle: {
    // 页面大标题：spoti.pw 的 LargeTitle 34 / 700 / letterSpacing -0.8
    fontWeight: SP_FONT.pageTitleWeight,
    letterSpacing: SP_FONT.pageTitleLetterSpacing,
    paddingLeft: 6,
    paddingRight: 12,
  },
  rightTitle: {
    fontWeight: SP_FONT.pageTitleWeight,
    letterSpacing: SP_FONT.pageTitleLetterSpacing,
    paddingLeft: 12,
    paddingRight: 12,
  },
})

export default Header
