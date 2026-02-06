/**
 * state-manager.ts (core/sync) 测试
 * 测试同步状态管理器
 */
import { SyncStateManager } from "@src/core/sync/state-manager";
import browser from "webextension-polyfill";
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SyncStateManager", () => {
  let manager: SyncStateManager;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetMockStore();
    manager = new SyncStateManager();
  });

  describe("getState", () => {
    it("无状态时返回 null", async () => {
      const result = await manager.getState("https://webdav.example.com");
      expect(result).toBeNull();
    });

    it("URL 匹配时返回状态", async () => {
      const state = {
        time: Date.now(),
        url: "https://webdav.example.com",
        type: "upload" as const,
      };
      await browser.storage.local.set({ syncState: state });

      const result = await manager.getState("https://webdav.example.com");
      expect(result).toEqual(state);
    });

    it("URL 不匹配时返回 null", async () => {
      const state = {
        time: Date.now(),
        url: "https://other.example.com",
        type: "upload" as const,
      };
      await browser.storage.local.set({ syncState: state });

      const result = await manager.getState("https://webdav.example.com");
      expect(result).toBeNull();
    });
  });

  describe("setState", () => {
    it("正确存储状态", async () => {
      const state = {
        time: 1234567890,
        url: "https://webdav.example.com",
        type: "download" as const,
      };
      await manager.setState(state);

      const stored = await browser.storage.local.get("syncState");
      expect(stored.syncState).toEqual(state);
    });
  });

  describe("getLastSyncTime", () => {
    it("无状态时返回 0", async () => {
      const time = await manager.getLastSyncTime("https://webdav.example.com");
      expect(time).toBe(0);
    });

    it("有匹配状态时返回时间戳", async () => {
      const state = {
        time: 1234567890,
        url: "https://webdav.example.com",
        type: "upload" as const,
      };
      await browser.storage.local.set({ syncState: state });

      const time = await manager.getLastSyncTime("https://webdav.example.com");
      expect(time).toBe(1234567890);
    });

    it("URL 不匹配时返回 0", async () => {
      const state = {
        time: 1234567890,
        url: "https://other.example.com",
        type: "upload" as const,
      };
      await browser.storage.local.set({ syncState: state });

      const time = await manager.getLastSyncTime("https://webdav.example.com");
      expect(time).toBe(0);
    });
  });
});
