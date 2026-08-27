/**
 * application/index.ts（自动同步启动）测试
 * 重点验证启动检查的会话级去重（storage.session）和自动同步开关
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWebDAVConfig: vi.fn(),
  executeAutoPull: vi.fn(),
  registerBookmarkListeners: vi.fn(),
  registerAlarmListener: vi.fn(),
}));

vi.mock("@src/application/state-manager", () => ({
  getWebDAVConfig: (...args: any[]) => mocks.getWebDAVConfig(...args),
}));

vi.mock("@src/application/sync-executor", () => ({
  executeAutoPull: (...args: any[]) => mocks.executeAutoPull(...args),
}));

vi.mock("@src/application/bookmark-monitor", () => ({
  registerBookmarkListeners: (...args: any[]) => mocks.registerBookmarkListeners(...args),
}));

vi.mock("@src/application/scheduler", () => ({
  registerAlarmListener: (...args: any[]) => mocks.registerAlarmListener(...args),
}));

import {
  checkCloudOnStartup,
  clearStartupCheckFlag,
  startAutoSync,
} from "@src/application/index";

describe("startAutoSync 启动检查去重", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetMockStore();
    mocks.getWebDAVConfig.mockResolvedValue({
      config: { url: "https://dav.example.com", username: "u", password: "p" },
      autoSyncEnabled: true,
      scheduledSyncEnabled: true,
      scheduledSyncInterval: 30,
    });
    mocks.executeAutoPull.mockResolvedValue(undefined);
    vi.useFakeTimers();
  });

  it("首次调用在 3 秒延迟后执行启动拉取", async () => {
    startAutoSync();

    // 3 秒延迟内不执行
    expect(mocks.executeAutoPull).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(1);
  });

  it("同一浏览器会话内再次调用（模拟 SW 冷启动）不重复拉取", async () => {
    startAutoSync();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(1);

    // 模拟 Service Worker 被 书签/闹钟事件唤醒后再次调用 startAutoSync
    startAutoSync();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(1);
  });

  it("安装/更新后清除会话标志，允许重新检查", async () => {
    startAutoSync();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(1);

    await clearStartupCheckFlag();

    startAutoSync();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(2);
  });

  it("自动同步开关关闭时启动检查被跳过", async () => {
    mocks.getWebDAVConfig.mockResolvedValue({
      config: { url: "https://dav.example.com", username: "u", password: "p" },
      autoSyncEnabled: false,
      scheduledSyncEnabled: false,
      scheduledSyncInterval: 30,
    });

    startAutoSync();
    await vi.advanceTimersByTimeAsync(3000);
    expect(mocks.executeAutoPull).not.toHaveBeenCalled();
  });
});

describe("checkCloudOnStartup", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetMockStore();
    vi.useFakeTimers();
  });

  it("自动同步关闭时直接返回，不执行拉取", async () => {
    mocks.getWebDAVConfig.mockResolvedValue({ autoSyncEnabled: false });

    await checkCloudOnStartup();
    expect(mocks.executeAutoPull).not.toHaveBeenCalled();
  });

  it("自动同步开启时在 3 秒延迟后执行拉取", async () => {
    mocks.getWebDAVConfig.mockResolvedValue({ autoSyncEnabled: true });
    mocks.executeAutoPull.mockResolvedValue(undefined);

    const promise = checkCloudOnStartup();
    expect(mocks.executeAutoPull).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(3000);
    await promise;
    expect(mocks.executeAutoPull).toHaveBeenCalledTimes(1);
  });
});
