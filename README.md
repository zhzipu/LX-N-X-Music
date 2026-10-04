<p align="center"><a href="https://github.com/zhzipu/LX-N-X-Music"><img width="200" src="./doc/images/icon.png" alt="LX-N-X Music logo"></a></p>

<h1 align="center">LX-N-X Music</h1>

<p align="center">
  <a href="https://github.com/zhzipu/LX-N-X-Music/releases"><img src="https://img.shields.io/github/release/zhzipu/LX-N-X-Music" alt="Release version"></a>
  <a href="https://github.com/zhzipu/LX-N-X-Music/actions/workflows/release.yml"><img src="https://github.com/zhzipu/LX-N-X-Music/workflows/Build/badge.svg" alt="Build status"></a>
  <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/github/package-json/dependency-version/zhzipu/LX-N-X-Music/react-native/master" alt="React native version"></a>
</p>

<p align="center">基于 React Native 的音乐客户端（网易云 + B 站音源）</p>

本项目在 [lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 与
[ikun-music-mobile](https://github.com/ikunshare/ikun-music-mobile) 的基础上继续改造，
以满足个人使用需求。感谢上游作者的开源工作。

> 同步、备份等功能未充分测试，请自行备份重要数据。

## 特性

完整更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

### 小哔音乐（B 站音源）

把 B 站的视频音频接成一个独立音源，可以直接在 App 里搜索、播放，并作为歌手页的数据源之一：

| 能力 | 说明 |
| --- | --- |
| 搜索 | 关键词搜索 B 站视频，取音频流播放 |
| 排行榜 | B 站分区排行榜 |
| 评论 | 读取视频评论 |
| 歌手页 | 以 UP 主为「歌手」，列出其**投稿作品**与**合集**；合集详情是独立的全屏页 |
| 登录 | 扫码 / 手机号 / 手动填 Cookie 三种方式，登录后可浏览自己的收藏夹与合集 |
| 跳转 | 播放页可直接跳到对应的 B 站视频详情页 |

入口是侧栏的「Bilibili」（`nav_bilibili`），可在设置里关闭。

接口实现上踩过的几个坑（都已写进代码注释）：

- **空间 / 作品接口必须走 App 端**。B 站 web 的 `/x/space/wbi/arc/search`、`/x/space/wbi/acc/info`
  对「未登录 + App 环境」风控极严，部分账号（尤其 16 位新创作号）直接返回 **HTTP 412 / -352**；
  而 `app.bilibili.com` 的 `/x/v2/space`、`/x/v2/space/archive` 用 appkey 签名后，未登录也能稳定返回。
  签名方式：参数按 key 升序拼成 query，取 `md5(query + appsec)` 作为 `sign`。
- **分页上限**。App 的作品接口每页硬上限 20，合集列表接口的 `page_size` 也只能 ≤ 20，传大了直接
  `-400`。代码里统一按 20 内部翻页，再对外返回真实的 `hasMore`。
- **封面防盗链**。B 站图片统一转 `https` 并补上 `Referer`，否则 403 会导致封面灰底。
- 所有请求都带 `credentials: 'omit'`，避免 RN 原生 CookieJar 覆盖显式传入的 Cookie 头（`/nav` 必需）。

### 听歌识曲

三个引擎并行识别，结果去重后按引擎置信度排序（优先级 `netease > kugou > shazam`）：

| 引擎 | 原理 | 是否需要联网 |
| --- | --- | --- |
| 网易云 | AFP 指纹由隐藏 WebView 在设备本地计算，再直连网易云官方接口 | 需要 |
| 酷狗 | 上传 PCM 到酷狗识曲接口 | 需要 |
| Shazam | 纯 JS 在端上计算指纹 | 仅查询时需要 |

**整条识曲链路不需要任何自建服务端** —— 网易云的 AFP 指纹算法是 WebAssembly，
而 React Native 的 Hermes 引擎不支持 WebAssembly，所以本项目把官方指纹实现
（`android/app/src/main/assets/afp/`）交给 WebView 的 V8 内核在本机计算。

**录音不中断，分多次自动提交**：到第 3 / 7 / 10 / 13 秒各把「当前已录到的音频」
送一轮识别（原生侧 `peek` 取快照，不停录音）。音频是累积的，后一轮拿到的片段更完整，
前面没识别出来不代表失败。每轮结果**按引擎累积** —— 同一引擎后一轮命中会覆盖前一轮，
没命中则保留已有结果，所以列表只会越补越全。

**通道命中即退场**：某个平台一旦给出结果，结果就直接贴在列表上，该平台**不再参与
后续提交**。后面几轮只会把「还没出结果的平台」送出去，既省掉重复请求，也避免同一
首歌在列表里被反复刷新。

**结果边出边展示**：不用等全部引擎跑完，谁先返回就先把它的结果列出来；后续返回的再
合并进同一个列表，面板底部的引擎标签实时显示每个平台的状态
（`识别中… / 已识别 / 未识别 / 不可用`）。因为合并按优先级重排，先到的结果可能被
更高优先级的引擎顶到列表上方 —— 这是预期行为。

**提前结束**：某一轮跑完后三个平台都已给出结果，就立刻停录音不再提交（再录也没有新信息）；
否则跑完最后一个时间点自动结束。中途也可以点「完成」立即收尾。

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
# debug 产物按 ABI 拆分，没有 app-debug.apk —— 按设备架构选对应文件
adb install -r -d android/app/build/outputs/apk/debug/LX-N-X-Music-v1.1.0-arm64-v8a.apk
```

### 正式版（release）

正式版**不用**先跑 `npm run bundle-android` —— Gradle 会自动打 release 的 JS bundle
并过一遍 Hermes 编译（`--dev false` + R8 压缩，产物大约只有 debug 的三分之一）。

```bash
cd android && ./gradlew assembleRelease
# 产物 → android/app/build/outputs/apk/release/
```

两个必须知道的坑：

1. **bundle 撞名**：只要跑过 `npm run bundle-android`，`android/app/src/main/assets/index.android.bundle`
   就会存在；它会和 release 自动生成的 bundle 冲突。打正式版前先把它删掉或移到别处
   （debug 编译前再 `npm run bundle-android` 放回去）。
2. **需要签名材料**：`android/app/lxnx-release.keystore` 与 `android/keystore.properties`
   —— 两者都在 `.gitignore` 里，需自行生成。字段格式见 `build.gradle` 的 `signingConfigs`
   （`MYAPP_UPLOAD_STORE_FILE` / `_STORE_PASSWORD` / `_KEY_ALIAS` / `_KEY_PASSWORD`）。

包名：正式版 `com.lxnx.music`，debug 版 `com.lxnx.music.dev` —— 两者可以同时装在一台机器上。

CI（`.github/workflows/release.yml`）**只支持手动触发**：去 Actions 页面点 `Run workflow`
才会编译并发布 Release；平时 push 源码不会自动发版。

## 目录说明

```
src/core/bilibili/              B 站音源：接口封装、WBI / App 签名、登录态
  api.ts                        空间 / 作品 / 合集 / 收藏夹等接口
  auth.ts                       扫码 / 手机号 / Cookie 登录
  wbi.ts                        web 接口的 WBI 签名
src/utils/musicSdk/bili/        小哔音乐音源适配（搜索 / 排行榜 / 评论 / 歌手）
src/screens/Home/Views/Bilibili/  B 站页面（侧栏入口、库、登录、收藏夹详情）
src/screens/ArtistDetail/        歌手页（含 B 站 UP 主的作品与合集）

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
