import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import IsStartupAutoPlay from '../Basic/IsStartupAutoPlay'
import IsSavePlayTime from './IsSavePlayTime'
import PlayHighQuality from './PlayHighQuality'
import IsHandleAudioFocus from './IsHandleAudioFocus'
import IsEnableAudioOffload from './IsEnableAudioOffload'
import IsAutoCleanPlayedList from './IsAutoCleanPlayedList'
import IsShowBluetoothLyric from './IsShowBluetoothLyric'
import IsShowLyricTranslation from './IsShowLyricTranslation'
import IsShowLyricRoma from './IsShowLyricRoma'
import IsS2T from './IsS2T'
import MaxCache from './MaxCache'
import { useI18n } from '@/lang'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_player')} description={t('setting_desc_player')}>
      <SubTitle title={t('setting_group_playback')}>
        <IsStartupAutoPlay />
        <IsSavePlayTime />
        <IsAutoCleanPlayedList />
        <IsHandleAudioFocus />
        <IsEnableAudioOffload />
      </SubTitle>
      <PlayHighQuality />
      <SubTitle title={t('setting_group_lyrics')}>
        <IsShowBluetoothLyric />
        <IsShowLyricTranslation />
        <IsShowLyricRoma />
        <IsS2T />
      </SubTitle>
      <SubTitle title={t('setting_group_cache')}>
        <MaxCache />
      </SubTitle>
    </Section>
  )
})
