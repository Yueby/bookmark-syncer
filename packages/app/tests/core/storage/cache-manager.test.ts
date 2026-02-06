/**
 * cache-manager.ts 测试
 * 测试缓存管理器的命中、过期、降级逻辑
 */
import { CacheManager } from "@src/core/storage/cache-manager";
import type { CachedBackup, CachedBackupList } from "@src/core/storage/types";
import browser from "webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("CacheManager", () => {
  let manager: CacheManager;
  const sessionStore: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    // 清空 session store
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }

    // 设置 session storage mock 返回存储内容
    vi.mocked(browser.storage.session.get).mockImplementation(async (keys) => {
      if (typeof keys === "string") {
        return { [keys]: sessionStore[keys] };
      }
      return {};
    });
    vi.mocked(browser.storage.session.set).mockImplementation(async (items) => {
      Object.assign(sessionStore, items);
    });
    vi.mocked(browser.storage.session.remove).mockImplementation(async (keys) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) {
        delete sessionStore[k];
      }
    });

    manager = new CacheManager(5000); // 5 秒过期用于测试
  });

  // ─── 单个备份缓存 ───

  describe("getCachedLatestBackup", () => {
    it("缓存未命中时返回 null", async () => {
      const result = await manager.getCachedLatestBackup();
      expect(result).toBeNull();
    });

    it("缓存命中时返回数据", async () => {
      const cached: CachedBackup = {
        fileName: "bookmarks_123.json.gz",
        timestamp: 123,
        browser: "chrome",
        totalCount: 100,
        content: "{}",
        cachedAt: Date.now(),
      };
      sessionStore["cloud_backup_cache"] = cached;

      const result = await manager.getCachedLatestBackup();
      expect(result).toEqual(cached);
    });

    it("缓存过期时返回 null 并清除缓存", async () => {
      const cached: CachedBackup = {
        fileName: "bookmarks_123.json.gz",
        timestamp: 123,
        browser: "chrome",
        totalCount: 100,
        content: "{}",
        cachedAt: Date.now() - 10000, // 10 秒前，超过 5 秒过期时间
      };
      sessionStore["cloud_backup_cache"] = cached;

      const result = await manager.getCachedLatestBackup();
      expect(result).toBeNull();
      expect(browser.storage.session.remove).toHaveBeenCalledWith("cloud_backup_cache");
    });
  });

  describe("cacheLatestBackup", () => {
    it("正确存储缓存数据", async () => {
      const data: CachedBackup = {
        fileName: "bookmarks_123.json.gz",
        timestamp: 123,
        browser: "chrome",
        totalCount: 100,
        content: "{}",
        cachedAt: Date.now(),
      };
      await manager.cacheLatestBackup(data);

      expect(sessionStore["cloud_backup_cache"]).toEqual(data);
    });
  });

  // ─── 备份列表缓存 ───

  describe("getCachedBackupList", () => {
    it("缓存未命中时返回 null", async () => {
      const result = await manager.getCachedBackupList();
      expect(result).toBeNull();
    });

    it("缓存命中时返回数据", async () => {
      const cached: CachedBackupList = {
        backups: [
          { name: "a.json.gz", path: "/a.json.gz", timestamp: 1 },
        ],
        cachedAt: Date.now(),
      };
      sessionStore["cloud_backup_list_cache"] = cached;

      const result = await manager.getCachedBackupList();
      expect(result).toEqual(cached);
    });

    it("缓存过期时返回 null", async () => {
      const cached: CachedBackupList = {
        backups: [],
        cachedAt: Date.now() - 10000,
      };
      sessionStore["cloud_backup_list_cache"] = cached;

      const result = await manager.getCachedBackupList();
      expect(result).toBeNull();
    });
  });

  // ─── 清除缓存 ───

  describe("clearAllCaches", () => {
    it("清除所有缓存", async () => {
      sessionStore["cloud_backup_cache"] = { cachedAt: Date.now() };
      sessionStore["cloud_backup_list_cache"] = { cachedAt: Date.now() };

      await manager.clearAllCaches();

      expect(browser.storage.session.remove).toHaveBeenCalledWith("cloud_backup_cache");
      expect(browser.storage.session.remove).toHaveBeenCalledWith("cloud_backup_list_cache");
    });
  });

  // ─── Firefox 降级（session storage 不可用）───

  describe("Firefox 降级 (session storage 不可用)", () => {
    let managerNoSession: CacheManager;

    beforeEach(() => {
      // 模拟 Firefox 无 session storage
      const origSession = browser.storage.session;
      Object.defineProperty(browser.storage, "session", {
        value: undefined,
        writable: true,
        configurable: true,
      });
      managerNoSession = new CacheManager(5000);

      // 还原（afterEach 用不到，因为 beforeEach 每次都重建）
      return () => {
        Object.defineProperty(browser.storage, "session", {
          value: origSession,
          writable: true,
          configurable: true,
        });
      };
    });

    it("getCachedLatestBackup 返回 null", async () => {
      const result = await managerNoSession.getCachedLatestBackup();
      expect(result).toBeNull();
    });

    it("cacheLatestBackup 静默跳过", async () => {
      await expect(
        managerNoSession.cacheLatestBackup({
          fileName: "x",
          timestamp: 0,
          browser: "firefox",
          totalCount: 0,
          content: "",
          cachedAt: Date.now(),
        })
      ).resolves.toBeUndefined();
    });

    it("clearAllCaches 静默跳过", async () => {
      await expect(managerNoSession.clearAllCaches()).resolves.toBeUndefined();
    });
  });
});
