import RNFS from 'react-native-fs'
import RNFetchBlob from 'rn-fetch-blob'
import { getData, saveData } from '@/plugins/storage'
import { getValidOneDriveAuth } from './auth'

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0/me/drive'
const CONFIG_KEY = '@onedrive_config'
const SIMPLE_UPLOAD_LIMIT = 250 * 1024 * 1024
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024
const audioExts = new Set([
  'mp3',
  'flac',
  'wav',
  'm4a',
  'aac',
  'ogg',
  'oga',
  'opus',
  'wma',
  'ape',
])

const requestGraph = async <T>(url: string): Promise<T> => {
  const auth = await getValidOneDriveAuth()
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
    },
  })
  const body = await response.json()
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.error_description ?? 'OneDrive request failed')
  }
  return body as T
}

const readAllPages = async <T>(url: string): Promise<T[]> => {
  const result: T[] = []
  let nextUrl: string | undefined = url
  while (nextUrl) {
    const body: { value: T[]; '@odata.nextLink'?: string } = await requestGraph(nextUrl)
    result.push(...(body.value ?? []))
    nextUrl = body['@odata.nextLink']
  }
  return result
}

const getChildrenUrl = (folderId?: string) => {
  const expand = '$expand=thumbnails($select=small,medium,large)'
  return folderId
    ? `${GRAPH_ROOT}/items/${encodeURIComponent(folderId)}/children?${expand}&$top=200`
    : `${GRAPH_ROOT}/root/children?${expand}&$top=200`
}

const getFolderItemUrl = (folder: LX.OneDrive.DriveFolder | null | undefined) => {
  return folder?.id
    ? `${GRAPH_ROOT}/items/${encodeURIComponent(folder.id)}`
    : `${GRAPH_ROOT}/root`
}

const getUploadUrl = (
  folder: LX.OneDrive.DriveFolder | null | undefined,
  fileName: string,
  action: 'content' | 'createUploadSession'
) => {
  return `${getFolderItemUrl(folder)}:/${encodeURIComponent(fileName)}:/${action}`
}

const normalizePath = (path: string | undefined, name: string) => {
  return path ? `${path}/${name}` : name
}

const getExt = (name: string) => {
  const ext = name.split('.').pop()
  return ext && ext != name ? ext.toLowerCase() : ''
}

const getContentType = (fileName: string) => {
  const ext = getExt(fileName)
  switch (ext) {
    case 'mp3':
      return 'audio/mpeg'
    case 'flac':
      return 'audio/flac'
    case 'm4a':
      return 'audio/mp4'
    case 'aac':
      return 'audio/aac'
    case 'ogg':
    case 'oga':
      return 'audio/ogg'
    case 'opus':
      return 'audio/opus'
    case 'wav':
      return 'audio/wav'
    case 'lrc':
      return 'text/plain; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

const parseFileName = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.')
  const rawName = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
  if (!rawName.includes('-')) return { name: rawName.trim(), singer: '' }
  const [left, ...rest] = rawName.split('-')
  return {
    name: left.trim(),
    singer: rest.join('-').trim(),
  }
}

const getThumbUrl = (item: LX.OneDrive.DriveFile) => {
  const thumb = item.thumbnails?.[0]
  return thumb?.large?.url ?? thumb?.medium?.url ?? thumb?.small?.url ?? ''
}

const getDownloadUrl = (item: LX.OneDrive.DriveFile) => {
  return item.downloadUrl ?? item['@microsoft.graph.downloadUrl']
}

export const getOneDriveConfig = async (): Promise<LX.OneDrive.Config> => {
  const config = (await getData<LX.OneDrive.Config>(CONFIG_KEY)) ?? {
    selectedFolder: null,
    songs: [],
  }
  config.songs = (config.songs ?? []).map(normalizeOneDriveMusicInfo)
  return config
}

export const saveOneDriveConfig = async (config: LX.OneDrive.Config) => {
  await saveData(CONFIG_KEY, config)
}

export const listOneDriveFolders = async (folder?: LX.OneDrive.DriveFolder | null) => {
  const items = await readAllPages<LX.OneDrive.DriveFile & { folder?: unknown }>(
    getChildrenUrl(folder?.id)
  )
  return items
    .filter(item => item.folder)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<LX.OneDrive.DriveFolder>(item => ({
      id: item.id,
      name: item.name,
      parentId: folder?.id,
      path: normalizePath(folder?.path, item.name),
    }))
}

export const saveOneDriveSelectedFolder = async (folder: LX.OneDrive.DriveFolder | null) => {
  const config = await getOneDriveConfig()
  config.selectedFolder = folder
  if (!config.downloadFolderSelected) config.downloadFolder = folder
  await saveOneDriveConfig(config)
  return config
}

export const getOneDriveDownloadFolder = (config: LX.OneDrive.Config) => {
  return !config.downloadFolderSelected
    ? config.selectedFolder ?? null
    : config.downloadFolder ?? null
}

export const saveOneDriveDownloadFolder = async (folder: LX.OneDrive.DriveFolder | null) => {
  const config = await getOneDriveConfig()
  config.downloadFolder = folder
  config.downloadFolderSelected = true
  await saveOneDriveConfig(config)
  return config
}

const toMusicInfo = (item: LX.OneDrive.DriveFile, path: string): LX.OneDrive.MusicInfo => {
  const ext = getExt(item.name)
  const title = parseFileName(item.name)
  const modifiedTime = item.lastModifiedDateTime
    ? new Date(item.lastModifiedDateTime).getTime()
    : 0
  return {
    id: `onedrive_${item.id}`,
    name: title.name,
    singer: title.singer,
    source: 'local',
    interval: null,
    meta: {
      songId: item.id,
      albumName: '',
      oneDrive: true,
      itemId: item.id,
      fileName: item.name,
      filePath: path,
      ext,
      size: item.size,
      webUrl: item.webUrl,
      downloadUrl: getDownloadUrl(item),
      picUrl: getThumbUrl(item),
      lastModifiedTime: modifiedTime,
    },
  }
}

const upsertOneDriveSong = async (
  item: LX.OneDrive.DriveFile,
  folder: LX.OneDrive.DriveFolder | null | undefined
) => {
  if (!item.file || !audioExts.has(getExt(item.name))) return

  const config = await getOneDriveConfig()
  const song = toMusicInfo(item, normalizePath(folder?.path, item.name))
  const index = config.songs.findIndex(s => s.meta.itemId === item.id)
  if (index > -1) {
    config.songs[index] = song
  } else {
    config.songs.unshift(song)
  }
  config.selectedFolder = folder ?? config.selectedFolder ?? null
  config.scannedAt = Date.now()
  await saveOneDriveConfig(config)
}

export const normalizeOneDriveMusicInfo = (musicInfo: LX.OneDrive.MusicInfo) => {
  const title = parseFileName(musicInfo.meta.fileName || musicInfo.name)
  return {
    ...musicInfo,
    name: title.name,
    singer: title.singer,
  }
}

const scanFolder = async (
  folder: LX.OneDrive.DriveFolder | null,
  onProgress?: (count: number, folderPath: string) => void
) => {
  const result: LX.OneDrive.MusicInfo[] = []
  const items = await readAllPages<LX.OneDrive.DriveFile & { folder?: unknown; file?: unknown }>(
    getChildrenUrl(folder?.id)
  )
  for (const item of items) {
    const path = normalizePath(folder?.path, item.name)
    if (item.folder) {
      result.push(
        ...(await scanFolder(
          { id: item.id, name: item.name, parentId: folder?.id, path },
          onProgress
        ))
      )
      onProgress?.(result.length, path)
      continue
    }
    if (!item.file) continue
    const ext = getExt(item.name)
    if (!audioExts.has(ext)) continue
    result.push(toMusicInfo(item, path))
  }
  return result
}

export const scanOneDriveSongs = async (
  folder: LX.OneDrive.DriveFolder | null,
  onProgress?: (count: number, folderPath: string) => void
) => {
  const songs = await scanFolder(folder, onProgress)
  songs.sort((a, b) => b.meta.lastModifiedTime - a.meta.lastModifiedTime)

  const config = await getOneDriveConfig()
  config.selectedFolder = folder
  if (!config.downloadFolderSelected) config.downloadFolder = folder
  config.songs = songs
  config.scannedAt = Date.now()
  await saveOneDriveConfig(config)
  return config
}

export const getOneDriveDownloadUrl = async (musicInfo: LX.OneDrive.MusicInfo) => {
  const body = await requestGraph<LX.OneDrive.DriveFile>(
    `${GRAPH_ROOT}/items/${encodeURIComponent(musicInfo.meta.itemId)}`
  )
  const url = getDownloadUrl(body) ?? musicInfo.meta.downloadUrl
  if (!url) throw new Error('OneDrive 文件没有可播放地址')
  musicInfo.meta.downloadUrl = url
  return url
}

const parseGraphBlobResponse = (response: any) => {
  const status = response.info().status
  let body: any = {}
  try {
    const text = response.text()
    body = text ? JSON.parse(text) : {}
  } catch {}
  if (status < 200 || status >= 300) {
    if (status == 401 || status == 403) {
      throw new Error('OneDrive 授权已过期或缺少 Files.ReadWrite 权限，请重新登录 OneDrive')
    }
    throw new Error(body.error?.message ?? body.error_description ?? 'OneDrive upload failed')
  }
  return body
}

const createUploadSession = async (
  folder: LX.OneDrive.DriveFolder | null | undefined,
  fileName: string
) => {
  const auth = await getValidOneDriveAuth()
  const response = await fetch(getUploadUrl(folder, fileName, 'createUploadSession'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item: {
        '@microsoft.graph.conflictBehavior': 'replace',
        name: fileName,
      },
    }),
  })
  const body = await response.json()
  if (!response.ok) {
    if (response.status == 401 || response.status == 403) {
      throw new Error('OneDrive 授权已过期或缺少 Files.ReadWrite 权限，请重新登录 OneDrive')
    }
    throw new Error(body.error?.message ?? body.error_description ?? 'OneDrive upload session failed')
  }
  return body.uploadUrl as string
}

export const uploadOneDriveFile = async ({
  localPath,
  fileName,
  folder,
  onProgress,
}: {
  localPath: string
  fileName: string
  folder?: LX.OneDrive.DriveFolder | null
  onProgress?: (uploaded: number, total: number) => void
}) => {
  const auth = await getValidOneDriveAuth()
  const stat = await RNFS.stat(localPath)
  const total = Number(stat.size)
  const contentType = getContentType(fileName)
  let item: LX.OneDrive.DriveFile

  if (total <= SIMPLE_UPLOAD_LIMIT) {
    const request = RNFetchBlob.fetch('PUT', getUploadUrl(folder, fileName, 'content'), {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': contentType,
    }, RNFetchBlob.wrap(localPath))
    request.uploadProgress({ interval: 500 }, (uploaded) => {
      onProgress?.(uploaded, total)
    })
    item = parseGraphBlobResponse(await request) as LX.OneDrive.DriveFile
  } else {
    const uploadUrl = await createUploadSession(folder, fileName)
    let uploaded = 0
    while (uploaded < total) {
      const chunkSize = Math.min(UPLOAD_CHUNK_SIZE, total - uploaded)
      const chunk = await RNFS.read(localPath, chunkSize, uploaded, 'base64')
      const end = uploaded + chunkSize - 1
      const response = await RNFetchBlob.fetch('PUT', uploadUrl, {
        'Content-Length': String(chunkSize),
        'Content-Range': `bytes ${uploaded}-${end}/${total}`,
        'Content-Type': 'application/octet-stream',
      }, chunk)
      const status = response.info().status
      if (status == 202) {
        uploaded += chunkSize
        onProgress?.(uploaded, total)
        continue
      }
      item = parseGraphBlobResponse(response) as LX.OneDrive.DriveFile
      uploaded = total
      onProgress?.(uploaded, total)
      break
    }
  }

  await upsertOneDriveSong(item!, folder)
  return {
    item: item!,
    remotePath: normalizePath(folder?.path, fileName),
  }
}
