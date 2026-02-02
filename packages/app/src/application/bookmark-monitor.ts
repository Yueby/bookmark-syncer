/**
 * 书签监听器
 * 监听书签变化并触发防抖同步
 */
import browser from "webextension-polyfill";
import { DEBOUNCE_ALARM, DEBOUNCE_DELAY_MS } from "./constants";
import { getIsRestoring, getWebDAVConfig } from "./state-manager";
import { executeUpload } from "./sync-executor";

/**
 * 触发防抖同步
 * 使用 Alarm API 以防止 Service Worker 休眠导致 Timer 丢失
 * 当书签发生变化时调用，会延迟执行上传避免频繁同步
 */
export async function triggerDebouncedSync(): Promise<void> {
  try {
    // 如果正在恢复，不触发上传
    if (await getIsRestoring()) {
      console.log("[BookmarkMonitor] Skipped debounce: restoring in progress");
      return;
    }

    // 清除旧的防抖闹钟（如果存在）
    const cleared = await browser.alarms.clear(DEBOUNCE_ALARM);
    if (cleared) {
      console.log("[BookmarkMonitor] Debounce alarm reset");
    }

    // 创建新的防抖闹钟
    // 注意：Chrome 扩展的 Alarm API 对于一次性闹钟（when）支持任意时间
    await browser.alarms.create(DEBOUNCE_ALARM, {
      when: Date.now() + DEBOUNCE_DELAY_MS,
    });

    console.log(`[BookmarkMonitor] Upload scheduled in ${DEBOUNCE_DELAY_MS}ms`);
  } catch (error) {
    console.error("[BookmarkMonitor] Failed to trigger debounced sync:", error);
  }
}

/**
 * 处理防抖闹钟触发
 */
export async function handleDebounceAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== DEBOUNCE_ALARM) return;

  console.log("[BookmarkMonitor] Debounce alarm triggered");

  // 再次检查自动同步开关
  const { autoSyncEnabled } = await getWebDAVConfig();

  if (!autoSyncEnabled) {
    console.log("[BookmarkMonitor] Auto sync disabled, skipping upload");
    return;
  }

  await executeUpload();
}

/**
 * 书签事件处理器
 * 当书签发生任何变化时触发防抖上传
 */
export const onBookmarkEvent = (): void => {
  triggerDebouncedSync();
};

/**
 * 注册书签监听器
 * 必须在顶级作用域调用，确保 Service Worker 能被事件唤醒
 */
export function registerBookmarkListeners(): void {
  browser.bookmarks.onCreated.addListener(onBookmarkEvent);
  browser.bookmarks.onRemoved.addListener(onBookmarkEvent);
  browser.bookmarks.onChanged.addListener(onBookmarkEvent);
  browser.bookmarks.onMoved.addListener(onBookmarkEvent);

  console.log("[BookmarkMonitor] Bookmark listeners registered");
}
