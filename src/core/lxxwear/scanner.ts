import { NativeModules } from 'react-native'
import { launchImageLibrary } from 'react-native-image-picker'

/**
 * 扫手表上的配对二维码。两种方式，拿到的东西一样（二维码里的原始字符串）：
 * - scanWithCamera：原生打开 ZXing 取景框，实时识别，扫到即返回
 * - scanFromLibrary：从相册挑一张图，交给原生模块 LXQrScan（MLKit）离线解码
 * 怎么用这串文本交给 pairing.ts 的 parseQrPayload。
 */
interface QrNativeModule {
  scan(): Promise<string>
  decode(uri: string): Promise<string>
}

const nativeModule = NativeModules.LXQrScan as QrNativeModule | undefined

const ensureModule = (): QrNativeModule => {
  if (!nativeModule?.scan || !nativeModule?.decode) {
    throw new Error('扫码模块不可用，请安装包含扫码功能的新版本')
  }
  return nativeModule
}

/** 打开相机取景框扫码；用户取消返回 null */
export const scanWithCamera = async (): Promise<string | null> => {
  const text = await ensureModule().scan()
  const trimmed = (text ?? '').trim()
  return trimmed ? trimmed : null
}

/** 从相册选图识别；用户取消返回 null */
export const scanFromLibrary = async (): Promise<string | null> => {
  const result = await launchImageLibrary({
    mediaType: 'photo',
    quality: 1,
    includeBase64: false,
    maxWidth: 2000,
    maxHeight: 2000,
    selectionLimit: 1,
  })

  if (result.didCancel) return null
  if (result.errorCode) {
    throw new Error(result.errorCode === 'permission'
      ? '没有相册权限，去系统设置里允许后重试'
      : result.errorMessage || '打开相册失败')
  }

  const uri = result.assets?.[0]?.uri
  if (!uri) throw new Error('没有拿到图片')

  const text = await ensureModule().decode(uri)
  return (text ?? '').trim()
}
