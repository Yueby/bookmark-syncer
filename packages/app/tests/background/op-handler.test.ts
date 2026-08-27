/**
 * background/op-handler.ts 测试
 * 验证消息分发、参数映射和错误包装
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  testConnection: vi.fn(),
  smartPush: vi.fn(),
  smartPull: vi.fn(),
  smartSync: vi.fn(),
  restoreFromCloudBackup: vi.fn(),
}));

vi.mock("@src/infrastructure/http/webdav-client", () => ({
  getWebDAVClient: vi.fn(() => ({
    testConnection: (...args: any[]) => mocks.testConnection(...args),
  })),
}));

vi.mock("@src/core/sync", () => ({
  smartPush: (...args: any[]) => mocks.smartPush(...args),
  smartPull: (...args: any[]) => mocks.smartPull(...args),
  smartSync: (...args: any[]) => mocks.smartSync(...args),
  restoreFromCloudBackup: (...args: any[]) => mocks.restoreFromCloudBackup(...args),
}));

import { registerBackgroundOpHandler } from "@src/background/op-handler";

const CONFIG = { url: "https://dav.example.com", username: "u", password: "p" };

let listener: (message: any) => any;

describe("BackgroundOpHandler", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    __resetMockStore();
    // 模块内有防重复注册标志，重置模块让每个测试拿到干净实例。
    // 注意：resetModules 后 webextension-polyfill 也会重新实例化，
    // 必须动态导入拿到与被测模块相同的实例，否则捕获不到监听器
    vi.resetModules();
    const mod = await import("@src/background/op-handler");
    const browserMod = (await import("webextension-polyfill")).default;
    mod.registerBackgroundOpHandler();
    listener = vi.mocked(browserMod.runtime.onMessage.addListener).mock.calls[0][0] as any;
  });

  it("webdav:test 成功时返回 { ok: true } 并透传 config", async () => {
    mocks.testConnection.mockResolvedValueOnce(true);

    const result = await listener({ type: "webdav:test", config: CONFIG });

    expect(mocks.testConnection).toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("webdav:test 失败时返回 { ok: false, error }（不抛出）", async () => {
    mocks.testConnection.mockRejectedValueOnce(new Error("认证失败"));

    const result = await listener({ type: "webdav:test", config: CONFIG });

    expect(result).toEqual({ ok: false, error: "认证失败" });
  });

  it("sync:push 映射到 smartPush(config, 'manual')", async () => {
    mocks.smartPush.mockResolvedValueOnce({ success: true, action: "uploaded", message: "上传成功" });

    const result = await listener({ type: "sync:push", config: CONFIG });

    expect(mocks.smartPush).toHaveBeenCalledWith(CONFIG, "manual");
    expect(result.success).toBe(true);
  });

  it("sync:pull 映射到 smartPull(config, 'manual', mode)", async () => {
    mocks.smartPull.mockResolvedValueOnce({ success: true, action: "downloaded", message: "恢复成功" });

    const result = await listener({ type: "sync:pull", config: CONFIG, mode: "merge" });

    expect(mocks.smartPull).toHaveBeenCalledWith(CONFIG, "manual", "merge");
    expect(result.success).toBe(true);
  });

  it("sync:smart 映射到 smartSync(config, 'manual')", async () => {
    mocks.smartSync.mockResolvedValueOnce({
      success: true,
      action: "uploaded",
      message: "同步成功",
      needsConflictResolution: false,
    });

    const result = await listener({ type: "sync:smart", config: CONFIG });

    expect(mocks.smartSync).toHaveBeenCalledWith(CONFIG, "manual");
    expect(result.needsConflictResolution).toBe(false);
  });

  it("sync:restoreCloudBackup 映射到 restoreFromCloudBackup(config, path, 'manual')", async () => {
    mocks.restoreFromCloudBackup.mockResolvedValueOnce({ success: true, action: "downloaded", message: "恢复成功" });

    const result = await listener({
      type: "sync:restoreCloudBackup",
      config: CONFIG,
      path: "BookmarkSyncer/bookmarks_1.json.gz",
    });

    expect(mocks.restoreFromCloudBackup).toHaveBeenCalledWith(
      CONFIG,
      "BookmarkSyncer/bookmarks_1.json.gz",
      "manual",
    );
    expect(result.success).toBe(true);
  });

  it("策略抛错时包装为统一的错误结果", async () => {
    mocks.smartPush.mockRejectedValueOnce(new Error("network down"));

    const result = await listener({ type: "sync:push", config: CONFIG });

    expect(result).toEqual({ success: false, action: "error", message: "network down" });
  });

  it("无关消息返回 undefined（不吞掉其他监听器的消息）", async () => {
    const result = await listener({ type: "someOtherMessage" });
    expect(result).toBeUndefined();
    expect(mocks.smartPush).not.toHaveBeenCalled();
  });

  it("重复注册不会产生多个监听器", async () => {
    const mod = await import("@src/background/op-handler");
    const browserMod = (await import("webextension-polyfill")).default;
    mod.registerBackgroundOpHandler();
    mod.registerBackgroundOpHandler();
    expect(browserMod.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
  });
});
