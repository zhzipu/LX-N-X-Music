import { memo } from 'react'
import { useI18n } from '@/lang'
import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import Source from '../Basic/Source'
import SourceName from '../Basic/SourceName'
import WyCookie from '../Basic/WyCookie'
import LyricAsrKey from '../Basic/LyricAsrKey'
import LyricTranslateKey from '../Basic/LyricTranslateKey'

export default memo(() => {
  const t = useI18n()
  return (
    <Section title={t('setting_services')} description={t('setting_desc_services')}>
      <Source />
      <SourceName />
      <SubTitle title={t('setting_group_account')}>
        <WyCookie />
      </SubTitle>
      <SubTitle title={t('setting_group_lyric_services')}>
        <LyricAsrKey />
        <LyricTranslateKey />
      </SubTitle>
    </Section>
  )
})
