/**
 * Application 层统一导出
 * 自动同步服务的公共 API
 */
import { registerBookmarkListeners } from "./bookmark-monitor";
import { registerAlarmListener } from "./scheduler";
import { executeAutoPull } from "./sync-executor";

// 防止重复启动的标志位
let isStartupCheckScheduled = false;

/**
 * 启动自动同步服务
 * 在扩展安装/启动时调用
 */
export function startAutoSync(): void {
  console.log("[AutoSync] Auto sync service started");

  // 防止重复调用 checkCloudOnStartup（开发时会多次触发 onInstalled）
  if (!isStartupCheckScheduled) {
    isStartupCheckScheduled = true;
    checkCloudOnStartup().finally(() => {
      // 检查完成后重置标志，允许下次启动时再次检查
      setTimeout(() => {
        isStartupCheckScheduled = false;
      }, 10000); // 10秒后重置
    });
  } else {
    console.log(
      "[AutoSync] Startup check already scheduled, skipping duplicate call",
    );
  }
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
 * 延迟 3 秒执行，避免与 UI 的 PROPFIND 冲突
 */
export async function checkCloudOnStartup(): Promise<void> {
  console.log("[AutoSync] Checking cloud on startup (delayed 3s)...");

  // 延迟 3 秒，等待扩展完全初始化，避免与 UI 同时执行 PROPFIND
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("[AutoSync] Starting cloud check after delay...");
  await executeAutoPull();
}

/**
 * 初始化自动同步
 * 注册所有必要的监听器
 * 必须在 background script 的顶级作用域调用
 */
export function initializeAutoSync(): void {
  registerBookmarkListeners();
  registerAlarmListener();
  console.log("[AutoSync] Initialization complete");
}

// 导出定时同步相关函数
export { resetScheduledSync, startScheduledSync, stopScheduledSync, updateScheduledSync } from "./scheduler";

