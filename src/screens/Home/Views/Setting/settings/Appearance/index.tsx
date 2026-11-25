import { memo } from 'react'
import { useI18n } from '@/lang'
import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import FontSize from '../Basic/FontSize'

// 外观配色选择、跟随系统/暗色模式开关都已移除：只保留默认配色 + 暗色外观
import IsHideBgDark from './IsHideBgDark'
import IsDynamicBg from './IsDynamicBg'
import IsFontShadow from './IsFontShadow'
import Blur from './Blur'
import PicOpacity from './PicOpacity'
import CustomBg from './CustomBg'

export default memo(() => {
  const t = useI18n()
  return (
    <Section title={t('setting_appearance')} description={t('setting_desc_appearance')}>
      <SubTitle title={t('setting_group_background')}>
        <IsDynamicBg />
        <IsHideBgDark />
        <IsFontShadow />
      </SubTitle>
      <CustomBg />
      <PicOpacity />
      <Blur />
      <FontSize />
    </Section>
  )
})
