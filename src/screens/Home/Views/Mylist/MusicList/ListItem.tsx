import { memo, useRef } from 'react'
import { Pressable, View } from 'react-native'
import { Icon } from '@/components/common/Icon'
import Text from '@/components/common/Text'
import ListRow from '@/components/spotify/ListRow'
import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle, type RowInfo } from '@/utils/tools'
import { useAssertApiSupport } from '@/store/common/hook'
import { useIsBiliLiked, useIsWyLiked } from '@/store/user/hook'
import { handleLikeMusic } from '@/components/OnlineList/listAction'
import { toggleBiliSongFavorite } from '@/core/bilibili/favorite'

/**
 * 本地列表的歌曲行（spoti.pw 的 playlist 行）。
 *
 * 高度与 `ListRow` 的 playlist 变体一致（64），序号 / 封面 / 标题层级都由 ListRow 处理，
 * 这里只负责把菜单按钮和选中态接上。注意 ListRow 内部的尺寸是原始 dp（不走像素换算），
 * 所以 ITEM_HEIGHT 也必须是原始 dp，才能和 FlatList 的 getItemLayout 对上。
 */
export const ITEM_HEIGHT = 64

export default memo(
  ({
    item,
    index,
    activeIndex,
    onPress,
    onShowMenu,
    onLongPress,
    selectedList,
    rowInfo,
    isShowAlbumName,
    isShowInterval,
    isShowSource,
    showCover,
  }: {
    item: LX.Music.MusicInfo
    index: number
    activeIndex: number
    onPress: (item: LX.Music.MusicInfo, index: number) => void
    onLongPress: (item: LX.Music.MusicInfo, index: number) => void
    onShowMenu: (
      item: LX.Music.MusicInfo,
      index: number,
      position: { x: number; y: number; w: number; h: number }
    ) => void
    selectedList: LX.Music.MusicInfo[]
    rowInfo: RowInfo
    isShowAlbumName: boolean
    isShowInterval: boolean
    isShowSource: boolean
    showCover: boolean
  }) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)
    const isSelected = selectedList.includes(item)
    const isSupported = useAssertApiSupport(item.source)
    const moreButtonRef = useRef<View>(null)
    // 网易云「喜欢」与 bili 本地收藏是两套存储，按音源二选一
    const isWyLiked = useIsWyLiked(item.source === 'wy' ? ((item.meta as any).songId ?? '') : '')
    const isBiliLiked = useIsBiliLiked(item.source === 'bili' ? (item.meta as any).songId : undefined)
    const isLiked = item.source === 'bili' ? isBiliLiked : isWyLiked
    const showLikeButton = item.source === 'wy' || item.source === 'bili'

    const handleLike = () => {
      if (item.source === 'bili') {
        void toggleBiliSongFavorite(item as LX.Music.MusicInfoOnline, !isBiliLiked)
        return
      }
      void handleLikeMusic(item as LX.Music.MusicInfoOnline)
    }

    const handleShowMenu = () => {
      moreButtonRef.current?.measure((fx, fy, width, height, px, py) => {
        onShowMenu(item, index, {
          x: Math.ceil(px),
          y: Math.ceil(py),
          w: Math.ceil(width),
          h: Math.ceil(height),
        })
      })
    }

    const active = activeIndex == index
    const singer = `${item.singer}${isShowAlbumName && item.meta.albumName ? ` · ${item.meta.albumName}` : ''}${isShowSource ? ` · ${item.source.toUpperCase()}` : ''}`
    const title = item.alias ? `${item.name} (${item.alias})` : item.name

    return (
      <ListRow
        variant="playlist"
        title={title}
        subtitle={singer}
        cover={showCover ? item.meta.picUrl ?? undefined : undefined}
        indexText={showCover ? undefined : String(index + 1)}
        active={active}
        onPress={() => { onPress(item, index) }}
        delayLongPress={300}
          onLongPress={() => { onLongPress(item, index) }}
        style={{
          opacity: isSupported ? 1 : 0.5,
          backgroundColor: isSelected ? sp.colors.interactive : 'transparent',
        }}
        right={(
          <View style={styles.right}>
            {isShowInterval
              ? (
                  <Text
                    size={sp.font.rowSubtitle}
                    numberOfLines={1}
                    style={{ color: sp.colors.textSecondary }}
                  >
                    {item.interval}
                  </Text>
                )
              : null}
            {showLikeButton
              ? (
                  <Pressable
                    onPress={handleLike}
                    hitSlop={6}
                    style={styles.moreButton}
                    accessibilityRole="button"
                  >
                    <Icon
                      name={isLiked ? 'love-filled' : 'love'}
                      size={16}
                      color={isLiked ? sp.colors.accent : sp.colors.textTertiary}
                    />
                  </Pressable>
                )
              : null}
            <View ref={moreButtonRef} collapsable={false}>
              <Pressable
                onPress={handleShowMenu}
                hitSlop={8}
                style={styles.moreButton}
                accessibilityRole="button"
              >
                <Icon name="dots-vertical" size={16} color={sp.colors.textTertiary} />
              </Pressable>
            </View>
          </View>
        )}
      />
    )
  },
  (prevProps, nextProps) => {
    return !!(
      prevProps.onPress === nextProps.onPress &&
      prevProps.onLongPress === nextProps.onLongPress &&
      prevProps.onShowMenu === nextProps.onShowMenu &&
      prevProps.rowInfo === nextProps.rowInfo &&
      prevProps.item === nextProps.item &&
      prevProps.index === nextProps.index &&
      prevProps.isShowAlbumName === nextProps.isShowAlbumName &&
      prevProps.isShowInterval === nextProps.isShowInterval &&
      prevProps.isShowSource === nextProps.isShowSource &&
      prevProps.activeIndex != nextProps.index &&
      nextProps.activeIndex != nextProps.index &&
      nextProps.selectedList.includes(nextProps.item) ==
      prevProps.selectedList.includes(nextProps.item) &&
      prevProps.showCover === nextProps.showCover
    )
  }
)

const styles = createStyle({
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  moreButton: {
    width: 32,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
