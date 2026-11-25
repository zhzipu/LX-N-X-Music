// 文件路径: screens/Home/Views/Setting/settings/Basic/NavMenu.tsx (新建文件)

import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import SubTitle from '../../components/SubTitle';
import CheckBox from '../../components/CheckBoxItem';
import { useSettingValue } from '@/store/setting/hook';
import { useI18n } from '@/lang';
import { updateSetting } from '@/core/common';
import { MORE_MENU_OPTION_IDS, type NAV_ID_Type } from '@/config/constant';

const Item = ({ id, name }: { id: NAV_ID_Type; name: string }) => {
  const navStatus = useSettingValue('common.navStatus');
  const isChecked = useMemo(() => navStatus[id] ?? true, [navStatus, id]);

  const handleChange = (check: boolean) => {
    updateSetting({ 'common.navStatus': { ...navStatus, [id]: check } });
  };

  return (
    <CheckBox
      check={isChecked}
      label={name}
      onChange={handleChange}
    />
  );
};

export default memo(() => {
  const t = useI18n();

  return (
    <SubTitle title={t('setting_basic_nav_menu')}>
      <View style={styles.list}>
        {MORE_MENU_OPTION_IDS.map(id => (
          <Item key={id} id={id} name={t(id)} />
        ))}
      </View>
    </SubTitle>
  );
});

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
});
