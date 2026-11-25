import { useLrcPlay } from '@/plugins/lyric'
import { useIsPlay, useStatusText } from '@/store/player/hook'
// import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'

export interface StatusProps {
  autoUpdate?: boolean
  /** 没有歌词 / 状态文案时显示的兜底内容（迷你播放条用它显示歌手名） */
  fallback?: string
  /** 兜底内容的字号（不传则沿用组件默认的 12） */
  fallbackSize?: number
  /** 兜底内容的文字颜色（不传则走主题默认 c-font） */
  fallbackColor?: string
}

export default ({ autoUpdate, fallback, fallbackSize, fallbackColor }: StatusProps) => {
  const { text } = useLrcPlay(autoUpdate)
  const statusText = useStatusText()
  const isPlay = useIsPlay()
  // console.log('render status')

  // 歌词优先、播放状态次之；两者都没有时才显示兜底内容（歌手名）
  const status = isPlay ? text : statusText
  const content = status || fallback || ''

  return (
    <Text
      numberOfLines={1}
      size={status ? 12 : (fallbackSize ?? 12)}
      color={status ? undefined : fallbackColor}
    >
      {content}
    </Text>
  )
}

// const styles = createStyle({
//   text: {
//     // fontSize: 10,
//     // lineHeight: 18,
//     // height: 18,
//     // height: '100%',
//     // backgroundColor: 'rgba(0,0,0,0.2)',
//   },
// })
