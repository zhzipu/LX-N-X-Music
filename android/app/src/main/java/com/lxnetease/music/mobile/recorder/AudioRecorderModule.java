package com.lxnetease.music.mobile.recorder;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.SystemClock;
import android.util.Base64;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.ByteArrayOutputStream;

/**
 * 听歌识曲用的录音模块。
 *
 * 采集参数固定为 16kHz / 单声道 / PCM 16bit（s16le），正好是识曲引擎（本地指纹与酷狗接口）需要的输入格式。
 * 采样数据先攒在内存里（12 秒约 384KB），stop 时整体 base64 交给 JS，省掉文件读写与清理。
 *
 * 关于音源选择（两次踩坑后定型，别退回去）：
 * 1. 只看 getState() 不够：有的机型能创建成功、能 startRecording，读出来却全是 0。
 * 2. 只看「是否出现过非零样本」也不够：部分音源（如 nubia NX712J 上的 UNPROCESSED）
 *    每次录音开头会吐一个近满量程的瞬态，之后**长达十几秒是精确的 0**。
 *    瞬态足以骗过「有过非零就算有声」，于是整条链路拿到一段几乎全静的 PCM，
 *    最后表现成「三个引擎都识别不出」。
 * 所以现在把试采切成多个窗口，要求**持续**有信号才算这个音源可用；
 * 并且优先用最标准的 MIC，UNPROCESSED 只在硬件声明支持时才列入候选。
 */
public class AudioRecorderModule extends ReactContextBaseJavaModule {

  /** 单次采集的最长时间，防止 JS 侧忘了调用 stop 时一直占用麦克风 */
  private static final int MAX_DURATION_MS = 20000;
  private static final int DEFAULT_SAMPLE_RATE = 16000;
  /** 试采时长：用来判断该音源是否真的能采到声音。
   *  部分机型 startRecording() 之后要几百毫秒才开始吐数据，试得太短会把可用音源误判成静音。 */
  private static final int PROBE_MS = 800;
  /** 试采切成几个窗口来看「是否持续有声音」 */
  private static final int PROBE_WINDOWS = 4;
  /** 单个窗口峰值达到这个值才算「这一段有信号」（用 0 的话单个抖动样本也会算通过） */
  private static final int PROBE_WINDOW_THRESHOLD = 3;
  /** 至少要这么多个窗口有信号才认为音源可用；3/4 足以挡掉「只有开头一声」的坏音源 */
  private static final int PROBE_MIN_ACTIVE_WINDOWS = 3;

  private final ReactApplicationContext reactContext;
  private final Object lock = new Object();

  private AudioRecord recorder = null;
  private Thread worker = null;
  private volatile boolean recording = false;
  private ByteArrayOutputStream pcmBuffer = null;
  private int sampleRate = DEFAULT_SAMPLE_RATE;

  /** 本次采集实际使用的音源，以及整段采集的电平统计（用于排查「采到静音」这类问题） */
  private String sourceName = "";
  private int sourceValue = 0;
  private int peakAbs = 0;
  private long squareSum = 0;
  private long sampleCount = 0;
  private boolean silenceProbeFailed = false;
  /** 各音源的试采结论，形如 `MIC:4/4 VOICE_RECOGNITION:1/4`，排查用 */
  private String probeSummary = "";

  AudioRecorderModule(ReactApplicationContext reactContext) {
    super(reactContext);
    this.reactContext = reactContext;
  }

  @Override
  public String getName() {
    return "AudioRecorderModule";
  }

  private boolean hasPermission() {
    // 用 Context 上的老接口，避免依赖 androidx 且兼容 minSdk 21
    return reactContext.checkCallingOrSelfPermission(Manifest.permission.RECORD_AUDIO)
      == PackageManager.PERMISSION_GRANTED;
  }

  private static String sourceLabel(int source) {
    switch (source) {
      case MediaRecorder.AudioSource.UNPROCESSED:
        return "UNPROCESSED";
      case MediaRecorder.AudioSource.VOICE_RECOGNITION:
        return "VOICE_RECOGNITION";
      case MediaRecorder.AudioSource.MIC:
        return "MIC";
      default:
        return "SOURCE_" + source;
    }
  }

  /**
   * 候选音源，按「最可能可用」排序。
   * MIC 是每个机型都必须正确实现的基础音源；VOICE_RECOGNITION 次之；
   * UNPROCESSED 需要硬件声明支持（AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED），
   * 不支持的机型上它会给出「开头一个瞬态 + 之后全零」的流，所以先挡在外面。
   */
  private int[] candidateSources() {
    int[] all;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      all = new int[] {
        MediaRecorder.AudioSource.MIC,
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        MediaRecorder.AudioSource.UNPROCESSED,
      };
    } else {
      all = new int[] {
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        MediaRecorder.AudioSource.MIC,
      };
    }
    java.util.ArrayList<Integer> list = new java.util.ArrayList<Integer>();
    for (int source : all) {
      if (source == MediaRecorder.AudioSource.UNPROCESSED && !supportsUnprocessed()) continue;
      list.add(source);
    }
    int[] out = new int[list.size()];
    for (int i = 0; i < out.length; i++) out[i] = list.get(i);
    return out;
  }

  /** 硬件是否声明支持 UNPROCESSED（raw）采集 */
  private boolean supportsUnprocessed() {
    try {
      AudioManager manager = (AudioManager) reactContext.getSystemService(Context.AUDIO_SERVICE);
      if (manager == null) return false;
      String value = manager.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED);
      return value != null && "true".equalsIgnoreCase(value.trim());
    } catch (Exception ignored) {
      return false;
    }
  }

  /** 按给定音源创建并启动一个 AudioRecord，失败返回 null */
  private AudioRecord openRecorder(int source, int bufferSize) {
    AudioRecord candidate = null;
    try {
      candidate = new AudioRecord(
        source,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      );
      if (candidate.getState() != AudioRecord.STATE_INITIALIZED) {
        candidate.release();
        return null;
      }
      candidate.startRecording();
      return candidate;
    } catch (Exception ignored) {
      if (candidate != null) {
        try {
          candidate.release();
        } catch (Exception ignored2) {
        }
      }
      return null;
    }
  }

  private void releaseRecorder() {
    if (recorder == null) return;
    try {
      if (recorder.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
        recorder.stop();
      }
    } catch (Exception ignored) {
    }
    try {
      recorder.release();
    } catch (Exception ignored) {
    }
    recorder = null;
  }

  /** 把一段 PCM 记入缓冲并更新电平统计 */
  private void appendPcm(ByteArrayOutputStream target, byte[] data, int length) {
    target.write(data, 0, length);
    for (int i = 0; i + 1 < length; i += 2) {
      int value = (short) ((data[i] & 0xff) | (data[i + 1] << 8));
      int abs = value < 0 ? -value : value;
      if (abs > peakAbs) peakAbs = abs;
      squareSum += (long) value * value;
      sampleCount++;
    }
  }

  private void resetStats() {
    peakAbs = 0;
    squareSum = 0;
    sampleCount = 0;
    silenceProbeFailed = false;
  }

  @ReactMethod
  public void start(double rate, Promise promise) {
    if (!hasPermission()) {
      promise.reject("PERMISSION_DENIED", "未获得录音权限");
      return;
    }
    synchronized (lock) {
      if (recording) {
        promise.reject("ALREADY_RECORDING", "上一次录音尚未结束");
        return;
      }

      sampleRate = (int) rate > 0 ? (int) rate : DEFAULT_SAMPLE_RATE;
      int minBuffer = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      );
      if (minBuffer <= 0) minBuffer = sampleRate; // 部分机型返回错误码，退化为 1 秒缓冲
      final int bufferSize = Math.max(minBuffer * 2, sampleRate);

      resetStats();
      final ByteArrayOutputStream target = new ByteArrayOutputStream(sampleRate * 2 * 16);
      // 试采用独立缓冲读，数据确认可用后直接攒进 target，避免丢掉开头那一段
      byte[] probeBuffer = new byte[bufferSize];
      // 每个试采窗口的样本数：PROBE_MS 均分成 PROBE_WINDOWS 份（16k 下每片 200ms）
      final int windowSamples = Math.max(1, sampleRate * PROBE_MS / 1000 / PROBE_WINDOWS);

      AudioRecord usable = null;
      int[] sources = candidateSources();
      int bestSource = Integer.MIN_VALUE;
      int bestActiveWindows = -1;
      int bestPeak = -1;
      StringBuilder probeLog = new StringBuilder();

      for (int source : sources) {
        AudioRecord candidate = openRecorder(source, bufferSize);
        if (candidate == null) {
          probeLog.append(sourceLabel(source)).append(":open-failed ");
          continue;
        }

        // 试采到的数据直接攒进正式缓冲：确认这个音源可用就留着（不丢开头这一段），
        // 判定为不可用时再 reset 掉。
        target.reset();
        resetStats();
        int[] windowPeak = new int[PROBE_WINDOWS];
        int probeSamples = 0;
        long probeStart = SystemClock.elapsedRealtime();
        while (SystemClock.elapsedRealtime() - probeStart < PROBE_MS) {
          int read = candidate.read(probeBuffer, 0, probeBuffer.length);
          if (read <= 0) break;
          target.write(probeBuffer, 0, read);
          for (int i = 0; i + 1 < read; i += 2) {
            int value = (short) ((probeBuffer[i] & 0xff) | (probeBuffer[i + 1] << 8));
            int abs = value < 0 ? -value : value;
            if (abs > peakAbs) peakAbs = abs;
            squareSum += (long) value * value;
            sampleCount++;
            int window = probeSamples / windowSamples;
            if (window >= PROBE_WINDOWS) window = PROBE_WINDOWS - 1;
            if (abs > windowPeak[window]) windowPeak[window] = abs;
            probeSamples++;
          }
          if (probeSamples >= windowSamples * PROBE_WINDOWS) break;
        }

        int activeWindows = 0;
        for (int peak : windowPeak) {
          if (peak >= PROBE_WINDOW_THRESHOLD) activeWindows++;
        }
        probeLog
          .append(sourceLabel(source))
          .append(':')
          .append(activeWindows)
          .append('/')
          .append(PROBE_WINDOWS)
          .append(' ');

        // 记下「看起来最好」的那个，全部不达标时兜底用它
        if (
          activeWindows > bestActiveWindows ||
          (activeWindows == bestActiveWindows && peakAbs > bestPeak)
        ) {
          bestActiveWindows = activeWindows;
          bestPeak = peakAbs;
          bestSource = source;
        }

        if (activeWindows >= PROBE_MIN_ACTIVE_WINDOWS) {
          sourceName = sourceLabel(source);
          sourceValue = source;
          usable = candidate;
          break;
        }

        // 不可用（静音，或只有开头一个瞬态）：丢掉试采数据换下一个
        target.reset();
        resetStats();
        try {
          if (candidate.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) candidate.stop();
        } catch (Exception ignored) {
        }
        try {
          candidate.release();
        } catch (Exception ignored) {
        }
      }

      probeSummary = probeLog.toString().trim();

      if (usable == null) {
        // 所有音源都没通过试采：退而求其次用「窗口命中最多」的那个，尽量别让功能直接挂掉
        int source = bestSource != Integer.MIN_VALUE ? bestSource : MediaRecorder.AudioSource.MIC;
        target.reset();
        resetStats();
        usable = openRecorder(source, bufferSize);
        if (usable != null) {
          silenceProbeFailed = true;
          sourceName = sourceLabel(source) + "(probe-failed)";
          sourceValue = source;
        }
      }

      if (usable == null) {
        promise.reject("RECORDER_UNAVAILABLE", "无法创建录音器，设备可能不支持该采样率");
        return;
      }

      // usable 在 openRecorder 里已经 startRecording 过了，这里不再重复调用
      recorder = usable;
      pcmBuffer = target;
      recording = true;

      final AudioRecord activeRecorder = recorder;
      final long startedAt = System.currentTimeMillis();
      worker = new Thread(new Runnable() {
        @Override
        public void run() {
          byte[] buffer = new byte[bufferSize];
          try {
            while (recording) {
              int read = activeRecorder.read(buffer, 0, buffer.length);
              if (read > 0) {
                // 这里不加锁：stop() 会先 join 本线程再读缓冲，join 已提供内存可见性，
                // 若此处再抢 lock 会和 stop() 持有的 lock 形成死锁
                appendPcm(target, buffer, read);
                if (System.currentTimeMillis() - startedAt >= MAX_DURATION_MS) {
                  recording = false;
                  break;
                }
              } else if (read < 0) {
                break;
              }
            }
          } catch (Exception ignored) {
            // 读取失败直接结束采集，JS 侧会根据时长判断结果是否有效
          }
        }
      }, "music-recognition-recorder");
      worker.start();

      WritableMap result = Arguments.createMap();
      result.putInt("sampleRate", sampleRate);
      result.putInt("channels", 1);
      result.putString("source", sourceName);
      result.putInt("sourceValue", sourceValue);
      promise.resolve(result);
    }
  }

  private void waitWorker() {
    Thread t = worker;
    worker = null;
    if (t == null) return;
    try {
      t.join(2000);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  @ReactMethod
  public void stop(Promise promise) {
    synchronized (lock) {
      if (!recording && worker == null && recorder == null) {
        promise.reject("NOT_RECORDING", "当前没有进行中的录音");
        return;
      }
      recording = false;
      releaseRecorder();
      waitWorker();

      ByteArrayOutputStream buffer = pcmBuffer;
      pcmBuffer = null;
      byte[] bytes = buffer == null ? new byte[0] : buffer.toByteArray();

      WritableMap result = Arguments.createMap();
      // RN 侧会把它解码回 16kHz / 单声道 / s16le 的采样点
      result.putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
      result.putInt("sampleRate", sampleRate);
      result.putInt("channels", 1);
      result.putInt("bytes", bytes.length);
      // 单位毫秒，JS 侧用来自查采集是否过短
      result.putDouble("duration", bytes.length / 2.0 / sampleRate * 1000);
      // 排查用：实际音源与电平，peak 为 0 基本等于整段静音
      result.putString("source", sourceName);
      result.putInt("peak", peakAbs);
      result.putDouble(
        "rms",
        sampleCount > 0 ? Math.sqrt((double) squareSum / sampleCount) : 0
      );
      result.putBoolean("silenceProbeFailed", silenceProbeFailed);
      // 排查用：各音源试采结论，如 `MIC:4/4 VOICE_RECOGNITION:1/4`
      result.putString("probe", probeSummary);
      promise.resolve(result);
    }
  }

  @ReactMethod
  public void cancel(Promise promise) {
    synchronized (lock) {
      recording = false;
      releaseRecorder();
      waitWorker();
      pcmBuffer = null;
      promise.resolve(true);
    }
  }

  @ReactMethod
  public void isRecording(Promise promise) {
    promise.resolve(recording);
  }

  @Override
  public void onCatalystInstanceDestroy() {
    recording = false;
    releaseRecorder();
    waitWorker();
    pcmBuffer = null;
    super.onCatalystInstanceDestroy();
  }
}
