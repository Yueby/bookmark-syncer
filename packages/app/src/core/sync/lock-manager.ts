/**
 * 同步锁管理器
 * 防止并发同步操作导致的数据冲突
 */
import browser from "webextension-polyfill";
import { LOCK_TIMEOUT_MS, SYNC_LOCK_KEY, SyncLock } from "./types";

/**
 * 同步锁管理器类
 */
export class SyncLockManager {
  /**
   * 尝试获取同步锁
   * 使用 lockId 机制防止并发获取时的竞态条件
   */
  async acquire(holder: string): Promise<boolean> {
    try {
      const result = await browser.storage.local.get(SYNC_LOCK_KEY);
      const existingLock = result[SYNC_LOCK_KEY] as SyncLock | undefined;

      // 检查现有锁
      if (existingLock) {
        const now = Date.now();
        const lockAge = now - existingLock.timestamp;

        // 锁未超时，无法获取
        if (lockAge < LOCK_TIMEOUT_MS) {
          console.log(
            `[SyncLockManager] Lock held by "${existingLock.holder}" (${Math.round(lockAge / 1000)}s ago)`,
          );
          return false;
        }

        // 锁已超时，可以强制获取
        console.warn(
          `[SyncLockManager] Lock timeout detected (${Math.round(lockAge / 1000)}s), force acquiring`,
        );
      }

      // 生成唯一 lockId 用于验证
      const lockId = `${holder}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const newLock: SyncLock = {
        holder,
        timestamp: Date.now(),
        lockId,
      };

      // 写入锁
      await browser.storage.local.set({ [SYNC_LOCK_KEY]: newLock });

      // 重新读取验证（防止并发写入导致的覆盖）
      await new Promise((resolve) => setTimeout(resolve, 50)); // 短暂延迟
      const verifyResult = await browser.storage.local.get(SYNC_LOCK_KEY);
      const verifyLock = verifyResult[SYNC_LOCK_KEY] as SyncLock | undefined;

      if (verifyLock?.lockId === lockId) {
        console.log(`[SyncLockManager] Lock acquired by "${holder}"`);
        return true;
      }

      // 验证失败，其他进程抢先获取了锁
      console.warn(`[SyncLockManager] Lock verification failed for "${holder}"`);
      return false;
    } catch (error) {
      console.error("[SyncLockManager] Failed to acquire lock:", error);
      return false;
    }
  }

  /**
   * 释放同步锁
   * 只有锁的持有者才能释放
   */
  async release(holder: string): Promise<void> {
    try {
      const result = await browser.storage.local.get(SYNC_LOCK_KEY);
      const existingLock = result[SYNC_LOCK_KEY] as SyncLock | undefined;

      if (!existingLock) {
        console.log(`[SyncLockManager] No lock to release for "${holder}"`);
        return;
      }

      if (existingLock.holder === holder) {
        await browser.storage.local.remove(SYNC_LOCK_KEY);
        console.log(`[SyncLockManager] Lock released by "${holder}"`);
      } else {
        console.warn(
          `[SyncLockManager] Lock held by "${existingLock.holder}", cannot release by "${holder}"`,
        );
      }
    } catch (error) {
      console.error("[SyncLockManager] Failed to release lock:", error);
    }
  }
}

/**
 * 导出单例实例
 */
export const syncLockManager = new SyncLockManager();

/**
 * 兼容旧 API 的导出（向后兼容）
 */
export const acquireSyncLock = (holder: string) => syncLockManager.acquire(holder);
export const releaseSyncLock = (holder: string) => syncLockManager.release(holder);
