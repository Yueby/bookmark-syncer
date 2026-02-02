/**
 * 智能同步策略
 * 自动判断推送或拉取
 */
import { acquireSyncLock, getLastSyncTime, releaseSyncLock, setSyncState } from "../";
import { getWebDAVClient } from "../../../infrastructure/http/webdav-client";
import { CloudBackup } from "../../../types";
import { bookmarkRepository, compareWithCloud, countBookmarks } from "../../bookmark";
import { fileManager } from "../../storage";
import { queueManager } from "../../storage/queue-manager";
import type { CloudInfo, WebDAVConfig } from "../../storage/types";
import type { SmartSyncResult } from "../types";
import { smartPull } from "./pull-strategy";
import { smartPush } from "./push-strategy";

/**
 * 智能同步：自动判断推送或拉取
 */
export async function smartSync(
  config: WebDAVConfig,
  lockHolder: string,
): Promise<SmartSyncResult> {
  const startTime = Date.now();
  console.log(`[SmartSyncStrategy] Starting smart sync by "${lockHolder}"`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[SmartSyncStrategy] Smart sync aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[SmartSyncStrategy] Smart sync aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getWebDAVClient(config);

    // 1. 获取本地书签
    console.log("[SmartSyncStrategy] Getting local bookmarks...");
    const localTree = await bookmarkRepository.getTree();
    const localCount = countBookmarks(localTree);
    console.log(`[SmartSyncStrategy] Local: ${localCount} bookmarks`);

    // 2. 获取云端最新备份数据
    console.log("[SmartSyncStrategy] Getting cloud data...");
    let cloudData: CloudBackup | null = null;
    let cloudInfo: CloudInfo = { exists: false };

    try {
      const latestBackupPath = await fileManager.getLatestBackupFile(client);
      if (latestBackupPath) {
        const json = await queueManager.getFileWithDedup(client, latestBackupPath);
        if (json) {
          cloudData = JSON.parse(json) as CloudBackup;
          
          // 从文件名解析浏览器信息
          const fileName = latestBackupPath.split("/").pop() || "";
          const parsed = fileManager.parseBackupFileName(fileName);
          
          cloudInfo = {
            exists: true,
            timestamp: cloudData.metadata?.timestamp,
            totalCount: parsed?.count || countBookmarks(cloudData.data),
            browser: parsed?.browser,
            browserVersion: undefined,
          };
          console.log(
            `[SmartSyncStrategy] Cloud: ${cloudInfo.totalCount} bookmarks from ${cloudInfo.browser || "unknown"}`,
          );
        }
      }
    } catch (error) {
      console.warn("[SmartSyncStrategy] No cloud data found:", error);
    }

    // Case A: 云端无数据 → 直接上传
    if (!cloudData) {
      console.log("[SmartSyncStrategy] No cloud backup, uploading...");
      // 释放锁后重新调用 smartPush（它会获取自己的锁）
      await releaseSyncLock(lockHolder);
      return await smartPush(config, lockHolder);
    }

    // 3. 比对内容
    console.log("[SmartSyncStrategy] Comparing local and cloud...");
    const isIdentical = await compareWithCloud(localTree, cloudData);

    if (isIdentical) {
      console.log("[SmartSyncStrategy] Content identical, no sync needed");
      await setSyncState({
        time: Date.now(),
        url: config.url,
        type: "skip_identical",
      });
      return {
        success: true,
        action: "skipped",
        message: "书签已同步，无需操作",
        cloudInfo,
      };
    }

    // 4. 检查是否需要用户选择
    const lastSyncTime = await getLastSyncTime(config.url);
    const cloudTime = cloudData.metadata?.timestamp || 0;

    console.log(
      `[SmartSyncStrategy] Sync times - Last: ${new Date(lastSyncTime).toISOString()}, Cloud: ${new Date(cloudTime).toISOString()}`,
    );

    // 首次同步或环境变更，且云端有数据 → 需要用户选择
    if (
      lastSyncTime === 0 &&
      cloudInfo.totalCount &&
      cloudInfo.totalCount > 0
    ) {
      console.log("[SmartSyncStrategy] First sync detected, need user choice");
      return {
        success: false,
        action: "skipped",
        message: "需要选择同步方向",
        needsConflictResolution: true,
        cloudInfo,
      };
    }

    // 5. 智能判断
    await releaseSyncLock(lockHolder);

    if (cloudTime > lastSyncTime) {
      // 云端比本地新 → 拉取
      console.log("[SmartSyncStrategy] Cloud is newer, pulling...");
      const result = await smartPull(config, lockHolder, "overwrite");
      const elapsed = Date.now() - startTime;
      console.log(`[SmartSyncStrategy] Smart sync completed (pull) in ${elapsed}ms`);
      return { ...result, cloudInfo };
    } else {
      // 本地可能更新 → 上传
      console.log("[SmartSyncStrategy] Local might be newer, pushing...");
      const result = await smartPush(config, lockHolder);
      const elapsed = Date.now() - startTime;
      console.log(`[SmartSyncStrategy] Smart sync completed (push) in ${elapsed}ms`);
      return { ...result, cloudInfo };
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "同步失败";
    console.error(`[SmartSyncStrategy] Smart sync failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    // 确保锁被释放（如果还持有的话）
    await releaseSyncLock(lockHolder);
  }
}
