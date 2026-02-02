/**
 * 同步执行器
 * 执行上传和拉取同步操作
 */
import browser from "webextension-polyfill";
import { getCloudInfo, smartPull, smartPush, type SyncState } from "../core/sync";
import {
    LOCK_HOLDER_AUTO,
    RESET_RESTORING_ALARM,
    RESET_RESTORING_DELAY_MS,
    SYNC_STATE_KEY,
} from "./constants";
import { getIsRestoring, getWebDAVConfig, setIsRestoring } from "./state-manager";

/**
 * 执行上传同步 (Push)
 * 自动上传本地书签变化到云端
 * 如果检测到云端有未同步的更新，先增量拉取再上传
 */
export async function executeUpload(): Promise<void> {
  try {
    // 检查是否正在恢复（避免循环触发）
    if (await getIsRestoring()) {
      console.log("[SyncExecutor] Skipped upload: restoring in progress");
      return;
    }

    // 检查网络状态
    if (!navigator.onLine) {
      console.log("[SyncExecutor] Skipped upload: offline");
      return;
    }

    // 获取配置
    const { config, autoSyncEnabled } = await getWebDAVConfig();
    if (!config) {
      console.log("[SyncExecutor] Skipped upload: no config");
      return;
    }

    if (!autoSyncEnabled) {
      console.log("[SyncExecutor] Skipped upload: auto sync disabled");
      return;
    }

    // 检查云端是否有未同步的更新
    const storageResult = await browser.storage.local.get(SYNC_STATE_KEY);
    const syncState = storageResult[SYNC_STATE_KEY] as SyncState | undefined;
    const lastSyncTime = syncState?.url === config.url ? syncState.time : 0;

    const cloudInfo = await getCloudInfo(config);
    const cloudTime = cloudInfo.exists ? (cloudInfo.timestamp || 0) : 0;

    // 如果云端有更新，先增量拉取
    if (cloudTime > lastSyncTime) {
      console.log(
        `[SyncExecutor] Cloud has updates, pulling first (cloud: ${new Date(cloudTime).toISOString()}, local: ${new Date(lastSyncTime).toISOString()})`,
      );
      
      // 标记正在恢复，避免拉取过程中触发新的上传
      await setIsRestoring(true);
      
      try {
        // 使用 merge 模式：保留本地新增的书签
        const pullResult = await smartPull(config, LOCK_HOLDER_AUTO, "merge");
        
        if (!pullResult.success) {
          console.warn(`[SyncExecutor] Pull before upload failed: ${pullResult.message}`);
          await setIsRestoring(false);
          return;
        }
        
        console.log("[SyncExecutor] Pull completed, now uploading merged result...");
      } finally {
        // 使用 Alarm 延迟重置恢复标志
        await browser.alarms.create(RESET_RESTORING_ALARM, {
          when: Date.now() + RESET_RESTORING_DELAY_MS,
        });
      }
    }

    console.log("[SyncExecutor] Starting upload...");
    const result = await smartPush(config, LOCK_HOLDER_AUTO);

    if (result.success) {
      console.log(`[SyncExecutor] Upload ${result.action}: ${result.message}`);
    } else {
      console.warn(`[SyncExecutor] Upload failed: ${result.message}`);
    }
  } catch (error) {
    console.error("[SyncExecutor] Upload error:", error);
    await setIsRestoring(false);
  }
}

/**
 * 执行拉取同步 (Pull)
 * 检查云端更新并自动同步到本地
 */
export async function executeAutoPull(): Promise<void> {
  try {
    console.log("[SyncExecutor] Checking for cloud updates...");

    // 检查是否正在恢复
    if (await getIsRestoring()) {
      console.log("[SyncExecutor] Skipped pull: restoring in progress");
      return;
    }

    // 检查网络状态
    if (!navigator.onLine) {
      console.log("[SyncExecutor] Skipped pull: offline");
      return;
    }

    // 获取配置
    const { config } = await getWebDAVConfig();
    if (!config) {
      console.log("[SyncExecutor] Skipped pull: no config");
      return;
    }

    console.log(
      `[SyncExecutor] Using WebDAV config: url=${config.url}, username=${config.username}`,
    );

    // 获取本地同步记录
    const storageResult = await browser.storage.local.get(SYNC_STATE_KEY);
    const syncState = storageResult[SYNC_STATE_KEY] as SyncState | undefined;
    const lastSyncTime = syncState?.url === config.url ? syncState.time : 0;

    // 获取云端信息
    const cloudInfo = await getCloudInfo(config);

    if (!cloudInfo.exists) {
      console.log("[SyncExecutor] No cloud backup found");
      return;
    }

    const cloudTime = cloudInfo.timestamp || 0;

    // 比对时间戳
    if (cloudTime <= lastSyncTime) {
      console.log(
        `[SyncExecutor] No updates (cloud: ${new Date(cloudTime).toISOString()}, local: ${new Date(lastSyncTime).toISOString()})`,
      );
      return;
    }

    console.log(
      `[SyncExecutor] Cloud update detected (${cloudInfo.totalCount} bookmarks from ${cloudInfo.browser || "unknown"})`,
    );

    // 标记正在恢复，阻止书签变化事件触发上传
    await setIsRestoring(true);

    try {
      const pullResult = await smartPull(config, LOCK_HOLDER_AUTO, "overwrite");

      if (pullResult.success) {
        console.log(`[SyncExecutor] Pull ${pullResult.action}: ${pullResult.message}`);
      } else {
        console.warn(`[SyncExecutor] Pull failed: ${pullResult.message}`);
      }
    } finally {
      // 使用 Alarm 延迟重置恢复标志（避免 setTimeout 在 SW 休眠后丢失）
      // 延迟时间足够长，确保书签恢复操作完全完成
      await browser.alarms.create(RESET_RESTORING_ALARM, {
        when: Date.now() + RESET_RESTORING_DELAY_MS,
      });
    }
  } catch (error) {
    console.error("[SyncExecutor] Pull error:", error);
    // 发生错误时立即重置状态
    await setIsRestoring(false);
  }
}
