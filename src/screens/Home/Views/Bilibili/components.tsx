import { memo, type ReactNode } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
import Text from '@/components/common/Text'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { createStyle } from '@/utils/tools'
import { useTheme } from '@/store/theme/hook'

/** 带返回按钮的子页面标题栏 */
export const PageHeader = memo(({ title, onBack }: { title: string; onBack: () => void }) => {
  const theme = useTheme()
  return (
    <View style={{ ...styles.header, borderBottomColor: theme['c-border-background'] }}>
      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Icon name="chevron-left-2" size={22} color={theme['c-font']} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.backBtn} />
    </View>
  )
})

/** B 站品牌图标 + 标题，用于登录页顶部 hero */
export const Hero = memo(
  ({ title, desc, iconSize = 56 }: { title: string; desc: string; iconSize?: number }) => {
    const theme = useTheme()
    return (
      <View style={styles.hero}>
        <SvgIcon name="bilibili" size={iconSize} rawSize={iconSize} color={theme['c-primary-font']} />
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroDesc} size={12} color={theme['c-font-label']}>
          {desc}
        </Text>
      </View>
    )
  }
)

/** 登录方式按钮：primary 为实心主按钮，其余为描边 */
export const MethodButton = memo(
  ({
    icon,
    label,
    desc,
    primary,
    disabled,
    onPress,
  }: {
    icon: string
    label: string
    desc?: string
    primary?: boolean
    disabled?: boolean
    onPress: () => void
  }) => {
    const theme = useTheme()
    const tint = primary ? theme['c-button-font'] : theme['c-primary-font']
    return (
      <TouchableOpacity
        style={[
          styles.methodBtn,
          primary
            ? { backgroundColor: theme['c-button-background'], borderColor: 'transparent' }
            : { borderColor: theme['c-primary-font'], backgroundColor: 'transparent' },
          disabled ? styles.methodBtnDisabled : null,
        ]}
        disabled={disabled}
        onPress={onPress}
      >
        <View style={styles.methodIcon}>
          {icon.startsWith('svg:') ? (
            <SvgIcon name={icon.slice(4)} size={20} color={tint} />
          ) : (
            <Icon name={icon} size={20} color={tint} />
          )}
        </View>
        <View style={styles.methodText}>
          <Text color={tint}>{label}</Text>
          {desc ? (
            <Text
              size={11}
              numberOfLines={1}
              color={primary ? theme['c-button-font'] : theme['c-font-label']}
            >
              {desc}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    )
  }
)

/** 卡片容器 */
export const Card = memo(({ children, style }: { children: ReactNode; style?: object }) => {
  const theme = useTheme()
  return (
    <View
      style={{
        ...styles.card,
        borderColor: theme['c-border-background'],
        backgroundColor: theme['c-primary-background'],
        ...style,
      }}
    >
      {children}
    </View>
  )
})

/** 居中的错误 / 提示文字 */
export const ErrorText = memo(({ children }: { children?: ReactNode }) => {
  const theme = useTheme()
  if (!children) return null
  return (
    <Text style={styles.errorText} size={12} color={theme['c-primary-font']}>
      {children}
    </Text>
  )
})

export const styles = createStyle({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  hero: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 32,
  },
  heroTitle: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: 'bold',
  },
  heroDesc: {
    marginTop: 8,
    lineHeight: 18,
    textAlign: 'center',
  },
  methodBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderRadius: 27,
    borderWidth: 1,
    alignSelf: 'stretch',
  },
  methodBtnDisabled: {
    opacity: 0.4,
  },
  methodIcon: {
    width: 26,
    alignItems: 'center',
  },
  methodText: {
    flex: 1,
    marginLeft: 10,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
  },
  errorText: {
    marginTop: 8,
    textAlign: 'center',
  },
  loginContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loginActions: {
    marginTop: 6,
  },
  fill: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
})
