/**
 * 详情页头（歌单 / 专辑 / 歌手共用）。
 *
 * 视觉取自 spoti.pw 的详情页：
 *  - 顶部是大标题栏（PageHeader，34/700，左侧返回），跟随内容一起滚动；
 *  - 居中封面（歌单 / 专辑圆角 12，歌手圆形头像），下面依次是
 *    歌名 22/700、作者 17、说明 / 元信息 13 次级色，再下面一行操作按钮；
 *  - 背景用同一张封面做虚化 + 压暗，底部渐隐到「透明」（不再收成纯黑），
 *    交给页面统一的「全局模糊封面底 + PageScrim」，头图与列表之间不会留黑带
 *    （不画任何卡片底 / 边框）。
 *
 * 纯展示组件：数据、播放、收藏、菜单都由调用方以 props 传入。
 */

import { memo, type ReactNode } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import Image from '@/components/common/Image'
import ImageBackground from '@/components/common/ImageBackground'
import Text from '@/components/common/Text'
import PageHeader from '@/components/spotify/PageHeader'
import { useTheme } from '@/store/theme/hook'
import { createStyle } from '@/utils/tools'
import { getSP } from '@/theme/spotify/tokens'

/** 封面边长（375×667 设计稿值） */
const COVER_SIZE = 180
/** 作者行字号：按 spoti.pw 详情页规范取 17，令牌未覆盖这个字号 */
export const DETAIL_AUTHOR_SIZE = 17

export interface DetailHeroProps {
  /** PageHeader 的大标题（歌单 / 专辑详情 / 歌手详情） */
  pageTitle: string
  onBack?: () => void
  /** 页头右侧额外节点 */
  headerRight?: ReactNode
  cover?: string
  /** 封面形状：歌单 / 专辑圆角，歌手圆形 */
  coverShape?: 'rounded' | 'circle'
  coverNativeID?: string
  /** 标题的 nativeID（原生页面的共享元素转场用） */
  titleNativeID?: string
  onCoverPress?: () => void
  title: string
  /** 作者行纯文本（与 authorNode 二选一） */
  author?: string
  /** 作者行自定义节点（如可点击的歌手名） */
  authorNode?: ReactNode
  /** 元信息（播放量 / 发行日期 / 曲目数） */
  meta?: string
  desc?: string
  /** 说明文字点击（展开 / 收起） */
  onDescPress?: () => void
  /** 操作行：随机 + 播放 + 收藏 / 更多 */
  actions?: ReactNode
  /** 操作行下方的额外内容（如「相似歌手」入口） */
  footer?: ReactNode
  /** 状态栏高度：原生页面 drawBehind 时需要给页头留出安全区 */
  topInset?: number
}

const DetailHero = ({
  pageTitle,
  onBack,
  headerRight,
  cover,
  coverShape = 'rounded',
  coverNativeID,
  titleNativeID,
  onCoverPress,
  title,
  author,
  authorNode,
  meta,
  desc,
  onDescPress,
  actions,
  footer,
  topInset = 0,
}: DetailHeroProps) => {
  const theme = useTheme()
  const sp = getSP(theme.isDark)

  const coverRadius = coverShape === 'circle' ? COVER_SIZE / 2 : sp.radius.cover

  const descText = desc
    ? (
        <Text
          size={sp.font.caption}
          numberOfLines={2}
          style={[styles.desc, { color: sp.colors.textSecondary }]}
        >
          {desc}
        </Text>
      )
    : null

  return (
    <View style={styles.root}>
      {/* 环境背景：封面虚化 + 压暗，底部渐隐到透明（亮色主题直接留白，保证文字对比度） */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {theme.isDark && cover
          ? (
              <ImageBackground
                style={StyleSheet.absoluteFill}
                imageStyle={styles.backdrop}
                source={{ uri: cover }}
                blurRadius={26}
              />
            )
          : null}
        {theme.isDark
          ? (
              <>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: sp.colors.scrim }]} />
                {/*
                 * 底部收口到「透明」而不是纯黑：页面本身已经是「全局模糊封面底 + PageScrim」，
                 * 这里再压一层纯黑会在头图下方留一条黑带。渐变从与上方相同的 45% 黑淡出到 0，
                 * 交给下面的页面渐变底接着走。
                 */}
                <Svg style={[styles.fade, styles.fadeOut]} preserveAspectRatio="none" pointerEvents="none">
                  <Defs>
                    <LinearGradient id="detailHeroFade" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#000000" stopOpacity={0.45} />
                      <Stop offset="1" stopColor="#000000" stopOpacity={0} />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="100%" height="100%" fill="url(#detailHeroFade)" />
                </Svg>
              </>
            )
          : null}
      </View>

      <View style={{ paddingTop: topInset }}>
        <PageHeader
          title={pageTitle}
          leftIcon={onBack ? 'chevron-left' : undefined}
          onLeftPress={onBack}
          right={headerRight}
        />

        <View style={styles.body}>
          <View
            style={[
              styles.coverWrap,
              {
                width: COVER_SIZE,
                height: COVER_SIZE,
                borderRadius: coverRadius,
                backgroundColor: sp.colors.surface,
              },
            ]}
          >
            {cover
              ? (
                  <Image
                    url={cover}
                    style={styles.cover}
                    nativeID={coverNativeID}
                  />
                )
              : null}
            {onCoverPress
              ? (
                  <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={onCoverPress}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={title}
                  />
                )
              : null}
          </View>

          <Text
            size={sp.font.sectionTitle}
            numberOfLines={2}
            allowFontScaling={false}
            nativeID={titleNativeID}
            style={[
              styles.title,
              {
                color: sp.colors.text,
                fontWeight: sp.font.sectionTitleWeight,
                letterSpacing: sp.font.sectionTitleLetterSpacing,
              },
            ]}
          >
            {title}
          </Text>

          {authorNode ??
            (author
              ? (
                  <Text
                    size={DETAIL_AUTHOR_SIZE}
                    numberOfLines={1}
                    style={[styles.author, { color: sp.colors.text }]}
                  >
                    {author}
                  </Text>
                )
              : null)}

          {meta
            ? (
                <Text
                  size={sp.font.caption}
                  numberOfLines={1}
                  style={[styles.meta, { color: sp.colors.textSecondary }]}
                >
                  {meta}
                </Text>
              )
            : null}

          {onDescPress && descText
            ? (
                <Pressable onPress={onDescPress} style={styles.descPress}>
                  {descText}
                </Pressable>
              )
            : descText}

          {actions
            ? (
                <View style={styles.actions}>{actions}</View>
              )
            : null}

          {footer}
        </View>
      </View>
    </View>
  )
}

const styles = createStyle({
  root: {
    position: 'relative',
  },
  backdrop: {
    resizeMode: 'cover',
    opacity: 0.55,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  /** 头图底部渐隐：从与上方一致的 45% 黑淡出到透明，不再收成纯黑 */
  fadeOut: {
    height: 160,
  },
  body: {
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 6,
    paddingBottom: 20,
  },
  coverWrap: {
    overflow: 'hidden',
  },
  cover: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  title: {
    textAlign: 'center',
    paddingTop: 18,
  },
  author: {
    textAlign: 'center',
    paddingTop: 6,
  },
  meta: {
    textAlign: 'center',
    paddingTop: 4,
  },
  desc: {
    textAlign: 'center',
    paddingTop: 8,
  },
  descPress: {
    alignSelf: 'stretch',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingTop: 20,
  },
})

export default memo(DetailHero)
