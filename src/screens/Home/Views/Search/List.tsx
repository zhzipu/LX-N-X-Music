import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import type { InitState as SearchState } from '@/store/search/state'
import type { Source as MusicSource } from '@/store/search/music/state'
import type { Source as SongListSource } from '@/store/search/songlist/state'
import MusicList, { type MusicListType } from './MusicList'
import BlankView, { type BlankViewType } from './BlankView'
import SonglistList from './SonglistList'
import CategoryList from './CategoryList'
import TopCategories, { type TopCategoryType } from './TopCategories'
import SectionTitle from '@/components/spotify/SectionTitle'
import { useI18n } from '@/lang'
import { View } from 'react-native'

interface ListProps {
  onSearch: (keyword: string) => void
  onSelectType: (type: TopCategoryType) => void
  onOpenItem: (kind: 'singer' | 'album' | 'songlist', item: any) => void
  /** 空白页有推荐内容时隐藏欢迎语 */
  hideWelcome?: boolean
  onOpenDetail: (item: any) => void; // 保留 onOpenDetail 以便传递
}
export interface ListType {
  loadList: (
    text: string,
    source: MusicSource | SongListSource,
    type: SearchState['searchType']
  ) => void
}

export default forwardRef<ListType, ListProps>(({ onSearch, onSelectType, onOpenItem, onOpenDetail, hideWelcome }, ref) => {
  const [listType, setListType] = useState<SearchState['searchType']>('music')
  const [showBlankView, setShowListView] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [sourceForTop, setSourceForTop] = useState<MusicSource | SongListSource>('wy')
  const [reloadKey, setReloadKey] = useState(0)
  const t = useI18n()
  const listRef = useRef<MusicListType>(null)
  const blankViewRef = useRef<BlankViewType>(null)

  useImperativeHandle(
    ref,
    () => ({
      loadList(text, source, type) {
        if (text) {
          setShowListView(false)
          setListType(type)
          setKeyword(text)
          setSourceForTop(source)
          setReloadKey(v => v + 1)
          requestAnimationFrame(() => {
            listRef.current?.loadList(text, source)
          })
        } else {
          setShowListView(true)
          requestAnimationFrame(() => {
            blankViewRef.current?.show(source)
          })
        }
      },
    }),
    []
  )

  const renderList = () => {
    switch (listType) {
      case 'songlist':
      case 'singer':
      case 'album':
        return (
          <CategoryList
            searchType={listType as 'singer' | 'album' | 'songlist'}
            keyword={keyword}
            source={String(sourceForTop)}
            onOpenItem={onOpenItem}
            reloadKey={reloadKey}
          />
        )
      case 'music':
      default:
        return <MusicList ref={listRef} onSelectType={onSelectType} />
    }
  }

  return showBlankView
    ? <BlankView ref={blankViewRef} onSearch={onSearch} hideWelcome={hideWelcome} />
    : (
        <View style={{ flex: 1 }}>
          {/* 歌曲结果页顶部是分类方块；歌手/专辑/歌单页只有左上角标题 + 列表 */}
          {keyword
            ? (listType === 'music'
                ? (
                    <TopCategories
                      keyword={keyword}
                      source={String(sourceForTop)}
                      currentType={listType as TopCategoryType}
                      onSelectType={onSelectType}
                    />
                  )
                : (
                    <SectionTitle
                      title={
                        listType === 'singer'
                          ? t('search_type_singer')
                          : listType === 'album'
                            ? t('search_type_album')
                            : t('search_type_songlist')
                      }
                    />
                  ))
            : null}
          <View style={{ flex: 1 }}>{renderList()}</View>
        </View>
      )
})
