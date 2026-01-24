/**
 * 自动同步服务
 * 监听书签变化，自动上传到云端
 * 定时检查云端更新，自动合并到本地
 *
 * 注意：MV3 Service Worker 是事件驱动的
 * - 书签事件会自动唤醒 SW
 * - Alarm 事件会自动唤醒 SW
 * - 状态使用 storage.session 持久化，避免 SW 休眠后丢失
 */
import browser from "webextension-polyfill";
import { getCloudInfo, smartPull, smartPush, SyncConfig } from "../services/syncService";

// ============================================
// 常量定义
// ============================================
const LOCK_HOLDER_AUTO = "auto_sync"; // 自动同步的锁持有者标识
const ALARM_NAME = "scheduledSync"; // 定时同步闹钟名称
const DEBOUNCE_ALARM = "autoSyncDebounce"; // 防抖闹钟名称
const RESET_RESTORING_ALARM = "resetRestoring"; // 重置恢复状态闹钟名称
const RESTORING_KEY = "isRestoring"; // storage.session 中的恢复状态键
const RESTORING_TIMEOUT_MS = 10000; // 恢复状态超时时间（10秒）
const DEBOUNCE_DELAY_MS = 1000; // 防抖延迟时间（1秒）
const RESET_RESTORING_DELAY_MS = 3000; // 重置恢复状态延迟（3秒）

// ============================================
// 状态管理（使用 storage.session 持久化）
// ============================================

/**
 * 检查是否正在执行恢复操作
 * 使用 storage.session 确保 Service Worker 重启后状态不丢失
 */
async function getIsRestoring(): Promise<boolean> {
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
        `[AutoSync] Restoring state timeout (${now - state.timestamp}ms), auto clearing`,
      );
      await setIsRestoring(false);
      return false;
    }

    return state.value;
  } catch (error) {
    console.error("[AutoSync] Failed to get restoring state:", error);
    return false;
  }
}

/**
 * 设置恢复状态
 */
async function setIsRestoring(value: boolean): Promise<void> {
  try {
    if (!browser.storage.session) {
      console.warn("[AutoSync] storage.session not supported");
      return;
    }

    if (value) {
      await browser.storage.session.set({
        [RESTORING_KEY]: {
          value: true,
          timestamp: Date.now(),
        },
      });
      console.log("[AutoSync] Restoring state activated");
    } else {
      await browser.storage.session.remove(RESTORING_KEY);
      console.log("[AutoSync] Restoring state cleared");
    }
  } catch (error) {
    console.error("[AutoSync] Failed to set restoring state:", error);
  }
}

/**
 * 获取 WebDAV 配置
 */
async function getWebDAVConfig(): Promise<{
  config: SyncConfig | null;
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
      url,
      username: result.webdav_username as string,
      password: result.webdav_password as string,
    },
    autoSyncEnabled: result.auto_sync_enabled !== false,
    scheduledSyncEnabled: result.scheduled_sync_enabled === true,
    scheduledSyncInterval: (result.scheduled_sync_interval as number) || 30,
  };
}

// ============================================
// 同步执行函数
// ============================================

/**
 * 执行上传同步 (Push)
 * 自动上传本地书签变化到云端
 */
async function executeUpload(): Promise<void> {
  try {
    // 检查是否正在恢复（避免循环触发）
    if (await getIsRestoring()) {
      console.log("[AutoSync] Skipped upload: restoring in progress");
      return;
    }

    // 检查网络状态
    if (!navigator.onLine) {
      console.log("[AutoSync] Skipped upload: offline");
      return;
    }

    // 获取配置
    const { config, autoSyncEnabled } = await getWebDAVConfig();
    if (!config) {
      console.log("[AutoSync] Skipped upload: no config");
      return;
    }

    if (!autoSyncEnabled) {
      console.log("[AutoSync] Skipped upload: auto sync disabled");
      return;
    }

    console.log("[AutoSync] Starting upload...");
    const result = await smartPush(config, LOCK_HOLDER_AUTO);

    if (result.success) {
      console.log(`[AutoSync] Upload ${result.action}: ${result.message}`);
    } else {
      console.warn(`[AutoSync] Upload failed: ${result.message}`);
    }
  } catch (error) {
    console.error("[AutoSync] Upload error:", error);
  }
}

/**
 * 执行拉取同步 (Pull)
 * 检查云端更新并自动同步到本地
 */
async function executeAutoPull(): Promise<void> {
  try {
    console.log("[AutoSync] Checking for cloud updates...");

    // 检查是否正在恢复
    if (await getIsRestoring()) {
      console.log("[AutoSync] Skipped pull: restoring in progress");
      return;
    }

    // 检查网络状态
    if (!navigator.onLine) {
      console.log("[AutoSync] Skipped pull: offline");
      return;
    }

    // 获取配置
    const { config } = await getWebDAVConfig();
    if (!config) {
      console.log("[AutoSync] Skipped pull: no config");
      return;
    }

    // 获取本地同步记录
    const storageResult = await browser.storage.local.get([
      "lastSyncTime",
      "lastSyncUrl",
    ]);

    const lastSyncTime =
      storageResult.lastSyncUrl === config.url
        ? (storageResult.lastSyncTime as number) || 0
        : 0;

    // 获取云端信息
    const cloudInfo = await getCloudInfo(config);

    if (!cloudInfo.exists) {
      console.log("[AutoSync] No cloud backup found");
      return;
    }

    const cloudTime = cloudInfo.timestamp || 0;

    // 比对时间戳
    if (cloudTime <= lastSyncTime) {
      console.log(
        `[AutoSync] No updates (cloud: ${new Date(cloudTime).toISOString()}, local: ${new Date(lastSyncTime).toISOString()})`,
      );
      return;
    }

    console.log(
      `[AutoSync] Cloud update detected (${cloudInfo.totalCount} bookmarks from ${cloudInfo.browser || "unknown"})`,
    );

    // 标记正在恢复，阻止书签变化事件触发上传
    await setIsRestoring(true);

    try {
      const pullResult = await smartPull(config, LOCK_HOLDER_AUTO, "overwrite");

      if (pullResult.success) {
        console.log(`[AutoSync] Pull ${pullResult.action}: ${pullResult.message}`);
      } else {
        console.warn(`[AutoSync] Pull failed: ${pullResult.message}`);
      }
    } finally {
      // 使用 Alarm 延迟重置恢复标志（避免 setTimeout 在 SW 休眠后丢失）
      // 延迟时间足够长，确保书签恢复操作完全完成
      await browser.alarms.create(RESET_RESTORING_ALARM, {
        when: Date.now() + RESET_RESTORING_DELAY_MS,
      });
    }
  } catch (error) {
    console.error("[AutoSync] Pull error:", error);
    // 发生错误时立即重置状态
    await setIsRestoring(false);
  }
}

// ============================================
// 防抖同步机制
// ============================================

/**
 * 触发防抖同步
 * 使用 Alarm API 以防止 Service Worker 休眠导致 Timer 丢失
 * 当书签发生变化时调用，会延迟执行上传避免频繁同步
 */
async function triggerDebouncedSync(): Promise<void> {
  try {
    // 如果正在恢复，不触发上传
    if (await getIsRestoring()) {
      console.log("[AutoSync] Skipped debounce: restoring in progress");
      return;
    }

    // 清除旧的防抖闹钟（如果存在）
    const cleared = await browser.alarms.clear(DEBOUNCE_ALARM);
    if (cleared) {
      console.log("[AutoSync] Debounce alarm reset");
    }

    // 创建新的防抖闹钟
    // 注意：Chrome 扩展的 Alarm API 对于一次性闹钟（when）支持任意时间
    await browser.alarms.create(DEBOUNCE_ALARM, {
      when: Date.now() + DEBOUNCE_DELAY_MS,
    });

    console.log(`[AutoSync] Upload scheduled in ${DEBOUNCE_DELAY_MS}ms`);
  } catch (error) {
    console.error("[AutoSync] Failed to trigger debounced sync:", error);
  }
}

/**
 * 处理防抖闹钟触发
 */
async function handleDebounceAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== DEBOUNCE_ALARM) return;

  console.log("[AutoSync] Debounce alarm triggered");

  // 再次检查自动同步开关
  const { autoSyncEnabled } = await getWebDAVConfig();

  if (!autoSyncEnabled) {
    console.log("[AutoSync] Auto sync disabled, skipping upload");
    return;
  }

  await executeUpload();
}

// ============================================
// 书签变化监听（顶级作用域注册）
// ============================================

/**
 * 书签事件处理器
 * 当书签发生任何变化时触发防抖上传
 */
const onBookmarkEvent = (): void => {
  triggerDebouncedSync();
};

// 注册所有书签变化事件
// 必须在顶级作用域注册，确保 Service Worker 能被事件唤醒
browser.bookmarks.onCreated.addListener(onBookmarkEvent);
browser.bookmarks.onRemoved.addListener(onBookmarkEvent);
browser.bookmarks.onChanged.addListener(onBookmarkEvent);
browser.bookmarks.onMoved.addListener(onBookmarkEvent);

console.log("[AutoSync] Bookmark listeners registered");

// ============================================
// 导出的控制函数
// ============================================

/**
 * 启动自动同步服务
 * 在扩展安装/启动时调用
 */
export function startAutoSync(): void {
  console.log("[AutoSync] Auto sync service started");
  // 检查云端更新
  checkCloudOnStartup();
}

/**
 * 停止自动同步服务
 * 注意：MV3 Service Worker 无法真正移除顶级监听器
 * 实际控制通过配置中的开关实现
 */
export function stopAutoSync(): void {
  console.log("[AutoSync] Auto sync service stopped (listeners remain active)");
  // 在 MV3 中，监听器会一直存在，通过配置开关控制是否执行
}

/**
 * 扩展启动时检查云端更新
 * 如果云端有新版本，自动同步到本地
 */
export async function checkCloudOnStartup(): Promise<void> {
  console.log("[AutoSync] Checking cloud on startup...");
  await executeAutoPull();
}

// ============================================
// 定时同步管理
// ============================================

/**
 * 启动定时同步
 * 根据配置创建周期性的云端检查任务
 */
export async function startScheduledSync(): Promise<void> {
  try {
    const { scheduledSyncEnabled, scheduledSyncInterval } =
      await getWebDAVConfig();

    if (!scheduledSyncEnabled) {
      const cleared = await browser.alarms.clear(ALARM_NAME);
      if (cleared) {
        console.log("[AutoSync] Scheduled sync disabled and alarm cleared");
      }
      return;
    }

    // 检查是否已存在同名 Alarm
    const existingAlarm = await browser.alarms.get(ALARM_NAME);

    if (existingAlarm) {
      // 如果已存在且周期一致，则不重置（防止无限推迟首次触发）
      if (existingAlarm.periodInMinutes === scheduledSyncInterval) {
        console.log(
          `[AutoSync] Scheduled sync already running (${scheduledSyncInterval}min)`,
        );
        return;
      }
      // 如果周期变了，清除旧的并创建新的
      await browser.alarms.clear(ALARM_NAME);
      console.log("[AutoSync] Scheduled sync interval changed, recreating alarm");
    }

    // 创建周期性定时器
    await browser.alarms.create(ALARM_NAME, {
      periodInMinutes: scheduledSyncInterval,
      when: Date.now() + scheduledSyncInterval * 60 * 1000, // 首次触发时间
    });

    console.log(
      `[AutoSync] Scheduled sync started (every ${scheduledSyncInterval}min)`,
    );
  } catch (error) {
    console.error("[AutoSync] Failed to start scheduled sync:", error);
  }
}

/**
 * 停止定时同步
 */
export async function stopScheduledSync(): Promise<void> {
  try {
    const cleared = await browser.alarms.clear(ALARM_NAME);
    if (cleared) {
      console.log("[AutoSync] Scheduled sync stopped");
    }
  } catch (error) {
    console.error("[AutoSync] Failed to stop scheduled sync:", error);
  }
}

/**
 * 处理定时同步闹钟触发
 */
async function handleScheduledAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM_NAME) return;

  console.log("[AutoSync] Scheduled sync triggered");

  // 再次检查开关状态，确保即使用户关闭了开关但 Alarm 还没清除时也不会运行
  const { scheduledSyncEnabled } = await getWebDAVConfig();
  if (!scheduledSyncEnabled) {
    console.log("[AutoSync] Scheduled sync disabled, skipping");
    await browser.alarms.clear(ALARM_NAME);
    return;
  }

  await executeAutoPull();
}

/**
 * 更新定时同步配置
 * 用于设置页面保存配置时调用
 */
export async function updateScheduledSync(): Promise<void> {
  try {
    const { scheduledSyncEnabled, scheduledSyncInterval } =
      await getWebDAVConfig();

    if (scheduledSyncEnabled) {
      // 清除旧的并创建新的
      await browser.alarms.clear(ALARM_NAME);
      await browser.alarms.create(ALARM_NAME, {
        periodInMinutes: scheduledSyncInterval,
        when: Date.now() + scheduledSyncInterval * 60 * 1000,
      });
      console.log(
        `[AutoSync] Scheduled sync updated (every ${scheduledSyncInterval}min)`,
      );
    } else {
      await browser.alarms.clear(ALARM_NAME);
      console.log("[AutoSync] Scheduled sync disabled");
    }
  } catch (error) {
    console.error("[AutoSync] Failed to update scheduled sync:", error);
  }
}

// ============================================
// 全局事件监听器（顶级作用域注册）
// ============================================

/**
 * Alarm 事件统一处理器
 * 必须在顶级作用域注册，确保 Service Worker 唤醒时能立即响应
 */
browser.alarms.onAlarm.addListener(async (alarm) => {
  try {
    console.log(`[AutoSync] Alarm triggered: ${alarm.name}`);

    switch (alarm.name) {
      case DEBOUNCE_ALARM:
        // 防抖上传
        await handleDebounceAlarm(alarm);
        break;

      case ALARM_NAME:
        // 定时同步
        await handleScheduledAlarm(alarm);
        break;

      case RESET_RESTORING_ALARM:
        // 重置恢复状态
        console.log("[AutoSync] Resetting restoring state");
        await setIsRestoring(false);
        break;

      default:
        console.warn(`[AutoSync] Unknown alarm: ${alarm.name}`);
    }
  } catch (error) {
    console.error(`[AutoSync] Alarm handler error (${alarm.name}):`, error);
  }
});
