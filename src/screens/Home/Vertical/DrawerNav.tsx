import { memo, useMemo } from 'react'
import { Image, ScrollView, TouchableOpacity, View } from 'react-native'
import { useI18n } from '@/lang'
import { useNavActiveId, useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { confirmDialog, createStyle, exitApp as backHome } from '@/utils/tools'
import { LIST_IDS, MORE_MENU_OPTION_IDS, NAV_MENUS } from '@/config/constant'
import type { InitState } from '@/store/common/state'
// import { navigations } from '@/navigation'
// import commonState from '@/store/common/state'
import { exitApp, setNavActiveId } from '@/core/common'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import React, { useState, useRef, useCallback } from 'react';
import { Animated, Easing } from 'react-native';
import { useMyList } from '@/store/list/hook';
import { setActiveList } from '@/core/list';
import { navigations } from "@/navigation";
import commonState from '@/store/common/state';
import { setMyMusicSegment } from '@/screens/Home/Views/MyMusic/segment'

const CollapsibleMyListItem = () => {
  const t = useI18n();
  const theme = useTheme();
  const allList = useMyList();
  const [isExpanded, setExpanded] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;
  const contentHeight = useRef(0); // 用于存储子列表的实际高度

  const toggleCollapse = () => {
    const toValue = isExpanded ? 0 : 1;
    Animated.timing(animation, {
      toValue,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false, // 高度动画必须禁用原生驱动
    }).start();
    setExpanded(!isExpanded);
  };

  const handleSelect = useCallback((listId: string) => {
    setMyMusicSegment('local');
    setNavActiveId('nav_my_playlist');
    setActiveList(listId);
    global.app_event.changeMenuVisible(false);
  }, []);

  // 「我的歌单」既是入口也是本地列表的展开开关：点一下进页面（本地列表分段），同时展开子列表
  const handleMainPress = () => {
    toggleCollapse()
    setMyMusicSegment('local')
    setNavActiveId('nav_my_playlist')
    global.app_event.changeMenuVisible(false)
  }

  // 动画插值
  const animatedHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight.current],
  });

  const animatedOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  const arrowRotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });

  return (
    <View>
      {/* 主菜单项 */}
      <TouchableOpacity style={styles.menuItem} onPress={handleMainPress}>
        <View style={styles.iconContent}>
          <Icon name="album" size={20} color={theme['c-font-label']} />
        </View>
        <Text style={styles.text}>{t('nav_my_playlist')}</Text>
        {/*<Animated.View style={{ transform: [{ rotate: arrowRotation }] }}>*/}
        {/*  <Icon name="chevron-right" size={16} color={theme['c-font-label']} />*/}
        {/*</Animated.View>*/}
      </TouchableOpacity>

      {/* 可折叠的子列表 */}
      <Animated.View style={{ height: animatedHeight, opacity: animatedOpacity, overflow: 'hidden' }}>
        <View
          onLayout={(event) => {
            // 测量内容实际高度，用于动画
            contentHeight.current = event.nativeEvent.layout.height;
          }}
          style={{ position: 'absolute', width: '100%' }} // 使用绝对定位来测量，避免影响布局
        >
          {allList.filter(list => list.id !== LIST_IDS.DEFAULT).map(list => (
            <TouchableOpacity
              key={list.id}
              style={styles.subMenuItem}
              onPress={() => handleSelect(list.id)}
            >
              <Text size={14} color={theme['c-font-label']} numberOfLines={1}>
                {list.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};
const styles = createStyle({
  container: {
    flex: 1,
    // alignItems: 'center',
    // justifyContent: 'center',
    // padding: 10,
  },
  header: {
    paddingTop: 40,
    paddingBottom: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },
  headerText: {
    textAlign: 'center',
    marginLeft: 16,
  },
  menus: {
    flex: 1,
  },
  subMenuItem: {
    paddingVertical: 12,
    paddingLeft: 55, // 缩进，使其在主菜单项的下方
    paddingRight: 25,
  },
  collapsibleMenuItemText: {
    flex: 1,
    paddingLeft: 20,
  },
  list: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  listAsPage: {
    paddingTop: 8,
    // 底部浮动条（迷你播放器 + Tab 栏）不占布局，留出滚动空间
    paddingBottom: 200,
  },
  menuItem: {
    flexDirection: 'row',
    paddingTop: 13,
    paddingBottom: 13,
    paddingLeft: 25,
    paddingRight: 25,
    alignItems: 'center',
    // backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  iconContent: {
    width: 24,
    alignItems: 'center',
  },
  text: {
    paddingLeft: 20,
    // fontWeight: '500',
  },
  footer: {
    paddingVertical: 5,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  footerBtn: {
    padding: 10,
  },
})

const Header = () => {
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  return (
    <View
      style={{
        paddingTop: statusBarHeight,
        backgroundColor: theme['c-primary-light-700-alpha-500'],
      }}
    >
      <View style={styles.header}>
        <Image source={require('@/resources/images/milky-music-icon.png')} style={styles.brandIcon} />
        <Text style={styles.headerText} size={28} color={theme['c-primary-dark-100-alpha-300']}>
          奶音
        </Text>
      </View>
    </View>
  )
}

type IdType = InitState['navActiveId'] | 'nav_exit' | 'back_home' | 'download_manager'

/** 菜单项文案：下载管理不是 nav id，单独取文案 */
const getMenuLabel = (id: IdType, t: (key: any) => string) => (
  id === 'download_manager' ? t('nav_download') : t(id)
)

const renderIcon = (icon: string, size: number, color: string) => {
  if (icon.startsWith('svg:')) {
    return <SvgIcon name={icon.slice(4)} size={size} color={color} />
  }
  return <Icon name={icon} size={size} color={color} />
}

const MenuItem = ({
  id,
  icon,
  onPress,
}: {
  id: IdType
  icon: string
  onPress: (id: IdType) => void
}) => {
  const t = useI18n()
  const activeId = useNavActiveId()
  const theme = useTheme()

  return activeId == id ? (
    <View style={{ ...styles.menuItem, backgroundColor: theme['c-primary-background-hover'] }}>
      <View style={styles.iconContent}>
        {renderIcon(icon, 20, theme['c-primary-font-active'])}
      </View>
      <Text style={styles.text} color={theme['c-primary-font']}>
        {getMenuLabel(id, t)}
      </Text>
    </View>
  ) : (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        onPress(id)
      }}
    >
      <View style={styles.iconContent}>
        {renderIcon(icon, 20, theme['c-font-label'])}
      </View>
      <Text style={styles.text}>{getMenuLabel(id, t)}</Text>
    </TouchableOpacity>
  )
}

export default memo(({ asPage = false }: { asPage?: boolean } = {}) => {
  const theme = useTheme()
  // console.log('render drawer nav')
  const showBackBtn = useSettingValue('common.showBackBtn')
  const showExitBtn = useSettingValue('common.showExitBtn')
  const navStatus = useSettingValue('common.navStatus');
  const isShowMyListSubMenu = useSettingValue('list.isShowMyListSubMenu');

  const handlePress = (id: IdType) => {
    switch (id) {
      case 'nav_exit':
        void confirmDialog({
          message: global.i18n.t('exit_app_tip'),
          confirmButtonText: global.i18n.t('list_remove_tip_button'),
        }).then((isExit) => {
          if (!isExit) return
          exitApp('Exit Btn')
        })
        return
      case 'back_home':
        backHome()
        return
      case 'download_manager':
        global.app_event.changeMenuVisible(false)
        navigations.pushDownloadManagerScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!)
        return
    }
    global.app_event.changeMenuVisible(false)
    setNavActiveId(id as any)
  }

  const filteredNavMenus = useMemo(() => {
    return NAV_MENUS.filter(
      menu => menu.id !== 'nav_setting' && (asPage
        ? MORE_MENU_OPTION_IDS.includes(menu.id) && (navStatus[menu.id] ?? true)
        : menu.id !== 'nav_play_history' && menu.id !== 'nav_menu' && (menu.id === 'nav_search' || (navStatus[menu.id] ?? true)))
    );
  }, [asPage, navStatus]);

  return (
    <View
      style={{
        ...styles.container,
        // 作为页面显示时不要黑色底：页面本身已有 PageScrim / 动态背景，纯黑遮罩会把它盖住
        backgroundColor: asPage ? 'transparent' : theme['c-content-background'],
      }}
    >
      {/* 作为页面打开时，页面本身已有「菜单」大标题，不再重复画 logo 头 */}
      {asPage ? null : <Header />}
      <ScrollView
        style={styles.menus}
        contentContainerStyle={asPage ? styles.listAsPage : undefined}
      >
        <View style={styles.list}>
          {filteredNavMenus.map((menu) => {
            if (menu.id === 'nav_my_playlist') {
              return isShowMyListSubMenu
                ? <CollapsibleMyListItem key={menu.id} />
                : <MenuItem key={menu.id} id={menu.id} icon={menu.icon} onPress={handlePress} />;
            }
            return <MenuItem key={menu.id} id={menu.id} icon={menu.icon} onPress={handlePress} />;
          })}
          {/* 原来右下角的两个图标按钮（历史 / 下载），功能不变，改成列表项 */}
          <MenuItem id="nav_play_history" icon="music_time" onPress={handlePress} />
          <MenuItem id="download_manager" icon="download-2" onPress={handlePress} />
          <MenuItem id="nav_setting" icon="setting" onPress={handlePress} />
        </View>
      </ScrollView>

      {global.lx.isCarMode && showBackBtn ? <MenuItem id="back_home" icon="home" onPress={handlePress} /> : null}
      {global.lx.isCarMode && showExitBtn ? <MenuItem id="nav_exit" icon="exit2" onPress={handlePress} /> : null}
    </View>
  )
})
