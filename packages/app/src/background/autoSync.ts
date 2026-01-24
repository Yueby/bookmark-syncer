/**
 * 自动同步服务
 * 监听书签变化，自动上传到云端
 * 定时检查云端更新，自动合并到本地
 */
import browser from "webextension-polyfill";
import { smartPush, smartPull, SyncConfig } from "../services/syncService";

// 防抖定时器
// 状态标志
let isRestoring = false; // 是否正在执行恢复操作（防止死循环）
const LOCK_HOLDER_AUTO = "auto_sync"; // 自动同步的锁持有者标识

const ALARM_NAME = "scheduledSync";

// 防抖定时器 Alarm 名称
const DEBOUNCE_ALARM = "autoSyncDebounce";

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

/**
 * 执行上传同步 (Push) - 使用统一 syncService
 */
async function executeUpload() {
  if (isRestoring) return;

  const { config, autoSyncEnabled } = await getWebDAVConfig();
  if (!config || !autoSyncEnabled) return;

  await smartPush(config, LOCK_HOLDER_AUTO, false);
}

/**
 * 执行拉取同步 (Pull) - 使用统一 syncService
 * 如果云端比本地新，则自动恢复
 */
async function executeAutoPull() {
  if (isRestoring) return;

  const { config } = await getWebDAVConfig();
  if (!config) return;

  // 检查云端是否有更新
  const result = await browser.storage.local.get([
    "lastSyncTime",
    "lastSyncUrl",
  ]);
  const lastSyncTime =
    result.lastSyncUrl === config.url
      ? (result.lastSyncTime as number) || 0
      : 0;

  // 获取云端时间戳
  try {
    const { getCloudInfo } = await import("../services/syncService");
    const cloudInfo = await getCloudInfo(config);
    if (!cloudInfo.exists) return;

    const cloudTime = cloudInfo.timestamp || 0;
    if (cloudTime <= lastSyncTime) return;

    // 标记正在恢复，阻止 onBookmarkChanged 触发上传
    isRestoring = true;

    try {
      await smartPull(config, LOCK_HOLDER_AUTO, "overwrite");
    } finally {
      // 延迟重置恢复标志，等待所有事件处理完成
      setTimeout(() => {
        isRestoring = false;
      }, 2000);
    }
  } catch {
    // 忽略错误
  }
}

// 防抖定时器 Alarm 名称

/**
 * 触发防抖同步 (使用 Alarm 以防止 Service Worker 休眠导致 Timer 丢失)
 */
async function triggerDebouncedSync() {
  if (isRestoring) return;

  // 清除旧的防抖闹钟（如果存在）
  await browser.alarms.clear(DEBOUNCE_ALARM);

  // 创建新的防抖闹钟 (3秒后触发)
  // 注意：Chrome 扩展对于 periodInMinutes 有限制，但对于 when (一次性) 通常允许短时间
  await browser.alarms.create(DEBOUNCE_ALARM, {
    when: Date.now() + 3000,
  });
}

/**
 * 处理防抖闹钟
 */
async function handleDebounceAlarm(alarm: browser.Alarms.Alarm) {
  if (alarm.name !== DEBOUNCE_ALARM) return;

  // 再次检查开关
  const { autoSyncEnabled } = await getWebDAVConfig();
  if (autoSyncEnabled) {
    await executeUpload();
  }
}

/**
 * 启动自动同步监听 (现仅需确保逻辑就绪，监听器已在顶级注册)
 */
export function startAutoSync() {
  checkCloudOnStartup();
}

/**
 * 停止自动同步监听 (实际上 Service Worker 无法真正移除顶级监听，只能通过标记位控制，但此处保留接口)
 */
export function stopAutoSync() {
  // 在 MV3 中，通常通过内部状态判断是否执行
}

// ==========================================
// 顶级注册监听器 (确保 Service Worker 始终被唤醒)
// ==========================================

// 1. 书签事件监听
const onBookmarkParams = () => triggerDebouncedSync();
browser.bookmarks.onCreated.addListener(onBookmarkParams);
browser.bookmarks.onRemoved.addListener(onBookmarkParams);
browser.bookmarks.onChanged.addListener(onBookmarkParams);
browser.bookmarks.onMoved.addListener(onBookmarkParams);

// 2. 防抖闹钟监听 (复用 handleAlarm 逻辑或单独注册)
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === DEBOUNCE_ALARM) {
    handleDebounceAlarm(alarm);
  }
  // 注意：scheduledSync 的 handleAlarm 在下面注册，或者我们需要合并监听器？
  // 由于 browser.alarms.onAlarm 可以有多个监听器，这里分开写没问题。
});

/**
 * 扩展启动时检查云端更新
 */
export async function checkCloudOnStartup() {
  await executeAutoPull();
}

/**
 * 启动定时同步
 */
export async function startScheduledSync() {
  const { scheduledSyncEnabled, scheduledSyncInterval } =
    await getWebDAVConfig();

  if (!scheduledSyncEnabled) {
    await browser.alarms.clear(ALARM_NAME);
    return;
  }

  // 创建定时器
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: scheduledSyncInterval,
  });
}

/**
 * 停止定时同步
 */
export async function stopScheduledSync() {
  await browser.alarms.clear(ALARM_NAME);
}

/**
 * 处理定时器触发
 */
async function handleAlarm(alarm: browser.Alarms.Alarm) {
  if (alarm.name !== ALARM_NAME) return;

  // 再次检查开关状态，确保即使用户关闭了开关但 Alarm 还没清除时也不会运行
  const { scheduledSyncEnabled } = await getWebDAVConfig();
  if (!scheduledSyncEnabled) return;

  await executeAutoPull();
}

/**
 * 更新定时同步配置
 */
export async function updateScheduledSync() {
  const { scheduledSyncEnabled, scheduledSyncInterval } =
    await getWebDAVConfig();

  if (scheduledSyncEnabled) {
    await browser.alarms.create(ALARM_NAME, {
      periodInMinutes: scheduledSyncInterval,
    });
  } else {
    await browser.alarms.clear(ALARM_NAME);
  }
}

// 注册监听器 (必须在顶级作用域注册，以确保 Service Worker 唤醒时能立即响应)
browser.alarms.onAlarm.addListener(handleAlarm);
