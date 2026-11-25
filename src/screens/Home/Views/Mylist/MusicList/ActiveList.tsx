import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import { Icon } from '@/components/common/Icon'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useActiveListId, useListFetching } from '@/store/list/hook'
import listState from '@/store/list/state'
import { createStyle } from '@/utils/tools'
import { getListPrevSelectId } from '@/utils/data'
import { setActiveList } from '@/core/list'
import Text from '@/components/common/Text'
import { LIST_IDS } from '@/config/constant'
import Loading from '@/components/common/Loading'
import { useSettingValue } from '@/store/setting/hook'

/** 当前列表名：17/700，令牌里没有 17 这个字号 */
const LIST_NAME_SIZE = 17

export interface ActiveListProps {
  onShowSearchBar: () => void
  onScrollToTop: () => void
  showCover: boolean
  onToggleView: () => void
}
export interface ActiveListType {
  setVisibleBar: (visible: boolean) => void
}

export default forwardRef<ActiveListType, ActiveListProps>(
  ({ onShowSearchBar, onScrollToTop, showCover, onToggleView }, ref) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)
    const currentListId = useActiveListId()
    const fetching = useListFetching(currentListId)
    const langId = useSettingValue('common.langId')
    const currentListName = useMemo(() => {
      switch (currentListId) {
        case LIST_IDS.TEMP:
          return global.i18n.t('list_name_temp')
        case LIST_IDS.DEFAULT:
          return global.i18n.t('list_name_default')
        case LIST_IDS.LOVE:
          return global.i18n.t('list_name_love')
        default:
          return listState.allList.find((l) => l.id === currentListId)?.name ?? ''
      }
    }, [currentListId, langId])
    const [visibleBar, setVisibleBar] = useState(true)

    useImperativeHandle(ref, () => ({
      setVisibleBar(visible) {
        setVisibleBar(visible)
      },
    }))

    const showList = () => {
      global.app_event.changeLoveListVisible(true)
    }

    useEffect(() => {
      void getListPrevSelectId().then((id) => {
        setActiveList(id)
      })
    }, [])

    return (
      <TouchableOpacity
        onPress={showList}
        onLongPress={onScrollToTop}
        style={[styles.currentList, { opacity: visibleBar ? 1 : 0 }]}
      >
        <Icon
          style={styles.currentListIcon}
          color={sp.colors.textSecondary}
          name="chevron-right"
          size={14}
        />
        {fetching ? <Loading color={sp.colors.accent} style={styles.loading} /> : null}
        <Text
          style={styles.currentListText}
          numberOfLines={1}
          size={LIST_NAME_SIZE}
          color={sp.colors.text}
        >
          {currentListName}
        </Text>
        <TouchableOpacity
          style={styles.currentListBtns}
          onPress={onToggleView}
          accessibilityRole="button"
        >
          <Icon color={sp.colors.textSecondary} name={showCover ? 'menu' : 'album'} size={20} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.currentListBtns}
          onPress={onShowSearchBar}
          accessibilityRole="button"
        >
          <Icon color={sp.colors.textSecondary} name="search-2" size={20} />
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }
)

const styles = createStyle({
  currentList: {
    flexDirection: 'row',
    paddingLeft: 16,
    paddingRight: 4,
    height: 48,
    alignItems: 'center',
  },
  currentListIcon: {
    paddingRight: 8,
  },
  currentListText: {
    flex: 1,
    fontWeight: '700',
    paddingRight: 10,
  },
  loading: {
    marginRight: 5,
  },
  currentListBtns: {
    width: 40,
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
})
