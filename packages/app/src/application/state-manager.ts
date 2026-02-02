/**
 * Application 层状态管理
 * 管理恢复状态，避免同步循环
 */
import browser from "webextension-polyfill";
import type { LastBackupFileInfo } from "../core/storage/types";
import { STORAGE_CONSTANTS } from "../core/storage/types";
import { RESTORING_KEY, RESTORING_TIMEOUT_MS } from "./constants";

/**
 * 检查是否正在执行恢复操作
 * 使用 storage.session 确保 Service Worker 重启后状态不丢失
 */
export async function getIsRestoring(): Promise<boolean> {
  try {
    // Firefox 不支持 storage.session，此时返回 false
    if (!browser.storage.session) {
      return false;
    }

    const result = await browser.storage.session.get(RESTORING_KEY);
    const state = result[RESTORING_KEY] as
      | { value: boolean; timestamp: number }
      | undefined;

    if (!state) return false;

    // 检查超时（防止异常情况下状态一直锁定）
    const now = Date.now();
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
    if (!browser.storage.session) {
      console.warn("[StateManager] storage.session not supported");
      return;
    }

    if (value) {
      await browser.storage.session.set({
        [RESTORING_KEY]: {
          value: true,
          timestamp: Date.now(),
        },
      });
      console.log("[StateManager] Restoring state activated");
    } else {
      await browser.storage.session.remove(RESTORING_KEY);
      console.log("[StateManager] Restoring state cleared");
    }
  } catch (error) {
    console.error("[StateManager] Failed to set restoring state:", error);
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
      password: ((result.webdav_password as string) || "").trim(),
    },
    autoSyncEnabled: result.auto_sync_enabled !== false,
    scheduledSyncEnabled: result.scheduled_sync_enabled === true,
    scheduledSyncInterval: (result.scheduled_sync_interval as number) || 30,
  };
}
