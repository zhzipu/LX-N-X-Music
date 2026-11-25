import { useRef, forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'

// import music from '@/utils/musicSdk'
// import InsetShadow from 'react-native-inset-shadow'
import SourceSelector, {
  type SourceSelectorType as _SourceSelectorType,
  type SourceSelectorProps as _SourceSelectorProps,
} from '@/components/SourceSelector'
import SearchInput, { type SearchInputType, type SearchInputProps } from './SearchInput'
import { createStyle } from '@/utils/tools'
import { type Source as MusicSource } from '@/store/search/music/state'
import { type Source as SonglistSource } from '@/store/search/songlist/state'

type Sources = Readonly<Array<MusicSource | SonglistSource>>
type SourceSelectorProps = _SourceSelectorProps<Sources>
type SourceSelectorType = _SourceSelectorType<Sources>

export interface HeaderBarProps {
  onSourceChange: SourceSelectorProps['onSourceChange']
  onTipSearch: SearchInputProps['onChangeText']
  onSearch: SearchInputProps['onSubmit']
  onHideTipList: SearchInputProps['onBlur']
  onShowTipList: SearchInputProps['onTouchStart']
}

export interface HeaderBarType {
  setSourceList: SourceSelectorType['setSourceList']
  setText: SearchInputType['setText']
  blur: SearchInputType['blur']
}

export default forwardRef<HeaderBarType, HeaderBarProps>(
  ({ onSourceChange, onTipSearch, onSearch, onHideTipList, onShowTipList }, ref) => {
    const sourceSelectorRef = useRef<SourceSelectorType>(null)
    const searchInputRef = useRef<SearchInputType>(null)

    useImperativeHandle(
      ref,
      () => ({
        setSourceList(list, source) {
          sourceSelectorRef.current?.setSourceList(list, source)
        },
        setText(text) {
          searchInputRef.current?.setText(text)
        },
        blur() {
          searchInputRef.current?.blur()
        },
      }),
      []
    )

    return (
      <View style={styles.searchBar}>
        <SearchInput
          left={
            <SourceSelector
              ref={sourceSelectorRef}
              onSourceChange={onSourceChange}
              icon="search-2"
              iconSize={18}
            />
          }
          ref={searchInputRef}
          onChangeText={onTipSearch}
          onSubmit={onSearch}
          onBlur={onHideTipList}
          onTouchStart={onShowTipList}
        />
      </View>
    )
  }
)

const styles = createStyle({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    // spoti.pw：搜索条是一条 48 高的胶囊，不画分隔线
    height: 56,
    zIndex: 2,
    paddingLeft: 16,
    paddingRight: 16,
  },
  selector: {
    marginRight: 8,
  },
})
