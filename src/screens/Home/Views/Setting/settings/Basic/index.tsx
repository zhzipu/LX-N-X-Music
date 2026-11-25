import { memo } from 'react'

import Section from '../../components/Section'
import SubTitle from '../../components/SubTitle'
import Language from './Language'
import ShareType from './ShareType'
import IsHomePageScroll from './IsHomePageScroll'
import IsShowBackBtn from './IsShowBackBtn'
import IsShowExitBtn from './IsShowExitBtn'
import IsUseSystemFileSelector from './IsUseSystemFileSelector'
import IsAlwaysKeepStatusbarHeight from './IsAlwaysKeepStatusbarHeight'
import { useI18n } from '@/lang/i18n'
import NavMenu from './NavMenu'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_basic')} description={t('setting_desc_basic')}>
      <Language />
      <SubTitle title={t('setting_group_operations')}>
        <IsHomePageScroll />
        <IsUseSystemFileSelector />
        <IsAlwaysKeepStatusbarHeight />
        {global.lx.isCarMode ? (
          <>
            <IsShowBackBtn />
            <IsShowExitBtn />
          </>
        ) : null}
      </SubTitle>
      <NavMenu />
      <ShareType />
    </Section>
  )
})
