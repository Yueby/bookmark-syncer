/**
 * 推送策略
 * 智能上传：检查内容差异，只有真正有变化时才上传
 */
import { getBackupFileInterval, getLastBackupFileInfo, saveLastBackupFileInfo } from "../../../application/state-manager";
import { getBrowserInfo, isSameBrowser } from "../../../infrastructure/browser/info";
import { getWebDAVClient } from "../../../infrastructure/http/webdav-client";
import { compressText } from "../../../infrastructure/utils/compression";
import { CloudBackup } from "../../../types";
import { snapshotManager } from "../../backup";
import { bookmarkRepository, compareWithCloud, countBookmarks } from "../../bookmark";
import type { WebDAVConfig } from "../../storage";
import { fileManager, STORAGE_CONSTANTS } from "../../storage";
import { cacheManager } from "../../storage/cache-manager";
import { queueManager } from "../../storage/queue-manager";
import { acquireSyncLock, releaseSyncLock } from "../lock-manager";
import { getLastSyncTime, setSyncState } from "../state-manager";
import type { SyncResult } from "../types";

const DIR = STORAGE_CONSTANTS.BACKUP_DIR;

/**
 * 智能上传：检查内容差异，只有真正有变化时才上传
 */
export async function smartPush(
  config: WebDAVConfig,
  lockHolder: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  console.log(`[PushStrategy] Starting push by "${lockHolder}"`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[PushStrategy] Push aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[PushStrategy] Push aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getWebDAVClient(config);

    // 1. 获取本地书签
    console.log("[PushStrategy] Getting local bookmarks...");
    const localTree = await bookmarkRepository.getTree();
    const localCount = countBookmarks(localTree);
    console.log(`[PushStrategy] Local: ${localCount} bookmarks`);

    // 安全检查：书签为空时不同步
    if (localCount === 0) {
      console.error("[PushStrategy] Push aborted: local bookmarks empty");
      return { success: false, action: "error", message: "本地书签为空" };
    }

    // 1.5. 创建本地快照（上传前备份）
    console.log("[PushStrategy] Creating local snapshot before push...");
    try {
      await snapshotManager.createSnapshot(
        localTree,
        localCount,
        `上传前自动备份 (${lockHolder === "manual" ? "手动" : "自动"})`
      );
    } catch (error) {
      console.warn("[PushStrategy] Failed to create snapshot:", error);
      // 快照创建失败不影响同步
    }

    // 2. 获取云端最新备份并比对
    console.log("[PushStrategy] Checking cloud state...");
    try {
      const latestBackupPath = await fileManager.getLatestBackupFile(client);
      if (latestBackupPath) {
        const cloudJson = await queueManager.getFileWithDedup(client, latestBackupPath);
        if (cloudJson) {
          const cloudData = JSON.parse(cloudJson) as CloudBackup;
          const cloudCount = countBookmarks(cloudData.data);
          const cloudTime = cloudData.metadata?.timestamp || 0;

          console.log(
            `[PushStrategy] Cloud: ${cloudCount} bookmarks (${new Date(cloudTime).toISOString()})`,
          );

          // 检查云端是否有未拉取的更新
          const lastSyncTime = await getLastSyncTime(config.url);
          
          if (cloudTime > lastSyncTime) {
            // 云端有更新且本地未同步
            // 区分手动同步和自动同步：
            // - 自动同步：阻止上传，防止数据丢失
            // - 手动同步：允许用户选择（用户明确想覆盖）
            const isManualSync = lockHolder === "manual";
            
            if (!isManualSync) {
              // 自动同步场景：阻止上传
              console.warn(
                `[PushStrategy] Cloud is newer, blocking auto-sync (cloud: ${new Date(cloudTime).toISOString()}, last: ${new Date(lastSyncTime).toISOString()})`,
              );
              return {
                success: false,
                action: "error",
                message: "云端有更新，请先拉取",
              };
            } else {
              // 手动同步：记录警告但允许继续（用户可能想覆盖）
              console.warn(
                `[PushStrategy] Cloud is newer but manual sync, allowing user choice (cloud: ${new Date(cloudTime).toISOString()}, last: ${new Date(lastSyncTime).toISOString()})`,
              );
            }
          }

          // 比对内容
          console.log("[PushStrategy] Comparing content...");
          const isIdentical = await compareWithCloud(
            localTree,
            cloudData,
          );

          if (isIdentical) {
            // 检查是否为手动同步且浏览器一致
            const localBrowserInfo = getBrowserInfo();
            
            // 从文件名解析浏览器信息
            const fileName = latestBackupPath.split("/").pop() || "";
            const parsed = fileManager.parseBackupFileName(fileName);
            const cloudBrowser = parsed?.browser || "";
            
            const isBrowserMatch = isSameBrowser(localBrowserInfo.name, cloudBrowser);
            const isManualSync = lockHolder === "manual";

            // 手动同步 + 浏览器一致 → 即使内容相同也更新云端时间戳
            if (isManualSync && isBrowserMatch) {
              console.log("[PushStrategy] Content identical but manual sync from same browser, creating new backup");
              // 继续执行上传，创建新备份
            } else {
              console.log("[PushStrategy] Content identical, skipping upload");
              // 内容相同，只更新同步时间
              await setSyncState({
                time: Date.now(),
                url: config.url,
                type: "skip_identical",
              });
              return {
                success: true,
                action: "skipped",
                message: "书签已同步，无需更新",
              };
            }
          } else {
            console.log("[PushStrategy] Content differs, will upload");
          }
        }
      } else {
        console.log("[PushStrategy] No cloud backup found, first upload");
      }
    } catch (error) {
      console.warn("[PushStrategy] Failed to check cloud state:", error);
      // 云端文件不存在或无法获取，继续上传
    }

    // 3. 执行上传 - 判断是否需要创建新文件
    console.log("[PushStrategy] Uploading to cloud...");
    const backup = await bookmarkRepository.createCloudBackup();

    // 确保目录存在
    if (!(await client.exists(DIR))) {
      console.log(`[PushStrategy] Creating directory: ${DIR}`);
      await client.createDirectory(DIR);
    }

    // 获取配置的时间间隔（分钟）
    const backupIntervalMinutes = await getBackupFileInterval();
    const backupIntervalMs = backupIntervalMinutes * 60 * 1000;

    // 获取最后备份文件信息
    const lastBackupInfo = await getLastBackupFileInfo();
    const now = Date.now();

    let targetFilePath: string;
    let targetFileName: string;
    let revisionNumber = 1;
    let isNewFile = true;

    // 获取当前书签数量和浏览器信息
    const browserInfo = getBrowserInfo();
    const bookmarkCount = countBookmarks(backup.data);
    
    // 判断是否在时间窗口内
    if (lastBackupInfo && (now - lastBackupInfo.createdAt) < backupIntervalMs) {
      // 时间窗口内：删除旧文件，创建新文件（更新书签数量）
      console.log(`[PushStrategy] Within time window (${backupIntervalMinutes}min), replacing: ${lastBackupInfo.fileName}`);
      
      // 删除旧文件
      try {
        await client.deleteFile(lastBackupInfo.filePath);
        console.log(`[PushStrategy] Deleted old file: ${lastBackupInfo.fileName}`);
      } catch (error) {
        console.warn(`[PushStrategy] Failed to delete old file (will overwrite):`, error);
      }
      
      // 生成新文件名（书签数量会更新）
      targetFileName = fileManager.generateBackupFileName(
        browserInfo.name, 
        bookmarkCount,
        lastBackupInfo.revisionNumber + 1  // 保持修订号递增
      );
      targetFilePath = `${DIR}/${targetFileName}`;
      revisionNumber = lastBackupInfo.revisionNumber + 1;
      isNewFile = false;  // 逻辑上还是覆盖（不触发清理旧文件）
    } else {
      // 时间窗口外：创建新文件
      console.log("[PushStrategy] Time window expired, creating new backup file");
      targetFileName = fileManager.generateBackupFileName(
        browserInfo.name, 
        bookmarkCount,
        1 // 初始修订号
      );
      targetFilePath = `${DIR}/${targetFileName}`;
      revisionNumber = 1;
      isNewFile = true;
    }

    // 准备文件内容（强制压缩）
    const backupJson = JSON.stringify(backup);
    
    console.log("[PushStrategy] Compressing backup...");
    const startCompress = Date.now();
    const fileContent = await compressText(backupJson);
    const compressTime = Date.now() - startCompress;
    const compressionRatio = Math.round((fileContent.length / backupJson.length) * 100);
    console.log(`[PushStrategy] Compression: ${backupJson.length} → ${fileContent.length} bytes (${compressionRatio}%) in ${compressTime}ms`);
    
    // 添加 .gz 扩展名
    const finalFileName = targetFileName.endsWith('.gz') ? targetFileName : targetFileName + '.gz';
    if (!targetFilePath.endsWith('.gz')) {
      targetFilePath = targetFilePath + '.gz';
    }

    console.log(`[PushStrategy] ${isNewFile ? 'Creating new backup' : 'Overwriting existing backup'}: ${finalFileName} (revision ${revisionNumber})`);
    
    // 上传文件（覆盖或创建）
    await client.putFile(targetFilePath, fileContent);

    // 保存最后备份文件信息
    await saveLastBackupFileInfo({
      fileName: finalFileName,
      filePath: targetFilePath,
      createdAt: isNewFile ? now : (lastBackupInfo?.createdAt || now), // 保持原创建时间
      revisionNumber: revisionNumber,
    });

    console.log(`[PushStrategy] Backup saved: ${targetFilePath} (revision ${revisionNumber})`);
    
    // 清理超过3天的旧备份（只在创建新文件时执行）
    if (isNewFile) {
      await fileManager.cleanOldBackups(client, 3);
    }

    // 4. 清除备份列表缓存（因为刚上传了新文件）
    await cacheManager.clearBackupListCache();

    // 5. 更新同步时间
    await setSyncState({
      time: Date.now(),
      url: config.url,
      type: "upload",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[PushStrategy] Push completed in ${elapsed}ms`);
    return { success: true, action: "uploaded", message: "上传成功" };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "上传失败";
    console.error(`[PushStrategy] Push failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}
