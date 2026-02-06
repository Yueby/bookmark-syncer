/**
 * lock-manager.ts 测试
 * 验证锁获取/释放逻辑，特别是 lockId 验证修复
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { SyncLockManager } from "@src/core/sync/lock-manager";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  __resetMockStore();
});

describe("SyncLockManager", () => {
  it("成功获取锁", async () => {
    const manager = new SyncLockManager();
    const result = await manager.acquire("manual");
    expect(result).toBe(true);
  });

  it("锁已被持有时获取失败", async () => {
    const manager = new SyncLockManager();
    // 第一次获取成功
    const first = await manager.acquire("auto-sync");
    expect(first).toBe(true);

    // 第二个实例尝试获取应该失败
    const manager2 = new SyncLockManager();
    const second = await manager2.acquire("manual");
    expect(second).toBe(false);
  });

  it("锁超时后可强制获取", async () => {
    const manager = new SyncLockManager();
    await manager.acquire("auto-sync");

    // 手动模拟锁超时：直接修改存储中的时间戳到 61 秒前
    const browser = (await import("webextension-polyfill")).default;
    const stored = await browser.storage.local.get("sync_lock");
    const lock = stored["sync_lock"] as { holder: string; timestamp: number; lockId: string };
    lock.timestamp = Date.now() - 61000; // 61 秒前
    await browser.storage.local.set({ sync_lock: lock });

    // 新实例应该可以获取
    const manager2 = new SyncLockManager();
    const result = await manager2.acquire("manual");
    expect(result).toBe(true);
  });

  it("释放时 lockId 不匹配则不释放（验证问题 6 修复）", async () => {
    const manager1 = new SyncLockManager();
    await manager1.acquire("auto-sync");

    // manager1 获取了锁，但我们模拟另一个同名 holder 获取了新锁
    // 先超时旧锁
    const browser = (await import("webextension-polyfill")).default;
    const stored = await browser.storage.local.get("sync_lock");
    const originalLock = stored["sync_lock"] as { holder: string; timestamp: number; lockId: string };
    
    // 新实例获取锁（模拟另一次 auto-sync）
    // 先让旧锁过期
    originalLock.timestamp = Date.now() - 61000;
    await browser.storage.local.set({ sync_lock: originalLock });

    const manager2 = new SyncLockManager();
    const acquired = await manager2.acquire("auto-sync");
    expect(acquired).toBe(true);

    // 现在 manager1 尝试释放 — 由于 lockId 不匹配，不应该释放
    await manager1.release("auto-sync");

    // 锁仍然存在（manager2 持有的）
    const afterRelease = await browser.storage.local.get("sync_lock");
    expect(afterRelease["sync_lock"]).toBeDefined();
  });

  it("释放时 holder 不匹配则不释放", async () => {
    const manager = new SyncLockManager();
    await manager.acquire("auto-sync");

    // 另一个 holder 尝试释放
    const manager2 = new SyncLockManager();
    await manager2.release("manual");

    // 锁仍然存在
    const browser = (await import("webextension-polyfill")).default;
    const afterRelease = await browser.storage.local.get("sync_lock");
    expect(afterRelease["sync_lock"]).toBeDefined();
  });

  it("正常获取后正常释放", async () => {
    const manager = new SyncLockManager();
    await manager.acquire("manual");

    await manager.release("manual");

    // 锁已被删除
    const browser = (await import("webextension-polyfill")).default;
    const afterRelease = await browser.storage.local.get("sync_lock");
    expect(afterRelease["sync_lock"]).toBeUndefined();
  });

  it("释放不存在的锁不报错", async () => {
    const manager = new SyncLockManager();
    // 不应抛出任何错误
    await expect(manager.release("manual")).resolves.toBeUndefined();
  });
});
