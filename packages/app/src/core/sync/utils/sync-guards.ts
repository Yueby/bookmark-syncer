/**
 * 同步守卫工具函数
 * 提供网络检查和锁管理等通用功能
 */
import { acquireSyncLock, releaseSyncLock } from "../lock-manager";
import type { SyncResult } from "../types";

/**
 * 检查网络状态
 * @returns 如果离线返回错误结果，否则返回 null
 */
export function checkOnlineStatus(): SyncResult | null {
  if (!navigator.onLine) {
    console.warn("[SyncGuard] Operation aborted: offline");
    return { success: false, action: "error", message: "网络断开" };
  }
  return null;
}

/**
 * 同步锁管理装饰器
 * 自动处理锁的获取和释放
 * 
 * @param lockHolder 锁持有者标识
 * @param fn 需要在锁保护下执行的函数
 * @returns 函数执行结果或错误信息
 */
export async function withSyncLock<T>(
  lockHolder: string,
  fn: () => Promise<T>
): Promise<T | SyncResult> {
  const lockAcquired = await acquireSyncLock(lockHolder);
  if (!lockAcquired) {
    console.warn(`[SyncGuard] Lock not acquired by "${lockHolder}"`);
    return { 
      success: false, 
      action: "error", 
      message: "同步正在进行中" 
    };
  }
  try {
    return await fn();
  } finally {
    await releaseSyncLock(lockHolder);
  }
}
