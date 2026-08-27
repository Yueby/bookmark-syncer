/**
 * 书签监听器
 * 监听书签变化并触发防抖同步
 */
import browser from "webextension-polyfill";
import {
  DEBOUNCE_ALARM,
  DEBOUNCE_ALARM_FALLBACK_MS,
  DEBOUNCE_DELAY_MS,
} from "./constants";
import { getIsRestoring, getWebDAVConfig } from "./state-manager";
import { executeUpload } from "./sync-executor";

// 防抖快速通道的定时器（模块级，SW 存活期内有效）
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

// 上传执行中的标志，防止快速通道和兜底闹钟双触发
let uploadInFlight = false;

/**
 * 执行防抖上传（含开关检查与并发去重）
 */
async function runDebouncedUpload(): Promise<void> {
  if (uploadInFlight) {
    console.log("[BookmarkMonitor] Upload already in flight, skipping");
    return;
  }

  // 再次检查自动同步开关
  const { autoSyncEnabled } = await getWebDAVConfig();
  if (!autoSyncEnabled) {
    console.log("[BookmarkMonitor] Auto sync disabled, skipping upload");
    return;
  }

  uploadInFlight = true;
  try {
    await executeUpload();
  } finally {
    uploadInFlight = false;
  }
}

/**
 * 触发防抖同步
 * 双通道策略：
 * - 快速通道：setTimeout（SW 存活期内 1 秒后触发，不受 Alarm 最小间隔限制）
 * - 兜底通道：Alarm（若 SW 在 1 秒内休眠导致 Timer 丢失，闹钟唤醒后执行；
 *   Chrome 会将闹钟推迟到 ≥30 秒，但可接受，因为它只是兜底）
 * 两条通道通过 uploadInFlight 标志去重
 */
export async function triggerDebouncedSync(): Promise<void> {
  try {
    // 如果正在恢复，不触发上传
    if (await getIsRestoring()) {
      console.log("[BookmarkMonitor] Skipped debounce: restoring in progress");
      return;
    }

    // 快速通道：重置计时器
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      // 快速通道即将执行，清除兜底闹钟（若已触发则由 uploadInFlight 去重）
      void browser.alarms.clear(DEBOUNCE_ALARM);
      console.log("[BookmarkMonitor] Debounce timer fired");
      void runDebouncedUpload();
    }, DEBOUNCE_DELAY_MS);

    // 兜底通道：重置兜底闹钟
    await browser.alarms.clear(DEBOUNCE_ALARM);
    await browser.alarms.create(DEBOUNCE_ALARM, {
      when: Date.now() + DEBOUNCE_ALARM_FALLBACK_MS,
    });

    console.log(`[BookmarkMonitor] Upload scheduled in ${DEBOUNCE_DELAY_MS}ms`);
  } catch (error) {
    console.error("[BookmarkMonitor] Failed to trigger debounced sync:", error);
  }
}

/**
 * 处理防抖闹钟触发（兜底通道）
 */
export async function handleDebounceAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== DEBOUNCE_ALARM) return;

  console.log("[BookmarkMonitor] Debounce alarm triggered (fallback)");

  // 闹钟到点说明快速通道定时器已丢失（SW 重启）或刚被新事件重置，
  // 清除残留定时器后立即执行
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  await runDebouncedUpload();
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
