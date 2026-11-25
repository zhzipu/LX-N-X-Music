/**
 * 设置页顶部分组导航（横向滚动）：选中项用 accent 文字 + 16% 白胶囊，
 * 未选中用次级文字；去掉旧版底部分割线与整体 0.7 透明度。
 */

import { memo, useCallback, useState } from 'react'
import { View, TouchableOpacity, ScrollView } from 'react-native'

import { useTheme } from '@/store/theme/hook'
import { getSP } from '@/theme/spotify/tokens'
import { createStyle } from '@/utils/tools'
import Text from '@/components/common/Text'
import { SETTING_SCREENS, type SettingScreenIds } from '../Main'
import { useI18n } from '@/lang'

const ListItem = memo(
  ({
    id,
    activeId,
    onPress,
  }: {
    onPress: (item: SettingScreenIds) => void
    activeId: string
    id: SettingScreenIds
  }) => {
    const theme = useTheme()
    const sp = getSP(theme.isDark)
    const t = useI18n()

    const active = activeId == id

    const handlePress = () => {
      onPress(id)
    }

    return (
      <View
        style={{
          ...styles.listItem,
          backgroundColor: active ? sp.colors.chipBg : 'transparent',
        }}
      >
        <TouchableOpacity style={styles.listName} onPress={handlePress}>
          <Text
            numberOfLines={1}
            size={15}
            style={{ color: active ? sp.colors.accent : sp.colors.textSecondary, fontWeight: '500' }}
            allowFontScaling={false}
          >
            {t(`setting_${id}`)}
          </Text>
        </TouchableOpacity>
      </View>
    )
  },
  (prevProps, nextProps) => {
    return !!(
      prevProps.id === nextProps.id &&
      prevProps.activeId != nextProps.id &&
      nextProps.activeId != nextProps.id
    )
  }
)

export default ({ onChangeId }: { onChangeId: (id: SettingScreenIds) => void }) => {
  const [activeId, setActiveId] = useState(global.lx.settingActiveId)

  const handleChangeId = useCallback((id: SettingScreenIds) => {
    onChangeId(id)
    setActiveId(id)
    global.lx.settingActiveId = id
  }, [])

  return (
    <ScrollView
      horizontal
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      keyboardShouldPersistTaps={'always'}
    >
      {SETTING_SCREENS.map((id) => (
        <ListItem key={id} id={id} activeId={activeId} onPress={handleChangeId} />
      ))}
    </ScrollView>
  )
}

const styles = createStyle({
  container: {
    height: 50,
    flexGrow: 0,
    flexShrink: 0,
  },
  contentContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  listItem: {
    height: 34,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: 500,
    justifyContent: 'center',
  },
  listName: {
    justifyContent: 'center',
    alignItems: 'center',
  },
})
