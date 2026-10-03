# 听歌识曲实现说明

## 总览

三个引擎并行跑，任一失败不影响其它；结果合并去重后按引擎优先级排序
（`shazam > netease > kugou`），只有一个引擎命中时标记为「可能结果」。

```
采集（原生 AudioRecord，16kHz / 单声道 / s16le，12 秒）
        │
        ├─► Shazam   纯 JS 指纹（src/core/musicRecognition/vendor/）
        ├─► 网易云   降采样到 8kHz → 隐藏 WebView 算 AFP 指纹 → 直连网易云
        └─► 酷狗     原始 PCM 上传到酷狗识曲接口
```

**整条链路不依赖任何自建服务端。**

## 网易云引擎：为什么用 WebView

网易云的 `api/music/audio/match` 要求 `rawdata` 是它自家的 AFP 指纹
（`algorithmCode=shazam_v2`，8kHz 输入），而指纹算法的实现是 **WebAssembly**
（`afp.wasm`）。

React Native 的 Hermes 引擎**不支持 WebAssembly**，但 Android WebView 的 V8 原生支持。
所以本项目把网易云官方 Chrome 扩展的指纹实现打进 APK：

- 资源：`android/app/src/main/assets/afp/`（`afp.wasm.js` + `afp.js` + 宿主页 `index.html`）
- 宿主组件：`src/components/MusicRecognition/AfpHidden.tsx`（1x1、不可交互、用户不可见）
- RN 侧桥：`src/core/musicRecognition/afp.ts`

数据流：录音 PCM（8kHz）→ base64 → `postMessage` 送进 WebView → 算指纹 →
`postMessage` 回传 → RN 请求网易云。

## 两个必须知道的坑（实测定位）

### 坑 1：指纹窗口必须固定 6 秒

网易云 matcher 只对**官方扩展那套固定 6 秒窗口**稳定命中。把整段录音直接喂进去，
命中与否取决于长度：

| 窗口 | 3s | 4s | 5s | 5.5s | 6s | 6.5s | 7s | 8s | 10s | 12s | 15s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 结果 | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

（同一首歌、同一起点。6 秒窗口在 0s/4s/10s/20s 四个起点 **12/12 命中**。）

所以 `afp.ts` 统一取 `min(总长, 6 × 8000)` 并从**中间**截取，避开录音首尾可能的
静音与点击声；`duration` 也填实际窗口长度。这么做还有个副作用是好的：送进 wasm 的
样本数恒定，避免了长音频导致 wasm 内存暴涨。

### 坑 2：音频里存在大段完全为 0 的样本时，指纹算不出来

`ExtractQueryFP` 遇到大段数字静音会抛 `Buffer length(64) is too short`
（该字符串由 wasm 内部拼出，不在 glue 的明文常量里）。这属于「这段音频识别不了」，
不该报成故障，所以：

- 指纹阶段抛错或指纹为空 → 按「未匹配」返回，不抛异常；
- 采集侧若整段全静音（`peak === 0`）**直接不发请求**，面板提示「没听到声音」；
- 低信号（零样本占比 > 50% 或连续静音 > 3s）提示用户调大音量、靠近音源。

### 配套：录音音源必须试采后择优

很多机型上 `UNPROCESSED` 音源能创建成功、也能开始录音，但读出来的是**整段全零**
（硬件并不真的支持 raw 采集）。只在开头试采一下还不够 —— 某些音源会先吐一个
起始瞬态再转为静音，足以骗过「有没有非零样本」的判据。

现在的做法（`AudioRecorderModule.java`）：

- 音源优先级 **MIC → VOICE_RECOGNITION → UNPROCESSED**；
- 试采 800ms，把这段时间切成若干个 200ms 窗口，要求**足够多的窗口都有信号**
  才算这个音源可用；
- 试采到的数据直接攒进正式缓冲，不浪费；
- 面板调试行会打印每个音源的试采结论（如 `MIC:4/4 UNPROCESSED:1/4`）。

实测：某机型用 `UNPROCESSED` 时零样本占比 96%（只有一个起始瞬态），换成 `MIC`
后降到 1%，网易云与酷狗都能正常识别。

## 排查

识曲面板底部（开发构建）会显示：

```
采集 13300ms / 13.3s 音源=MIC 峰值=13612(原生13612) RMS=2349 零占比=1%(最长0.1s) 有声
试采 UNPROCESSED:1/4 VOICE_RECOGNITION:2/4 MIC:4/4
netease: 命中=3 窗口=6s 指纹=2KB noMatch=0
```

- `零占比` 高、`最长` 静音长 → 采集问题，看试采那行判断是不是音源选错；
- 各引擎那一行是接口返回的直接证据，报错时会带具体原因。
