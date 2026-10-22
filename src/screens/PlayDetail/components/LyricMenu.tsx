import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'

import Popup, { type PopupType } from '@/components/common/Popup'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import LyricMatchModal, { type LyricMatchModalType } from '@/components/LyricMatchModal'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

export interface LyricMenuType {
  show: () => void
}

export interface LyricMenuProps {
  /** 选择「调节歌词」：由歌词组件自己进入调节模式 */
  onAdjust: () => void
}

/**
 * 长按歌词呼出的操作面板：匹配歌词 / 调节歌词。
 */
export default forwardRef<LyricMenuType, LyricMenuProps>(({ onAdjust }, ref) => {
  const theme = useTheme()
  const popupRef = useRef<PopupType>(null)
  const matchModalRef = useRef<LyricMatchModalType>(null)
  const [visible, setVisible] = useState(false)

  useImperativeHandle(ref, () => ({
    show() {
      if (visible) {
        popupRef.current?.setVisible(true)
        return
      }
      setVisible(true)
      requestAnimationFrame(() => {
        popupRef.current?.setVisible(true)
      })
    },
  }))

  const handleHide = useCallback(() => {
    setVisible(false)
  }, [])

  // 先收面板再干活，避免两个 Modal 同帧切换在部分机型上显示为空
  const closeMenuThen = useCallback((open: () => void) => {
    popupRef.current?.setVisible(false)
    setVisible(false)
    setTimeout(open, 180)
  }, [])

  const handleMatch = useCallback(() => {
    closeMenuThen(() => {
      matchModalRef.current?.show()
    })
  }, [closeMenuThen])

  const handleAdjust = useCallback(() => {
    closeMenuThen(onAdjust)
  }, [closeMenuThen, onAdjust])

  return (
    <>
      {visible ? (
        <Popup ref={popupRef} title="歌词" onHide={handleHide}>
          <View style={styles.content}>
            <TouchableOpacity
              style={styles.item}
              activeOpacity={0.7}
              onPress={handleMatch}
            >
              <Icon name="search-2" size={18} color={theme['c-font']} />
              <View style={styles.itemInfo}>
                <Text size={15}>匹配歌词</Text>
                <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
                  从其他音源搜索替换当前歌词
                </Text>
              </View>
            </TouchableOpacity>
            <View style={{ ...styles.divider, backgroundColor: theme['c-primary-alpha-100'] }} />
            <TouchableOpacity
              style={styles.item}
              activeOpacity={0.7}
              onPress={handleAdjust}
            >
              <Icon name="slider" size={18} color={theme['c-font']} />
              <View style={styles.itemInfo}>
                <Text size={15}>调节歌词</Text>
                <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
                  上下拖动歌词对齐时间，右侧按钮重置或确定
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Popup>
      ) : null}
      <LyricMatchModal ref={matchModalRef} />
    </>
  )
})

const styles = createStyle({
  content: {
    paddingBottom: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  itemInfo: {
    flexGrow: 1,
    flexShrink: 1,
    paddingLeft: 15,
  },
  divider: {
    height: 0.5,
    marginLeft: 20,
    marginRight: 20,
  },
})
