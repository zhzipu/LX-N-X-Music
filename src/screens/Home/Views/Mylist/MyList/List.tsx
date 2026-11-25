import { memo, useEffect, useMemo, useRef } from 'react'
import {
  View,
  TouchableOpacity,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type FlatListProps,
} from 'react-native'

import { Icon } from '@/components/common/Icon'
import { HOME_BOTTOM_OVERLAY_HEIGHT } from '@/components/spotify/layout'

import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useActiveListId, useListFetching, useMyList } from '@/store/list/hook'
import { LIST_IDS } from '@/config/constant'
import { createStyle } from '@/utils/tools'
import { LIST_SCROLL_POSITION_KEY } from '@/config/constant'
import { getListPosition, saveListPosition } from '@/utils/data'
import { setActiveList } from '@/core/list'
import Text from '@/components/common/Text'
import { type Position } from './ListMenu'
import { scaleSizeH } from '@/utils/pixelRatio'
import Loading from '@/components/common/Loading'

type FlatListType = FlatListProps<LX.List.MyListInfo>

const ITEM_HEIGHT = scaleSizeH(48)

const ListItem = memo(
  ({
    item,
    index,
    activeId,
    onPress,
    onShowMenu,
  }: {
    onPress: (item: LX.List.MyListInfo) => void
    index: number
    activeId: string
    item: LX.List.MyListInfo
    onShowMenu: (
      item: LX.List.MyListInfo,
      index: number,
      position: { x: number; y: number; w: number; h: number }
    ) => void
  }) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)
    const moreButtonRef = useRef<TouchableOpacity>(null)
    const fetching = useListFetching(item.id)

    const active = activeId == item.id

    const handleShowMenu = () => {
      if (moreButtonRef.current?.measure) {
        moreButtonRef.current.measure((fx, fy, width, height, px, py) => {
          // console.log(fx, fy, width, height, px, py)
          onShowMenu(item, index, {
            x: Math.ceil(px),
            y: Math.ceil(py),
            w: Math.ceil(width),
            h: Math.ceil(height),
          })
        })
      }
    }

    const handlePress = () => {
      onPress(item)
    }

    return (
      <View style={{ ...styles.listItem, height: ITEM_HEIGHT }}>
        {active ? (
          <Icon
            style={styles.listActiveIcon}
            name="chevron-right"
            size={12}
            color={sp.colors.text}
          />
        ) : null}
        {fetching ? (
          <Loading
            color={active ? sp.colors.accent : sp.colors.textSecondary}
            style={styles.loading}
          />
        ) : null}
        <TouchableOpacity style={styles.listName} onPress={handlePress}>
          <Text
            numberOfLines={1}
            size={sp.font.rowTitle}
            style={{ fontWeight: sp.font.rowTitleWeight, color: sp.colors.text }}
          >
            {item.name}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleShowMenu} ref={moreButtonRef} style={styles.listMoreBtn}>
          <Icon name="dots-vertical" color={sp.colors.textTertiary} size={16} />
        </TouchableOpacity>
      </View>
    )
  },
  (prevProps, nextProps) => {
    return !!(
      prevProps.item === nextProps.item &&
      prevProps.index === nextProps.index &&
      prevProps.item.name == nextProps.item.name &&
      prevProps.activeId != nextProps.item.id &&
      nextProps.activeId != nextProps.item.id
    )
  }
)

export default ({
  onShowMenu,
}: {
  onShowMenu: (info: { listInfo: LX.List.MyListInfo; index: number }, position: Position) => void
}) => {
  const flatListRef = useRef<FlatList>(null)
  const allList = useMyList()
  // 「试听列表」(default) 只是播单曲时的临时队列，不再作为歌单展示
  const lists = useMemo(() => allList.filter(item => item.id !== LIST_IDS.DEFAULT), [allList])
  const activeListId = useActiveListId()
  const lastScrollOffset = useRef(0)

  const handleToggleList = (item: LX.List.MyListInfo) => {
    // setVisiblePanel(false)
    global.app_event.changeLoveListVisible(false)
    requestAnimationFrame(() => {
      setActiveList(item.id)
    })
  }

  const handleScroll = ({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = nativeEvent.contentOffset.y
    const deltaY = offsetY - lastScrollOffset.current
    lastScrollOffset.current = offsetY
    if (Math.abs(deltaY) >= 1) {
      global.app_event.setBottomBarHidden(deltaY > 0)
    }
    void saveListPosition(LIST_SCROLL_POSITION_KEY, offsetY)
  }

  const showMenu = (listInfo: LX.List.MyListInfo, index: number, position: Position) => {
    onShowMenu({ listInfo, index }, position)
  }

  useEffect(() => {
    void getListPosition(LIST_SCROLL_POSITION_KEY).then((offset) => {
      flatListRef.current?.scrollToOffset({ offset, animated: false })
    })
  }, [])

  const renderItem: FlatListType['renderItem'] = ({ item, index }) => (
    <ListItem
      key={item.id}
      item={item}
      index={index}
      activeId={activeListId}
      onPress={handleToggleList}
      onShowMenu={showMenu}
    />
  )
  const getkey: FlatListType['keyExtractor'] = (item) => item.id
  const getItemLayout: FlatListType['getItemLayout'] = (data, index) => {
    return { length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }
  }

  return (
    <FlatList
      ref={flatListRef}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: HOME_BOTTOM_OVERLAY_HEIGHT }]}
      data={lists}
      maxToRenderPerBatch={9}
      // updateCellsBatchingPeriod={80}
      windowSize={9}
      removeClippedSubviews={true}
      initialNumToRender={18}
      renderItem={renderItem}
      keyExtractor={getkey}
      // extraData={activeIndex}
      getItemLayout={getItemLayout}
    />
  )
}

const styles = createStyle({
  container: {
    flexShrink: 1,
    flexGrow: 0,
  },
  content: {
    paddingTop: 6,
    paddingBottom: 24,
  },
  listItem: {
    height: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    paddingLeft: 16,
  },
  listActiveIcon: {
    marginLeft: 3,
    textAlign: 'center',
  },
  loading: {
    marginLeft: 5,
  },
  listName: {
    height: '100%',
    justifyContent: 'center',
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 5,
  },
  listMoreBtn: {
    height: '100%',
    width: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
