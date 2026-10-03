<p align="center"><a href="https://github.com/zhzipu/LX-N-X-Music"><img width="200" src="./doc/images/icon.png" alt="LX-N-X Music logo"></a></p>

<h1 align="center">LX-N-X Music</h1>

<p align="center">
  <a href="https://github.com/zhzipu/LX-N-X-Music/releases"><img src="https://img.shields.io/github/release/zhzipu/LX-N-X-Music" alt="Release version"></a>
  <a href="https://github.com/zhzipu/LX-N-X-Music/actions/workflows/release.yml"><img src="https://github.com/zhzipu/LX-N-X-Music/workflows/Build/badge.svg" alt="Build status"></a>
  <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/github/package-json/dependency-version/zhzipu/LX-N-X-Music/react-native/master" alt="React native version"></a>
</p>

<p align="center">基于 React Native 的网易云音乐客户端</p>

本项目在 [lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 与
[ikun-music-mobile](https://github.com/ikunshare/ikun-music-mobile) 的基础上继续改造，
以满足个人使用需求。感谢上游作者的开源工作。

> 同步、备份等功能未充分测试，请自行备份重要数据。

## 特性

### 听歌识曲

三个引擎并行识别，结果去重后按引擎置信度排序（优先级 `shazam > netease > kugou`）：

| 引擎 | 原理 | 是否需要联网 |
| --- | --- | --- |
| Shazam | 纯 JS 在端上计算指纹 | 仅查询时需要 |
| 网易云 | AFP 指纹由隐藏 WebView 在设备本地计算，再直连网易云官方接口 | 需要 |
| 酷狗 | 上传 PCM 到酷狗识曲接口 | 需要 |

**整条识曲链路不需要任何自建服务端** —— 网易云的 AFP 指纹算法是 WebAssembly，
而 React Native 的 Hermes 引擎不支持 WebAssembly，所以本项目把官方指纹实现
（`android/app/src/main/assets/afp/`）交给 WebView 的 V8 内核在本机计算。

入口：搜索页标题右侧的麦克风按钮。

### 桌面歌词小组件

Android 桌面 4×1 小组件（AppWidget），把「正在播放」连同**逐行歌词**直接摆到桌面上，
不用打开 App：

| 区域 | 内容 |
| --- | --- |
| 左侧 | 专辑封面（异步下载，缩放到 128×128 后写入，按 URL 去重） |
| 右侧上方 | 歌名（跑马灯）+ **当前歌词行**（单行跑马灯，自动横向滚动） |
| 右侧中间 | 上一首 / 播放暂停 / 下一首，点击即可控制 |
| 右侧底部 | 只读播放进度条 |

几个值得说明的实现点：

- **歌词跟着原生时间轴走**：每行切换由原生桌面歌词的 `onLyricLinePlay` 事件驱动
  （原生层推进，比 JS 定时器可靠），因此小组件歌词与 App 内歌词、桌面歌词三者同步。
- **没有歌词就降级**：没有歌词时歌词位回退显示歌手名，未播放时显示「未在播放」。
- **状态可恢复**：歌名、歌手、歌词、进度都写入 `SharedPreferences`（`MusicWidgetPrefs`），
  Launcher 重启或小组件重建后仍能显示上次的内容。
- **点击按钮不会卡死**：按钮通过 `PendingIntent` 广播到 `AppWidgetProvider`，再由它转发成
  `INTERNAL_*` 广播交给播放服务，并用独立事件名回传 JS，避免广播回环。

两个性能取舍：歌词用 **full update**（部分 Launcher 对 partial update 处理不可靠），节流 200ms；
进度条用 **partial update + `setProgressBar`**（属性更新开销小），节流 500ms —— 都是为了避开高频广播风暴。

尺寸 `minWidth 250dp / minHeight 70dp`，仅支持横向拉伸（`resizeMode="horizontal"`），
`updatePeriodMillis="0"` 表示不靠系统轮询刷新，全部由 App 主动推送。

### 其它

- 播放历史（播放满 2 分钟或 50% 计入）
- 相似歌手、相似歌曲
- 全量导出备份
- OneDrive 远程播放
- 网易云搜索增强

## 构建

需要 Node.js >= 18、JDK 17、Android SDK。

```bash
npm install

# 打 JS bundle（改过 JS 之后必须执行，assembleDebug 不会自动重打包）
npm run bundle-android

# 编译 debug APK → android/app/build/outputs/apk/debug/
cd android && ./gradlew assembleDebug
```

安装到设备：

```bash
adb install -r -d android/app/build/outputs/apk/debug/LX-N-X-Music-v1.0.0-arm64-v8a.apk
```

## 目录说明

```
src/core/musicRecognition/      听歌识曲：采集、三引擎、结果合并
  engines/                      shazam / netease / kugou
  afp.ts                        AFP 指纹桥（与隐藏 WebView 通信）
src/components/MusicRecognition/ 识曲面板与隐藏 WebView
android/app/src/main/assets/afp/ AFP 指纹资源（wasm），来源见该目录 README

src/utils/nativeModules/musicWidget.ts       桌面歌词小组件的 RN 侧封装
src/core/init/player/lyric.ts                歌词行 / 播放进度的推送时机
android/app/src/main/java/.../widget/        小组件原生实现（Provider + RN 模块）
android/app/src/main/res/layout/widget_music_4x1.xml   小组件布局
android/app/src/main/res/xml/widget_music_info.xml     小组件元信息
```

## 免责声明

- 本项目仅供学习与技术研究使用，请勿用于商业用途。
- 本项目不提供任何音乐内容，所有内容均来自第三方接口，仅供个人试听。
- 若你使用过程中遇到广告或引流（如需加群、关注公众号才能使用），则说明你运行的
  是第三方修改版，请谨慎鉴别。
- 本项目没有微信公众号之类的「官方账号」，也未在任何应用商店发布，谨防被骗。

## 许可证

[Apache-2.0](./LICENSE)

其中 `android/app/src/main/assets/afp/` 下的 AFP 指纹实现来自
[ncm-afp](https://github.com/mos9527/ncm-afp)，MIT License。
