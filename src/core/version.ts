import { compareVer } from '@/utils'
import { downloadNewVersion, getVersionInfo, openNewVersionInBrowser } from '@/utils/version'
import versionActions from '@/store/version/action'
import versionState, { type InitState } from '@/store/version/state'
import {
  getIgnoreVersion,
  getIgnoreVersionFailTipTime,
  saveIgnoreVersion,
  saveIgnoreVersionFailTipTime,
} from '@/utils/data'
import { showVersionModal } from '@/navigation'
import { Navigation } from 'react-native-navigation'

export const showModal = () => {
  if (versionState.showModal) return
  versionActions.setVisibleModal(true)
  showVersionModal()
}

export const hideModal = (componentId: string) => {
  if (!versionState.showModal) return
  versionActions.setVisibleModal(false)
  void Navigation.dismissOverlay(componentId)
}

export const checkUpdate = async (silent = false) => {
  versionActions.setVersionInfo({ status: 'checking' })
  let versionInfo: InitState['versionInfo'] = { ...versionState.versionInfo }
  try {
    const { version, desc, history } = await getVersionInfo()
    versionInfo.newVersion = {
      version,
      desc,
      history,
    }
  } catch (err) {
    versionInfo.newVersion = {
      version: '0.0.0',
      desc: '',
      history: [],
    }
  }
  // const versionInfo = {
  //   version: '1.9.0',
  //   desc: '- 更新xxx\n- 修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达修复xxx123的萨达',
  //   history: [{ version: '1.8.0', desc: '- 更新xxx22\n- 修复xxx22' }, { version: '1.7.0', desc: '- 更新xxx22\n- 修复xxx22' }],
  // }
  if (versionInfo.newVersion.version == '0.0.0') {
    versionInfo.isUnknown = true
    versionInfo.status = 'error'
  } else {
    versionInfo.status = 'idle'
    versionInfo.isUnknown = false
    if (compareVer(versionInfo.version, versionInfo.newVersion.version) != -1) {
      versionInfo.isLatest = true
    }
  }

  versionActions.setVersionInfo(versionInfo)

  if (!versionInfo.isLatest && !silent) {
    if (versionInfo.isUnknown) {
      const time = await getIgnoreVersionFailTipTime()
      if (Date.now() - time < 7 * 86400000) return
      saveIgnoreVersionFailTipTime(Date.now())
      showModal()
    } else if (versionInfo.newVersion.version != (await getIgnoreVersion())) {
      showModal()
    }
  }
  // console.log(compareVer(process.versions.app, versionInfo.version))
  // console.log(process.versions.app, versionInfo.version)
}

/**
 * 用外部浏览器打开新版下载地址。
 *
 * 下载 / 安装交给系统浏览器，避免应用内下载受网络、存储与「安装未知应用」权限影响。
 * 只有浏览器完全打不开时才返回 false，由调用方回退到应用内下载。
 */
export const openUpdateInBrowser = async (): Promise<boolean> => {
  const version = versionState.versionInfo.newVersion?.version
  if (!version) return false
  try {
    const url = await openNewVersionInBrowser(version)
    console.log('新版下载已交给外部浏览器:', url)
    return true
  } catch (err) {
    console.log('外部浏览器打开失败，回退到应用内下载:', err)
    return false
  }
}

export const downloadUpdate = () => {
  versionActions.setVersionInfo({ status: 'downloading' })
  versionActions.setProgress({ total: 0, current: 0 })

  downloadNewVersion(
    versionState.versionInfo.newVersion!.version,
    (total: number, current: number) => {
      // console.log(total, current)
      versionActions.setProgress({ total, current })
    }
  )
    .then(() => {
      versionActions.setVersionInfo({ status: 'downloaded' })
    })
    .catch(() => {
      versionActions.setVersionInfo({ status: 'error' })
      // console.log(err)
    })
}

export const setIgnoreVersion = (version: InitState['ignoreVersion']) => {
  versionActions.setIgnoreVersion(version)
  saveIgnoreVersion(version)
}
