import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import AddMusicLocationType from './AddMusicLocationType'
import IsClickPlayList from './IsClickPlayList'
import IsShowAlbumName from './IsShowAlbumName'
import IsShowInterval from './IsShowInterval'
import IsAutoSaveDailyRec from './IsAutoSaveDailyRec';
import IsShowMyListSubMenu from './IsShowMyListSubMenu';

import { useI18n } from '@/lang'
import MenuSettings from "@/screens/Home/Views/Setting/settings/List/MenuSettings.tsx";

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_list')} description={t('setting_desc_list')}>
      <SubTitle title={t('setting_group_list_display')}>
        <IsShowAlbumName />
        <IsShowInterval />
        <IsShowMyListSubMenu />
      </SubTitle>
      <SubTitle title={t('setting_group_list_actions')}>
        <IsClickPlayList />
        <IsAutoSaveDailyRec />
      </SubTitle>
      <AddMusicLocationType />
      <MenuSettings />
    </Section>
  )
})
