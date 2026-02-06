/**
 * application/state-manager.ts 测试
 * 测试恢复状态、WebDAV 配置获取、备份信息存取
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { RESTORING_KEY, RESTORING_TIMEOUT_MS } from "@src/application/constants";
import {
  clearLastBackupFileInfo,
  getBackupFileInterval,
  getIsRestoring,
  getLastBackupFileInfo,
  getWebDAVConfig,
  saveLastBackupFileInfo,
  setIsRestoring,
} from "@src/application/state-manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";

describe("Application StateManager", () => {
  const sessionStore: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    __resetMockStore();
    // 清空 session store
    for (const key of Object.keys(sessionStore)) {
      delete sessionStore[key];
    }

    // 设置 session storage mock
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
  });

  // ─── getIsRestoring / setIsRestoring ───

  describe("getIsRestoring", () => {
    it("无状态时返回 false", async () => {
      expect(await getIsRestoring()).toBe(false);
    });

    it("设置为 true 后返回 true", async () => {
      await setIsRestoring(true);
      expect(await getIsRestoring()).toBe(true);
    });

    it("设置为 false 后返回 false", async () => {
      await setIsRestoring(true);
      await setIsRestoring(false);
      expect(await getIsRestoring()).toBe(false);
    });

    it("超时后自动清除并返回 false", async () => {
      // 设置一个过去超时时间的状态
      sessionStore[RESTORING_KEY] = {
        value: true,
        timestamp: Date.now() - RESTORING_TIMEOUT_MS - 1000,
      };
      expect(await getIsRestoring()).toBe(false);
      // 应该清除了 session 中的状态
      expect(browser.storage.session.remove).toHaveBeenCalledWith(RESTORING_KEY);
    });
  });

  describe("setIsRestoring", () => {
    it("设为 true 时存储带时间戳的状态", async () => {
      const now = Date.now();
      await setIsRestoring(true);
      const stored = sessionStore[RESTORING_KEY] as { value: boolean; timestamp: number };
      expect(stored.value).toBe(true);
      expect(stored.timestamp).toBeGreaterThanOrEqual(now);
    });

    it("设为 false 时删除状态", async () => {
      await setIsRestoring(true);
      await setIsRestoring(false);
      expect(sessionStore[RESTORING_KEY]).toBeUndefined();
    });
  });

  // ─── Firefox 降级 ───

  describe("Firefox 降级 (session storage 不可用)", () => {
    let origSession: typeof browser.storage.session;

    beforeEach(() => {
      origSession = browser.storage.session;
      Object.defineProperty(browser.storage, "session", {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    afterEach(() => {
      Object.defineProperty(browser.storage, "session", {
        value: origSession,
        writable: true,
        configurable: true,
      });
    });

    it("getIsRestoring 返回 false", async () => {
      expect(await getIsRestoring()).toBe(false);
    });

    it("setIsRestoring 静默跳过", async () => {
      await expect(setIsRestoring(true)).resolves.toBeUndefined();
    });
  });

  // ─── getBackupFileInterval ───

  describe("getBackupFileInterval", () => {
    it("无配置时返回默认值 1", async () => {
      const interval = await getBackupFileInterval();
      expect(interval).toBe(1);
    });

    it("有配置时返回存储值", async () => {
      await browser.storage.local.set({ backup_file_interval: 5 });
      const interval = await getBackupFileInterval();
      expect(interval).toBe(5);
    });
  });

  // ─── getLastBackupFileInfo / saveLastBackupFileInfo ───

  describe("getLastBackupFileInfo / saveLastBackupFileInfo", () => {
    it("无信息时返回 null", async () => {
      const info = await getLastBackupFileInfo();
      expect(info).toBeNull();
    });

    it("保存后可以读取", async () => {
      const info = {
        fileName: "bookmarks_123.json.gz",
        filePath: "/BookmarkSyncer/bookmarks_123.json.gz",
        createdAt: Date.now(),
        revisionNumber: 1,
      };
      await saveLastBackupFileInfo(info);
      const result = await getLastBackupFileInfo();
      expect(result).toEqual(info);
    });

    it("清除后返回 null", async () => {
      await saveLastBackupFileInfo({
        fileName: "x",
        filePath: "/x",
        createdAt: 0,
        revisionNumber: 0,
      });
      await clearLastBackupFileInfo();
      const result = await getLastBackupFileInfo();
      expect(result).toBeNull();
    });
  });

  // ─── getWebDAVConfig ───

  describe("getWebDAVConfig", () => {
    it("无 URL 时返回 config=null 及默认值", async () => {
      const result = await getWebDAVConfig();
      expect(result.config).toBeNull();
      expect(result.autoSyncEnabled).toBe(true); // 默认 true
      expect(result.scheduledSyncEnabled).toBe(false); // 默认 false
      expect(result.scheduledSyncInterval).toBe(30); // 默认 30
    });

    it("有 URL 时返回完整配置", async () => {
      await browser.storage.local.set({
        webdav_url: "  https://dav.example.com  ",
        webdav_username: "  user  ",
        webdav_password: "  pass  ",
        auto_sync_enabled: false,
        scheduled_sync_enabled: true,
        scheduled_sync_interval: 15,
      });

      const result = await getWebDAVConfig();
      expect(result.config).toEqual({
        url: "https://dav.example.com",
        username: "user",
        password: "pass",
      });
      expect(result.autoSyncEnabled).toBe(false);
      expect(result.scheduledSyncEnabled).toBe(true);
      expect(result.scheduledSyncInterval).toBe(15);
    });

    it("用户名和密码为空时使用空字符串", async () => {
      await browser.storage.local.set({ webdav_url: "https://dav.example.com" });

      const result = await getWebDAVConfig();
      expect(result.config!.username).toBe("");
      expect(result.config!.password).toBe("");
    });
  });
});
