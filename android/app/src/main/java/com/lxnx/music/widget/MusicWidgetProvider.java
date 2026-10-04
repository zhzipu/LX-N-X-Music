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
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import com.lxnx.music.R;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicWidgetProvider extends AppWidgetProvider {

    private static final String TAG = "MusicWidget";
    public static final String ACTION_PLAY_PAUSE = "com.lxnx.music.widget.PLAY_PAUSE";
    public static final String ACTION_PREV = "com.lxnx.music.widget.PREV";
    public static final String ACTION_NEXT = "com.lxnx.music.widget.NEXT";
    public static final String ACTION_UPDATE_WIDGET = "com.lxnx.music.widget.UPDATE";
    public static final String ACTION_UPDATE_LYRIC = "com.lxnx.music.widget.UPDATE_LYRIC";
    public static final String ACTION_UPDATE_PROGRESS = "com.lxnx.music.widget.UPDATE_PROGRESS";

    // Internal actions to forward to JS to avoid loop
    public static final String INTERNAL_ACTION_PLAY_PAUSE = "com.lxnx.music.widget.INTERNAL_PLAY_PAUSE";
    public static final String INTERNAL_ACTION_PREV = "com.lxnx.music.widget.INTERNAL_PREV";
    public static final String INTERNAL_ACTION_NEXT = "com.lxnx.music.widget.INTERNAL_NEXT";

    private static final String PREFS_NAME = "MusicWidgetPrefs";
    private static final String KEY_TITLE = "widget_title";
    private static final String KEY_ARTIST = "widget_artist";
    private static final String KEY_IS_PLAYING = "widget_is_playing";
    private static final String KEY_ARTWORK_URL = "widget_artwork_url";
    private static final String KEY_LYRIC = "widget_lyric";
    private static final String KEY_PROGRESS = "widget_progress";

    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
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

                // Update all widget instances
                AppWidgetManager manager = AppWidgetManager.getInstance(context);
                ComponentName widget = new ComponentName(context, MusicWidgetProvider.class);
                int[] ids = manager.getAppWidgetIds(widget);
                for (int id : ids) {
                    updateWidget(context, manager, id);
                }
                break;
            case ACTION_UPDATE_LYRIC:
                String lyric = intent.getStringExtra("lyric");
                updateLyric(context, lyric);
                break;
            case ACTION_UPDATE_PROGRESS:
                int progress = intent.getIntExtra("progress", 0);
                updateProgress(context, progress);
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
        ComponentName widget = new ComponentName(context, MusicWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(widget);
        if (ids.length == 0) return;

        // 节流
        long now = System.currentTimeMillis();
        if (now - lastProgressUpdateMs < PROGRESS_THROTTLE_MS) return;
        lastProgressUpdateMs = now;

        // 持久化（重建小组件时显示）
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putInt(KEY_PROGRESS, progress).apply();

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_music_4x1);
            views.setProgressBar(R.id.widget_progress, 100, progress, false);
            manager.partiallyUpdateAppWidget(id, views);
        }
    }

    /**
     * 歌词行更新：用 full update 确保 widget 真正刷新（partial update 在部分 launcher 不可靠）。
     * 复用 updateWidget 逻辑：设置 title/按钮/intent/最新歌词，artwork 通过 url 去重避免重复加载。
     * 节流：避免高频 onPlay 导致 full update 风暴（最低 200ms 一次）。
     */
    private static long lastLyricUpdateMs = 0;
    private static final long LYRIC_THROTTLE_MS = 200;
    private static String lastArtworkUrl = null;

    private void updateLyric(Context context, String lyric) {
        if (lyric == null) return;

        // 诊断日志：确认 onPlay 是否持续触发
        Log.e(TAG, "updateLyric: " + lyric);

        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName widget = new ComponentName(context, MusicWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(widget);
        if (ids.length == 0) return;

        // 节流
        long now = System.currentTimeMillis();
        if (now - lastLyricUpdateMs < LYRIC_THROTTLE_MS) return;
        lastLyricUpdateMs = now;

        // 持久化最新歌词（updateWidget 会从 prefs 读取显示）
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putString(KEY_LYRIC, lyric).apply();

        // full update：复用 updateWidget，确保所有字段 + 歌词刷新
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_music_4x1);

        // Read saved state
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String title = prefs.getString(KEY_TITLE, "LX-N-X Music");
        String artist = prefs.getString(KEY_ARTIST, "未在播放");
        boolean isPlaying = prefs.getBoolean(KEY_IS_PLAYING, false);
        String artworkUrl = prefs.getString(KEY_ARTWORK_URL, null);
        String lyric = prefs.getString(KEY_LYRIC, null);

        // Set text
        views.setTextViewText(R.id.widget_song_title, title);
        // 歌词区：重建时显示最新歌词（无歌词时显示歌手信息）
        String displayLyric = (lyric != null && !lyric.isEmpty()) ? lyric : artist;
        views.setTextViewText(R.id.widget_lyric_text, displayLyric);
        // 进度条：重建时从 prefs 恢复上次进度
        int progress = prefs.getInt(KEY_PROGRESS, 0);
        views.setProgressBar(R.id.widget_progress, 100, progress, false);

        // Set play/pause icon
        views.setImageViewResource(R.id.widget_btn_play,
                isPlaying ? R.drawable.widget_ic_pause : R.drawable.widget_ic_play);

        // Set button click intents
        views.setOnClickPendingIntent(R.id.widget_btn_prev, getPendingIntent(context, ACTION_PREV));
        views.setOnClickPendingIntent(R.id.widget_btn_play, getPendingIntent(context, ACTION_PLAY_PAUSE));
        views.setOnClickPendingIntent(R.id.widget_btn_next, getPendingIntent(context, ACTION_NEXT));

        // Click on widget body to open the app
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launchIntent != null) {
            PendingIntent launchPending = PendingIntent.getActivity(context, 0, launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_info, launchPending);
            views.setOnClickPendingIntent(R.id.widget_album_art, launchPending);
        }

        // Update immediately with text first
        appWidgetManager.updateAppWidget(appWidgetId, views);

        // Load artwork asynchronously（url 去重，避免 updateLyric 频繁 full update 时重复加载）
        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            loadArtworkAsync(context, appWidgetManager, appWidgetId, artworkUrl);
        }
    }

    /**
     * 异步加载封面图。url 去重：同一 url 只加载一次，避免 updateLyric full update 时重复下载。
     */
    private void loadArtworkAsync(Context context, AppWidgetManager appWidgetManager, int appWidgetId, String artworkUrl) {
        if (artworkUrl.equals(lastArtworkUrl)) return;
        lastArtworkUrl = artworkUrl;
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

                if (bitmap != null) {
                    // Scale down to save memory
                    int size = 128;
                    Bitmap scaled = Bitmap.createScaledBitmap(bitmap, size, size, true);
                    if (scaled != bitmap) bitmap.recycle();

                    final Bitmap finalBitmap = scaled;
                    mainHandler.post(() -> {
                        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_music_4x1);
                        views.setImageViewBitmap(R.id.widget_album_art, finalBitmap);
                        appWidgetManager.partiallyUpdateAppWidget(appWidgetId, views);
                    });
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to load artwork: " + e.getMessage());
            }
        });
    }

    private PendingIntent getPendingIntent(Context context, String action) {
        Intent intent = new Intent(context, MusicWidgetProvider.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(context, action.hashCode(), intent,
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
}
