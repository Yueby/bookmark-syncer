/**
 * 云端操作
 * 获取云端信息、备份列表、恢复指定备份
 */
import { getWebDAVClient } from "../../infrastructure/http/webdav-client";
import { CloudBackup } from "../../types";
import { snapshotManager } from "../backup";
import { bookmarkRepository, countBookmarks } from "../bookmark";
import { fileManager, STORAGE_CONSTANTS } from "../storage";
import { cacheManager } from "../storage/cache-manager";
import { queueManager } from "../storage/queue-manager";
import type { CloudBackupFile, CloudInfo, WebDAVConfig } from "../storage/types";
import { acquireSyncLock, releaseSyncLock } from "./lock-manager";
import { setSyncState } from "./state-manager";
import type { SyncResult } from "./types";

const DIR = STORAGE_CONSTANTS.BACKUP_DIR;

/**
 * 获取云端备份信息
 * 使用 getCloudBackupList 来获取列表，支持强制刷新
 * @param config WebDAV 配置
 * @param forceRefresh 是否强制刷新（跳过缓存），默认 false
 */
export async function getCloudInfo(config: WebDAVConfig, forceRefresh = false): Promise<CloudInfo> {
  if (!navigator.onLine) {
    console.log("[CloudOperations] getCloudInfo: offline");
    return { exists: false };
  }

  // 使用 getCloudBackupList 获取列表
  // 这里不吞错误：否则 UI 会把“认证失败/解析失败”等情况误显示成“云端 0”。
  const backupList = await getCloudBackupList(config, forceRefresh);

  if (backupList.length === 0) {
    console.log("[CloudOperations] No cloud backup exists");
    return { exists: false };
  }

  // 获取最新的备份（列表已按时间排序）
  const latest = backupList[0];

  const info: CloudInfo = {
    exists: true,
    timestamp: latest.timestamp,
    totalCount: latest.totalCount,
    browser: latest.browser,
    browserVersion: undefined,
  };

  console.log(
    `[CloudOperations] Cloud info: ${info.totalCount} bookmarks from ${info.browser || "unknown"}`,
  );

  return info;
}

/**
 * 获取所有云端备份文件列表
 * 优先使用缓存（5分钟），避免频繁 PROPFIND
 */
export async function getCloudBackupList(config: WebDAVConfig, forceRefresh = false): Promise<CloudBackupFile[]> {
  if (!navigator.onLine) {
    console.log("[CloudOperations] getCloudBackupList: offline");
    return [];
  }

  // 尝试从缓存读取（除非强制刷新）
  if (!forceRefresh) {
    const cached = await cacheManager.getCachedBackupList();
    if (cached) {
      return cached.backups;
    }
  }

  // 缓存未命中或已过期，执行 PROPFIND
  console.log("[CloudOperations] Fetching backup list from cloud...");
  const client = getWebDAVClient(config);
  const files = await client.listFiles(DIR);

  // 过滤出备份文件（只支持 .json.gz 格式）
  const backupFiles = files.filter(
    (file) => file.name.startsWith("bookmarks_") && file.name.endsWith(".json.gz")
  );

  // 按最后修改时间排序（最新的在前）
  backupFiles.sort((a, b) => b.lastModified - a.lastModified);

  // 从文件名解析元数据（不下载文件内容）
  const backupList: CloudBackupFile[] = backupFiles.map((file) => {
    const parsed = fileManager.parseBackupFileName(file.name);

    return {
      name: file.name,
      path: file.path,
      timestamp: parsed?.timestamp || file.lastModified,
      totalCount: parsed?.count,
      browser: parsed?.browser,
      browserVersion: undefined, // 不再提供
    };
  });

  console.log(`[CloudOperations] Found ${backupList.length} cloud backups`);

  // 缓存结果（注意：认证失败等错误会在 listFiles 抛出，因此不会缓存“假空列表”）
  await cacheManager.cacheBackupList({
    backups: backupList,
    cachedAt: Date.now(),
  });

  return backupList;
}

/**
 * 从指定的云端备份文件恢复
 */
export async function restoreFromCloudBackup(
  config: WebDAVConfig,
  backupPath: string,
  lockHolder: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  console.log(`[CloudOperations] Restoring from backup: ${backupPath}`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[CloudOperations] Restore aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[CloudOperations] Restore aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getWebDAVClient(config);

    // 路径问题已修复，理论上不再需要智能等待
    // 保留简化版本作为保险（如果还有 409，说明有其他问题）
    console.log(`[CloudOperations] Starting restore operation...`);

    // 0. 创建本地快照（恢复前备份）
    console.log("[CloudOperations] Creating local snapshot before restore...");
    try {
      const currentTree = await bookmarkRepository.getTree();
      const currentCount = countBookmarks(currentTree);
      await snapshotManager.createSnapshot(
        currentTree,
        currentCount,
        `云端恢复前自动备份 (${lockHolder === "manual" ? "手动" : "自动"})`
      );
    } catch (error) {
      console.warn("[CloudOperations] Failed to create snapshot:", error);
      // 快照创建失败不影响恢复
    }

    // 直接下载备份文件（带去重保护）
    console.log("[CloudOperations] Downloading backup...");
    const json = await queueManager.getFileWithDedup(client, backupPath);
    if (!json) {
      console.error("[CloudOperations] Restore aborted: failed to read backup file");
      return { success: false, action: "error", message: "无法读取备份文件" };
    }
    
    const fileName = backupPath.split("/").pop() || "";

    let cloudData: CloudBackup;
    try {
      cloudData = JSON.parse(json) as CloudBackup;
    } catch {
      console.error("[CloudOperations] Backup data is corrupted, cannot parse");
      return { success: false, action: "error", message: "备份数据格式损坏" };
    }
    const cloudCount = countBookmarks(cloudData.data);
    const cloudTime = cloudData.metadata?.timestamp || 0;
    
    // 从文件名解析浏览器信息
    const parsed = fileManager.parseBackupFileName(fileName);
    const cloudBrowser = parsed?.browser || "unknown";

    console.log(
      `[CloudOperations] Restoring ${cloudCount} bookmarks from ${cloudBrowser} (${new Date(cloudTime).toISOString()})`,
    );

    // 2. 恢复书签
    console.log("[CloudOperations] Restoring bookmarks...");
    await bookmarkRepository.restoreFromBackup(cloudData);

    // 3. 更新同步时间
    await setSyncState({
      time: Date.now(),
      url: config.url,
      type: "restore",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[CloudOperations] Restore completed in ${elapsed}ms`);
    return { success: true, action: "downloaded", message: "恢复成功" };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "恢复失败";
    console.error(`[CloudOperations] Restore failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}
