import { useRef } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import TimeoutExitEditModal, {
  type TimeoutExitEditModalType,
  useTimeInfo,
} from '@/components/TimeoutExitEditModal'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import settingState from '@/store/setting/state'
import { getSP } from '@/theme/spotify/tokens'

/**
 * 播放器设置里的「定时播放」入口。
 *
 * 原来它是播放页顶栏上的一个独立圆钮（时钟图标），现在挪进右上角「更多」菜单里，
 * 顶栏只留返回 / 标题 / 更多三个元素，和 spoti.pw 的页头一致。
 * 打开后仍然是原来那个 [TimeoutExitEditModal]（分钟数输入 + 播完再停的开关），逻辑没变。
 */
export default () => {
  const t = useI18n()
  const theme = useTheme()
  const sp = getSP(theme.isDark)
  const modalRef = useRef<TimeoutExitEditModalType>(null)
  const timeInfo = useTimeInfo()

  const minutes = settingState.setting['player.timeoutExit']
  const active = timeInfo.active || !!minutes
  const valueText = active
    ? (timeInfo.confirmText ? t('timeout_exit_tip_on', { time: `${minutes}${t('timeout_exit_min')}` }) : t('timeout_exit_btn_cancel'))
    : t('timeout_exit_tip_off')

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => { modalRef.current?.show() }}
        accessibilityRole="button"
      >
        <Text size={15} style={{ color: sp.colors.text, fontWeight: '500' }} allowFontScaling={false}>
          {t('play_detail_setting_timeout_exit')}
        </Text>
        <View style={styles.right}>
          <Text size={13} numberOfLines={1} style={{ color: active ? sp.colors.text : sp.colors.textSecondary }} allowFontScaling={false}>
            {valueText}
          </Text>
          <Icon name="chevron-right" size={14} color={sp.colors.textSecondary} />
        </View>
      </TouchableOpacity>
      <TimeoutExitEditModal ref={modalRef} timeInfo={timeInfo} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingLeft: 15,
    paddingRight: 15,
    paddingBottom: 15,
  },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  right: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    gap: 4,
  },
})
