/**
 * scheduler.ts 测试
 * 测试定时同步调度器
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWebDAVConfig: vi.fn(),
  setIsRestoring: vi.fn(),
  executeAutoPull: vi.fn(),
  handleDebounceAlarm: vi.fn(),
}));

vi.mock("@src/application/state-manager", () => ({
  getWebDAVConfig: (...args: any[]) => mocks.getWebDAVConfig(...args),
  setIsRestoring: (...args: any[]) => mocks.setIsRestoring(...args),
}));

vi.mock("@src/application/sync-executor", () => ({
  executeAutoPull: (...args: any[]) => mocks.executeAutoPull(...args),
}));

vi.mock("@src/application/bookmark-monitor", () => ({
  handleDebounceAlarm: (...args: any[]) => mocks.handleDebounceAlarm(...args),
}));

import {
  registerAlarmListener,
  resetScheduledSync,
  startScheduledSync,
  stopScheduledSync,
  updateScheduledSync,
} from "@src/application/scheduler";
import { ALARM_NAME } from "@src/application/constants";
import browser from "webextension-polyfill";

describe("scheduler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getWebDAVConfig.mockResolvedValue({
      config: { url: "https://dav.example.com", username: "u", password: "p" },
      autoSyncEnabled: true,
      scheduledSyncEnabled: true,
      scheduledSyncInterval: 30,
    });
    mocks.executeAutoPull.mockResolvedValue(undefined);
    mocks.setIsRestoring.mockResolvedValue(undefined);
    mocks.handleDebounceAlarm.mockResolvedValue(undefined);
    vi.mocked(browser.alarms.create).mockResolvedValue(undefined as any);
    vi.mocked(browser.alarms.clear).mockResolvedValue(true);
    vi.mocked(browser.alarms.get).mockResolvedValue(null as any);
  });

  // ─── startScheduledSync ───

  describe("startScheduledSync", () => {
    it("定时同步启用时创建 alarm", async () => {
      await startScheduledSync();
      expect(browser.alarms.create).toHaveBeenCalledWith(
        ALARM_NAME,
        expect.objectContaining({
          periodInMinutes: 30,
          when: expect.any(Number),
        })
      );
    });

    it("定时同步禁用时清除 alarm", async () => {
      mocks.getWebDAVConfig.mockResolvedValueOnce({
        scheduledSyncEnabled: false,
        scheduledSyncInterval: 30,
      });
      await startScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
      expect(browser.alarms.create).not.toHaveBeenCalled();
    });

    it("已存在且周期相同的 alarm 不重建", async () => {
      vi.mocked(browser.alarms.get).mockResolvedValueOnce({
        name: ALARM_NAME,
        periodInMinutes: 30,
        scheduledTime: Date.now() + 60000,
      });
      await startScheduledSync();
      expect(browser.alarms.create).not.toHaveBeenCalled();
    });

    it("周期变更时重建 alarm", async () => {
      vi.mocked(browser.alarms.get).mockResolvedValueOnce({
        name: ALARM_NAME,
        periodInMinutes: 15, // 旧周期
        scheduledTime: Date.now() + 60000,
      });
      await startScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
      expect(browser.alarms.create).toHaveBeenCalledWith(
        ALARM_NAME,
        expect.objectContaining({ periodInMinutes: 30 })
      );
    });
  });

  // ─── stopScheduledSync ───

  describe("stopScheduledSync", () => {
    it("清除定时 alarm", async () => {
      await stopScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
    });
  });

  // ─── updateScheduledSync ───

  describe("updateScheduledSync", () => {
    it("启用时重建 alarm", async () => {
      await updateScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
      expect(browser.alarms.create).toHaveBeenCalled();
    });

    it("禁用时清除 alarm", async () => {
      mocks.getWebDAVConfig.mockResolvedValueOnce({
        scheduledSyncEnabled: false,
        scheduledSyncInterval: 30,
      });
      await updateScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
      expect(browser.alarms.create).not.toHaveBeenCalled();
    });
  });

  // ─── resetScheduledSync ───

  describe("resetScheduledSync", () => {
    it("重置定时器", async () => {
      await resetScheduledSync();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
      expect(browser.alarms.create).toHaveBeenCalledWith(
        ALARM_NAME,
        expect.objectContaining({ periodInMinutes: 30 })
      );
    });

    it("定时同步未启用时不操作", async () => {
      mocks.getWebDAVConfig.mockResolvedValueOnce({
        scheduledSyncEnabled: false,
        scheduledSyncInterval: 30,
      });
      await resetScheduledSync();
      expect(browser.alarms.clear).not.toHaveBeenCalled();
    });
  });

  // ─── registerAlarmListener ───

  describe("registerAlarmListener", () => {
    it("注册 alarm 监听器", () => {
      registerAlarmListener();
      expect(browser.alarms.onAlarm.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it("防抖 alarm 路由到 handleDebounceAlarm", async () => {
      registerAlarmListener();
      const listener = vi.mocked(browser.alarms.onAlarm.addListener).mock.calls[0][0] as Function;
      await listener({ name: "autoSyncDebounce", scheduledTime: Date.now() });
      expect(mocks.handleDebounceAlarm).toHaveBeenCalled();
    });

    it("定时 alarm 路由到 executeAutoPull（启用时）", async () => {
      registerAlarmListener();
      const listener = vi.mocked(browser.alarms.onAlarm.addListener).mock.calls[0][0] as Function;
      await listener({ name: "scheduledSync", scheduledTime: Date.now() });
      expect(mocks.executeAutoPull).toHaveBeenCalled();
    });

    it("定时 alarm 禁用时清除 alarm", async () => {
      mocks.getWebDAVConfig.mockResolvedValueOnce({
        scheduledSyncEnabled: false,
      });
      registerAlarmListener();
      const listener = vi.mocked(browser.alarms.onAlarm.addListener).mock.calls[0][0] as Function;
      await listener({ name: "scheduledSync", scheduledTime: Date.now() });
      expect(mocks.executeAutoPull).not.toHaveBeenCalled();
      expect(browser.alarms.clear).toHaveBeenCalledWith(ALARM_NAME);
    });

    it("重置恢复状态 alarm 调用 setIsRestoring(false)", async () => {
      registerAlarmListener();
      const listener = vi.mocked(browser.alarms.onAlarm.addListener).mock.calls[0][0] as Function;
      await listener({ name: "resetRestoring", scheduledTime: Date.now() });
      expect(mocks.setIsRestoring).toHaveBeenCalledWith(false);
    });
  });
});
