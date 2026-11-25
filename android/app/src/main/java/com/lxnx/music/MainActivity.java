package com.lxnx.music;

import android.content.res.Configuration;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.ViewGroup;
import android.view.ViewParent;

import com.facebook.react.ReactRootView;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.modules.deviceinfo.DeviceInfoModule;
import com.facebook.react.uimanager.DisplayMetricsHolder;
import com.lxnx.music.glass.GlassBackdropHost;
import com.reactnativenavigation.NavigationActivity;

/**
 * 液态玻璃需要把「玻璃背后的整棵界面」录进 RenderNode，所以 RN 根视图必须有一个
 * [GlassBackdropHost] 爸爸（见 glass/GlassBackdropHost.kt）。
 *
 * 这里有两条包装路径：
 *  1. {@link #setContentView(View)} / {@link #setContentView(View, ViewGroup.LayoutParams)}：
 *     标准 RN 会用 ReactRootView 调 setContentView，直接在这里包一层；
 *  2. {@link #wrapReactRootViews()}：本项目用的是 react-native-navigation（RNN），
 *     它不把 ReactRootView 交给 setContentView，而是自己往 android.R.id.content 里
 *     塞导航布局、再把每个屏幕的 ReactView（继承自 ReactRootView）挂到更深的位置，
 *     所以还要在全局布局回调里兜底查找并就地包一层。
 *
 * 只包 ReactRootView，其它内容（RNN 的启动占位 View、导航栏等）原样不动。
 */
public class MainActivity extends NavigationActivity {

    /** 防止在全局布局回调里改视图树时重入。 */
    private boolean wrappingReactRootViews = false;
    private int navigationOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyScreenOrientationPolicy();
        // RNN 的 ReactView 是异步挂上来的，这里只挂监听，真正的包装在全局布局回调里做。
        getWindow().getDecorView().getViewTreeObserver()
                .addOnGlobalLayoutListener(() -> wrapReactRootViews());
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyScreenOrientationPolicy();
        refreshReactWindowMetrics();
    }

    @Override
    protected void onResume() {
        super.onResume();
        applyScreenOrientationPolicy();
        refreshReactWindowMetrics();
    }

    @Override
    public void setRequestedOrientation(int orientation) {
        // RNN reapplies orientation during push/pop. Keep its requested value
        // for wide screens, but do not let it unlock a narrow phone display.
        navigationOrientation = orientation;
        applyScreenOrientationPolicy();
    }

    private void applyScreenOrientationPolicy() {
        DisplayMetrics screen = new DisplayMetrics();
        getWindowManager().getDefaultDisplay().getRealMetrics(screen);
        int orientation = ScreenLayoutPolicy.locksPortrait(
                screen.widthPixels, screen.heightPixels, screen.density)
                ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT : navigationOrientation;
        if (getRequestedOrientation() != orientation) super.setRequestedOrientation(orientation);
    }

    private void refreshReactWindowMetrics() {
        // RN 0.73 refreshes the cached metrics on rotation. Switching displays
        // can resize this Activity while both displays remain in portrait.
        DisplayMetricsHolder.initDisplayMetrics(this);
        ReactNativeHost host = ((MainApplication) getApplication()).getReactNativeHost();
        if (!host.hasInstance()) return;
        ReactContext context = host.getReactInstanceManager().getCurrentReactContext();
        if (context == null || !context.hasActiveReactInstance()) return;
        DeviceInfoModule deviceInfo = context.getNativeModule(DeviceInfoModule.class);
        if (deviceInfo != null) deviceInfo.emitUpdateDimensionsEvent();
    }

    @Override
    public void setContentView(View view) {
        super.setContentView(wrapIfReactRoot(view));
    }

    @Override
    public void setContentView(View view, ViewGroup.LayoutParams params) {
        super.setContentView(wrapIfReactRoot(view), params);
    }

    /** 标准 RN 路径：把传给 setContentView 的 ReactRootView 包进玻璃宿主。 */
    private static View wrapIfReactRoot(View view) {
        if (!(view instanceof ReactRootView)) {
            // 不是 RN 内容（例如 RNN 的启动占位 View），不要乱包。
            return view;
        }
        if (view.getParent() instanceof GlassBackdropHost) {
            return view;
        }
        GlassBackdropHost host = new GlassBackdropHost(view.getContext());
        host.addView(view, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        return host;
    }

    /**
     * RNN 路径的兜底：在内容视图树里找到还没被包过的 ReactRootView，
     * 用 GlassBackdropHost 顶替它在父容器里的位置。
     */
    private void wrapReactRootViews() {
        if (wrappingReactRootViews) return;
        wrappingReactRootViews = true;
        try {
            View content = findViewById(android.R.id.content);
            if (content != null) {
                wrapTree(content);
            }
        } finally {
            wrappingReactRootViews = false;
        }
    }

    private static void wrapTree(View view) {
        ViewParent parent = view.getParent();
        if (view instanceof ReactRootView
                && parent instanceof ViewGroup
                && !(parent instanceof GlassBackdropHost)) {
            ViewGroup group = (ViewGroup) parent;
            int index = group.indexOfChild(view);
            // 保留原来的 LayoutParams（可能带 RNN 自己的 margin / gravity），
            // 父容器在 addView 时会把它转成自己需要的类型。
            ViewGroup.LayoutParams params = view.getLayoutParams();

            group.removeViewAt(index);

            GlassBackdropHost host = new GlassBackdropHost(view.getContext());
            host.addView(view, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            group.addView(host, index, params);
            return;
        }

        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                wrapTree(group.getChildAt(i));
            }
        }
    }
}
