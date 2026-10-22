import RNFetchBlob from 'rn-fetch-blob';
import {toMD5, toast, requestStoragePermission} from '@/utils/tools';
import { getMusicUrl, getLyricInfo } from '@/core/music';
import {getFileExtension, getFileExtensionFromUrl} from '@/screens/Home/Views/Mylist/MusicList/download/utils';
import { mergeLyrics } from '@/screens/Home/Views/Mylist/MusicList/download/lrcTool';
import {writeFile, unlink} from '@/utils/fs';
import { writeMetadata, writePic, writeLyric } from '@/utils/localMediaMetadata';
import settingState from '@/store/setting/state';
import downloadState from '@/store/download/state';
import downloadActions from '@/store/download/action';
import {filterFileName, sizeFormate} from "@/utils";
import { getPicUrl } from '@/core/music/online'
import { getOneDriveConfig, getOneDriveDownloadFolder, uploadOneDriveFile } from '@/core/oneDrive/drive'
import { getValidOneDriveAuth } from '@/core/oneDrive/auth'
import DownloadTask = LX.Download.DownloadTask
import wySdk from '@/utils/musicSdk/wy'

const taskQueue: DownloadTask[] = [];
let isProcessing = false;
const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
};
const WY_MEDIA_HEADERS = {
  'User-Agent': '',
  Referer: 'https://music.163.com/',
  Origin: 'https://music.163.com',
}
/**
 * B 站 CDN（upos-sz-mirrorcos / mirrorhw）会按 UA + Referer 的组合判盗链：
 * 没 Referer → 403；移动端浏览器 UA + 网页 Referer → 也 403；
 * BiliApp UA + 网页 Referer 才是能过的那一组。mcdn 节点不校验，所以只有一部分歌会挂。
 */
const BILI_MEDIA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 BiliApp/6.66.0',
  Referer: 'https://www.bilibili.com/',
}
const DOWNLOAD_OPTION_MAX_ATTEMPTS = 3;
const DOWNLOAD_OPTION_RETRY_DELAY = 800;

type MetadataStatusKey = keyof DownloadTask['metadataStatus'];

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error);
};

const retryDownloadOption = async (label: string, handler: () => Promise<void>) => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_OPTION_MAX_ATTEMPTS; attempt++) {
    try {
      await handler();
      return;
    } catch (error) {
      lastError = error;
      console.warn(
        `[Download Manager] ${label} failed (${attempt}/${DOWNLOAD_OPTION_MAX_ATTEMPTS}):`,
        getErrorMessage(error)
      );
      if (attempt < DOWNLOAD_OPTION_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, DOWNLOAD_OPTION_RETRY_DELAY * attempt));
      }
    }
  }
  throw new Error(
    `${label}失败（已尝试 ${DOWNLOAD_OPTION_MAX_ATTEMPTS} 次）：${getErrorMessage(lastError)}`
  );
};

const updateMetadataStatus = (
  task: DownloadTask,
  key: MetadataStatusKey,
  status: DownloadTask['metadataStatus'][MetadataStatusKey]
) => {
  downloadActions.updateTask(task.id, {
    metadataStatus: { ...task.metadataStatus, [key]: status },
  });
};

const getDownloadHeaders = (task: DownloadTask) => {
  const source = task.musicInfo.source
  if (source === 'wy') return WY_MEDIA_HEADERS
  if (source === 'bili') return BILI_MEDIA_HEADERS
  return DOWNLOAD_HEADERS
}
let currentDownloadTask: any | null = null;
type DownloadTarget = 'local' | 'onedrive';

const getTaskTarget = (task: DownloadTask): DownloadTarget => task.target ?? 'local'

const getTaskAudioFileName = (task: DownloadTask) => {
  // 优先用落盘后的真实扩展名：B 站直链是 fMP4，会从 .mp3 纠正成 .m4a
  const actual = task.filePath.match(/\.([0-9a-z]+)$/i)
  return `${task.fileName}.${actual ? actual[1] : getFileExtension(task.quality)}`
}

/**
 * 按文件头判断真实容器。B 站 dash 音频是 fMP4（ftyp iso5 / mp41 / dash），
 * 但文件名是按音质给的 .mp3，标签库按扩展名找 MP3 帧头就会报
 * 「No audio header found within xxx.mp3」。下完就改名能一并解决播放器认格式的问题。
 */
const sniffAudioExt = async (filePath: string): Promise<string | null> => {
  const probePath = `${RNFetchBlob.fs.dirs.CacheDir}/lx_ext_probe_${Date.now()}.bin`;
  try {
    await RNFetchBlob.fs.slice(filePath, probePath, 0, 16);
    const head = await RNFetchBlob.fs.readFile(probePath, 'ascii');
    if (typeof head === 'string') {
      if (head.includes('ftyp')) return 'm4a';
      if (head.includes('fLaC')) return 'flac';
      if (head.includes('OggS')) return 'ogg';
    }
    return null;
  } catch (error) {
    console.warn('[Download Manager] 无法识别音频格式:', getErrorMessage(error));
    return null;
  } finally {
    await unlink(probePath).catch(() => {});
  }
};

/** 扩展名和真实容器对不上时改名，返回新的路径 */
const fixAudioExtension = async (task: DownloadTask): Promise<void> => {
  const detected = await sniffAudioExt(task.filePath);
  if (!detected) return;
  const current = (task.filePath.match(/\.([0-9a-z]+)$/i)?.[1] ?? '').toLowerCase();
  if (current === detected) return;
  const nextPath = task.filePath.replace(/\.[0-9a-z]+$/i, `.${detected}`);
  await RNFetchBlob.fs.mv(task.filePath, nextPath);
  task.filePath = nextPath;
  downloadActions.updateTask(task.id, { filePath: nextPath });
  console.log(`[Download Manager] 扩展名纠正: .${current} -> .${detected}`);
};

const processQueue = async () => {
  if (isProcessing || taskQueue.length === 0) return;
  isProcessing = true;

  const task = taskQueue.shift();
  if (!task) {
    isProcessing = false;
    return;
  }

  try {
    await startDownload(task);
  } catch (error: any) {
    downloadActions.updateTask(task.id, { status: 'error', errorMsg: error.message });
    if (getTaskTarget(task) === 'onedrive') {
      toast(`OneDrive 下载失败：${error.message}`, 'long');
    }
  } finally {
    isProcessing = false;
    processQueue();
  }
};

const startDownload = async (task: DownloadTask) => {
  downloadActions.updateTask(task.id, { status: 'downloading' });
  const target = getTaskTarget(task);
  if (target === 'onedrive') {
    await getValidOneDriveAuth();
  }

  let url: string;
  if (task.isForceCookie && task.musicInfo.source === 'wy') {
    const highQualityLevels: LX.Quality[] = ['flac', 'hires', 'master', 'atmos', 'atmos_plus'];
    console.log(`[Batch Download] Forcing cookie for ${task.musicInfo.name}`);
    try {
      const result = await wySdk.cookie.getMusicUrl(task.musicInfo, task.quality).promise;
      if (!result.url) throw new Error('Cookie 未能获取到URL');
      if (result.level === 'exhigh' && highQualityLevels.includes(task.quality)) {
        throw new Error(`请求的音质 ${task.quality} 不可用`);
      }
      url = result.url;
    } catch (error: any) {
      throw new Error(`获取下载地址失败：${error.message}`);
    }
  } else {
    url = await getMusicUrl({ musicInfo: task.musicInfo, quality: task.quality, isRefresh: true });
  }

  if (target === 'local') await requestStoragePermission()

  if (!task.isForceCookie) {
    toast(`${task.fileName} 正在下载...`, 'short');
  }
  let lastWritten = 0;
  let lastTime = Date.now();
  try {
    const downloadTask = RNFetchBlob.config({
      path: task.filePath,
      fileCache: true,
    }).fetch('GET', url, getDownloadHeaders(task));

    currentDownloadTask = downloadTask;
    downloadTask.progress({ interval: 500 }, (written, total) => {
      const now = Date.now();
      const deltaTime = now - lastTime;
      if (deltaTime === 0) return;

      const deltaBytes = written - lastWritten;
      const speed = deltaBytes / (deltaTime / 1000);

      lastWritten = written;
      lastTime = now;
      const percent = total > 0 ? written / total : 0;
      downloadActions.updateTask(task.id, {
        progress: {
          ...task.progress,
          percent,
          downloaded: written,
          total,
          speed: `${sizeFormate(speed)}/s`,
        },
      });
    });

    await downloadTask;
    console.log('下载完成:', task.fileName);
    await fixAudioExtension(task);
    await handleMetadata(task, task.filePath);
    if (target === 'onedrive') {
      const config = await getOneDriveConfig();
      const downloadFolder = getOneDriveDownloadFolder(config);
      const uploadFileName = getTaskAudioFileName(task);
      const lyricPath = task.filePath.substring(0, task.filePath.lastIndexOf('.')) + '.lrc';
      try {
        toast(`${uploadFileName} 正在上传到 OneDrive...`, 'short');
        const result = await uploadOneDriveFile({
          localPath: task.filePath,
          fileName: uploadFileName,
          folder: downloadFolder,
          onProgress(uploaded, total) {
            const percent = total > 0 ? uploaded / total : 0;
            downloadActions.updateTask(task.id, {
              progress: {
                ...task.progress,
                percent,
                downloaded: uploaded,
                total,
                speed: 'OneDrive',
              },
            });
          },
        });

        if (settingState.setting['download.writeLyric'] && await RNFetchBlob.fs.exists(lyricPath)) {
          await uploadOneDriveFile({
            localPath: lyricPath,
            fileName: `${task.fileName}.lrc`,
            folder: downloadFolder,
          });
        }

        downloadActions.updateTask(task.id, {
          status: 'completed',
          remotePath: result.remotePath,
          remoteUrl: result.item.webUrl,
          progress: {
            ...task.progress,
            percent: 1,
            total: result.item.size ?? task.progress.total,
          },
        });
        toast(`${uploadFileName} 已上传到 OneDrive!`, 'short');
        return;
      } finally {
        await unlink(task.filePath).catch(() => {});
        await unlink(lyricPath).catch(() => {});
      }
    }
    try {
      await RNFetchBlob.fs.scanFile([{ path: task.filePath }]);
      console.log(`[Download Manager] Media scan requested for: ${task.filePath}`);
    } catch (scanError) {
      console.error(`[Download Manager] Failed to request media scan for ${task.filePath}:`, scanError);
    }
    downloadActions.updateTask(task.id, { status: 'completed', progress: { ...task.progress, percent: 1 } });

    if (!task.isForceCookie) {
      toast(`${task.fileName} 下载完成!`, 'short');
    }
  } finally {
    currentDownloadTask = null;
  }
};

const handleMetadata = async (task: DownloadTask, filePath: string) => {
  console.log('开始处理元数据:', filePath);
  // 写入标签
  if (settingState.setting['download.writeMetadata']) {
    try {
      await retryDownloadOption('标签写入', async () => {
        const title = settingState.setting['download.writeAlias'] && task.musicInfo.alias
          ? `${task.musicInfo.name} (${task.musicInfo.alias})`
          : task.musicInfo.name;

        await writeMetadata(filePath, {
          name: title,
          singer: task.musicInfo.singer,
          albumName: task.musicInfo.meta.albumName,
        }, true);
      });
      updateMetadataStatus(task, 'tags', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'tags', 'fail');
      throw error;
    }
  }

  // 写入封面
  if (settingState.setting['download.writePicture']) {
    try {
      await retryDownloadOption('封面写入', async () => {
        let picPath = '';
        try {
          const picUrl = await getPicUrl({ musicInfo: task.musicInfo });
          if (!picUrl) throw new Error('未获取到封面地址');
          const extension = getFileExtensionFromUrl(picUrl);
          picPath = `${RNFetchBlob.fs.dirs.CacheDir}/lx_download_cover_${task.id}.${extension}`;
          // B 站图片服务器同样要 Referer，不带会 403
          await RNFetchBlob.config({ path: picPath }).fetch(
            'GET',
            picUrl,
            task.musicInfo.source === 'bili' ? BILI_MEDIA_HEADERS : undefined,
          );
          await writePic(filePath, picPath);
        } finally {
          if (picPath) await unlink(picPath).catch(() => {});
        }
      });
      updateMetadataStatus(task, 'cover', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'cover', 'fail');
      throw error;
    }
  }

  // 写入歌词
  if (settingState.setting['download.writeLyric'] || settingState.setting['download.writeEmbedLyric']) {
    try {
      await retryDownloadOption('歌词写入', async () => {
        const lyrics = await getLyricInfo({
          musicInfo: task.musicInfo as LX.Music.MusicInfoOnline,
        });
        const baseFilePath = filePath.substring(0, filePath.lastIndexOf('.'));
        const romaLyric = settingState.setting['download.writeRomaLyric'] ? lyrics.rlyric : null;
        const lyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (!lyricContent) throw new Error('未获取到可写入的歌词');

        if (settingState.setting['download.writeEmbedLyric']) {
          await writeLyric(filePath, lyricContent);
        }
        if (settingState.setting['download.writeLyric']) {
          await writeFile(`${baseFilePath}.lrc`, lyricContent);
        }
      });
      updateMetadataStatus(task, 'lyric', 'success');
    } catch (error) {
      updateMetadataStatus(task, 'lyric', 'fail');
      throw error;
    }
  }
};

export const retryMetadata = async (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task || !task.filePath) {
    toast('任务或文件不存在，无法重试');
    return;
  }

  toast('正在尝试重新获取元信息...');
  const filePath = task.filePath;
  const metadataStatus = { ...task.metadataStatus };

  // 重试写入标签
  if (metadataStatus.tags === 'fail' && settingState.setting['download.writeMetadata']) {
    try {
      const title = settingState.setting['download.writeAlias'] && task.musicInfo.alias
      ? `${task.musicInfo.name} (${task.musicInfo.alias})`
      : task.musicInfo.name;

      await writeMetadata(filePath, {
        name: title,
        singer: task.musicInfo.singer,
        albumName: task.musicInfo.meta.albumName,
      }, true);
      metadataStatus.tags = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Tags Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.tags = 'fail';
    }
  }

  // 重试写入封面
  if (metadataStatus.cover === 'fail' && settingState.setting['download.writePicture']) {
    try {
      const picUrl = await getPicUrl({ musicInfo: task.musicInfo as LX.Music.MusicInfoOnline });
      const extension = getFileExtensionFromUrl(picUrl);
      const picPath = `${RNFetchBlob.fs.dirs.CacheDir}/lx_temp_pic_${task.id}.${extension}`;

      await RNFetchBlob.config({ path: picPath }).fetch('GET', picUrl);
      await writePic(filePath, picPath);
      await unlink(picPath);
      metadataStatus.cover = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Cover Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.cover = 'fail';
    }
  }

  // 重试写入歌词
  if (metadataStatus.lyric === 'fail' && (settingState.setting['download.writeLyric'] || settingState.setting['download.writeEmbedLyric'])) {
    try {
      const lyrics = await getLyricInfo({ musicInfo: task.musicInfo as LX.Music.MusicInfoOnline });
      const baseFilePath = filePath.substring(0, filePath.lastIndexOf('.'));
      const romaLyric = settingState.setting['download.writeRomaLyric'] ? lyrics.rlyric : null;

      if (settingState.setting['download.writeEmbedLyric']) {
        const embedLyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (embedLyricContent) await writeLyric(filePath, embedLyricContent);
      }
      if (settingState.setting['download.writeLyric']) {
        const finalLyricContent = mergeLyrics(lyrics.lyric, lyrics.tlyric, romaLyric);
        if (finalLyricContent) await writeFile(`${baseFilePath}.lrc`, finalLyricContent);
      }
      metadataStatus.lyric = 'success';
    } catch (e: any) {
      console.error(`[Retry Metadata] Write Lyric Error for ${task.musicInfo.name}:`, e.message);
      metadataStatus.lyric = 'fail';
    }
  }

  downloadActions.updateTask(task.id, { metadataStatus });

  if (Object.values(metadataStatus).every(s => s !== 'fail')) {
    toast('元信息已全部修复成功！');
  } else {
    toast('部分元信息修复失败，请检查日志', 'long');
  }
};

export const retryTask = (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task) return;

  // 失败任务由用户手动触发后原地重新排队，避免删除任务造成状态和清理竞态。
  if (task.status === 'error' || !task.filePath) {
    toast('正在重新下载...');
    void unlink(task.filePath).catch(() => {}).finally(() => {
      downloadActions.updateTask(task.id, {
        status: 'waiting',
        errorMsg: '',
        progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
        metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
        remotePath: undefined,
        remoteUrl: undefined,
      });
      if (!taskQueue.some(item => item.id === task.id)) taskQueue.push(task);
      processQueue();
    });
  }
  // 如果文件已存在，但元信息失败，则只重试元信息
  else if (Object.values(task.metadataStatus).includes('fail')) {
    void retryMetadata(task.id);
  }
};

export const resumeTask = async (taskId: string) => {
  const task = downloadState.tasks.find(t => t.id === taskId);
  if (!task) return;
  if (task.status !== 'paused') return;

  if (taskQueue.some(t => t.id === task.id)) {
    return;
  }

  try {
    await unlink(task.filePath);
  } catch (error) {
    // Ignore cleanup failures so we can still restart the download.
  }

  downloadActions.updateTask(task.id, {
    status: 'waiting',
    errorMsg: '',
    progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
    metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
  });
  taskQueue.push(task);
  processQueue();
};

export const addTask = (
  musicInfo: LX.Music.MusicInfo,
  quality: LX.Quality,
  isForceCookie: boolean = false,
  target: DownloadTarget = 'local'
) => {
  const extension = getFileExtension(quality);

  let finalSingerString = musicInfo.singer;
  // 文件名过长的情况下，只取前6个歌手名
  if (musicInfo.artists && musicInfo.artists.length > 6) {
    finalSingerString = musicInfo.artists.slice(0, 6).map(artist => artist.name).join('、') + '...';
  }
  let fileName = settingState.setting['download.fileName']
    .replace('歌名', musicInfo.name)
    .replace('歌手', finalSingerString);
  fileName = filterFileName(fileName);
  const id = toMD5(`${musicInfo.id}-${quality}-${target}`);
  const downloadDir = target === 'onedrive'
    ? RNFetchBlob.fs.dirs.CacheDir
    : settingState.setting['download.path'] || (RNFetchBlob.fs.dirs.MusicDir + '/LX-N-X Music');
  const filePath = target === 'onedrive'
    ? `${downloadDir}/lx_onedrive_${id}.${extension}`
    : `${downloadDir}/${fileName}.${extension}`;

  const task: DownloadTask = {
    id,
    musicInfo,
    quality,
    status: 'waiting',
    filePath,
    fileName,
    target,
    progress: { percent: 0, speed: '', downloaded: 0, total: 0 },
    metadataStatus: { cover: 'pending', lyric: 'pending', tags: 'pending' },
    createdAt: Date.now(),
    isForceCookie,
  };

  if (downloadState.tasks.some(t => t.id === task.id)) {
    toast('任务已存在');
    return;
  }

  downloadActions.addTask(task);
  taskQueue.push(task);
  processQueue();
};

export const removeTask = (id: string) => {
  const taskToRemove = downloadState.tasks.find(t => t.id === id);
  if (currentDownloadTask && taskToRemove && taskToRemove.status === 'downloading') {
    currentDownloadTask.cancel(async () => {
      try {
        console.log(taskToRemove)
        if (taskToRemove.filePath) {
          await unlink(taskToRemove.filePath);
          console.log(`[Download Manager] Canceled and deleted partial file: ${taskToRemove.filePath}`);
        }
      } catch (error) {
        console.error(`[Download Manager] Failed to delete partial file on remove:`, error);
      }
      currentDownloadTask = null;
    })
  } else if (taskToRemove && taskToRemove.status !== 'completed' && taskToRemove.filePath) {
    void unlink(taskToRemove.filePath).catch(() => {});
  }
  // 从队列中移除
  const taskIndex = taskQueue.findIndex(t => t.id === id);
  if (taskIndex > -1) taskQueue.splice(taskIndex, 1);
  // 从store中移除
  downloadActions.removeTask(id);
  isProcessing = false;
  processQueue();
};


/**
 * 批量下载任务 - 使用网易云源和Cookie，并间隔添加
 * @param musicInfos 选中的歌曲列表
 */
export const batchDownload = async (
  musicInfos: LX.Music.MusicInfo[],
  quality: LX.Quality,
  target: DownloadTarget = 'local'
) => {
  const cookie = settingState.setting['common.wy_cookie'];
  if (!cookie) {
    toast('请先在设置中配置网易云 Cookie');
    return;
  }

  const wyMusicInfos = musicInfos.filter(m => m.source === 'wy');
  if (musicInfos.length > wyMusicInfos.length) {
    toast('已自动过滤非网易云音源的歌曲');
  }
  if (!wyMusicInfos.length) {
    toast('未选择任何网易云音源的歌曲');
    return;
  }

  toast(`准备添加 ${wyMusicInfos.length} 首歌曲到下载队列...`);
  for (const musicInfo of wyMusicInfos) {
    addTask(musicInfo, quality, true, target);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};
