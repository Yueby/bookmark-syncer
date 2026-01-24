/**
 * 统一同步服务
 * 提供自动同步、手动同步、定时同步共用的核心逻辑
 */
import browser from "webextension-polyfill";
import { getBrowserInfo, isSameBrowser } from "../lib/browser";
import { CloudBackup } from "../types";
import { BookmarkService } from "./bookmarkService";
import { createWebDAVClient, WebDAVClient } from "./webdav";

// ============================================
// 同步锁机制
// ============================================

const LOCK_KEY = "sync_lock";
const LOCK_TIMEOUT_MS = 60000; // 60 秒超时自动释放

interface SyncLock {
  holder: string;
  timestamp: number;
  lockId: string; // 用于验证锁的有效性，防止 race condition
}

/**
 * 尝试获取同步锁
 * 使用 lockId 机制防止并发获取时的竞态条件
 */
async function acquireSyncLock(holder: string): Promise<boolean> {
  try {
    const result = await browser.storage.local.get(LOCK_KEY);
    const existingLock = result[LOCK_KEY] as SyncLock | undefined;

    // 检查现有锁
    if (existingLock) {
      const now = Date.now();
      const lockAge = now - existingLock.timestamp;

      // 锁未超时，无法获取
      if (lockAge < LOCK_TIMEOUT_MS) {
        console.log(
          `[SyncService] Lock held by "${existingLock.holder}" (${Math.round(lockAge / 1000)}s ago)`,
        );
        return false;
      }

      // 锁已超时，可以强制获取
      console.warn(
        `[SyncService] Lock timeout detected (${Math.round(lockAge / 1000)}s), force acquiring`,
      );
    }

    // 生成唯一 lockId 用于验证
    const lockId = `${holder}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const newLock: SyncLock = {
      holder,
      timestamp: Date.now(),
      lockId,
    };

    // 写入锁
    await browser.storage.local.set({ [LOCK_KEY]: newLock });

    // 重新读取验证（防止并发写入导致的覆盖）
    await new Promise((resolve) => setTimeout(resolve, 50)); // 短暂延迟
    const verifyResult = await browser.storage.local.get(LOCK_KEY);
    const verifyLock = verifyResult[LOCK_KEY] as SyncLock | undefined;

    if (verifyLock?.lockId === lockId) {
      console.log(`[SyncService] Lock acquired by "${holder}"`);
      return true;
    }

    // 验证失败，其他进程抢先获取了锁
    console.warn(`[SyncService] Lock verification failed for "${holder}"`);
    return false;
  } catch (error) {
    console.error("[SyncService] Failed to acquire lock:", error);
    return false;
  }
}

/**
 * 释放同步锁
 * 只有锁的持有者才能释放
 */
async function releaseSyncLock(holder: string): Promise<void> {
  try {
    const result = await browser.storage.local.get(LOCK_KEY);
    const existingLock = result[LOCK_KEY] as SyncLock | undefined;

    if (!existingLock) {
      console.log(`[SyncService] No lock to release for "${holder}"`);
      return;
    }

    if (existingLock.holder === holder) {
      await browser.storage.local.remove(LOCK_KEY);
      console.log(`[SyncService] Lock released by "${holder}"`);
    } else {
      console.warn(
        `[SyncService] Lock held by "${existingLock.holder}", cannot release by "${holder}"`,
      );
    }
  } catch (error) {
    console.error("[SyncService] Failed to release lock:", error);
  }
}

// ============ 配置和类型 ============

export interface SyncConfig {
  url: string;
  username: string;
  password: string;
}

export interface SyncResult {
  success: boolean;
  action: "uploaded" | "downloaded" | "skipped" | "error";
  message: string;
}

const DIR = "BookmarkSyncer";
const FILE = `${DIR}/bookmarks.json`;

/**
 * 获取 WebDAV 客户端
 */
function getClient(config: SyncConfig): WebDAVClient {
  return createWebDAVClient({
    url: config.url,
    username: config.username,
    password: config.password,
  });
}

/**
 * 智能上传：检查内容差异，只有真正有变化时才上传
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 */
export async function smartPush(
  config: SyncConfig,
  lockHolder: string,
): Promise<SyncResult> {
  const startTime = Date.now();
  console.log(`[SyncService] Starting push by "${lockHolder}"`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[SyncService] Push aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[SyncService] Push aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 获取本地书签
    console.log("[SyncService] Getting local bookmarks...");
    const localTree = await BookmarkService.getTree();
    const localCount = BookmarkService.countBookmarks(localTree);
    console.log(`[SyncService] Local: ${localCount} bookmarks`);

    // 安全检查：书签为空时不同步
    if (localCount === 0) {
      console.error("[SyncService] Push aborted: local bookmarks empty");
      return { success: false, action: "error", message: "本地书签为空" };
    }

    // 2. 获取云端数据并比对
    console.log("[SyncService] Checking cloud state...");
    try {
      const cloudJson = await client.getFile(FILE);
      if (cloudJson) {
        const cloudData = JSON.parse(cloudJson) as CloudBackup;
        const cloudCount = cloudData.metadata?.totalCount || 0;
        const cloudTime = cloudData.metadata?.timestamp || 0;

        console.log(
          `[SyncService] Cloud: ${cloudCount} bookmarks (${new Date(cloudTime).toISOString()})`,
        );

        // 检查云端是否有未拉取的新版本
        const result = await browser.storage.local.get([
          "lastSyncTime",
          "lastSyncUrl",
        ]);
        const lastSyncTime =
          result.lastSyncUrl === config.url
            ? (result.lastSyncTime as number) || 0
            : 0;

        if (cloudTime > lastSyncTime) {
          console.warn(
            `[SyncService] Cloud is newer (cloud: ${new Date(cloudTime).toISOString()}, last: ${new Date(lastSyncTime).toISOString()})`,
          );
          return {
            success: false,
            action: "error",
            message: "云端有更新，请先拉取",
          };
        }

        // 比对内容
        console.log("[SyncService] Comparing content...");
        const isIdentical = await BookmarkService.compareWithCloud(
          localTree,
          cloudData,
        );

        if (isIdentical) {
          // 检查是否为手动同步且浏览器一致
          const localBrowserInfo = getBrowserInfo();
          const cloudBrowser = cloudData.metadata?.browser || "";
          const isBrowserMatch = isSameBrowser(localBrowserInfo.name, cloudBrowser);
          const isManualSync = lockHolder === "manual";

          // 手动同步 + 浏览器一致 → 即使内容相同也更新云端时间戳
          if (isManualSync && isBrowserMatch) {
            console.log("[SyncService] Content identical but manual sync from same browser, updating timestamp");
            // 继续执行上传，更新云端时间戳
          } else {
            console.log("[SyncService] Content identical, skipping upload");
            // 内容相同，只更新同步时间
            await browser.storage.local.set({
              lastSyncTime: Date.now(),
              lastSyncUrl: config.url,
              lastSyncType: "skip_identical",
            });
            return {
              success: true,
              action: "skipped",
              message: "书签已同步，无需更新",
            };
          }
        } else {
          console.log("[SyncService] Content differs, will upload");
        }
      } else {
        console.log("[SyncService] No cloud backup found, first upload");
      }
    } catch (error) {
      console.warn("[SyncService] Failed to check cloud state:", error);
      // 云端文件不存在或无法获取，继续上传
    }

    // 3. 执行上传
    console.log("[SyncService] Uploading to cloud...");
    const backup = await BookmarkService.createCloudBackup();

    // 确保目录存在
    if (!(await client.exists(DIR))) {
      console.log(`[SyncService] Creating directory: ${DIR}`);
      await client.createDirectory(DIR);
    }

    await client.putFile(FILE, JSON.stringify(backup));

    // 4. 更新同步时间
    await browser.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncUrl: config.url,
      lastSyncType: "upload",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[SyncService] Push completed in ${elapsed}ms`);
    return { success: true, action: "uploaded", message: "上传成功" };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "上传失败";
    console.error(`[SyncService] Push failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}

/**
 * 智能下载：拉取云端数据并恢复到本地
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 * @param mode 恢复模式：overwrite（覆盖）或 merge（合并）
 */
export async function smartPull(
  config: SyncConfig,
  lockHolder: string,
  mode: "overwrite" | "merge" = "overwrite",
): Promise<SyncResult> {
  const startTime = Date.now();
  console.log(`[SyncService] Starting pull by "${lockHolder}" (mode: ${mode})`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[SyncService] Pull aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[SyncService] Pull aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 下载云端数据
    console.log("[SyncService] Downloading from cloud...");
    const json = await client.getFile(FILE);
    if (!json) {
      console.error("[SyncService] Pull aborted: no cloud data");
      return { success: false, action: "error", message: "云端无数据" };
    }

    const cloudData = JSON.parse(json) as CloudBackup;
    const cloudCount = cloudData.metadata?.totalCount || 0;
    const cloudTime = cloudData.metadata?.timestamp || 0;
    const cloudBrowser = cloudData.metadata?.browser || "unknown";

    console.log(
      `[SyncService] Cloud: ${cloudCount} bookmarks from ${cloudBrowser} (${new Date(cloudTime).toISOString()})`,
    );

    // 2. 恢复书签
    console.log(`[SyncService] Restoring bookmarks (${mode} mode)...`);
    if (mode === "overwrite") {
      await BookmarkService.restoreFromBackup(cloudData);
    } else {
      await BookmarkService.mergeFromBackup(cloudData);
    }

    // 3. 更新同步时间
    await browser.storage.local.set({
      lastSyncTime: Date.now(),
      lastSyncUrl: config.url,
      lastSyncType: "download",
    });

    const elapsed = Date.now() - startTime;
    console.log(`[SyncService] Pull completed in ${elapsed}ms`);
    return { success: true, action: "downloaded", message: "同步完成" };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "恢复失败";
    console.error(`[SyncService] Pull failed after ${elapsed}ms:`, error);
    return {
      success: false,
      action: "error",
      message: errorMessage,
    };
  } finally {
    await releaseSyncLock(lockHolder);
  }
}

/**
 * 云端信息
 */
export interface CloudInfo {
  exists: boolean;
  timestamp?: number;
  totalCount?: number;
  browser?: string;
  browserVersion?: string;
}

/**
 * 获取云端备份信息（不需要锁）
 */
export async function getCloudInfo(config: SyncConfig): Promise<CloudInfo> {
  if (!navigator.onLine) {
    console.log("[SyncService] getCloudInfo: offline");
    return { exists: false };
  }

  try {
    const client = getClient(config);
    const json = await client.getFile(FILE);
    if (!json) {
      console.log("[SyncService] No cloud backup exists");
      return { exists: false };
    }

    const data = JSON.parse(json) as CloudBackup;
    const info: CloudInfo = {
      exists: true,
      timestamp: data.metadata?.timestamp,
      totalCount: data.metadata?.totalCount,
      browser: data.metadata?.browser,
      browserVersion: data.metadata?.browserVersion,
    };

    console.log(
      `[SyncService] Cloud info: ${info.totalCount} bookmarks from ${info.browser || "unknown"}`,
    );
    return info;
  } catch (error) {
    console.error("[SyncService] Failed to get cloud info:", error);
    return { exists: false };
  }
}

/**
 * 智能同步结果
 */
export interface SmartSyncResult extends SyncResult {
  needsConflictResolution?: boolean;
  cloudInfo?: CloudInfo;
}

/**
 * 智能同步：自动判断推送或拉取
 * @param config WebDAV 配置
 * @param lockHolder 锁持有者标识
 */
export async function smartSync(
  config: SyncConfig,
  lockHolder: string,
): Promise<SmartSyncResult> {
  const startTime = Date.now();
  console.log(`[SyncService] Starting smart sync by "${lockHolder}"`);

  // 检查网络
  if (!navigator.onLine) {
    console.warn("[SyncService] Smart sync aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }

  // 获取锁
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn("[SyncService] Smart sync aborted: lock not acquired");
    return { success: false, action: "error", message: "同步正在进行中" };
  }

  try {
    const client = getClient(config);

    // 1. 获取本地书签
    console.log("[SyncService] Getting local bookmarks...");
    const localTree = await BookmarkService.getTree();
    const localCount = BookmarkService.countBookmarks(localTree);
    console.log(`[SyncService] Local: ${localCount} bookmarks`);

    // 2. 获取云端数据
    console.log("[SyncService] Getting cloud data...");
    let cloudData: CloudBackup | null = null;
    let cloudInfo: CloudInfo = { exists: false };

    try {
      const json = await client.getFile(FILE);
      if (json) {
        cloudData = JSON.parse(json) as CloudBackup;
        cloudInfo = {
          exists: true,
          timestamp: cloudData.metadata?.timestamp,
          totalCount: cloudData.metadata?.totalCount,
          browser: cloudData.metadata?.browser,
          browserVersion: cloudData.metadata?.browserVersion,
        };
        console.log(
          `[SyncService] Cloud: ${cloudInfo.totalCount} bookmarks from ${cloudInfo.browser || "unknown"}`,
        );
      }
    } catch (error) {
      console.warn("[SyncService] No cloud data found:", error);
    }

    // Case A: 云端无数据 → 直接上传
    if (!cloudData) {
      console.log("[SyncService] No cloud backup, uploading...");
      // 释放锁后重新调用 smartPush（它会获取自己的锁）
      await releaseSyncLock(lockHolder);
      return await smartPush(config, lockHolder);
    }

    // 3. 比对内容
    console.log("[SyncService] Comparing local and cloud...");
    const isIdentical = await BookmarkService.compareWithCloud(localTree, cloudData);

    if (isIdentical) {
      console.log("[SyncService] Content identical, no sync needed");
      await browser.storage.local.set({
        lastSyncTime: Date.now(),
        lastSyncUrl: config.url,
        lastSyncType: "skip_identical",
      });
      return {
        success: true,
        action: "skipped",
        message: "书签已同步，无需操作",
        cloudInfo,
      };
    }

    // 4. 检查是否需要用户选择
    const storage = await browser.storage.local.get([
      "lastSyncTime",
      "lastSyncUrl",
    ]);
    const lastSyncUrl = storage.lastSyncUrl as string | undefined;
    const lastSyncTime =
      lastSyncUrl === config.url ? (storage.lastSyncTime as number) || 0 : 0;
    const cloudTime = cloudData.metadata?.timestamp || 0;

    console.log(
      `[SyncService] Sync times - Last: ${new Date(lastSyncTime).toISOString()}, Cloud: ${new Date(cloudTime).toISOString()}`,
    );

    // 首次同步或环境变更，且云端有数据 → 需要用户选择
    if (
      lastSyncTime === 0 &&
      cloudInfo.totalCount &&
      cloudInfo.totalCount > 0
    ) {
      console.warn("[SyncService] First sync detected, need user choice");
      return {
        success: false,
        action: "error",
        message: "需要选择同步方向",
        needsConflictResolution: true,
        cloudInfo,
      };
    }

    // 5. 智能判断
    await releaseSyncLock(lockHolder);

    if (cloudTime > lastSyncTime) {
      // 云端比本地新 → 拉取
      console.log("[SyncService] Cloud is newer, pulling...");
      const result = await smartPull(config, lockHolder, "overwrite");
      const elapsed = Date.now() - startTime;
      console.log(`[SyncService] Smart sync completed (pull) in ${elapsed}ms`);
      return { ...result, cloudInfo };
    } else {
      // 本地可能更新 → 上传
      console.log("[SyncService] Local might be newer, pushing...");
      const result = await smartPush(config, lockHolder);
      const elapsed = Date.now() - startTime;
      console.log(`[SyncService] Smart sync completed (push) in ${elapsed}ms`);
      return { ...result, cloudInfo };
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = (error as Error).message || "同步失败";
    console.error(`[SyncService] Smart sync failed after ${elapsed}ms:`, error);
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

/**
 * 检查是否需要用户选择同步方向（用于 UI 预检）
 */
export async function checkNeedsConflictResolution(
  config: SyncConfig,
): Promise<{ needsResolution: boolean; cloudInfo: CloudInfo }> {
  const cloudInfo = await getCloudInfo(config);
  if (!cloudInfo.exists) {
    return { needsResolution: false, cloudInfo };
  }

  const storage = await browser.storage.local.get([
    "lastSyncTime",
    "lastSyncUrl",
  ]);
  const lastSyncUrl = storage.lastSyncUrl as string | undefined;
  const lastSyncTime =
    lastSyncUrl === config.url ? (storage.lastSyncTime as number) || 0 : 0;

  // 首次同步且云端有数据
  if (lastSyncTime === 0 && cloudInfo.totalCount && cloudInfo.totalCount > 0) {
    return { needsResolution: true, cloudInfo };
  }

  return { needsResolution: false, cloudInfo };
}
