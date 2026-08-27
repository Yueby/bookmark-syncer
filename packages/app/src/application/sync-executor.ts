/**
 * 同步执行器
 * 执行上传和拉取同步操作
 */
import browser from "webextension-polyfill";
import { getCloudInfo, smartPull, smartPush, type SyncState } from "../core/sync";
import {
    LOCK_HOLDER_AUTO,
    POST_PULL_UPLOAD_SUPPRESSION_MS,
    SYNC_STATE_KEY,
} from "./constants";
import { getIsRestoring, getWebDAVConfig } from "./state-manager";

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

    if (
      syncState?.url === config.url &&
      (syncState.type === "download" || syncState.type === "restore") &&
      Date.now() - syncState.time < POST_PULL_UPLOAD_SUPPRESSION_MS
    ) {
      console.log(
        "[SyncExecutor] Skipped upload: recently pulled/restored, waiting for native bookmark sync to settle",
      );
      return;
    }

    // 强制刷新：与 smartPush 的实时云端检查保持一致，
    // 避免缓存窗口内自动上传被“云端有更新”阻断
    const cloudInfo = await getCloudInfo(config, true);
    const cloudTime = cloudInfo.exists ? (cloudInfo.timestamp || 0) : 0;

    // 如果云端有更新，先增量拉取
    if (cloudTime > lastSyncTime) {
      console.log(
        `[SyncExecutor] Cloud has updates, pulling first (cloud: ${new Date(cloudTime).toISOString()}, local: ${new Date(lastSyncTime).toISOString()})`,
      );
      // 使用 merge 模式：保留本地新增的书签
      const pullResult = await smartPull(config, LOCK_HOLDER_AUTO, "merge");

      if (!pullResult.success) {
        console.warn(`[SyncExecutor] Pull before upload failed: ${pullResult.message}`);
        return;
      }

      console.log("[SyncExecutor] Pull completed, now uploading merged result...");
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

    console.log("[SyncExecutor] Using WebDAV config");

    // 获取本地同步记录
    const storageResult = await browser.storage.local.get(SYNC_STATE_KEY);
    const syncState = storageResult[SYNC_STATE_KEY] as SyncState | undefined;
    const lastSyncTime = syncState?.url === config.url ? syncState.time : 0;

    // 获取云端信息（强制刷新，避免旧缓存漏检远端更新）
    const cloudInfo = await getCloudInfo(config, true);

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

    const pullResult = await smartPull(config, LOCK_HOLDER_AUTO, "overwrite");

    if (pullResult.success) {
      console.log(`[SyncExecutor] Pull ${pullResult.action}: ${pullResult.message}`);
    } else {
      console.warn(`[SyncExecutor] Pull failed: ${pullResult.message}`);
    }
  } catch (error) {
    console.error("[SyncExecutor] Pull error:", error);
  }
}
