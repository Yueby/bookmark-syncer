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
   * 记录当前实例获取的 lockId
   * 用于释放时精确验证，防止意外释放其他操作持有的锁
   * 注意：MV3 Service Worker 重启后此值会丢失，release 有降级逻辑
   */
  private activeLockId: string | null = null;

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
        this.activeLockId = lockId;
        console.log(`[SyncLockManager] Lock acquired by "${holder}" (lockId: ${lockId.slice(-8)})`);
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
   * 验证 holder 和 lockId 双重匹配，防止意外释放其他操作的锁
   * 降级逻辑：如果 activeLockId 不可用（如 SW 重启后），仅验证 holder
   */
  async release(holder: string): Promise<void> {
    try {
      const result = await browser.storage.local.get(SYNC_LOCK_KEY);
      const existingLock = result[SYNC_LOCK_KEY] as SyncLock | undefined;

      if (!existingLock) {
        console.log(`[SyncLockManager] No lock to release for "${holder}"`);
        this.activeLockId = null;
        return;
      }

      // 验证持有者
      if (existingLock.holder !== holder) {
        console.warn(
          `[SyncLockManager] Lock held by "${existingLock.holder}", cannot release by "${holder}"`,
        );
        return;
      }

      // 精确验证 lockId（如果可用）
      if (this.activeLockId && existingLock.lockId !== this.activeLockId) {
        console.warn(
          `[SyncLockManager] LockId mismatch: expected ${this.activeLockId.slice(-8)}, got ${existingLock.lockId.slice(-8)}. Another "${holder}" operation may have acquired a new lock.`,
        );
        // 不释放：同一个 holder 的另一个操作已经获取了新锁
        this.activeLockId = null;
        return;
      }

      await browser.storage.local.remove(SYNC_LOCK_KEY);
      this.activeLockId = null;
      console.log(`[SyncLockManager] Lock released by "${holder}"`);
    } catch (error) {
      console.error("[SyncLockManager] Failed to release lock:", error);
      this.activeLockId = null;
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
