/**
 * sync-executor.ts 测试
 * 测试上传和拉取执行器
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getIsRestoring: vi.fn(),
  setIsRestoring: vi.fn(),
  getWebDAVConfig: vi.fn(),
  getCloudInfo: vi.fn(),
  smartPush: vi.fn(),
  smartPull: vi.fn(),
}));

vi.mock("@src/application/state-manager", () => ({
  getIsRestoring: (...args: any[]) => mocks.getIsRestoring(...args),
  setIsRestoring: (...args: any[]) => mocks.setIsRestoring(...args),
  getWebDAVConfig: (...args: any[]) => mocks.getWebDAVConfig(...args),
}));

vi.mock("@src/core/sync", () => ({
  getCloudInfo: (...args: any[]) => mocks.getCloudInfo(...args),
  smartPush: (...args: any[]) => mocks.smartPush(...args),
  smartPull: (...args: any[]) => mocks.smartPull(...args),
}));

import { executeAutoPull, executeUpload } from "@src/application/sync-executor";
import { POST_PULL_UPLOAD_SUPPRESSION_MS } from "@src/application/constants";
import browser from "webextension-polyfill";

const config = { url: "https://dav.example.com", username: "u", password: "p" };

describe("executeUpload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 默认状态：在线、未恢复、有配置、自动同步已启用
    mocks.getIsRestoring.mockResolvedValue(false);
    mocks.setIsRestoring.mockResolvedValue(undefined);
    mocks.getWebDAVConfig.mockResolvedValue({
      config,
      autoSyncEnabled: true,
    });
    mocks.getCloudInfo.mockResolvedValue({ exists: false });
    mocks.smartPush.mockResolvedValue({
      success: true,
      action: "uploaded",
      message: "ok",
    });
    mocks.smartPull.mockResolvedValue({
      success: true,
      action: "downloaded",
      message: "ok",
    });
    // mock storage.local.get for sync state
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.alarms.create).mockResolvedValue(undefined as any);
  });

  it("正常上传", async () => {
    await executeUpload();
    expect(mocks.smartPush).toHaveBeenCalled();
  });

  it("恢复中跳过上传", async () => {
    mocks.getIsRestoring.mockResolvedValueOnce(true);
    await executeUpload();
    expect(mocks.smartPush).not.toHaveBeenCalled();
  });

  it("离线跳过上传", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    await executeUpload();
    expect(mocks.smartPush).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("无配置跳过上传", async () => {
    mocks.getWebDAVConfig.mockResolvedValueOnce({
      config: null,
      autoSyncEnabled: true,
    });
    await executeUpload();
    expect(mocks.smartPush).not.toHaveBeenCalled();
  });

  it("自动同步禁用时跳过上传", async () => {
    mocks.getWebDAVConfig.mockResolvedValueOnce({
      config,
      autoSyncEnabled: false,
    });
    await executeUpload();
    expect(mocks.smartPush).not.toHaveBeenCalled();
  });

  it("最近下载后跳过自动上传", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
        syncState: {
          url: config.url,
          time: now - 30000,
          type: "download",
        },
      });

      await executeUpload();

      expect(mocks.getCloudInfo).not.toHaveBeenCalled();
      expect(mocks.smartPull).not.toHaveBeenCalled();
      expect(mocks.smartPush).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("最近恢复后跳过自动上传", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
        syncState: {
          url: config.url,
          time: now - 30000,
          type: "restore",
        },
      });

      await executeUpload();

      expect(mocks.getCloudInfo).not.toHaveBeenCalled();
      expect(mocks.smartPull).not.toHaveBeenCalled();
      expect(mocks.smartPush).not.toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("下载抑制窗口结束后继续自动上传", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
        syncState: {
          url: config.url,
          time: now - POST_PULL_UPLOAD_SUPPRESSION_MS - 1,
          type: "download",
        },
      });

      await executeUpload();

      expect(mocks.getCloudInfo).toHaveBeenCalled();
      expect(mocks.smartPush).toHaveBeenCalled();
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("云端有更新时先 pull 再 push", async () => {
    const syncState = { url: config.url, time: 1000 };
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
      syncState,
    });
    mocks.getCloudInfo.mockResolvedValueOnce({
      exists: true,
      timestamp: 2000, // 比 lastSyncTime 新
    });

    await executeUpload();
    expect(mocks.smartPull).toHaveBeenCalledBefore(mocks.smartPush);
  });

  it("pull 失败时不继续 push", async () => {
    const syncState = { url: config.url, time: 1000 };
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
      syncState,
    });
    mocks.getCloudInfo.mockResolvedValueOnce({
      exists: true,
      timestamp: 2000,
    });
    mocks.smartPull.mockResolvedValueOnce({
      success: false,
      action: "error",
      message: "pull failed",
    });

    await executeUpload();
    expect(mocks.smartPush).not.toHaveBeenCalled();
  });
});

describe("executeAutoPull", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getIsRestoring.mockResolvedValue(false);
    mocks.setIsRestoring.mockResolvedValue(undefined);
    mocks.getWebDAVConfig.mockResolvedValue({ config });
    mocks.getCloudInfo.mockResolvedValue({
      exists: true,
      timestamp: 5000,
      totalCount: 100,
    });
    mocks.smartPull.mockResolvedValue({
      success: true,
      action: "downloaded",
      message: "ok",
    });
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    vi.mocked(browser.alarms.create).mockResolvedValue(undefined as any);
  });

  it("检测到云端更新时执行 pull", async () => {
    await executeAutoPull();
    expect(mocks.smartPull).toHaveBeenCalled();
  });

  it("恢复中跳过 pull", async () => {
    mocks.getIsRestoring.mockResolvedValueOnce(true);
    await executeAutoPull();
    expect(mocks.smartPull).not.toHaveBeenCalled();
  });

  it("离线跳过 pull", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    await executeAutoPull();
    expect(mocks.smartPull).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("无配置跳过 pull", async () => {
    mocks.getWebDAVConfig.mockResolvedValueOnce({ config: null });
    await executeAutoPull();
    expect(mocks.smartPull).not.toHaveBeenCalled();
  });

  it("无云端备份时不 pull", async () => {
    mocks.getCloudInfo.mockResolvedValueOnce({ exists: false });
    await executeAutoPull();
    expect(mocks.smartPull).not.toHaveBeenCalled();
  });

  it("云端时间不新于本地时不 pull", async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
      syncState: { url: config.url, time: 5000 },
    });
    mocks.getCloudInfo.mockResolvedValueOnce({
      exists: true,
      timestamp: 5000, // 等于 lastSyncTime
    });
    await executeAutoPull();
    expect(mocks.smartPull).not.toHaveBeenCalled();
  });

  it("pull 错误时不误清恢复状态（恢复状态只能由恢复操作自己管理）", async () => {
    mocks.smartPull.mockRejectedValueOnce(new Error("network error"));
    await executeAutoPull();
    // 错误被吞掉并记录，但不能清除并发的恢复操作设置的 isRestoring 标志
    expect(mocks.setIsRestoring).not.toHaveBeenCalled();
  });
});
