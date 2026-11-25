import { connectServer } from '@/plugins/sync'
import { updateSetting } from '@/core/common'
import { getSyncHost } from '@/plugins/sync/data'
import {triggerWebDAVSync} from "@/core/sync/webdavSync.ts";
import { log } from '@/utils/log'

export default async (setting: LX.AppSetting) => {
  if (setting['sync.webdav.url']) {
    // 这里必须挂 catch：WebDAV 远端返回非 JSON（错误页 / 代理页）时，
    // 未捕获的 rejection 会被全局兜底当成 Fatal 弹窗，启动就崩在首页。
    void triggerWebDAVSync().catch((err: unknown) => {
      log.error('[WebDAV] 启动同步失败', err as Error)
    });
  }
  if (!setting['sync.enable']) return

  const host = await getSyncHost()
  // console.log(host)
  if (!host) {
    updateSetting({ 'sync.enable': false })
    return
  }
  void connectServer(host)
}
