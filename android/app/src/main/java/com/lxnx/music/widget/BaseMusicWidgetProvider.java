package com.lxnx.music.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.BitmapShader;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Shader;
import android.graphics.drawable.Drawable;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import com.lxnx.music.R;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 桌面小组件公共逻辑。
 *
 * 所有样式共用同一套 id（widget_song_title / widget_lyric_text / widget_album_art / widget_btn_* ...），
 * 只是布局文件不同：由 layoutForClass 决定，新增样式时在这里登记类 + 布局。
 * 唯一例外：widget_progress 在毛玻璃/透明样式里是 ProgressBar，在「主题」样式里是 ImageView
 * （主题色要做成整条位图，ProgressBar 的颜色在低版本无法动态改）。
 *
 * 注意：布局里只能用 RemoteViews 允许的控件类（带 @RemoteView 注解的：FrameLayout / LinearLayout /
 * RelativeLayout / GridLayout / TextView / ImageView / ImageButton / Button / ProgressBar / ViewFlipper 等）。
 * 裸的 android.view.View 不在其中，用了会让桌面报「加载窗口小部件时出现问题」。
 * 子类无需重写任何方法，只要继承即可。
 */
public abstract class BaseMusicWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "MusicWidget";
    public static final String ACTION_PLAY_PAUSE = "OMG.Milky.Music.widget.PLAY_PAUSE";
    public static final String ACTION_PREV = "OMG.Milky.Music.widget.PREV";
    public static final String ACTION_NEXT = "OMG.Milky.Music.widget.NEXT";
    public static final String ACTION_UPDATE_WIDGET = "OMG.Milky.Music.widget.UPDATE";
    public static final String ACTION_UPDATE_LYRIC = "OMG.Milky.Music.widget.UPDATE_LYRIC";
    public static final String ACTION_UPDATE_PROGRESS = "OMG.Milky.Music.widget.UPDATE_PROGRESS";
    public static final String ACTION_UPDATE_THEME = "OMG.Milky.Music.widget.UPDATE_THEME";

    // Internal actions to forward to JS to avoid loop
    public static final String INTERNAL_ACTION_PLAY_PAUSE = "OMG.Milky.Music.widget.INTERNAL_PLAY_PAUSE";
    public static final String INTERNAL_ACTION_PREV = "OMG.Milky.Music.widget.INTERNAL_PREV";
    public static final String INTERNAL_ACTION_NEXT = "OMG.Milky.Music.widget.INTERNAL_NEXT";

    private static final String PREFS_NAME = "MusicWidgetPrefs";
    private static final String KEY_TITLE = "widget_title";
    private static final String KEY_ARTIST = "widget_artist";
    private static final String KEY_IS_PLAYING = "widget_is_playing";
    private static final String KEY_ARTWORK_URL = "widget_artwork_url";
    private static final String KEY_LYRIC = "widget_lyric";
    private static final String KEY_PROGRESS = "widget_progress";

    // 明暗模式（仅「主题」样式使用）
    private static final String KEY_THEME_IS_DARK = "widget_theme_is_dark";

    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    /** 所有小组件样式：新增样式时在这里登记（同时要在 AndroidManifest 注册 receiver） */
    private static final Class<?>[] WIDGET_CLASSES = {
            MusicWidgetProvider.class,
            MusicWidgetTransparentProvider.class,
            MusicWidgetThemeProvider.class,
            MusicWidgetDarkProvider.class,
            MusicWidgetLightProvider.class,
    };

    /** 按样式取布局；新增样式时在这里补一个分支 */
    private static int layoutForClass(Class<?> cls) {
        if (cls == MusicWidgetTransparentProvider.class) {
            return R.layout.widget_music_4x1_transparent;
        }
        if (isMonochromeWidget(cls)) {
            return R.layout.widget_music_4x1_theme;
        }
        return R.layout.widget_music_4x1;
    }

    private static boolean isMonochromeWidget(Class<?> cls) {
        return cls == MusicWidgetThemeProvider.class
                || cls == MusicWidgetDarkProvider.class
                || cls == MusicWidgetLightProvider.class;
    }

    private static boolean isDarkWidget(Class<?> cls, SharedPreferences prefs) {
        if (cls == MusicWidgetDarkProvider.class) return true;
        if (cls == MusicWidgetLightProvider.class) return false;
        return prefs.getBoolean(KEY_THEME_IS_DARK, true);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateSingleWidget(context, appWidgetManager, appWidgetId, getClass());
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (action == null) return;

        switch (action) {
            case ACTION_PLAY_PAUSE:
            case ACTION_PREV:
            case ACTION_NEXT:
                // Forward the action to the music service via INTERNAL broadcast
                String internalAction = action.replace("widget.", "widget.INTERNAL_");
                Intent serviceIntent = new Intent(internalAction);
                serviceIntent.setPackage(context.getPackageName());
                context.sendBroadcast(serviceIntent);
                break;
            case ACTION_UPDATE_WIDGET:
                String title = intent.getStringExtra("title");
                String artist = intent.getStringExtra("artist");
                boolean isPlaying = intent.getBooleanExtra("isPlaying", false);
                String artworkUrl = intent.getStringExtra("artworkUrl");

                // Save to prefs for when widget is recreated
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                SharedPreferences.Editor editor = prefs.edit();
                if (title != null) editor.putString(KEY_TITLE, title);
                if (artist != null) editor.putString(KEY_ARTIST, artist);
                editor.putBoolean(KEY_IS_PLAYING, isPlaying);
                if (artworkUrl != null) editor.putString(KEY_ARTWORK_URL, artworkUrl);
                editor.apply();

                // Update all widget instances（含所有样式）
                updateAllInstances(context);
                break;
            case ACTION_UPDATE_LYRIC:
                String lyric = intent.getStringExtra("lyric");
                updateLyric(context, lyric);
                break;
            case ACTION_UPDATE_PROGRESS:
                int progress = intent.getIntExtra("progress", 0);
                updateProgress(context, progress);
                break;
            case ACTION_UPDATE_THEME:
                boolean themeIsDark = intent.getBooleanExtra("isDark", false);

                SharedPreferences.Editor themeEditor = context
                        .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit();
                themeEditor.putBoolean(KEY_THEME_IS_DARK, themeIsDark);
                themeEditor.apply();

                updateAllInstances(context);
                break;
        }
    }

    /**
     * 进度条更新：用 partial update + setProgressBar（属性更新，partial 支持，开销小，适合每秒频繁更新）。
     */
    private static long lastProgressUpdateMs = 0;
    private static final long PROGRESS_THROTTLE_MS = 500; // 最低 500ms 一次，避免广播风暴

    private void updateProgress(Context context, int progress) {
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int total = 0;
        for (Class<?> cls : WIDGET_CLASSES) {
            total += manager.getAppWidgetIds(new ComponentName(context, cls)).length;
        }
        if (total == 0) return;

        // 节流
        long now = System.currentTimeMillis();
        if (now - lastProgressUpdateMs < PROGRESS_THROTTLE_MS) return;
        lastProgressUpdateMs = now;

        // 持久化（重建小组件时显示）
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putInt(KEY_PROGRESS, progress).apply();

        for (Class<?> cls : WIDGET_CLASSES) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, cls));
            if (ids.length == 0) continue;
            int layoutId = layoutForClass(cls);
            boolean isTheme = isMonochromeWidget(cls);
            Bitmap themedBar = null;
            if (isTheme) {
                boolean isDark = isDarkWidget(cls,
                        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE));
                int accent = isDark ? Color.WHITE : Color.BLACK;
                themedBar = progressBarBitmap(accent, progress);
            }
            for (int id : ids) {
                RemoteViews views = new RemoteViews(context.getPackageName(), layoutId);
                if (isTheme) {
                    if (themedBar != null) views.setImageViewBitmap(R.id.widget_progress, themedBar);
                } else {
                    views.setProgressBar(R.id.widget_progress, 100, progress, false);
                }
                manager.partiallyUpdateAppWidget(id, views);
            }
        }
    }

    /**
     * 歌词行更新：用 full update 确保 widget 真正刷新（partial update 在部分 launcher 不可靠）。
     * 复用 updateSingleWidget 逻辑：设置 title/按钮/intent/最新歌词，artwork 通过 url 去重避免重复加载。
     * 节流并合并中间更新：避免 full update 风暴，同时保证最终显示最新歌词。
     */
    private static long lastLyricUpdateMs = 0;
    private static final long LYRIC_THROTTLE_MS = 200;
    private static String pendingLyric;
    private static Runnable pendingLyricUpdate;

    private void updateLyric(Context context, String lyric) {
        if (lyric == null) return;

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int total = 0;
        for (Class<?> cls : WIDGET_CLASSES) {
            total += manager.getAppWidgetIds(new ComponentName(context, cls)).length;
        }
        if (total == 0) return;

        long now = System.currentTimeMillis();
        long delay = LYRIC_THROTTLE_MS - (now - lastLyricUpdateMs);
        if (delay > 0) {
            pendingLyric = lyric;
            if (pendingLyricUpdate != null) mainHandler.removeCallbacks(pendingLyricUpdate);
            pendingLyricUpdate = () -> {
                String latestLyric = pendingLyric;
                pendingLyric = null;
                pendingLyricUpdate = null;
                if (latestLyric != null) applyLyricUpdate(context, latestLyric);
            };
            mainHandler.postDelayed(pendingLyricUpdate, delay);
            return;
        }

        applyLyricUpdate(context, lyric);
    }

    private void applyLyricUpdate(Context context, String lyric) {
        lastLyricUpdateMs = System.currentTimeMillis();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        // 持久化最新歌词（重建 RemoteViews 时 updateSingleWidget 会从 prefs 读取显示）
        prefs.edit().putString(KEY_LYRIC, lyric).apply();

        // 使用 full update：部分桌面启动器不会可靠应用 partial update。
        // updateSingleWidget 会复用已缓存封面位图，不会在每句歌词时重新下载封面。
        for (Class<?> cls : WIDGET_CLASSES) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, cls));
            if (ids.length == 0) continue;
            for (int id : ids) updateSingleWidget(context, manager, id, cls);
        }
    }

    /** 刷新所有样式、所有实例 */
    private static void updateAllInstances(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> cls : WIDGET_CLASSES) {
            int[] ids = manager.getAppWidgetIds(new ComponentName(context, cls));
            for (int id : ids) {
                updateSingleWidget(context, manager, id, cls);
            }
        }
    }

    private static void updateSingleWidget(Context context, AppWidgetManager appWidgetManager,
                                           int appWidgetId, Class<?> cls) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layoutForClass(cls));

        // Read saved state
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String title = prefs.getString(KEY_TITLE, "奶音");
        String artist = prefs.getString(KEY_ARTIST, "未在播放");
        boolean isPlaying = prefs.getBoolean(KEY_IS_PLAYING, false);
        String artworkUrl = prefs.getString(KEY_ARTWORK_URL, null);
        String lyric = prefs.getString(KEY_LYRIC, null);

        // Set text
        views.setTextViewText(R.id.widget_song_title, title);
        // 歌词区：重建时显示最新歌词（无歌词时显示歌手信息）
        String displayLyric = (lyric != null && !lyric.isEmpty()) ? lyric : artist;
        views.setTextViewText(R.id.widget_lyric_text, displayLyric);
        // 进度条：重建时从 prefs 恢复上次进度（主题样式的进度是位图，由 applyThemeColors 一起画）
        int progress = prefs.getInt(KEY_PROGRESS, 0);
        if (!isMonochromeWidget(cls)) {
            views.setProgressBar(R.id.widget_progress, 100, progress, false);
        }

        // Set play/pause icon
        views.setImageViewResource(R.id.widget_btn_play,
                isPlaying ? R.drawable.widget_ic_pause : R.drawable.widget_ic_play);

        // 主题样式：底色 / 文字 / 进度条 / 图标按当前主题上色（放在图标设定之后，图标位图才会覆盖默认白图标）
        if (isMonochromeWidget(cls)) {
            applyThemeColors(context, views, prefs, isPlaying, isDarkWidget(cls, prefs));
        }

        // Set button click intents
        views.setOnClickPendingIntent(R.id.widget_btn_prev, getPendingIntent(context, ACTION_PREV, cls));
        views.setOnClickPendingIntent(R.id.widget_btn_play, getPendingIntent(context, ACTION_PLAY_PAUSE, cls));
        views.setOnClickPendingIntent(R.id.widget_btn_next, getPendingIntent(context, ACTION_NEXT, cls));

        // Click on widget body to open the app
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent launchPending = PendingIntent.getActivity(context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_info, launchPending);
            views.setOnClickPendingIntent(R.id.widget_album_art, launchPending);
        }

        // 封面位：没有封面（未在播放 / 无图）时显示音符占位，不画底衬
        boolean hasArtwork = artworkUrl != null && !artworkUrl.isEmpty();
        if (!hasArtwork) {
            artworkCache.remove(appWidgetId);
            artworkBitmapCache.remove(appWidgetId);
            setNoteIcon(context, views, cls, prefs);
        } else {
            Bitmap cachedArtwork = artworkUrl.equals(artworkCache.get(appWidgetId))
                    ? artworkBitmapCache.get(appWidgetId) : null;
            if (cachedArtwork != null) {
                views.setImageViewBitmap(R.id.widget_album_art, cachedArtwork);
            } else {
                setNoteIcon(context, views, cls, prefs);
            }
        }

        // Update immediately with text first
        appWidgetManager.updateAppWidget(appWidgetId, views);

        // Load artwork asynchronously（同一实例同一 url 只加载一次，避免 updateLyric 频繁 full update 时重复加载）
        if (hasArtwork) {
            loadArtworkAsync(context, appWidgetManager, appWidgetId, cls, artworkUrl);
        }
    }

    /** widgetId -> 已加载的封面 url，用于去重（按实例区分，多实例各自加载互不影响） */
    private static final Map<Integer, String> artworkCache = new HashMap<>();
    /** RemoteViews 全量重建时复用已解码位图，避免相同 URL 被去重后封面丢失。 */
    private static final Map<Integer, Bitmap> artworkBitmapCache = new HashMap<>();

    /**
     * 异步加载封面图。同一实例的同一 url 只加载一次，避免 updateLyric full update 时重复下载。
     */
    private static void loadArtworkAsync(Context context, AppWidgetManager appWidgetManager,
                                         int appWidgetId, Class<?> cls, String artworkUrl) {
        if (artworkUrl.equals(artworkCache.get(appWidgetId))) return;
        artworkCache.put(appWidgetId, artworkUrl);
        artworkBitmapCache.remove(appWidgetId);
        executor.execute(() -> {
            try {
                Bitmap bitmap;
                if (artworkUrl.startsWith("http://") || artworkUrl.startsWith("https://")) {
                    URL url = new URL(artworkUrl);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setDoInput(true);
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.connect();
                    InputStream input = conn.getInputStream();
                    bitmap = BitmapFactory.decodeStream(input);
                    input.close();
                    conn.disconnect();
                } else if (artworkUrl.startsWith("file://")) {
                    String path = artworkUrl.replace("file://", "");
                    bitmap = BitmapFactory.decodeFile(path);
                } else {
                    bitmap = BitmapFactory.decodeFile(artworkUrl);
                }

                if (bitmap == null) {
                    // 下载/解码失败：退回音符占位，避免留在旧封面或空白
                    showNotePlaceholder(context, appWidgetManager, appWidgetId, cls, artworkUrl);
                    return;
                }

                // 等比例居中裁成圆角正方形，不能直接缩放宽高，否则非方形封面会变形。
                final Bitmap finalBitmap;
                try {
                    finalBitmap = createRoundedArtwork(bitmap);
                } finally {
                    bitmap.recycle();
                }
                mainHandler.post(() -> {
                    if (!artworkUrl.equals(artworkCache.get(appWidgetId))) {
                        finalBitmap.recycle();
                        return;
                    }
                    artworkBitmapCache.put(appWidgetId, finalBitmap);
                    RemoteViews views = new RemoteViews(context.getPackageName(), layoutForClass(cls));
                    views.setImageViewBitmap(R.id.widget_album_art, finalBitmap);
                    appWidgetManager.partiallyUpdateAppWidget(appWidgetId, views);
                });
            } catch (Exception e) {
                Log.e(TAG, "Failed to load artwork: " + e.getMessage());
                // 加载异常同样退回音符占位
                showNotePlaceholder(context, appWidgetManager, appWidgetId, cls, artworkUrl);
            }
        });
    }

    /** 三种样式共用：64dp 封面、8dp 圆角，以 128px 位图传给 RemoteViews。 */
    private static Bitmap createRoundedArtwork(Bitmap source) {
        int size = 128;
        float radius = size * (8f / 64f);
        int cropSize = Math.min(source.getWidth(), source.getHeight());
        int cropLeft = (source.getWidth() - cropSize) / 2;
        int cropTop = (source.getHeight() - cropSize) / 2;
        Bitmap square = Bitmap.createBitmap(source, cropLeft, cropTop, cropSize, cropSize);

        Matrix matrix = new Matrix();
        matrix.setScale(size / (float) cropSize, size / (float) cropSize);

        BitmapShader shader = new BitmapShader(square, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP);
        shader.setLocalMatrix(matrix);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
        paint.setShader(shader);

        Bitmap result = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        new Canvas(result).drawRoundRect(0, 0, size, size, radius, radius, paint);
        if (square != source) square.recycle();
        return result;
    }

    /**
     * 无封面占位音符：毛玻璃/透明样式用白色；「主题」样式把音符按副标题色渲染
     * （亮色卡片上白音符看不见）。
     */
    private static void setNoteIcon(Context context, RemoteViews views, Class<?> cls, SharedPreferences prefs) {
        if (isMonochromeWidget(cls)) {
            int color = isDarkWidget(cls, prefs) ? Color.WHITE : Color.BLACK;
            Bitmap note = iconBitmap(context, R.drawable.widget_ic_note, color, 64);
            if (note != null) {
                views.setImageViewBitmap(R.id.widget_album_art, note);
                return;
            }
        }
        views.setImageViewResource(R.id.widget_album_art, R.drawable.widget_ic_note);
    }

    /** 把封面位换回音符占位（背景透明） */
    private static void showNotePlaceholder(Context context, AppWidgetManager appWidgetManager,
                                            int appWidgetId, Class<?> cls, String expectedUrl) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        mainHandler.post(() -> {
            if (!expectedUrl.equals(artworkCache.get(appWidgetId))) return;
            artworkCache.remove(appWidgetId);
            artworkBitmapCache.remove(appWidgetId);
            RemoteViews views = new RemoteViews(context.getPackageName(), layoutForClass(cls));
            setNoteIcon(context, views, cls, prefs);
            appWidgetManager.partiallyUpdateAppWidget(appWidgetId, views);
        });
    }

    /**
     * 把主题色套到「主题」样式上：卡片底、标题、歌词、进度条、三个按钮图标。
     *
     * 只用各版本都存在的 RemoteViews 能力（RemoteViews.setColorStateList 要 API 31，
     * 在 Android 11 及以下会直接 NoSuchMethodError）：
     *  - 背景色 → setInt(id, "setBackgroundColor", color)
     *  - 文字色 → setTextColor
     *  - 图标   → 把白色矢量按目标颜色画成位图，再 setImageViewBitmap
     *  - 进度条 → 直接画成一整条位图（底槽 + 已完成），setImageViewBitmap
     */
    private static void applyThemeColors(Context context, RemoteViews views, SharedPreferences prefs,
                                         boolean isPlaying, boolean isDark) {
        int bg = isDark ? Color.BLACK : Color.WHITE;
        int foreground = isDark ? Color.WHITE : Color.BLACK;
        int accent = foreground;

        views.setInt(R.id.widget_theme_bg, "setBackgroundColor", bg);
        views.setTextColor(R.id.widget_song_title, foreground);
        views.setTextColor(R.id.widget_lyric_text, foreground);

        // 进度条：整条位图，已完成部分主色、底槽主色 28%
        Bitmap bar = progressBarBitmap(accent, prefs.getInt(KEY_PROGRESS, 0));
        if (bar != null) views.setImageViewBitmap(R.id.widget_progress, bar);

        // Keep the glyph at the same 24dp intrinsic size as the other widget variants.
        Bitmap playIcon = iconBitmap(context,
                isPlaying ? R.drawable.widget_ic_pause : R.drawable.widget_ic_play, accent, 24);
        Bitmap prevIcon = iconBitmap(context, R.drawable.widget_ic_prev, foreground, 24);
        Bitmap nextIcon = iconBitmap(context, R.drawable.widget_ic_next, foreground, 24);
        if (playIcon != null) views.setImageViewBitmap(R.id.widget_btn_play, playIcon);
        if (prevIcon != null) views.setImageViewBitmap(R.id.widget_btn_prev, prevIcon);
        if (nextIcon != null) views.setImageViewBitmap(R.id.widget_btn_next, nextIcon);
        // 注意：不要给 widget_album_art 上色，否则播放时封面位图也会被染色（占位音符见 setNoteIcon）
    }

    /** 图标着色位图缓存：resId#color#size -> Bitmap（避免每次全量刷新都重画） */
    private static final Map<String, Bitmap> iconCache = new HashMap<>();

    /** 把白色矢量图标按指定颜色渲染成位图（RemoteViews 传不了 tint，这样最兼容） */
    private static Bitmap iconBitmap(Context context, int resId, int color, int sizeDp) {
        String key = resId + "#" + color + "#" + sizeDp;
        Bitmap cached = iconCache.get(key);
        if (cached != null) return cached;
        // 换主题时颜色会变，缓存别无限长
        if (iconCache.size() > 24) iconCache.clear();
        try {
            Drawable drawable = context.getDrawable(resId);
            if (drawable == null) return null;
            drawable = drawable.mutate();
            drawable.setTint(color);
            int size = Math.max(1, Math.round(sizeDp * context.getResources().getDisplayMetrics().density));
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            drawable.setBounds(0, 0, size, size);
            drawable.draw(new Canvas(bitmap));
            iconCache.put(key, bitmap);
            return bitmap;
        } catch (Exception e) {
            Log.w(TAG, "Failed to render icon: " + e.getMessage());
            return null;
        }
    }

    /** 进度条位图缓存：accent#progress -> Bitmap */
    private static final Map<String, Bitmap> progressCache = new HashMap<>();

    /**
     * 画主题样式的进度条：整条一张位图（底槽 accent@28% + 已完成 accent）。
     * ImageView 是 RemoteViews 允许的控件，所以颜色和进度都能随便变，且不依赖任何高版本 API。
     * 源图 300x8，显示时按 fitXY 拉伸到实际高度（3dp），纯色条拉伸看不出差别。
     */
    private static Bitmap progressBarBitmap(int accent, int progress) {
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;
        String key = accent + "#" + progress;
        Bitmap cached = progressCache.get(key);
        if (cached != null) return cached;
        try {
            if (progressCache.size() > 32) progressCache.clear();
            final int w = 300, h = 8;
            Bitmap bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            Paint paint = new Paint();
            paint.setColor(withAlpha(accent, 0.28f));
            canvas.drawRect(0, 0, w, h, paint);
            paint.setColor(accent);
            canvas.drawRect(0, 0, w * progress / 100f, h, paint);
            progressCache.put(key, bitmap);
            return bitmap;
        } catch (Exception e) {
            Log.w(TAG, "Failed to render progress bar: " + e.getMessage());
            return null;
        }
    }

    private static int withAlpha(int color, float alpha) {
        int a = Math.max(0, Math.min(255, Math.round(alpha * 255)));
        return (color & 0x00FFFFFF) | (a << 24);
    }

    private static PendingIntent getPendingIntent(Context context, String action, Class<?> cls) {
        Intent intent = new Intent(context, cls);
        intent.setAction(action);
        // 不同样式用不同 requestCode，避免 PendingIntent 互相覆盖
        int requestCode = (action + "#" + cls.getSimpleName()).hashCode();
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Static helper to update all widgets from anywhere in the app
     */
    public static void updateAllWidgets(Context context, String title, String artist, boolean isPlaying, String artworkUrl) {
        Intent intent = new Intent(context, MusicWidgetProvider.class);
        intent.setAction(ACTION_UPDATE_WIDGET);
        intent.putExtra("title", title);
        intent.putExtra("artist", artist);
        intent.putExtra("isPlaying", isPlaying);
        intent.putExtra("artworkUrl", artworkUrl);
        context.sendBroadcast(intent);
    }

    /**
     * Static helper to push the current lyric line to all widgets
     */
    public static void updateLyricAllWidgets(Context context, String lyric) {
        Intent intent = new Intent(context, MusicWidgetProvider.class);
        intent.setAction(ACTION_UPDATE_LYRIC);
        intent.putExtra("lyric", lyric);
        context.sendBroadcast(intent);
    }

    /**
     * 推送播放进度到小组件进度条（0-100 整数）。
     */
    public static void updateProgressAllWidgets(Context context, int progress) {
        Intent intent = new Intent(context, MusicWidgetProvider.class);
        intent.setAction(ACTION_UPDATE_PROGRESS);
        intent.putExtra("progress", progress);
        context.sendBroadcast(intent);
    }

    /** Refresh the theme-following widget; fixed dark/light widgets keep their own mode. */
    public static void updateWidgetThemeAllWidgets(Context context, boolean isDark) {
        Intent intent = new Intent(context, MusicWidgetProvider.class);
        intent.setAction(ACTION_UPDATE_THEME);
        intent.putExtra("isDark", isDark);
        context.sendBroadcast(intent);
    }
}
