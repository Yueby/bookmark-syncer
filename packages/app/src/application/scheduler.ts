/**
 * 定时调度器
 * 管理定时同步任务
 */
import browser from "webextension-polyfill";
import { handleDebounceAlarm } from "./bookmark-monitor";
import { ALARM_NAME, DEBOUNCE_ALARM, RESET_RESTORING_ALARM } from "./constants";
import { getWebDAVConfig, setIsRestoring } from "./state-manager";
import { executeAutoPull } from "./sync-executor";

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
        console.log("[Scheduler] Scheduled sync disabled and alarm cleared");
      }
      return;
    }

    // 检查是否已存在同名 Alarm
    const existingAlarm = await browser.alarms.get(ALARM_NAME);

    if (existingAlarm) {
      // 如果已存在且周期一致，则不重置（防止无限推迟首次触发）
      if (existingAlarm.periodInMinutes === scheduledSyncInterval) {
        console.log(
          `[Scheduler] Scheduled sync already running (${scheduledSyncInterval}min)`,
        );
        return;
      }
      // 如果周期变了，清除旧的并创建新的
      await browser.alarms.clear(ALARM_NAME);
      console.log("[Scheduler] Scheduled sync interval changed, recreating alarm");
    }

    // 创建周期性定时器（首次触发设为 1 分钟后，后续按周期执行）
    const FIRST_TRIGGER_DELAY_MS = 60 * 1000; // 1 分钟
    await browser.alarms.create(ALARM_NAME, {
      periodInMinutes: scheduledSyncInterval,
      when: Date.now() + FIRST_TRIGGER_DELAY_MS,
    });

    console.log(
      `[Scheduler] Scheduled sync started (first in 1min, then every ${scheduledSyncInterval}min)`,
    );
  } catch (error) {
    console.error("[Scheduler] Failed to start scheduled sync:", error);
  }
}

/**
 * 停止定时同步
 */
export async function stopScheduledSync(): Promise<void> {
  try {
    const cleared = await browser.alarms.clear(ALARM_NAME);
    if (cleared) {
      console.log("[Scheduler] Scheduled sync stopped");
    } else {
      console.log("[Scheduler] No scheduled sync alarm to stop");
    }
  } catch (error) {
    console.error("[Scheduler] Failed to stop scheduled sync:", error);
  }
}

/**
 * 处理定时闹钟触发
 */
async function handleScheduledAlarm(alarm: browser.Alarms.Alarm): Promise<void> {
  if (alarm.name !== ALARM_NAME) return;

  console.log("[Scheduler] Scheduled sync triggered");

  // 再次检查开关状态，确保即使用户关闭了开关但 Alarm 还没清除时也不会运行
  const { scheduledSyncEnabled } = await getWebDAVConfig();
  if (!scheduledSyncEnabled) {
    console.log("[Scheduler] Scheduled sync disabled, skipping");
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
        `[Scheduler] Scheduled sync updated (every ${scheduledSyncInterval}min)`,
      );
    } else {
      await browser.alarms.clear(ALARM_NAME);
      console.log("[Scheduler] Scheduled sync disabled");
    }
  } catch (error) {
    console.error("[Scheduler] Failed to update scheduled sync:", error);
  }
}

/**
 * 重置定时同步计时器
 * 在手动同步成功后调用，避免手动同步和定时同步重复触发
 */
export async function resetScheduledSync(): Promise<void> {
  try {
    const { scheduledSyncEnabled, scheduledSyncInterval } =
      await getWebDAVConfig();

    // 如果定时同步未启用，不需要重置
    if (!scheduledSyncEnabled) {
      return;
    }

    // 清除当前的定时器并创建新的，重新开始计时
    await browser.alarms.clear(ALARM_NAME);
    await browser.alarms.create(ALARM_NAME, {
      periodInMinutes: scheduledSyncInterval,
      when: Date.now() + scheduledSyncInterval * 60 * 1000,
    });
    
    console.log(
      `[Scheduler] Scheduled sync timer reset (next trigger in ${scheduledSyncInterval}min)`,
    );
  } catch (error) {
    console.error("[Scheduler] Failed to reset scheduled sync:", error);
  }
}

/**
 * 注册闹钟监听器
 * 必须在顶级作用域调用，确保 Service Worker 能被事件唤醒
 */
export function registerAlarmListener(): void {
  browser.alarms.onAlarm.addListener(async (alarm) => {
    try {
      console.log(`[Scheduler] Alarm triggered: ${alarm.name}`);

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
          console.log("[Scheduler] Resetting restoring state");
          await setIsRestoring(false);
          break;

        default:
          console.warn(`[Scheduler] Unknown alarm: ${alarm.name}`);
      }
    } catch (error) {
      console.error(`[Scheduler] Alarm handler error (${alarm.name}):`, error);
    }
  });

  console.log("[Scheduler] Alarm listener registered");
}
