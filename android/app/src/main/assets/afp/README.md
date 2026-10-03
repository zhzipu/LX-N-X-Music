# AFP 指纹资源（本地计算用）

网易云识曲需要它自家的 AFP 指纹（`algorithmCode=shazam_v2`，8kHz 输入），
算法是 WebAssembly 的 `afp.wasm`，而 React Native 的 Hermes 引擎**不支持 WebAssembly**。

所以这里把网易云官方 Chrome 扩展的指纹实现打包进 APK，交给 **WebView（V8 支持 wasm）**
在设备本地计算，指纹算完直接由客户端请求网易云，**不需要任何中转服务器**。

| 文件 | 说明 |
| --- | --- |
| `afp.wasm.js` | 指纹算法本体（wasm 以 base64 内嵌），约 300KB |
| `afp.js` | wasm 的 Emscripten glue，导出 `GenerateFP` / `AudioFingerprintRuntime` |
| `index.html` | 宿主页：与 RN 之间用 `postMessage` 收发，见文件头注释里的协议 |

来源：npm 包 `ncm-audio-recognize`（`@xnfa/netease-music-api` 的 `public/audio_match_demo/`），
上游实现见 <https://github.com/mos9527/ncm-afp>，MIT License。

> `afp.js` **保持原样未做任何修改** —— 浏览器里 `index.html` 先加载 `afp.wasm.js`（定义全局
> `const WASM_BINARY`）再加载 `afp.js`，`afp.js` 会走 `typeof WASM_BINARY != 'undefined'`
> 的分支直接使用它，不需要替换文件里那个 `WASM_BINARY_PLACEHOLDER` 占位符。
> 这与 Node/服务端的用法（把占位符替换成 `./afp.wasm` 文件路径）不同，两种都能用。
