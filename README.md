> [!WARNING]
> **LX-N-X-Music 已废弃并停止维护，项目已迁移至 [奶音 Milky Music（milky-music）](https://github.com/zhzipu/milky-music)。**
> 后续开发、版本发布、使用文档与问题反馈统一在新仓库进行。本仓库保留历史源码与发布记录，不再提供功能更新或问题修复。
> 请前往 [新项目 README](https://github.com/zhzipu/milky-music#readme) 查看使用说明，并从 [新项目 Releases](https://github.com/zhzipu/milky-music/releases) 获取后续版本。

<p align="center"><a href="https://github.com/zhzipu/LX-N-X-Music"><img width="200" src="./doc/images/icon.png" alt="LX-N-X Music logo"></a></p>

<h1 align="center">LX-N-X Music</h1>

<p align="center">
  <a href="https://github.com/zhzipu/LX-N-X-Music/releases"><img src="https://img.shields.io/github/release/zhzipu/LX-N-X-Music" alt="Release version"></a>
  <a href="https://github.com/zhzipu/LX-N-X-Music/actions/workflows/release.yml"><img src="https://github.com/zhzipu/LX-N-X-Music/workflows/Build/badge.svg" alt="Build status"></a>
  <a href="https://github.com/facebook/react-native"><img src="https://img.shields.io/github/package-json/dependency-version/zhzipu/LX-N-X-Music/react-native/master" alt="React native version"></a>
</p>

<p align="center">基于 React Native 的音乐客户端</p>

本项目在 [lx-music-mobile](https://github.com/lyswhut/lx-music-mobile) 与
[ikun-music-mobile](https://github.com/ikunshare/ikun-music-mobile) 的基础上继续改造，
以满足个人使用需求。感谢上游作者的开源工作。

> 同步、备份等功能未充分测试，请自行备份重要数据。

## 特性

完整更新记录见 [CHANGELOG.md](./CHANGELOG.md)。

### LXXWear 手表端同步

配套的手表端应用 [LXXWear](https://github.com/zhzipu/LXXWear)（Wear OS / 安卓手表）可以让手表播放手机上的歌单，
**手机与手表连同一个 Wi-Fi 即可，不经过任何服务器、不需要外网**。

| 能力 | 说明 |
| --- | --- |
| 歌单同步 | 勾选要同步的歌单，逐个歌单选曲；手表上只保留你选中的那些歌 |
| 自动同步 | 每个歌单可单独开「自动同步」，只把选歌之后**新加进歌单**的曲目带过去 |
| 音质 | 跟随同步设置里选的音质，同一首歌不同音质视为两个条目 |
| 歌词 | 歌词随歌一起下发，手机上调过偏移 / 倍速的歌词会使用调整后的时间轴 |
| 配对 | 手表显示二维码，手机扫码（也可从相册选图）完成配对 |

工作方式：手机端在本机起一个 HTTP 服务当**服务端**，手表是**客户端**。

- **配对**：手表在「配对手机」页临时起一个服务并显示二维码，内容形如
  `lxnx://p?h=192.168.1.23&p=8688&c=482913`。手机扫码后 `POST /pair`，用一次性配对码换 token。
  token 的权威来源是手机（手表只保存），所以手机重装后再扫一次码即可，不会出现「配对成功但同步不动」。
- **清单**：手机把勾选的歌单整理成一份 manifest 交给原生服务，每首歌的 `wireId` 是
  `<音源>-<歌曲id>__<音质>`，并带一个 `revision`。手表按 revision 判断要不要重拉。
- **按需准备**：手表点某首时才来要文件，手机现取直链 / 下载 / 写标签，状态（待处理 / 就绪 / 失败 / 跳过）
  回传给界面；断点续传在手表侧完成（Range + `.part`），手机只要保证同一首每次都能取到同一个文件。
- **歌词一致**：manifest 里带 `lyricRevision` 指纹，手表手上的歌词指纹对不上时接口返回 **503**，
  手表据此重新拉取 —— 这样手机上改了歌词偏移，手表不会继续用旧时间轴。

> 需要手机与手表在同一个 Wi-Fi、且手机端 App 的同步服务处于开启状态。

### 歌词匹配与调节

自动匹配不准时（翻唱、纯音乐、B 站视频标题里塞满 tag），长按歌词可以对当前这首单独处理：

| 操作 | 说明 |
| --- | --- |
| 匹配歌词 | 按歌名 / 歌手搜索，从候选里挑一条保存；保存结果只作用于这一首，本地记住 |
| 调节歌词 | 进入调节模式，微调时间偏移，或改**歌词倍速**（默认 1.0，范围 0.5～2.0，精度 0.1） |
| 拖动对齐 | 直接在歌词列表里拖到某一句，以该行为锚点反解偏移，松手即对齐 |
| 倍速 | 歌词滚太快 / 太慢时用它拉伸整条时间轴，音频本身不变 |

调节模式里按系统返回键只退出调节模式，不会退出播放器。调整结果会同时作用于 App 内歌词、
桌面歌词小组件，以及通过局域网同步给手表的歌词。

B 站音源也支持歌词：优先取 B 站播放器识别出的 BGM 名称，没有再用视频标题清洗后匹配。

### 小哔音乐

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
src/core/lxxwear/               手表端局域网同步：配置、配对、清单与按需准备
  sync.ts                       整理清单、处理手表的取歌请求、推送歌词
  pairing.ts                    二维码解析与 /pair 换 token
src/screens/Home/Views/LxxWear/ 手机端同步页面（侧栏入口）
android/app/src/main/java/.../lanserver/  手机端内置 HTTP 服务与 RN 模块
android/app/src/main/java/.../qr/         二维码扫描（ML Kit + ZXing 取景框）

src/core/lyricAdjust.ts         歌词偏移 / 倍速的存取与变更通知
src/core/lyric.ts               歌词时间轴平移 / 缩放 / 锚点反解
src/components/LyricMatchModal.tsx       歌词手动匹配面板
src/screens/PlayDetail/components/useLyricAdjust.ts  调节模式的状态机
src/screens/PlayDetail/components/LyricAdjustBar.tsx 调节模式底部工具栏

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
