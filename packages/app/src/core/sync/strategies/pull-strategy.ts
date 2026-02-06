/**
 * 拉取策略
 * 智能下载：拉取云端数据并恢复到本地
 */
import { getWebDAVClient } from "../../../infrastructure/http/webdav-client";
import { CloudBackup } from "../../../types";
import { snapshotManager } from "../../backup";
import { bookmarkRepository, countBookmarks } from "../../bookmark";
import type { WebDAVConfig } from "../../storage";
import { fileManager } from "../../storage";
import { queueManager } from "../../storage/queue-manager";
import { acquireSyncLock, releaseSyncLock } from "../lock-manager";
import { setSyncState } from "../state-manager";
import type { SyncResult } from "../types";

/**
 * 智能下载：拉取云端数据并恢复到本地
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 * @param mode 恢复模式：覆盖或合并
 * @param options.skipLock 是否跳过锁管理（由上层 smartSync 传递锁时使用）
 */
export async function smartPull(
  config: WebDAVConfig,
  lockHolder: string,
  mode: "overwrite" | "merge" = "overwrite",
  options?: { skipLock?: boolean },
): Promise<SyncResult> {
  const startTime = Date.now();
  const skipLock = options?.skipLock ?? false;
  console.log(`[PullStrategy] Starting pull by "${lockHolder}" (mode: ${mode})${skipLock ? ' (lock inherited)' : ''}`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[PullStrategy] Pull aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁（如果上层未传递锁）
  if (!skipLock) {
    const lockAcquired = await acquireSyncLock(lockHolder);
    if (!lockAcquired) {
      console.warn("[PullStrategy] Pull aborted: lock not acquired");
      return { success: false, action: "error", message: "同步正在进行中" };
    }
  }

  try {
    const client = getWebDAVClient(config);

    // 0. 创建本地快照（下载前备份）
    console.log("[PullStrategy] Creating local snapshot before pull...");
    try {
      const currentTree = await bookmarkRepository.getTree();
      const currentCount = countBookmarks(currentTree);
      await snapshotManager.createSnapshot(
        currentTree,
        currentCount,
        `下载前自动备份 (${lockHolder === "manual" ? "手动" : "自动"}, ${mode === "overwrite" ? "覆盖" : "合并"})`
      );
    } catch (error) {
      console.warn("[PullStrategy] Failed to create snapshot:", error);
      // 快照创建失败不影响同步
    }

    // 1. 下载云端最新备份数据
    console.log("[PullStrategy] Downloading from cloud...");
    const latestBackupPath = await fileManager.getLatestBackupFile(client);
    if (!latestBackupPath) {
      console.error("[PullStrategy] Pull aborted: no cloud backup found");
      return { success: false, action: "error", message: "云端无备份数据" };
    }
    
    const json = await queueManager.getFileWithDedup(client, latestBackupPath);
    if (!json) {
      console.error("[PullStrategy] Pull aborted: failed to read backup file");
      return { success: false, action: "error", message: "无法读取云端备份" };
    }

    let cloudData: CloudBackup;
    try {
      cloudData = JSON.parse(json) as CloudBackup;
    } catch {
      console.error("[PullStrategy] Cloud data is corrupted, cannot parse");
      return { success: false, action: "error", message: "云端备份数据格式损坏" };
    }
    if (!cloudData.data || !Array.isArray(cloudData.data)) {
      console.error("[PullStrategy] Cloud data structure invalid: missing or non-array data");
      return { success: false, action: "error", message: "云端备份数据结构无效" };
    }
    const cloudCount = countBookmarks(cloudData.data);
    const cloudTime = cloudData.metadata?.timestamp || 0;
    
    // 从文件名解析浏览器信息
    const fileName = latestBackupPath.split("/").pop() || "";
    const parsed = fileManager.parseBackupFileName(fileName);
    const cloudBrowser = parsed?.browser || "unknown";

    console.log(
      `[PullStrategy] Cloud: ${cloudCount} bookmarks from ${cloudBrowser} (${new Date(cloudTime).toISOString()})`,
    );

    // 2. 恢复书签
    console.log(`[PullStrategy] Restoring bookmarks (${mode} mode)...`);
    if (mode === "overwrite") {
      await bookmarkRepository.restoreFromBackup(cloudData);
    } else {
      await bookmarkRepository.mergeFromBackup(cloudData);
    }

    // 3. 更新同步时间
    await setSyncState({
      time: Date.now(),
      url: config.url,
      type: "download",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[PullStrategy] Pull completed in ${elapsed}ms`);
    return { success: true, action: "downloaded", message: "同步完成" };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "恢复失败";
    console.error(`[PullStrategy] Pull failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    if (!skipLock) {
      await releaseSyncLock(lockHolder);
    }
  }
}
