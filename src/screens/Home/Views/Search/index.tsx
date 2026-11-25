import { useRef, useEffect, useState, useCallback } from 'react'
import { type LayoutChangeEvent, View, BackHandler, StyleSheet } from 'react-native'
import HeaderBar, { type HeaderBarProps, type HeaderBarType } from './HeaderBar'
import searchState, { type SearchType } from '@/store/search/state'
import commonState from '@/store/common/state'
import searchMusicState from '@/store/search/music/state'
import searchSonglistState, { type ListInfoItem } from '@/store/search/songlist/state'
import { getSearchSetting, saveSearchSetting } from '@/utils/data'
import {createStyle, toast} from '@/utils/tools'
import TipList, { type TipListType } from './TipList'
import List, { type ListType } from './List'
import { addHistoryWord, setSearchText as setSearchState } from '@/core/search/search'
import SonglistDetail from '../../../SonglistDetail'
import DetailView, { type DetailKind } from './DetailView'
import RecommendRows from './RecommendRows'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { useNavActiveId } from '@/store/common/hook'
import {COMPONENT_IDS} from "@/config/constant.ts"
import { popHomeDetail, pushHomeDetail } from '@/screens/Home/Views/Music/detailState'

interface SearchInfo {
  temp_source: LX.OnlineSource
  source: LX.OnlineSource | 'all'
  searchType: 'music' | 'songlist' | 'singer' | 'album'
}

export default () => {
  const activeNavId = useNavActiveId()
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const headerBarRef = useRef<HeaderBarType>(null)
  const searchTipListRef = useRef<TipListType>(null)
  const listRef = useRef<ListType>(null)
  const layoutHeightRef = useRef<number>(0)
  const searchInfo = useRef<SearchInfo>({ temp_source: 'kw', source: 'kw', searchType: 'music' })
  const [selectedList, setSelectedList] = useState<ListInfoItem | null>(null)
  /** 搜索里点开的歌手/专辑/歌单详情 */
  const [detailItem, setDetailItem] = useState<{ kind: DetailKind, item: any, source?: string } | null>(null)
  /** 当前结果分类；搜索框在各分类下共用。 */
  const [searchTypeState, setSearchTypeState] = useState<SearchType>(searchInfo.current.searchType)
  const [searchTextState, setSearchTextState] = useState(searchState.searchText)
  const [hasRecommend, setHasRecommend] = useState(false)
  const [recExpanded, setRecExpanded] = useState(false)
  const showSearchHeader = activeNavId === 'nav_search' && !selectedList && !detailItem

  useEffect(() => {
    if (!detailItem) return
    pushHomeDetail()
    return () => { popHomeDetail() }
  }, [detailItem])

  /** 切换搜索类型（歌手 / 专辑 / 歌单）——分类胶囊移除后，由结果页顶部方块触发 */
  const handleTypeChange = useCallback((type: SearchType) => {
    setSearchTypeState(type)
    setSelectedList(null)
    searchInfo.current.searchType = type
    void saveSearchSetting({ type })
    if ((type === 'singer' || type === 'album') && searchInfo.current.source !== 'wy') {
      toast('歌手与专辑搜索目前仅支持网易云源')
    }
    if (searchState.searchText) {
      listRef.current?.loadList(searchState.searchText, searchInfo.current.source, type)
    }
  }, [])
  const handleTypeChangeRef = useRef(handleTypeChange)
  handleTypeChangeRef.current = handleTypeChange
  const selectedListRef = useRef(selectedList)
  const hasOpenedDetailRef = useRef(false)
  selectedListRef.current = selectedList

  const [headerKey, setHeaderKey] = useState(Date.now())

  useEffect(() => {
    const onBackPress = () => {
      if (selectedListRef.current) {
        // 获取状态管理中记录的最后一个（即最顶层）屏幕信息
        const lastScreen = commonState.componentIds[commonState.componentIds.length - 1]

        // 如果最顶层的屏幕不是 Home 屏幕，则意味着有其他屏幕（如歌手详情页）被 push 到栈顶
        // 此时不应处理返回事件，应交由 react-native-navigation 默认处理（即 pop 顶层屏幕）
        if (lastScreen && lastScreen.name !== COMPONENT_IDS.home) {
          return false
        }

        // 否则，处理返回事件，关闭当前的歌单详情浮层
        setSelectedList(null)
        return true // 消费事件，防止退出应用
      }
      return false
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)

    return () => subscription.remove()
  }, [])

  useEffect(() => {
    if (selectedList) {
      hasOpenedDetailRef.current = true
      return
    }
    if (!hasOpenedDetailRef.current) return
    hasOpenedDetailRef.current = false
    setHeaderKey(Date.now())
  }, [selectedList])

  const handleSearch: HeaderBarProps['onSearch'] = useCallback((text) => {
    handleHideTipList()
    setSelectedList(null)
    setSearchState(text) // 更新全局状态
    setSearchTextState(text)
    searchTipListRef.current?.search(text, layoutHeightRef.current)
    headerBarRef.current?.setText(text)
    headerBarRef.current?.blur()
    void addHistoryWord(text)
    listRef.current?.loadList(text, searchInfo.current.source, searchInfo.current.searchType)
  }, [])

  useEffect(() => {
    void getSearchSetting().then((info) => {
      searchInfo.current.temp_source = info.temp_source
      searchInfo.current.source = info.source
      searchInfo.current.searchType = info.type
      setSearchTypeState(info.type)
      switch (info.type) {
        case 'music':
        case 'singer':
        case 'album':
          headerBarRef.current?.setSourceList(searchMusicState.sources, info.source)
          break
        case 'songlist':
          headerBarRef.current?.setSourceList(searchSonglistState.sources, info.source)
          break
      }
      headerBarRef.current?.setText(searchState.searchText)
      listRef.current?.loadList(
        searchState.searchText,
        searchInfo.current.source,
        searchInfo.current.searchType,
      )
    })

    const handleTypeChange = handleTypeChangeRef.current
    global.app_event.on('searchTypeChanged', handleTypeChange)

    return () => {
      global.app_event.off('searchTypeChanged', handleTypeChange)
    }
  }, [headerKey])

  // HeaderBar 在切换 tab 或进入详情时会卸载。回到搜索页后，等它重新挂载
  // 再恢复音源和搜索词，不能只依赖导航事件发生时可能为空的 ref。
  useEffect(() => {
    if (!showSearchHeader) {
      // 离开搜索页（切 tab / 进详情）时顺手收起历史/候选面板
      searchTipListRef.current?.hide()
      return
    }
    const { source, searchType } = searchInfo.current
    headerBarRef.current?.setSourceList(
      searchType === 'songlist' ? searchSonglistState.sources : searchMusicState.sources,
      source,
    )
    headerBarRef.current?.setText(searchState.searchText)
  }, [showSearchHeader, searchTypeState, headerKey])

  // 返回键：分类列表 → 歌曲结果页 → 空搜索页
  useEffect(() => {
    const onBackPress = () => {
      // 只有当前停在「搜索」tab 时才接管返回键
      if (activeNavId !== 'nav_search') return false
      // 0) 详情页 → 回到分类列表
      if (detailItem) {
        setDetailItem(null)
        return true
      }
      const { searchType } = searchInfo.current
      // 1) 歌手/专辑/歌单 → 回到歌曲结果页
      if (searchType !== 'music') {
        handleTypeChange('music')
        return true
      }
      // 2) 有搜索结果 → 回到空白的搜索页
      if (searchState.searchText) {
        setSelectedList(null)
        headerBarRef.current?.setText('')
        setSearchState('')
        setSearchTextState('')
        handleHideTipList()
        listRef.current?.loadList('', searchInfo.current.source, 'music')
        return true
      }
      return false
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => { sub.remove() }
  }, [handleTypeChange, activeNavId, detailItem])

  useEffect(() => {
    const handleNavChange = (id: string) => {
      if (id === 'nav_search' && searchState.searchText) {
        headerBarRef.current?.setText(searchState.searchText)
        listRef.current?.loadList(searchState.searchText, searchInfo.current.source, searchInfo.current.searchType)
      }
    }
    global.state_event.on('navActiveIdUpdated', handleNavChange)
    return () => {
      global.state_event.off('navActiveIdUpdated', handleNavChange)
    }
  }, [])

  useEffect(() => {
    // 听歌识曲等入口会直接抛 triggerSearch。当搜索页已经在前台时，
    // setNavActiveId 会因导航 id 未变化而提前返回，不会触发 navActiveIdUpdated，
    // 所以这里要自己接一次，保证「用识别结果发起搜索」在任意情况下都能生效。
    const handleTriggerSearch = (text: string) => {
      if (!text) return
      handleSearch(text)
    }
    global.app_event.on('triggerSearch', handleTriggerSearch)
    return () => {
      global.app_event.off('triggerSearch', handleTriggerSearch)
    }
  }, [handleSearch])

  const handleLayout = (e: LayoutChangeEvent) => {
    layoutHeightRef.current = e.nativeEvent.layout.height
  }
  const handleSourceChange: HeaderBarProps['onSourceChange'] = (source) => {
    setSelectedList(null)
    searchInfo.current.source = source
    void saveSearchSetting({ source })
    if (searchState.searchText) {
      listRef.current?.loadList(searchState.searchText, source, searchInfo.current.searchType)
    }
  }

  const handleTipSearch: HeaderBarProps['onTipSearch'] = (text) => {
    // 有输入立刻切到候选列表；清空输入则回到搜索历史。
    // 两者共用同一个下拉面板，不需要延迟切换。
    searchTipListRef.current?.search(text, layoutHeightRef.current)
  }
  const handleHideTipList = () => {
    searchTipListRef.current?.hide()
  }
  const handleShowTipList: HeaderBarProps['onShowTipList'] = (text) => {
    // 点搜索框：文本为空时展示搜索历史，已有文本时直接展示候选
    searchTipListRef.current?.show(layoutHeightRef.current, text)
  }

  const handleOpenDetail = useCallback((item: ListInfoItem) => {
    setSelectedList(item)
  }, [])

  return (
    <View style={styles.container}>
      {/*
       * 只在搜索页处于激活状态时才挂 HeaderBar。
       * 这条不是性能优化：PagerView 会把相邻页一起挂载，宿主的玻璃/浮层是按窗口坐标补画的，
       * 离屏页的搜索框玻璃会被画到当前页上（表现为标题右侧一块圆角磨砂"幽灵"）。
       * 卸载掉就彻底没有这个源。
       */}
      {showSearchHeader && (
        <HeaderBar
          key={headerKey}
          ref={headerBarRef}
          onSourceChange={handleSourceChange}
          onTipSearch={handleTipSearch}
          onSearch={handleSearch}
          onHideTipList={handleHideTipList}
          onShowTipList={handleShowTipList}
        />
      )}
      { !detailItem && !selectedList && !searchTextState.trim()
        ? (
            <RecommendRows
              onOpenPlaylist={(item) => { setRecExpanded(false); setDetailItem({ kind: 'songlist', item, source: 'wy' }) }}
              onLoaded={setHasRecommend}
              onExpandChange={setRecExpanded}
            />
          )
        : null}
      <View style={[styles.content, recExpanded ? styles.hidden : null]} onLayout={handleLayout}>
        {/* 列表保持挂载（用 display 隐藏），这样从详情返回时不会丢掉搜索结果状态 */}
        <View style={[styles.listLayer, detailItem ? styles.hidden : null]}>
          { selectedList
            ? <SonglistDetail
                componentId={commonState.componentIds.find(c => c.name === COMPONENT_IDS.home)?.id}
                info={selectedList} onBack={() => setSelectedList(null)}
              />
            : (
                <>
                  <TipList ref={searchTipListRef} onSearch={handleSearch} onPressBg={() => { headerBarRef.current?.blur() }} />
                  <List ref={listRef} onSearch={handleSearch} onSelectType={handleTypeChange} onOpenItem={(kind, item) => { setDetailItem({ kind, item }) }} onOpenDetail={handleOpenDetail} hideWelcome={hasRecommend} />
                </>
              )
          }
        </View>
        {detailItem
          ? (
              <View style={styles.detailLayer}>
                <DetailView
                  kind={detailItem.kind}
                  item={detailItem.item}
                  source={detailItem.source ?? String(searchInfo.current.source)}
                  onBack={() => { setDetailItem(null) }}
                />
              </View>
            )
          : null}
      </View>
    </View>
  )
}


const styles = createStyle({
  container: {
    width: '100%',
    flex: 1,
  },
  content: {
    flex: 1,
  },
  listLayer: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
  detailLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
})
