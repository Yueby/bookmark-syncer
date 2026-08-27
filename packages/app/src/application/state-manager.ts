/**
 * Application 层状态管理
 * 管理恢复状态，避免同步循环
 */
import browser from "webextension-polyfill";
import type { LastBackupFileInfo } from "../core/storage/types";
import { STORAGE_CONSTANTS } from "../core/storage/types";
import { RESET_RESTORING_DELAY_MS, RESTORING_KEY, RESTORING_TIMEOUT_MS } from "./constants";

type RestoringState = {
  value: boolean;
  timestamp: number;
  until?: number;
};

function getRestoringStorageArea(): typeof browser.storage.local | typeof browser.storage.session {
  return browser.storage.session ?? browser.storage.local;
}

/**
 * 检查是否正在执行恢复操作
 * 使用 storage.session 确保 Service Worker 重启后状态不丢失
 */
export async function getIsRestoring(): Promise<boolean> {
  try {
    const storageArea = getRestoringStorageArea();
    const result = await storageArea.get(RESTORING_KEY);
    const state = result[RESTORING_KEY] as RestoringState | undefined;

    if (!state) return false;

    const now = Date.now();

    if (typeof state.until === "number") {
      if (now >= state.until) {
        await setIsRestoring(false);
        return false;
      }

      return state.value;
    }

    // 检查超时（防止异常情况下状态一直锁定）
    if (now - state.timestamp > RESTORING_TIMEOUT_MS) {
      console.warn(
        `[StateManager] Restoring state timeout (${now - state.timestamp}ms), auto clearing`,
      );
      await setIsRestoring(false);
      return false;
    }

    return state.value;
  } catch (error) {
    console.error("[StateManager] Failed to get restoring state:", error);
    return false;
  }
}

/**
 * 设置恢复状态
 */
export async function setIsRestoring(value: boolean): Promise<void> {
  try {
    const storageArea = getRestoringStorageArea();

    if (value) {
      await storageArea.set({
        [RESTORING_KEY]: {
          value: true,
          timestamp: Date.now(),
        },
      });
      console.log("[StateManager] Restoring state activated");
    } else {
      await storageArea.remove(RESTORING_KEY);
      console.log("[StateManager] Restoring state cleared");
    }
  } catch (error) {
    console.error("[StateManager] Failed to set restoring state:", error);
  }
}

/**
 * 在恢复结束后保留一个短暂阻塞窗口，避免收尾事件立即触发同步
 */
export async function holdRestoringUntil(delayMs = RESET_RESTORING_DELAY_MS): Promise<void> {
  try {
    const storageArea = getRestoringStorageArea();
    const now = Date.now();
    await storageArea.set({
      [RESTORING_KEY]: {
        value: true,
        timestamp: now,
        until: now + delayMs,
      } satisfies RestoringState,
    });
    console.log(`[StateManager] Restoring hold scheduled for ${delayMs}ms`);
  } catch (error) {
    console.error("[StateManager] Failed to hold restoring state:", error);
    await setIsRestoring(false);
  }
}

/**
 * 获取备份文件间隔配置（分钟）
 */
export async function getBackupFileInterval(): Promise<number> {
  const result = await browser.storage.local.get('backup_file_interval');
  return (result.backup_file_interval as number) || 1; // 默认1分钟
}

/**
 * 获取最后备份文件信息
 */
export async function getLastBackupFileInfo(): Promise<LastBackupFileInfo | null> {
  const result = await browser.storage.local.get(STORAGE_CONSTANTS.LAST_BACKUP_FILE_KEY);
  return (result[STORAGE_CONSTANTS.LAST_BACKUP_FILE_KEY] as LastBackupFileInfo | undefined) || null;
}

/**
 * 保存最后备份文件信息
 */
export async function saveLastBackupFileInfo(info: LastBackupFileInfo): Promise<void> {
  await browser.storage.local.set({
    [STORAGE_CONSTANTS.LAST_BACKUP_FILE_KEY]: info,
  });
}

/**
 * 清除最后备份文件信息（用于强制创建新文件）
 */
export async function clearLastBackupFileInfo(): Promise<void> {
  await browser.storage.local.remove(STORAGE_CONSTANTS.LAST_BACKUP_FILE_KEY);
}

/**
 * 获取 WebDAV 配置
 */
export async function getWebDAVConfig(): Promise<{
  config: { url: string; username: string; password: string } | null;
  autoSyncEnabled: boolean;
  scheduledSyncEnabled: boolean;
  scheduledSyncInterval: number;
}> {
  const result = await browser.storage.local.get([
    "webdav_url",
    "webdav_username",
    "webdav_password",
    "auto_sync_enabled",
    "scheduled_sync_enabled",
    "scheduled_sync_interval",
  ]);

  const url = result.webdav_url as string;
  if (!url) {
    return {
      config: null,
      autoSyncEnabled: result.auto_sync_enabled !== false,
      scheduledSyncEnabled: result.scheduled_sync_enabled === true,
      scheduledSyncInterval: (result.scheduled_sync_interval as number) || 30,
    };
  }

  return {
    config: {
      url: url.trim(),
      username: ((result.webdav_username as string) || "").trim(),
      // 密码保留原样：trim 会破坏含首尾空格的真实密码
      password: (result.webdav_password as string) || "",
    },
    autoSyncEnabled: result.auto_sync_enabled !== false,
    scheduledSyncEnabled: result.scheduled_sync_enabled === true,
    scheduledSyncInterval: (result.scheduled_sync_interval as number) || 30,
  };
}
