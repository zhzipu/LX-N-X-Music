package com.lxnx.music.lanserver;

import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * LXXWear 手机端服务：给手表端 LX-N-XW-Music 提供局域网拉取能力。
 * <p>
 * - HTTP 服务（默认 8686）：/api/ping、/api/playlist、/api/prepare/{id}、
 * /api/audio/{id}（支持 Range 断点续传）、/api/lyric/{id}、/api/cover/{id}
 * - UDP 广播（8687）：每 2 秒播一次地址、token 与歌单 revision，手表据此发现手机
 * <p>
 * 文件由 JS 侧准备：手表请求 prepare 时这里只抛事件给 JS，JS 下载完再回填 setReady，
 * 这样「手机没有音频就先下载」的逻辑全部留在 JS（能复用 App 现有的取地址/下载能力）。
 */
public class LanServerModule extends ReactContextBaseJavaModule {

    private static final String TAG = "LXXWearLan";
    public static final String EVENT_PREPARE = "LXXWearPrepare";
    public static final String EVENT_PROGRESS = "LXXWearProgress";
    /** 手表说「这首我本地已经有了」，不需要手机准备 */
    public static final String EVENT_SKIP = "LXXWearSkip";
    /** 手表这一轮同步结束，带统计 */
    public static final String EVENT_FINISH = "LXXWearFinish";

    private static final int BASE_PORT = 8686;
    private static final int PORT_TRIES = 10;
    private static final int DISCOVERY_PORT = 8687;
    private static final long BROADCAST_INTERVAL_MS = 2000L;
    private static final int MAX_HEAD_BYTES = 16 * 1024;

    private static final int STATE_IDLE = 0;
    private static final int STATE_PENDING = 1;
    private static final int STATE_READY = 2;
    private static final int STATE_FAILED = 3;
    /** 手表端已有这首歌的文件，这一轮不需要手机准备，也不会来取 */
    private static final int STATE_SKIPPED = 4;

    private static class Song {
        String id = "";
        String name = "";
        String artist = "";
        String album = "";
        long duration;
        volatile int state = STATE_IDLE;
        volatile String audioPath;
        volatile String ext = "mp3";
        volatile long size = -1L;
        volatile String lyric;
        /**
         * 歌词版本指纹（手机端调过歌词才有值）。手表本地已有歌词时靠它判断要不要重拉，
         * 清单里没给就一直是空串，行为与老版本一致。
         */
        volatile String lyricRevision = "";
        /** 当前这份 `lyric` 是按哪个歌词指纹准备的；与上面的期望值不一致就说明还没重算 */
        volatile String readyLyricRevision = "";
        volatile String coverPath;
        volatile String error;
    }

    private final Object songLock = new Object();
    private final Map<String, Song> songs = new LinkedHashMap<>();

    private volatile String playlistId = "";
    private volatile String playlistName = "";
    /** 勾选的歌单分组（原样透传，手表端左侧那页按它列歌单）。 */
    private volatile String playlistsJson = "[]";
    private volatile String revision = "";
    private volatile String quality = "";
    private volatile String token = "";
    private volatile String deviceName = "我的手机";

    private volatile boolean running;
    private volatile int port;
    private ServerSocket serverSocket;
    private ExecutorService pool;
    private Thread acceptThread;
    private Thread broadcastThread;
    private DatagramSocket broadcastSocket;

    public LanServerModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return "LanServer";
    }

    // ---------------------------------------------------------------- JS 接口

    /**
     * 启动服务。manifestJson 形如
     * {"playlistId":"...","playlistName":"...","revision":"...","quality":"320k","songs":[{...}]}
     */
    @ReactMethod
    public void start(String manifestJson, String optionsJson, Promise promise) {
        try {
            stopInternal();
            applyManifest(manifestJson, true);

            JSONObject options = new JSONObject(
                    optionsJson == null || optionsJson.isEmpty() ? "{}" : optionsJson);
            String name = options.optString("name", "");
            deviceName = name.isEmpty() ? (Build.MODEL == null ? "我的手机" : Build.MODEL) : name;
            token = options.optString("token", "");
            int preferred = options.optInt("port", BASE_PORT);

            int bound = openServer(preferred);
            if (bound <= 0) {
                promise.reject("E_PORT", "端口 8686-8695 都被占用了");
                return;
            }
            startBroadcast();

            WritableMap result = Arguments.createMap();
            result.putInt("port", bound);
            result.putString("ip", localIp());
            result.putString("name", deviceName);
            promise.resolve(result);
        } catch (Exception e) {
            Log.w(TAG, "启动失败", e);
            stopInternal();
            promise.reject("E_START", e.getMessage(), e);
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        stopInternal();
        promise.resolve(null);
    }

    /** 歌单/音质变了：重新下发清单。reset=true 时把所有歌重新置为未准备。 */
    @ReactMethod
    public void setManifest(String manifestJson, boolean reset, Promise promise) {
        try {
            applyManifest(manifestJson, reset);
            promise.resolve(null);
        } catch (Exception e) {
            promise.reject("E_MANIFEST", e.getMessage(), e);
        }
    }

    /** JS 把某首歌的音频/歌词/封面准备好之后回填。 */
    @ReactMethod
    public void setReady(String id, String audioPath, String ext, double size, String lyric,
                         String coverPath) {
        Song song = find(id);
        if (song == null) {
            return;
        }
        song.audioPath = audioPath;
        if ((song.ext == null || song.ext.isEmpty()) && ext != null && !ext.isEmpty()) {
            song.ext = ext;
        }
        song.size = (long) size;
        song.lyric = lyric;
        // 记下这份歌词对应哪一版：清单里的指纹换了之后，这里就会对不上
        song.readyLyricRevision = song.lyricRevision == null ? "" : song.lyricRevision;
        song.coverPath = coverPath;
        song.error = null;
        song.state = STATE_READY;
        Log.i(TAG, "已就绪 " + id + " (" + song.size + "B)");
    }

    /**
     * 只更新某首歌的歌词，不动音频状态。
     *
     * 手机端调过歌词（手动匹配 / 时间偏移）之后用它把新的一版推上来，
     * 这样 `/api/lyric` 发的就是调整后的内容；已经就绪的歌也不会被打回「待准备」。
     */
    @ReactMethod
    public void setLyric(String id, String lyric) {
        Song song = find(id);
        if (song == null) {
            return;
        }
        song.lyric = lyric;
        song.readyLyricRevision = song.lyricRevision == null ? "" : song.lyricRevision;
        Log.i(TAG, "歌词已更新 " + id);
    }

    @ReactMethod
    public void setFailed(String id, String message) {
        Song song = find(id);
        if (song == null) {
            return;
        }
        song.error = message;
        song.state = STATE_FAILED;
        Log.i(TAG, "准备失败 " + id + "：" + message);
    }

    /**
     * 把一首歌退回「未准备」：手机界面上点「重试」时用。
     * 不清掉失败标记的话，手表下次来要这首，handlePrepare 会直接回 failed，
     * 永远等不到新的 prepare 事件。
     */
    @ReactMethod
    public void resetSong(String id, Promise promise) {
        Song song = find(id);
        if (song == null) {
            promise.resolve(false);
            return;
        }
        song.state = STATE_IDLE;
        song.error = null;
        promise.resolve(true);
    }

    @ReactMethod
    public void getInfo(Promise promise) {
        try {
            WritableMap map = Arguments.createMap();
            map.putBoolean("running", running);
            map.putInt("port", port);
            map.putString("ip", localIp());
            map.putString("name", deviceName);
            map.putString("revision", revision);
            map.putString("quality", quality);
            map.putString("playlistName", playlistName);

            WritableArray array = Arguments.createArray();
            synchronized (songLock) {
                for (Song song : songs.values()) {
                    WritableMap item = Arguments.createMap();
                    item.putString("id", song.id);
                    item.putString("name", song.name);
                    item.putInt("state", song.state);
                    item.putDouble("size", song.size);
                    if (song.error != null) {
                        item.putString("error", song.error);
                    }
                    array.pushMap(item);
                }
            }
            map.putArray("songs", array);
            promise.resolve(map);
        } catch (Exception e) {
            promise.reject("E_INFO", e.getMessage(), e);
        }
    }

    // RN 0.7x 要求原生模块提供这两个方法（NativeEventEmitter 会检查）
    @ReactMethod
    public void addListener(String eventName) {
    }

    @ReactMethod
    public void removeListeners(double count) {
    }

    // ---------------------------------------------------------------- 内部实现

    private Song find(String id) {
        synchronized (songLock) {
            return songs.get(id);
        }
    }

    private void applyManifest(String manifestJson, boolean reset) throws Exception {
        JSONObject json = new JSONObject(manifestJson == null || manifestJson.isEmpty() ? "{}" : manifestJson);
        Map<String, Song> previous;
        synchronized (songLock) {
            previous = new LinkedHashMap<>(songs);
            songs.clear();
            playlistId = json.optString("playlistId", "");
            playlistName = json.optString("playlistName", "");
            revision = json.optString("revision", "");
            quality = json.optString("quality", "");

            // 歌单分组原样留给手表（结构由 JS 定，这里不解析字段）
            JSONArray playlists = json.optJSONArray("playlists");
            playlistsJson = playlists == null ? "[]" : playlists.toString();

            JSONArray array = json.optJSONArray("songs");
            if (array != null) {
                for (int i = 0; i < array.length(); i++) {
                    JSONObject item = array.optJSONObject(i);
                    if (item == null) {
                        continue;
                    }
                    Song song = new Song();
                    song.id = item.optString("id", "");
                    if (song.id.isEmpty()) {
                        continue;
                    }
                    song.name = item.optString("name", "");
                    song.artist = item.optString("artist", "");
                    song.album = item.optString("album", "");
                    song.duration = item.optLong("duration", 0L);
                    // 手机端调过歌词才有这个字段；手表拿它和自己的索引比对，对不上才重拉歌词
                    song.lyricRevision = item.optString("lyricRevision", "");
                    // 落盘后缀由 JS 在清单里定死（按音质推导），手表拿清单时就能知道该存成什么
                    String declaredExt = item.optString("ext", "");
                    if (!declaredExt.isEmpty()) {
                        song.ext = declaredExt;
                    }

                    Song old = reset ? null : previous.get(song.id);
                    // 已就绪的复用原来的文件；「已跳过」表示手表端自己有这份文件、
                    // 手机这边从来不用准备，所以不校验本地文件，状态照旧留着。
                    boolean reusable = old != null
                            && ((old.state == STATE_READY && fileExists(old.audioPath))
                            || old.state == STATE_SKIPPED);
                    if (reusable) {
                        song.state = old.state;
                        song.audioPath = old.audioPath;
                        song.ext = old.ext;
                        song.size = old.size;
                        song.lyric = old.lyric;
                        song.readyLyricRevision = old.readyLyricRevision;
                        song.coverPath = old.coverPath;
                    }
                    songs.put(song.id, song);
                }
            }
        }
        Log.i(TAG, "清单更新：" + playlistName + " / " + songs.size() + " 首 / " + revision);
    }

    private static boolean fileExists(String path) {
        if (path == null || path.isEmpty()) {
            return false;
        }
        File file = new File(path);
        return file.isFile() && file.length() > 0;
    }

    private int openServer(int preferred) {
        for (int i = 0; i < PORT_TRIES; i++) {
            int candidate = preferred + i;
            try {
                ServerSocket socket = new ServerSocket();
                socket.setReuseAddress(true);
                socket.bind(new InetSocketAddress(candidate), 16);
                serverSocket = socket;
                port = candidate;
                running = true;
                pool = Executors.newFixedThreadPool(4);
                acceptThread = new Thread(this::acceptLoop, "lxxwear-accept");
                acceptThread.start();
                Log.i(TAG, "HTTP 服务已启动 :" + candidate);
                return candidate;
            } catch (IOException e) {
                Log.w(TAG, "端口 " + candidate + " 不可用: " + e.getMessage());
            }
        }
        return -1;
    }

    private void acceptLoop() {
        while (running) {
            Socket socket = null;
            try {
                socket = serverSocket.accept();
            } catch (IOException e) {
                if (running) {
                    Log.w(TAG, "accept 失败: " + e.getMessage());
                }
                break;
            }
            final Socket client = socket;
            ExecutorService current = pool;
            if (current == null) {
                closeQuietly(client);
                continue;
            }
            current.execute(() -> {
                try {
                    handle(client);
                } catch (Exception e) {
                    Log.w(TAG, "请求处理失败: " + e.getMessage());
                } finally {
                    closeQuietly(client);
                }
            });
        }
    }

    private void handle(Socket socket) throws Exception {
        socket.setSoTimeout(10000);
        InputStream in = socket.getInputStream();
        String head = readHead(in);
        if (head == null || head.isEmpty()) {
            return;
        }
        String[] lines = head.split("\r\n");
        String[] requestLine = lines[0].split(" ");
        if (requestLine.length < 2) {
            return;
        }
        String method = requestLine[0];
        String path = requestLine[1];
        int queryIndex = path.indexOf('?');
        if (queryIndex >= 0) {
            path = path.substring(0, queryIndex);
        }

        Map<String, String> headers = new LinkedHashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int colon = lines[i].indexOf(':');
            if (colon > 0) {
                headers.put(lines[i].substring(0, colon).trim().toLowerCase(Locale.US),
                        lines[i].substring(colon + 1).trim());
            }
        }

        OutputStream out = socket.getOutputStream();
        if (!token.isEmpty()) {
            String given = headers.get("x-lx-token");
            if (given == null || !given.equals(token)) {
                sendJson(out, 401, "{\"error\":\"token\"}");
                return;
            }
        }

        if ("/api/ping".equals(path)) {
            JSONObject payload = new JSONObject();
            payload.put("service", "lxnx-lan");
            payload.put("version", 1);
            payload.put("name", deviceName);
            sendJson(out, 200, payload.toString());
            return;
        }
        if ("/api/playlist".equals(path)) {
            sendJson(out, 200, buildPlaylistJson().toString());
            return;
        }
        if (path.startsWith("/api/prepare/")) {
            handlePrepare(out, decodeId(path.substring("/api/prepare/".length())));
            return;
        }
        // 手表端本地已经有这首歌的完整文件，告诉手机「这首不用准备了」，界面别一直停在待准备
        if (path.startsWith("/api/skip/")) {
            handleSkip(out, decodeId(path.substring("/api/skip/".length())));
            return;
        }
        // 手表这一轮同步结束（含取消），带上统计，手机据此结束任务、显示结果
        if ("/api/finish".equals(path)) {
            handleFinish(out, in, headers);
            return;
        }
        if (path.startsWith("/api/audio/")) {
            handleFile(out, decodeId(path.substring("/api/audio/".length())), "audio",
                    headers.get("range"));
            return;
        }
        if (path.startsWith("/api/lyric/")) {
            handleFile(out, decodeId(path.substring("/api/lyric/".length())), "lyric", null);
            return;
        }
        if (path.startsWith("/api/cover/")) {
            handleFile(out, decodeId(path.substring("/api/cover/".length())), "cover", null);
            return;
        }
        sendJson(out, 404, "{\"error\":\"not found\"}");
    }

    private JSONObject buildPlaylistJson() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("playlistId", playlistId);
        payload.put("playlistName", playlistName);
        payload.put("revision", revision);
        payload.put("quality", quality);
        try {
            payload.put("playlists", new JSONArray(playlistsJson));
        } catch (Exception e) {
            payload.put("playlists", new JSONArray());
        }

        JSONArray array = new JSONArray();
        synchronized (songLock) {
            for (Song song : songs.values()) {
                JSONObject item = new JSONObject();
                item.put("id", song.id);
                item.put("name", song.name);
                item.put("artist", song.artist);
                item.put("album", song.album);
                item.put("duration", song.duration);
                // 只在手机端调过歌词时才下发，老手表不认识这个字段也不影响
                if (song.lyricRevision != null && !song.lyricRevision.isEmpty()) {
                    item.put("lyricRevision", song.lyricRevision);
                }
                JSONObject audio = new JSONObject();
                boolean ready = song.state == STATE_READY;
                audio.put("ready", ready);
                audio.put("ext", song.ext);
                // 大小未知时给 -1，手表那边就不会因为长度对不上而反复重下
                audio.put("size", ready ? song.size : -1L);
                item.put("audio", audio);
                array.put(item);
            }
        }
        payload.put("songs", array);
        return payload;
    }

    private void handlePrepare(OutputStream out, String id) throws Exception {
        Song song = find(id);
        if (song == null) {
            sendJson(out, 404, "{\"state\":\"failed\",\"message\":\"歌单里没有这首\"}");
            return;
        }
        int state = song.state;
        if (state == STATE_READY) {
            sendJson(out, 200, "{\"state\":\"ready\"}");
            return;
        }
        if (state == STATE_FAILED) {
            JsonWriter writer = new JsonWriter();
            writer.put("state", "failed");
            writer.put("message", song.error == null ? "手机端准备失败" : song.error);
            sendJson(out, 200, writer.toString());
            return;
        }
        // 跳过状态的歌手表后来又来要（它把那边的文件删了），照常重新准备
        if (state == STATE_IDLE || state == STATE_SKIPPED) {
            song.state = STATE_PENDING;
            emitPrepare(id);
        }
        sendJson(out, 200, "{\"state\":\"pending\"}");
    }

    /** 手表端本地已有完整文件，这一首不用手机准备 */
    private void handleSkip(OutputStream out, String id) throws Exception {
        Song song = find(id);
        if (song == null) {
            sendJson(out, 404, "{\"error\":\"no song\"}");
            return;
        }
        // 已经准备好的不要被降级，否则清单里 audio.ready 会翻回去
        if (song.state != STATE_READY) {
            song.state = STATE_SKIPPED;
            song.error = null;
        }
        emitSkip(id);
        sendJson(out, 200, "{\"state\":\"skipped\"}");
    }

    /** 手表一轮同步结束（成功或取消），把统计抛给 JS 收尾 */
    private void handleFinish(OutputStream out, InputStream in, Map<String, String> headers)
            throws Exception {
        JSONObject payload = null;
        String body = readBody(in, headers);
        if (!body.isEmpty()) {
            try {
                payload = new JSONObject(body);
            } catch (Exception ignored) {
            }
        }
        WritableMap map = Arguments.createMap();
        map.putInt("total", payload == null ? 0 : payload.optInt("total", 0));
        map.putInt("downloaded", payload == null ? 0 : payload.optInt("downloaded", 0));
        map.putInt("skipped", payload == null ? 0 : payload.optInt("skipped", 0));
        map.putInt("removed", payload == null ? 0 : payload.optInt("removed", 0));
        map.putBoolean("cancelled", payload != null && payload.optBoolean("cancelled", false));
        map.putString("message", payload == null ? "" : payload.optString("message", ""));
        emit(EVENT_FINISH, map);
        Log.i(TAG, "手表同步结束：" + (payload == null ? "{}" : payload.toString()));
        sendJson(out, 200, "{\"ok\":true}");
    }

    /** 读 POST 的 JSON body（体积很小，超过 64KB 直接忽略） */
    private static String readBody(InputStream in, Map<String, String> headers) {
        try {
            String length = headers.get("content-length");
            if (length == null) {
                return "";
            }
            int size = Integer.parseInt(length.trim());
            if (size <= 0 || size > 64 * 1024) {
                return "";
            }
            byte[] buffer = new byte[size];
            int read = 0;
            while (read < size) {
                int n = in.read(buffer, read, size - read);
                if (n <= 0) {
                    break;
                }
                read += n;
            }
            return new String(buffer, 0, read, "UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private void handleFile(OutputStream out, String id, String kind, String rangeHeader)
            throws Exception {
        Song song = find(id);
        if (song == null) {
            sendJson(out, 404, "{\"error\":\"no song\"}");
            return;
        }
        if ("lyric".equals(kind)) {
            // 手机端刚把这首歌的歌词调过、这份还没重新准备出来：
            // 这时候把旧歌词发出去，手表会当成新版存下来再也不会来取，所以让它稍后再来
            String expected = song.lyricRevision;
            String actual = song.readyLyricRevision;
            boolean lyricStale = expected != null && !expected.isEmpty()
                    && !expected.equals(actual == null ? "" : actual);
            if (lyricStale) {
                sendJson(out, 503, "{\"error\":\"lyric not ready\"}");
                return;
            }
            String lyric = song.lyric;
            if (lyric == null || lyric.isEmpty()) {
                sendJson(out, 404, "{\"error\":\"no lyric\"}");
                return;
            }
            byte[] data = lyric.getBytes(StandardCharsets.UTF_8);
            StringBuilder header = new StringBuilder();
            header.append("HTTP/1.1 200 OK\r\n");
            header.append("Content-Type: text/plain; charset=utf-8\r\n");
            header.append("Content-Length: ").append(data.length).append("\r\n");
            header.append("Connection: close\r\n\r\n");
            out.write(header.toString().getBytes(StandardCharsets.UTF_8));
            out.write(data);
            out.flush();
            return;
        }

        String path = "cover".equals(kind) ? song.coverPath : song.audioPath;
        if (path == null || !fileExists(path)) {
            sendJson(out, 404, "{\"error\":\"file not ready\"}");
            return;
        }
        File file = new File(path);
        serveFile(out, file, rangeHeader, song);
    }

    private void serveFile(OutputStream out, File file, String rangeHeader, Song song)
            throws IOException {
        long length = file.length();
        long start = 0L;
        long end = length - 1;
        boolean partial = false;

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            try {
                String spec = rangeHeader.substring("bytes=".length()).trim();
                int dash = spec.indexOf('-');
                if (dash >= 0) {
                    String from = spec.substring(0, dash).trim();
                    String to = spec.substring(dash + 1).trim();
                    if (!from.isEmpty()) {
                        start = Long.parseLong(from);
                    }
                    if (!to.isEmpty()) {
                        end = Long.parseLong(to);
                    }
                    if (start > end) {
                        start = 0L;
                        end = length - 1;
                    }
                    partial = true;
                }
            } catch (NumberFormatException ignored) {
            }
        }
        if (start >= length) {
            String header = "HTTP/1.1 416 Range Not Satisfiable\r\n"
                    + "Content-Range: bytes */" + length + "\r\n"
                    + "Content-Length: 0\r\nConnection: close\r\n\r\n";
            out.write(header.getBytes(StandardCharsets.UTF_8));
            out.flush();
            return;
        }
        long total = end - start + 1;
        StringBuilder header = new StringBuilder();
        header.append(partial ? "HTTP/1.1 206 Partial Content\r\n" : "HTTP/1.1 200 OK\r\n");
        header.append("Content-Type: application/octet-stream\r\n");
        header.append("Accept-Ranges: bytes\r\n");
        header.append("Content-Length: ").append(total).append("\r\n");
        if (partial) {
            header.append("Content-Range: bytes ").append(start).append('-').append(end)
                    .append('/').append(length).append("\r\n");
        }
        header.append("Connection: close\r\n\r\n");
        out.write(header.toString().getBytes(StandardCharsets.UTF_8));

        if (song != null) {
            emitProgress(song.id, start, length);
        }
        long sent = start;
        long lastEmit = System.currentTimeMillis();
        try (FileInputStream in = new FileInputStream(file)) {
            long skipped = 0L;
            while (skipped < start) {
                long n = in.skip(start - skipped);
                if (n <= 0) {
                    break;
                }
                skipped += n;
            }
            byte[] buffer = new byte[32 * 1024];
            long remaining = total;
            while (remaining > 0) {
                int want = (int) Math.min(buffer.length, remaining);
                int read = in.read(buffer, 0, want);
                if (read == -1) {
                    break;
                }
                out.write(buffer, 0, read);
                remaining -= read;
                sent += read;
                long now = System.currentTimeMillis();
                if (song != null && now - lastEmit >= 400L) {
                    lastEmit = now;
                    emitProgress(song.id, sent, length);
                }
            }
            out.flush();
        }
        if (song != null) {
            emitProgress(song.id, length, length);
        }
    }

    private static String readHead(InputStream in) throws IOException {
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        int matched = 0;
        int b;
        while ((b = in.read()) != -1) {
            buffer.write(b);
            if ((matched == 0 || matched == 2) && b == '\r') {
                matched++;
            } else if ((matched == 1 || matched == 3) && b == '\n') {
                matched++;
            } else {
                matched = b == '\r' ? 1 : 0;
            }
            if (matched == 4) {
                break;
            }
            if (buffer.size() > MAX_HEAD_BYTES) {
                break;
            }
        }
        return buffer.toString("UTF-8");
    }

    private static void sendJson(OutputStream out, int status, String body) throws IOException {
        byte[] data = body.getBytes(StandardCharsets.UTF_8);
        StringBuilder header = new StringBuilder();
        header.append("HTTP/1.1 ").append(status).append(' ').append(statusText(status)).append("\r\n");
        header.append("Content-Type: application/json; charset=utf-8\r\n");
        header.append("Content-Length: ").append(data.length).append("\r\n");
        header.append("Connection: close\r\n\r\n");
        out.write(header.toString().getBytes(StandardCharsets.UTF_8));
        out.write(data);
        out.flush();
    }

    private static String statusText(int status) {
        switch (status) {
            case 200:
                return "OK";
            case 206:
                return "Partial Content";
            case 401:
                return "Unauthorized";
            case 404:
                return "Not Found";
            default:
                return "Status";
        }
    }

    private static String decodeId(String raw) {
        try {
            return URLDecoder.decode(raw, "UTF-8");
        } catch (Exception e) {
            return raw;
        }
    }

    // ---------------------------------------------------------------- 广播

    private void startBroadcast() {
        running = true;
        broadcastThread = new Thread(this::broadcastLoop, "lxxwear-broadcast");
        broadcastThread.start();
    }

    private void broadcastLoop() {
        try {
            broadcastSocket = new DatagramSocket();
            broadcastSocket.setBroadcast(true);
        } catch (Exception e) {
            Log.w(TAG, "广播 socket 创建失败: " + e.getMessage());
            return;
        }
        while (running) {
            try {
                String json = buildBroadcastJson();
                byte[] data = json.getBytes(StandardCharsets.UTF_8);
                DatagramPacket global = new DatagramPacket(data, data.length,
                        InetAddress.getByName("255.255.255.255"), DISCOVERY_PORT);
                broadcastSocket.send(global);

                // 部分路由器不放行 255.255.255.255，按 /24 再发一份子网广播
                String subnet = subnetBroadcast();
                if (subnet != null) {
                    DatagramPacket local = new DatagramPacket(data, data.length,
                            InetAddress.getByName(subnet), DISCOVERY_PORT);
                    broadcastSocket.send(local);
                }
                Thread.sleep(BROADCAST_INTERVAL_MS);
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                Log.w(TAG, "广播失败: " + e.getMessage());
                try {
                    Thread.sleep(BROADCAST_INTERVAL_MS);
                } catch (InterruptedException ignored) {
                    break;
                }
            }
        }
        DatagramSocket socket = broadcastSocket;
        broadcastSocket = null;
        if (socket != null) {
            socket.close();
        }
    }

    private String buildBroadcastJson() throws Exception {
        JSONObject payload = new JSONObject();
        payload.put("service", "lxnx-lan");
        payload.put("version", 1);
        payload.put("port", port);
        payload.put("name", deviceName);
        payload.put("token", token);
        payload.put("revision", revision);
        payload.put("quality", quality);
        return payload.toString();
    }

    private String subnetBroadcast() {
        String ip = localIp();
        if (ip == null) {
            return null;
        }
        int lastDot = ip.lastIndexOf('.');
        if (lastDot <= 0) {
            return null;
        }
        return ip.substring(0, lastDot) + ".255";
    }

    /** 当前 Wi-Fi 的 IPv4 地址，优先 wlan 网卡。 */
    private String localIp() {
        try {
            List<NetworkInterface> interfaces = Collections.list(NetworkInterface.getNetworkInterfaces());
            String fallback = null;
            for (NetworkInterface nif : interfaces) {
                if (!nif.isUp() || nif.isLoopback()) {
                    continue;
                }
                for (InetAddress address : Collections.list(nif.getInetAddresses())) {
                    if (!(address instanceof Inet4Address) || address.isLoopbackAddress()) {
                        continue;
                    }
                    String ip = address.getHostAddress();
                    if (ip == null || ip.isEmpty()) {
                        continue;
                    }
                    String name = nif.getName() == null ? "" : nif.getName();
                    if (name.startsWith("wlan")) {
                        return ip;
                    }
                    if (fallback == null) {
                        fallback = ip;
                    }
                }
            }
            return fallback;
        } catch (Exception e) {
            Log.w(TAG, "取本机 IP 失败: " + e.getMessage());
            return null;
        }
    }

    // ---------------------------------------------------------------- 事件

    private void emitPrepare(String id) {
        WritableMap map = Arguments.createMap();
        map.putString("id", id);
        emit(EVENT_PREPARE, map);
    }

    private void emitProgress(String id, long done, long total) {
        WritableMap map = Arguments.createMap();
        map.putString("id", id);
        map.putDouble("done", done);
        map.putDouble("total", total);
        emit(EVENT_PROGRESS, map);
    }

    private void emitSkip(String id) {
        WritableMap map = Arguments.createMap();
        map.putString("id", id);
        emit(EVENT_SKIP, map);
    }

    private void emit(String event, WritableMap payload) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit(event, payload);
        } catch (Exception e) {
            Log.w(TAG, "事件发送失败: " + e.getMessage());
        }
    }

    // ---------------------------------------------------------------- 收尾

    private void stopInternal() {
        running = false;
        ServerSocket socket = serverSocket;
        serverSocket = null;
        if (socket != null) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }
        }
        ExecutorService executor = pool;
        pool = null;
        if (executor != null) {
            executor.shutdownNow();
        }
        Thread broadcast = broadcastThread;
        broadcastThread = null;
        if (broadcast != null) {
            broadcast.interrupt();
        }
        DatagramSocket udp = broadcastSocket;
        broadcastSocket = null;
        if (udp != null) {
            udp.close();
        }
        Thread accept = acceptThread;
        acceptThread = null;
        if (accept != null) {
            accept.interrupt();
        }
        port = 0;
    }

    @Override
    public void invalidate() {
        stopInternal();
        super.invalidate();
    }

    private static void closeQuietly(Socket socket) {
        try {
            socket.close();
        } catch (IOException ignored) {
        }
    }

    /** 极简 JSON 拼装，避免为了两个字段引依赖。 */
    private static class JsonWriter {
        private final StringBuilder builder = new StringBuilder("{");
        private boolean first = true;

        void put(String key, String value) {
            if (!first) {
                builder.append(',');
            }
            first = false;
            builder.append('"').append(escape(key)).append("\":\"").append(escape(value)).append('"');
        }

        private static String escape(String value) {
            if (value == null) {
                return "";
            }
            return value.replace("\\", "\\\\").replace("\"", "\\\"");
        }

        @Override
        public String toString() {
            return builder.append('}').toString();
        }
    }
}
