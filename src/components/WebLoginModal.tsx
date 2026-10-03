import { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Modal, { type ModalType } from '@/components/common/Modal';
import WebView, { type WebViewNavigation } from 'react-native-webview';
import { useTheme } from '@/store/theme/hook';
import { useStatusbarHeight } from '@/store/common/hook';
import { Icon } from '@/components/common/Icon';
import Text from '@/components/common/Text';
import { toast } from '@/utils/tools';
import wyApi from '@/utils/musicSdk/wy/user';
import CookieManager from '@react-native-cookies/cookies';
import Button from '@/components/common/Button';


const LOGIN_URL = 'https://music.163.com/m/login';
const SUCCESS_URL_FLAG = 'music.163.com';

// 判断 cookie 是否"像"登录态：至少命中一个登录态字段（手机号/P_INFO、邮箱/MUSIC_U、会话/S_INFO、__csrf 全部都算）
const looksLikeLoggedInCookie = (cookie: string): boolean => {
  if (!cookie) return false;
  return /(^|;\s*)(MUSIC_U|S_INFO|P_INFO|__csrf|NMTID|_ntes_nuid|_ntes_nnid)=/.test(cookie)
    && (cookie.includes('MUSIC_U=') || cookie.includes('S_INFO=') || cookie.includes('P_INFO='));
};

export interface WebLoginModalType {
  show: () => void;
}

const Header = ({ onClose, onExtractNow }: { onClose: () => void; onExtractNow: () => void }) => {
  const theme = useTheme();
  const statusBarHeight = useStatusbarHeight();

  return (
    <View style={[styles.header, { height: 50 + statusBarHeight, paddingTop: statusBarHeight, backgroundColor: theme['c-content-background'] }]}>
      <TouchableOpacity onPress={onClose} style={styles.backButton}>
        <Icon name="chevron-left" size={24} color={theme['c-font']} />
      </TouchableOpacity>
      <Text size={18}>网易云音乐登录</Text>
      <View style={[styles.backButton, styles.extractBtnWrap]}>
        <TouchableOpacity onPress={onExtractNow}>
          <Text size={12} color={theme['c-primary-font']}>提取Cookie</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
export default forwardRef<WebLoginModalType, {}>((props, ref) => {
  const modalRef = useRef<ModalType>(null);
  const webViewRef = useRef<WebView>(null);
  const loggedInRef = useRef(false);
  const isCheckingRef = useRef(false);
  const visibleRef = useRef(false);
  const pollTimerRef = useRef<any>(null);
  const theme = useTheme();

  useImperativeHandle(ref, () => ({
    show() {
      loggedInRef.current = false;
      isCheckingRef.current = false;
      visibleRef.current = true;
      modalRef.current?.setVisible(true);
    },
  }));

  const handleClose = useCallback(() => {
    visibleRef.current = false;
    stopPollingInternal();
    modalRef.current?.setVisible(false);
  }, []);

  const stopPollingInternal = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const stopPolling = () => {
    stopPollingInternal();
  };

  // 打开 modal 后启动后台轮询：应对 SPA 登录（不触发 onNavigationStateChange）或 CookieJar 延迟写入
  useEffect(() => {
    return () => stopPollingInternal();
  }, []);

  const startPollingIfNeeded = () => {
    if (pollTimerRef.current || loggedInRef.current) return;
    // 每 2s 主动拉一次 cookie，连续 2 次取到有效 cookie 才停止（最多跑 60s）
    let attempts = 0;
    const MAX_ATTEMPTS = 30;
    pollTimerRef.current = setInterval(async () => {
      if (loggedInRef.current || !visibleRef.current || attempts++ >= MAX_ATTEMPTS) {
        stopPollingInternal();
        return;
      }
      try {
        await extractCookieNowInternal(true);
      } catch {
        // ignore
      }
    }, 2000);
  };

  // 合并提取 cookie：先 CookieManager（全域名 cookie jar，含 HttpOnly/MUSIC_U/P_INFO），失败再回退 document.cookie
  // 如果 includeSubdomains=true，CookieManager 会把 music.163.com、.music.163.com、.163.com 的 cookie 都取到
  const extractCookieNowInternal = async (silentOnMissing = false) => {
    if (loggedInRef.current || isCheckingRef.current) return;
    console.log('Web登录: 提取 Cookie（CookieManager + 回退 document.cookie）');
    let cookieString = '';
    try {
      // 三个域名一起合并，最大化抓到 MUSIC_U / P_INFO
      const urls = [
        'https://music.163.com',
        'https://.music.163.com',
        'https://www.163.com',
        'https://.163.com',
      ];
      const all: Record<string, any> = {};
      for (const u of urls) {
        try {
          const c = await CookieManager.get(u, true);
          Object.assign(all, c);
        } catch { /* per-domain ignore */ }
      }
      cookieString = Object.values(all)
        .filter((c: any) => c && c.name && c.value != null)
        .map((c: any) => `${c.name}=${c.value}`)
        .join('; ');
      console.log('Web登录: CookieManager 抓到 key 数 =', cookieString ? cookieString.split(/;\s*/).filter(Boolean).length : 0);
    } catch (err) {
      console.error('Web登录: CookieManager 失败，回退 document.cookie', err);
    }
    if (!cookieString) {
      // 兜底：WebView 内部 JS 抓 document.cookie（抓不到 HttpOnly，但够用）
      webViewRef.current?.injectJavaScript(
        '(function(){try{window.ReactNativeWebView.postMessage("COOKIE_INJECT:"+document.cookie)}catch(e){window.ReactNativeWebView.postMessage("COOKIE_INJECT:")}})(); true;'
      );
      return;
    }
    await handleCookieCandidate(cookieString, silentOnMissing);
  };

  // 按钮触发的"手动提取"：一定给用户 toast 反馈（成功/失败/未登录）
  const handleExtractNow = async () => {
    try {
      await extractCookieNowInternal(false);
    } catch (err) {
      console.error('Web登录: 手动提取异常', err);
      toast('提取 Cookie 失败，请重试', 'long');
    }
  };

  const handleCookieCandidate = async (rawCookie: string, silentOnMissing: boolean) => {
    if (loggedInRef.current || isCheckingRef.current) return;
    if (!rawCookie) {
      if (!silentOnMissing) toast('未读取到 Cookie，请先完成登录');
      return;
    }
    // 宽松校验：手机号登录有 P_INFO/S_INFO；邮箱登录有 MUSIC_U/S_INFO。都满足不了 = 未登录
    if (!looksLikeLoggedInCookie(rawCookie)) {
      console.log('Web登录: cookie 候选不含登录态字段，跳过验证');
      if (!silentOnMissing) toast('Cookie 中未检测到登录信息，请先完成登录后再提取');
      return;
    }
    isCheckingRef.current = true;
    try {
      // 调用 getUid 做服务端校验，同时会写入 VIP 类型/缓存
      await wyApi.getUid(rawCookie);
      loggedInRef.current = true;
      stopPollingInternal();
      global.app_event.emit('wy-cookie-set', rawCookie);
      toast('登录成功，已自动获取 Cookie！');
      handleClose();
    } catch (error) {
      const msg = (error as Error)?.message || '未知错误';
      console.warn('Web登录: 服务端校验失败', msg);
      if (!silentOnMissing) toast(`登录校验失败：${msg}，请确认已成功登录网易云账号`, 'long');
    } finally {
      isCheckingRef.current = false;
    }
  };

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    console.log('Web登录: 页面导航状态变化:', navState.url);
    const url = navState.url;
    // 宽松判定：只排除 /login 字面量；网易云手机端登录成功后仍在 /m/... 路径下
    const looksDone = url.includes(SUCCESS_URL_FLAG) && !/\/login($|[?#/])/.test(url);
    if (looksDone) {
      // 启动补拉轮询（幂等，已启动就跳过）
      startPollingIfNeeded();
      // 立即先尝试提取一次
      try { await extractCookieNowInternal(true); } catch { /* ignore */ }
    }
  };

  const handleMessage = async (event: any) => {
    const raw: string = event?.nativeEvent?.data ?? '';
    if (!raw) return;
    console.log('Web登录: 收到消息长度 =', raw.length);
    if (loggedInRef.current || isCheckingRef.current) return;
    // 兼容注入 JS 的 COOKIE_INJECT: 前缀；其他消息（含原始 postMessage document.cookie）原样处理
    const cookie = raw.startsWith('COOKIE_INJECT:') ? raw.slice('COOKIE_INJECT:'.length) : raw;
    await handleCookieCandidate(cookie, false);
  };

  const injectedJavaScriptBeforeContentLoaded = `
    (function() {
      if (window.__lxNeteaseLoginTouchPatch) return true;
      window.__lxNeteaseLoginTouchPatch = true;

      var originalAddEventListener = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        var isCapture = options === true || !!(options && options.capture);
        var isBodyTouchMove = type === 'touchmove' && isCapture && (this === document || this === document.body);
        if (isBodyTouchMove && typeof listener === 'function') {
          var wrappedListener = function(event) {
            var yidun = document.querySelector('.yidun');
            if (yidun && !yidun.contains(event.target)) return;
            return listener.call(this, event);
          };
          return originalAddEventListener.call(this, type, wrappedListener, options);
        }
        return originalAddEventListener.call(this, type, listener, options);
      };

      var touchStartX = 0;
      var touchStartY = 0;

      document.addEventListener('touchstart', function(event) {
        if (!event.touches || event.touches.length !== 1) return;
        touchStartX = event.touches[0].clientX;
        touchStartY = event.touches[0].clientY;
      }, true);

      document.addEventListener('touchend', function(event) {
        if (!event.changedTouches || event.changedTouches.length !== 1) return;
        var touch = event.changedTouches[0];
        if (Math.abs(touch.clientX - touchStartX) > 8 || Math.abs(touch.clientY - touchStartY) > 8) return;

        var target = event.target;
        if (!target || !target.closest) return;
        if (target.closest('a[href*="official-terms"]')) return;

        var clickable = target.closest('span,label');
        if (!clickable) return;

        var terms = clickable.parentElement;
        if (
          !terms ||
          !terms.textContent ||
          terms.textContent.indexOf('同意') === -1 ||
          !terms.querySelector('a[href*="official-terms"]')
        ) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        clickable.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        }));
      }, true);

      return true;
    })();
  `;
  const injectedJavaScript = `true;`;

  return (
    <Modal ref={modalRef} onHide={stopPolling} statusBarPadding={false} bgHide={false}>
      <View style={[styles.container, { backgroundColor: theme['c-content-background'] }]}>
        <Header onClose={handleClose} onExtractNow={handleExtractNow} />
        <WebView
          ref={webViewRef}
          source={{ uri: LOGIN_URL }}
          onMessage={handleMessage}
          injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
          injectedJavaScript={injectedJavaScript}
          onNavigationStateChange={handleNavigationStateChange}
          userAgent="Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
          javaScriptEnabled={true}
          domStorageEnabled={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
        />
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 5,
    width: 40,
  },
  extractBtnWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 6,
  },
});
