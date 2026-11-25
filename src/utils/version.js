import { Linking } from 'react-native'
import { httpGet } from '@/utils/request'
import { name, repository } from '../../package.json'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'

const abis = ['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86', 'universal']
const repositorySlug = repository.url.replace(/^git\+https:\/\/github\.com\//, '').replace(/\.git$/, '')

const address = [
  [
    `https://raw.githubusercontent.com/${repositorySlug}/main/publish/version.json`,
    'direct',
  ],
  // ['https://registry.npmjs.org/lx-music-mobile-version-info/latest', 'npm'],
  [`https://cdn.jsdelivr.net/gh/${repositorySlug}/publish/version.json`, 'direct'],
  [`https://fastly.jsdelivr.net/gh/${repositorySlug}/publish/version.json`, 'direct'],
  [`https://gcore.jsdelivr.net/gh/${repositorySlug}/publish/version.json`, 'direct'],
  // ['https://registry.npmmirror.com/lx-music-mobile-version-info/latest', 'npm'],
  // ['http://cdn.stsky.cn/lx-music/mobile/version.json', 'direct'],
]

const request = async (url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(
      url,
      {
        timeout: 10000,
      },
      (err, resp, body) => {
        if (err || resp.statusCode != 200) {
          ++retryNum >= 3
            ? reject(err || new Error(resp.statusMessage || resp.statusCode))
            : request(url, retryNum).then(resolve).catch(reject)
        } else resolve(body)
      }
    )
  })
}

const getDirectInfo = async (url) => {
  return request(url).then((info) => {
    if (info.version == null) throw new Error('failed')
    return info
  })
}

const getNpmPkgInfo = async (url) => {
  return request(url).then((json) => {
    if (!json.versionInfo) throw new Error('failed')
    const info = JSON.parse(json.versionInfo)
    if (info.version == null) throw new Error('failed')
    return info
  })
}

export const getVersionInfo = async (index = 0) => {
  const [url, source] = address[index]
  let promise
  switch (source) {
    case 'direct':
      promise = getDirectInfo(url)
      break
    case 'npm':
      promise = getNpmPkgInfo(url)
      break
  }

  return promise.catch(async (err) => {
    index++
    if (index >= address.length) throw err
    return getVersionInfo(index)
  })
}

const getTargetAbi = async () => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}

/** 项目 GitHub 仓库地址 */
const repoUrl = `https://github.com/${repositorySlug}`

/**
 * 新版 APK 的下载直链。
 * 包名与 .github/workflows/release.yml 上传的产物保持一致：
 *   milky-music-v<version>-<abi>.apk
 */
export const getNewVersionApkUrl = async (version) => {
  const abi = await getTargetAbi()
  return `${repoUrl}/releases/download/v${version}/${name}-v${version}-${abi}.apk`
}

/** 新版 release 页面地址（直链打不开时兜底） */
export const getNewVersionReleaseUrl = (version) => `${repoUrl}/releases/tag/v${version}`

/**
 * 用外部浏览器打开新版下载地址，把下载 / 安装交给系统浏览器处理。
 *
 * 这里不先问 Linking.canOpenURL：本项目 AndroidManifest 没声明 <queries>，
 * Android 11+ 的包可见性会让它对 https 链接误报 false，据此判断会白白放弃一次正常跳转。
 * 直链打不开时退到 release 页面，两个都打不开才抛错，由调用方回退到应用内下载。
 *
 * @returns 最终交给浏览器的地址
 */
export const openNewVersionInBrowser = async (version) => {
  const apkUrl = await getNewVersionApkUrl(version)
  try {
    await Linking.openURL(apkUrl)
    return apkUrl
  } catch (err) {
    console.log('打开新版 APK 直链失败，改为打开 release 页面:', err)
    const releaseUrl = getNewVersionReleaseUrl(version)
    await Linking.openURL(releaseUrl)
    return releaseUrl
  }
}

let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

export const downloadNewVersion = async (version, onDownload = noop) => {
  const url = await getNewVersionApkUrl(version)
  let savePath = temporaryDirectoryPath + '/lx-netease-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 30000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
      // switch (statusCode) {
      //   case 200:
      //   case 206:
      //     break
      //   default:
      //     onDownload(null, contentLength, 0)
      //     break
      // }
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async () => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
