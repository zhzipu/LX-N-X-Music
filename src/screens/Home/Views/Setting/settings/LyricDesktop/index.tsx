import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import IsShowLyric from './IsShowLyric'
import IsLockLyric from './IsLockLyric'
import IsShowToggleAnima from './IsShowToggleAnima'
import IsSingleLine from './IsSingleLine'
import TextSize from './TextSize'
import MaxLineNum from './MaxLineNum'
import TextOpacity from './TextOpacity'
import TextPositionX from './TextPositionX'
import TextPositionY from './TextPositionY'
import { useI18n } from '@/lang'
import Appearance from './Appearance'
// import { useTranslation } from '@/plugins/i18n'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_lyric_desktop')} description={t('setting_desc_lyric_desktop')}>
      <SubTitle title={t('setting_group_lyric_window')}>
        <IsShowLyric />
        <IsLockLyric />
        <IsShowToggleAnima />
        <IsSingleLine />
      </SubTitle>
      <Appearance />
      <TextSize />
      <MaxLineNum />
      <TextOpacity />
      <TextPositionX />
      <TextPositionY />
    </Section>
  )
})
