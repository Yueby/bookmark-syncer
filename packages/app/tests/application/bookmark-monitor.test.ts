/**
 * bookmark-monitor.ts 测试
 * 测试书签变化监听和防抖同步
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIsRestoring: vi.fn(),
  getWebDAVConfig: vi.fn(),
  executeUpload: vi.fn(),
}));

vi.mock("@src/application/state-manager", () => ({
  getIsRestoring: (...args: any[]) => mocks.getIsRestoring(...args),
  getWebDAVConfig: (...args: any[]) => mocks.getWebDAVConfig(...args),
}));

vi.mock("@src/application/sync-executor", () => ({
  executeUpload: (...args: any[]) => mocks.executeUpload(...args),
}));

import {
  handleDebounceAlarm,
  registerBookmarkListeners,
  triggerDebouncedSync,
} from "@src/application/bookmark-monitor";
import { DEBOUNCE_ALARM } from "@src/application/constants";
import browser from "webextension-polyfill";

describe("bookmark-monitor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getIsRestoring.mockResolvedValue(false);
    mocks.getWebDAVConfig.mockResolvedValue({ autoSyncEnabled: true });
    mocks.executeUpload.mockResolvedValue(undefined);
    vi.mocked(browser.alarms.create).mockResolvedValue(undefined as any);
    vi.mocked(browser.alarms.clear).mockResolvedValue(true);
  });

  // ─── triggerDebouncedSync ───

  describe("triggerDebouncedSync", () => {
    it("创建防抖 alarm", async () => {
      await triggerDebouncedSync();
      expect(browser.alarms.create).toHaveBeenCalledWith(
        DEBOUNCE_ALARM,
        expect.objectContaining({ when: expect.any(Number) })
      );
    });

    it("清除旧的防抖 alarm 后创建新的", async () => {
      await triggerDebouncedSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(DEBOUNCE_ALARM);
      expect(browser.alarms.create).toHaveBeenCalledWith(
        DEBOUNCE_ALARM,
        expect.anything()
      );
    });

    it("恢复中跳过", async () => {
      mocks.getIsRestoring.mockResolvedValueOnce(true);
      await triggerDebouncedSync();
      expect(browser.alarms.create).not.toHaveBeenCalled();
    });
  });

  // ─── handleDebounceAlarm ───

  describe("handleDebounceAlarm", () => {
    it("匹配 alarm 时执行上传", async () => {
      const alarm = { name: DEBOUNCE_ALARM, scheduledTime: Date.now() };
      await handleDebounceAlarm(alarm as any);
      expect(mocks.executeUpload).toHaveBeenCalled();
    });

    it("不匹配 alarm 名称时跳过", async () => {
      const alarm = { name: "otherAlarm", scheduledTime: Date.now() };
      await handleDebounceAlarm(alarm as any);
      expect(mocks.executeUpload).not.toHaveBeenCalled();
    });

    it("自动同步禁用时跳过上传", async () => {
      mocks.getWebDAVConfig.mockResolvedValueOnce({ autoSyncEnabled: false });
      const alarm = { name: DEBOUNCE_ALARM, scheduledTime: Date.now() };
      await handleDebounceAlarm(alarm as any);
      expect(mocks.executeUpload).not.toHaveBeenCalled();
    });
  });

  // ─── registerBookmarkListeners ───

  describe("registerBookmarkListeners", () => {
    it("注册 4 种书签事件", () => {
      registerBookmarkListeners();
      expect(browser.bookmarks.onCreated?.addListener).toHaveBeenCalled();
      expect(browser.bookmarks.onRemoved?.addListener).toHaveBeenCalled();
      expect(browser.bookmarks.onChanged?.addListener).toHaveBeenCalled();
      expect(browser.bookmarks.onMoved?.addListener).toHaveBeenCalled();
    });
  });
});
