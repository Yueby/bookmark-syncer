/**
 * 自动同步服务
 * 监听书签变化，自动上传到云端
 * 定时检查云端更新，自动合并到本地
 */
import browser from "webextension-polyfill";
import { smartPush, smartPull, SyncConfig } from "../services/syncService";

// 防抖定时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_DELAY = 3000; // 3 秒防抖

// 状态标志
let isRestoring = false; // 是否正在执行恢复操作（防止死循环）
const LOCK_HOLDER_AUTO = "auto_sync"; // 自动同步的锁持有者标识

// 监听器引用（用于移除）
let listeners: (() => void)[] = [];

const ALARM_NAME = "scheduledSync";

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

/**
 * 触发防抖同步
 */
function triggerDebouncedSync() {
  if (isRestoring) return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    executeUpload();
  }, DEBOUNCE_DELAY);
}

/**
 * 启动自动同步监听
 */
export function startAutoSync() {
  // 创建监听器
  const onCreated = () => triggerDebouncedSync();
  const onRemoved = () => triggerDebouncedSync();
  const onChanged = () => triggerDebouncedSync();
  const onMoved = () => triggerDebouncedSync();

  // 添加监听器
  browser.bookmarks.onCreated.addListener(onCreated);
  browser.bookmarks.onRemoved.addListener(onRemoved);
  browser.bookmarks.onChanged.addListener(onChanged);
  browser.bookmarks.onMoved.addListener(onMoved);

  // 保存引用以便移除
  listeners = [
    () => browser.bookmarks.onCreated.removeListener(onCreated),
    () => browser.bookmarks.onRemoved.removeListener(onRemoved),
    () => browser.bookmarks.onChanged.removeListener(onChanged),
    () => browser.bookmarks.onMoved.removeListener(onMoved),
  ];

  // 启动时也检查一次更新
  checkCloudOnStartup();
}

/**
 * 停止自动同步监听
 */
export function stopAutoSync() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  listeners.forEach((remove) => remove());
  listeners = [];
}

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
