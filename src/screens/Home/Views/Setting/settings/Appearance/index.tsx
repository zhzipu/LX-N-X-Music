import { memo } from 'react'

// import Section from '../../components/Section'
import Appearance from './Appearance'
import IsAutoAppearance from './IsAutoAppearance'
import IsDarkMode from './IsDarkMode'
import IsHideBgDark from './IsHideBgDark'
import IsDynamicBg from './IsDynamicBg'
import IsFontShadow from './IsFontShadow'
import Blur from "@/screens/Home/Views/Setting/settings/Appearance/Blur.tsx";
import CustomBg from "@/screens/Home/Views/Setting/settings/Appearance/CustomBg.tsx";
import PicOpacity from "@/screens/Home/Views/Setting/settings/Appearance/PicOpacity.tsx";
// import { useI18n } from '@/lang/i18n'

export default memo(() => {
  return (
    <>
      <Appearance />
      <IsAutoAppearance />
      <IsDarkMode />
      <IsDynamicBg />
      <CustomBg />
      <PicOpacity />
      <Blur />
      <IsFontShadow />
    </>
  )
})
