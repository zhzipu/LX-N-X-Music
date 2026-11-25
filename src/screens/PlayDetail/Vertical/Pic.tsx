import { memo, useEffect, useMemo, useRef, useCallback, useState } from 'react';
import { View, Animated, Easing, TouchableWithoutFeedback } from 'react-native';
import { useIsPlay, usePlayMusicInfo } from '@/store/player/hook';
import { useWindowSize } from '@/utils/hooks';
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant';
import { HEADER_HEIGHT } from './components/Header';
import Image from '@/components/common/Image';
import idlePlayerCover from '@/resources/images/milky-music-icon.png'
import { useStatusbarHeight } from '@/store/common/hook';
// 封面旋转设置项暂停使用（仿 Spotify 固定方形封面），见 isCoverSpin 定义处
import { createStyle, toast, requestStoragePermission } from '@/utils/tools';
import Menu, { type MenuType, type Menus } from '@/components/common/Menu';
import { addTask } from '@/core/download';
import RNFetchBlob from 'rn-fetch-blob';
import { getPicUrl } from '@/core/music/online';
import { getFileExtensionFromUrl } from '@/screens/Home/Views/Mylist/MusicList/download/utils';
import settingState from '@/store/setting/state';
import { MS_MOTION } from '@/theme/myspotify/tokens';
import { SP_RADIUS, SP_SPACING } from '@/theme/spotify/tokens';

/** spoti.pw：封面左右各留 24，宽度 = 屏宽 − 48 */
const COVER_INSET_H = SP_SPACING.xxl;
/** 统计可用高时给底部控制区留的余量比例，保证小屏上封面不会把控制区挤出屏幕 */
const COVER_MAX_HEIGHT_RATIO = 0.52;

export default memo(({ componentId, maxWidth, maxHeight, topPadding = 0, onPress }: { componentId: string, maxWidth?: number, maxHeight?: number, topPadding?: number, onPress?: () => void }) => {
  const musicInfo = usePlayMusicInfo();
  const { width: winWidth, height: winHeight } = useWindowSize();
  const statusBarHeight = useStatusbarHeight();
  const isPlay = useIsPlay();
  // 仿 Spotify / Chroma：封面固定为方形圆角。
  // 转盘与目标布局冲突，且旧版本默认值为 true 已被持久化，这里直接固定关闭；
  // 需要恢复时改回 useSettingValue('playDetail.isCoverSpin') 即可。
  const isCoverSpin = false
  const spinValue = useRef(new Animated.Value(0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isAnimating = useRef(false);
  const menuRef = useRef<MenuType>(null);
  const coverRef = useRef<View>(null);
  const longPressedRef = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);

  // 进场动画：opacity 0→1、translateY 12→0，320ms
  const enterAnim = useRef(new Animated.Value(0)).current;
  // 切歌交叉淡入：400ms
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const createAnimation = useCallback((value: number) => {
    return Animated.timing(spinValue, {
      toValue: 1,
      duration: 25000 * (1 - value),
      easing: Easing.linear,
      useNativeDriver: true,
    });
  }, [spinValue]);

  const startAnimation = useCallback(() => {
    if (isAnimating.current || !isCoverSpin) return;
    isAnimating.current = true;
    spinValue.stopAnimation(value => {
      animationRef.current = createAnimation(value);
      animationRef.current.start(({ finished }) => {
        if (finished && isAnimating.current) {
          spinValue.setValue(0);
          isAnimating.current = false;
          startAnimation();
        }
      });
    });
  }, [spinValue, createAnimation, isCoverSpin]);

  const stopAnimation = useCallback(() => {
    if (!isAnimating.current) return;
    isAnimating.current = false;
    animationRef.current?.stop();
    animationRef.current = null;
    spinValue.stopAnimation();
  }, [spinValue]);

  useEffect(() => {
    if (isPlay && isCoverSpin) {
      startAnimation();
    } else {
      stopAnimation();
    }
  }, [isPlay, isCoverSpin, startAnimation, stopAnimation]);

  useEffect(() => {
    stopAnimation();
    if (isPlay && isCoverSpin) {
      startAnimation();
    }
  }, [musicInfo.musicInfo?.id, isCoverSpin, startAnimation, stopAnimation]);

  // 进场（挂载时一次）
  useEffect(() => {
    const animation = Animated.timing(enterAnim, {
      toValue: 1,
      duration: MS_MOTION.enterDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [enterAnim]);

  // 切歌时封面交叉淡入
  useEffect(() => {
    if (!musicInfo.musicInfo?.id) return;
    fadeAnim.setValue(0);
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: MS_MOTION.crossFadeDuration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [musicInfo.musicInfo?.id, fadeAnim]);

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // spoti.pw：封面宽度 = 屏宽 − 48（左右各 24），高度只做兜底，避免小屏把控制区挤出去
  const coverSize = useMemo(() => {
    return Math.min(
      winWidth - COVER_INSET_H * 2,
      maxWidth == null ? Number.POSITIVE_INFINITY : maxWidth - COVER_INSET_H * 2,
      maxHeight ?? Number.POSITIVE_INFINITY,
      (winHeight - statusBarHeight - HEADER_HEIGHT) * COVER_MAX_HEIGHT_RATIO,
    )
  }, [maxWidth, maxHeight, statusBarHeight, winHeight, winWidth]);

  const imageContainerStyle = useMemo(() => {
    return {
      width: coverSize,
      height: coverSize,
      borderRadius: isCoverSpin ? coverSize / 2 : SP_RADIUS.cover,
      // 黑色 45%、radius 32、offset (0, 12)（Android 用 elevation 近似）
      shadowColor: '#000000',
      shadowOpacity: 0.45,
      shadowRadius: 32,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    };
  }, [coverSize, isCoverSpin]);

  const imageStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    borderRadius: imageContainerStyle.borderRadius,
  } as const), [imageContainerStyle.borderRadius]);

  const contentStyle = useMemo(() => ({
    width: coverSize,
    height: coverSize,
    borderRadius: imageContainerStyle.borderRadius,
  }), [coverSize, imageContainerStyle.borderRadius]);

  const animatedStyle = useMemo(() => ({
    opacity: Animated.multiply(enterAnim, fadeAnim),
    transform: [{
      translateY: enterAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [MS_MOTION.enterTranslateY, 0],
      }),
    }],
  }), [enterAnim, fadeAnim]);

  const menus = useMemo((): Menus => [
    { action: 'download_song', label: '下载歌曲' },
    { action: 'download_pic', label: '下载封面' },
  ], []);

  const handleLongPress = () => {
    if (!coverRef.current) return;
    longPressedRef.current = true;
    coverRef.current.measure((x, y, w, h, px, py) => {
      setMenuVisible(true);
      requestAnimationFrame(() => {
        menuRef.current?.show({ x: px, y: py, w, h });
      });
    });
  };

  const handlePress = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    onPress?.();
  };

  const handleMenuPress = ({ action }: typeof menus[number]) => {
    switch (action) {
      case 'download_song':
        if (musicInfo.musicInfo) {
          const quality = settingState.setting['player.playQuality'];
          addTask(musicInfo.musicInfo as LX.Music.MusicInfo, quality);
        }
        break;
      case 'download_pic':
        if (musicInfo.musicInfo) {
          void (async () => {
            try {
              const isGranted = await requestStoragePermission();
              if (isGranted === false) {
                toast('没有存储权限，无法下载', 'short');
                return;
              }

              toast('正在下载封面...', 'short');
              const picUrl = await getPicUrl({ musicInfo: musicInfo.musicInfo as LX.Music.MusicInfoOnline, isRefresh: true });
              const extension = getFileExtensionFromUrl(picUrl);
              const picBaseDir = RNFetchBlob.fs.dirs.PictureDir || RNFetchBlob.fs.dirs.DownloadDir;
              const downloadDir = `${picBaseDir}/LX-N-Music`;
              const mInfo = musicInfo.musicInfo as LX.Music.MusicInfo;
              const fileName = `${mInfo.name}_${mInfo.singer}.${extension}`.replace(/[\\/:*?"<>|]/g, '_');
              const filePath = `${downloadDir}/${fileName}`;

              const exists = await RNFetchBlob.fs.exists(downloadDir);
              if (!exists) {
                try {
                  await RNFetchBlob.fs.mkdir(downloadDir);
                } catch (e) {
                  console.warn('mkdir failed');
                }
              }

              const targetPath = (await RNFetchBlob.fs.exists(downloadDir)) ? filePath : `${picBaseDir}/${fileName}`;

              await RNFetchBlob.config({ path: targetPath }).fetch('GET', picUrl);
              await RNFetchBlob.fs.scanFile([{ path: targetPath }]);
              toast(`封面已保存到: ${targetPath}`, 'long');
            } catch (err: any) {
              toast(`下载封面失败: ${err.message}`, 'long');
            }
          })();
        }
        break;
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topPadding }]}>
      <Animated.View style={[imageContainerStyle, animatedStyle]}>
        <TouchableWithoutFeedback onPress={handlePress} onLongPress={handleLongPress}>
          <View ref={coverRef} style={[styles.content, contentStyle]}>
            <Animated.View style={[styles.coverInner, { transform: [{ rotate: spin }] }]}>
              <Image
                url={(musicInfo.musicInfo as LX.Music.MusicInfo)?.meta?.picUrl || idlePlayerCover}
                nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_pic}
                style={imageStyle}
              />
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>
      {menuVisible && <Menu ref={menuRef} menus={menus} onPress={handleMenuPress} onHide={() => setMenuVisible(false)} />}
    </View>
  );
});

const styles = createStyle({
  container: {
    flexGrow: 1,
    flexShrink: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: '3%',
  },
  content: {
    backgroundColor: 'rgba(0,0,0,0)',
    // 裁掉旋转的封面，阴影交给外层 wrapper（Android 上 elevation 与 overflow 冲突）
    overflow: 'hidden',
  },
  coverInner: {
    width: '100%',
    height: '100%',
  },
});
