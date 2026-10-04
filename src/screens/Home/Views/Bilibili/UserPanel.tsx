import { memo, useCallback, useEffect, useState } from 'react'
import { TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import Image from '@/components/common/Image'
import Button from '@/components/common/Button'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { useTheme } from '@/store/theme/hook'
import { confirmDialog, createStyle, toast } from '@/utils/tools'
import { clearBiliCookie, fetchBiliUserInfo } from '@/core/bilibili/auth'
import type { BiliUserInfo } from '@/core/bilibili/api'
import { Card, styles as shared } from './components'
import Library from './Library'

const TitleBar = ({ onRefresh }: { onRefresh: () => void }) => {
  const theme = useTheme()
  return (
    <View style={{ ...styles.titleBar, borderBottomColor: theme['c-border-background'] }}>
      <SvgIcon name="bilibili" size={18} color={theme['c-font']} />
      <Text style={styles.titleText} numberOfLines={1}>
        Bilibili
      </Text>
      <TouchableOpacity style={styles.titleBtn} onPress={onRefresh}>
        <Icon name="available_updates" size={16} color={theme['c-font-label']} />
      </TouchableOpacity>
    </View>
  )
}

export default memo(() => {
  const theme = useTheme()
  const [userInfo, setUserInfo] = useState<BiliUserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  /** 联网校验失败（Cookie 失效）时为 true */
  const [invalid, setInvalid] = useState(false)

  const loadUserInfo = useCallback(async () => {
    setLoading(true)
    try {
      const info = await fetchBiliUserInfo()
      setUserInfo(info)
      setInvalid(!info)
    } catch {
      setUserInfo(null)
      setInvalid(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUserInfo()
  }, [loadUserInfo])

  const handleLogout = useCallback(async () => {
    const confirmed = await confirmDialog({
      message: '退出 Bilibili 账号？退出后收藏夹、稍后再看等功能会暂停。',
      confirmButtonText: '退出',
    })
    if (!confirmed) return
    clearBiliCookie()
    toast('已退出 Bilibili 账号')
  }, [])

  return (
    <View style={shared.fill}>
      <TitleBar onRefresh={() => void loadUserInfo()} />
      <View style={styles.profileWrap}>
        <Card style={styles.profileCard}>
          {userInfo?.face ? (
            <Image url={userInfo.face} style={styles.avatar} />
          ) : (
            <View style={{ ...styles.avatar, backgroundColor: theme['c-primary-light-400-alpha-700'] }}>
              <SvgIcon name="artist" size={32} rawSize={32} color={theme['c-primary-font']} />
            </View>
          )}
          <View style={styles.profileText}>
            <Text numberOfLines={1}>{loading && !userInfo ? '加载中…' : userInfo?.name ?? '未获取到账号'}</Text>
            <Text size={11} color={theme['c-font-label']} numberOfLines={1}>
              {userInfo ? `UID ${userInfo.mid}` : invalid ? '登录状态已失效' : 'Bilibili 账号'}
            </Text>
            {userInfo?.vip ? (
              <Text size={11} color={theme['c-primary-font']}>
                大会员
              </Text>
            ) : null}
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={() => void handleLogout()}>
            <Icon name="exit" size={18} color={theme['c-font-label']} />
          </TouchableOpacity>
        </Card>
      </View>

      {invalid ? (
        <View style={styles.invalidWrap}>
          <Card style={styles.invalidCard}>
            <Text size={13} color={theme['c-font-label']} style={styles.invalidText}>
              当前 Cookie 已失效，请重新登录。
            </Text>
            <Button
              style={{ ...styles.reloginBtn, backgroundColor: theme['c-button-background'] }}
              onPress={() => clearBiliCookie()}
            >
              <Text color={theme['c-button-font']}>重新登录</Text>
            </Button>
          </Card>
        </View>
      ) : (
        <Library />
      )}
    </View>
  )
})

const styles = createStyle({
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  titleText: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    fontWeight: '500',
  },
  titleBtn: {
    padding: 6,
  },
  content: {
    padding: 16,
  },
  profileWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileText: {
    flex: 1,
    marginLeft: 14,
  },
  invalidWrap: {
    flex: 1,
    padding: 16,
  },
  invalidCard: {
    marginTop: 16,
  },
  invalidText: {
    marginBottom: 14,
    textAlign: 'center',
  },
  placeholderCard: {
    marginTop: 16,
    paddingVertical: 36,
  },
  placeholderText: {
    marginTop: 12,
    marginBottom: 4,
  },
  logoutBtn: {
    padding: 8,
    borderRadius: 18,
  },
  reloginBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 18,
  },
  logoutLink: {
    marginTop: 24,
    alignItems: 'center',
    paddingVertical: 10,
  },
})
