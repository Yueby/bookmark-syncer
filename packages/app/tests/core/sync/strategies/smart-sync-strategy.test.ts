/**
 * smart-sync-strategy.ts 测试
 * 验证锁传递修复：smartSync 持有锁全程传递给子策略
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 提升后仍可访问
const {
  mockAcquire,
  mockRelease,
  mockGetLastSyncTime,
  mockSetSyncState,
  mockClient,
  mockGetTree,
  mockCompareWithCloud,
  mockCountBookmarks,
  mockGetLatestBackupFile,
  mockParseBackupFileName,
  mockGetFileWithDedup,
  mockSmartPush,
  mockSmartPull,
  mockBookmarkTree,
} = vi.hoisted(() => {
  const tree = [{ title: "Test", url: "https://test.com" }];
  return {
    mockAcquire: vi.fn(async () => true),
    mockRelease: vi.fn(async () => {}),
    mockGetLastSyncTime: vi.fn(async () => 0),
    mockSetSyncState: vi.fn(async () => {}),
    mockClient: {
      testConnection: vi.fn(async () => true),
      putFile: vi.fn(async () => {}),
      getFile: vi.fn(async () => ""),
      createDirectory: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
      listFiles: vi.fn(async () => []),
      deleteFile: vi.fn(async () => {}),
    },
    mockGetTree: vi.fn(async () => tree),
    mockCompareWithCloud: vi.fn(async () => false),
    mockCountBookmarks: vi.fn(() => 1),
    mockGetLatestBackupFile: vi.fn(async () => null),
    mockParseBackupFileName: vi.fn(() => null),
    mockGetFileWithDedup: vi.fn(async () => null),
    mockSmartPush: vi.fn(async () => ({
      success: true,
      action: "uploaded" as const,
      message: "上传成功",
    })),
    mockSmartPull: vi.fn(async () => ({
      success: true,
      action: "downloaded" as const,
      message: "同步完成",
    })),
    mockBookmarkTree: tree,
  };
});

// --- Mock 模块 ---
vi.mock("@src/core/sync", () => ({
  acquireSyncLock: mockAcquire,
  releaseSyncLock: mockRelease,
  getLastSyncTime: mockGetLastSyncTime,
  setSyncState: mockSetSyncState,
}));

vi.mock("@src/infrastructure/http/webdav-client", () => ({
  getWebDAVClient: vi.fn(() => mockClient),
}));

vi.mock("@src/core/bookmark", () => ({
  bookmarkRepository: { getTree: mockGetTree },
  compareWithCloud: mockCompareWithCloud,
  countBookmarks: mockCountBookmarks,
}));

vi.mock("@src/core/storage", () => ({
  fileManager: {
    getLatestBackupFile: mockGetLatestBackupFile,
    parseBackupFileName: mockParseBackupFileName,
  },
}));

vi.mock("@src/core/storage/queue-manager", () => ({
  queueManager: { getFileWithDedup: mockGetFileWithDedup },
}));

vi.mock("@src/core/sync/strategies/push-strategy", () => ({
  smartPush: (...args: unknown[]) => mockSmartPush(...args),
}));

vi.mock("@src/core/sync/strategies/pull-strategy", () => ({
  smartPull: (...args: unknown[]) => mockSmartPull(...args),
}));

import { smartSync } from "@src/core/sync/strategies/smart-sync-strategy";

const testConfig = {
  url: "https://dav.example.com",
  username: "user",
  password: "pass",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAcquire.mockResolvedValue(true);
  mockGetLatestBackupFile.mockResolvedValue(null);
  mockGetFileWithDedup.mockResolvedValue(null);
  mockCompareWithCloud.mockResolvedValue(false);
  mockSmartPush.mockResolvedValue({
    success: true,
    action: "uploaded" as const,
    message: "上传成功",
  });
  mockSmartPull.mockResolvedValue({
    success: true,
    action: "downloaded" as const,
    message: "同步完成",
  });

  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
});

describe("smartSync - 分支决策", () => {
  it("云端无数据时调用 smartPush（skipLock: true）", async () => {
    const result = await smartSync(testConfig, "auto-sync");

    expect(result.success).toBe(true);
    expect(mockSmartPush).toHaveBeenCalledWith(
      testConfig,
      "auto-sync",
      { skipLock: true }
    );
    expect(mockSmartPull).not.toHaveBeenCalled();
  });

  it("云端更新时调用 smartPull（skipLock: true）", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
        data: [{ title: "Cloud", url: "https://cloud.com" }],
      })
    );
    mockCompareWithCloud.mockResolvedValueOnce(false);
    mockGetLastSyncTime.mockResolvedValueOnce(Date.now() - 60000);

    await smartSync(testConfig, "auto-sync");

    expect(mockSmartPull).toHaveBeenCalledWith(
      testConfig,
      "auto-sync",
      "overwrite",
      { skipLock: true }
    );
  });

  it("本地更新时调用 smartPush（skipLock: true）", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: Date.now() - 60000, clientVersion: "1.0.0" },
        data: [{ title: "Cloud", url: "https://cloud.com" }],
      })
    );
    mockCompareWithCloud.mockResolvedValueOnce(false);
    mockGetLastSyncTime.mockResolvedValueOnce(Date.now());

    await smartSync(testConfig, "auto-sync");

    expect(mockSmartPush).toHaveBeenCalledWith(
      testConfig,
      "auto-sync",
      { skipLock: true }
    );
  });

  it("内容相同时跳过", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
        data: mockBookmarkTree,
      })
    );
    mockCompareWithCloud.mockResolvedValueOnce(true);

    const result = await smartSync(testConfig, "auto-sync");

    expect(result.action).toBe("skipped");
    expect(mockSmartPush).not.toHaveBeenCalled();
    expect(mockSmartPull).not.toHaveBeenCalled();
  });

  it("首次同步需要用户选择", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockParseBackupFileName.mockReturnValueOnce({
      timestamp: Date.now(),
      browser: "chrome",
      count: 100,
      revisionNumber: 1,
    });
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
        data: [{ title: "Cloud", url: "https://cloud.com" }],
      })
    );
    mockCompareWithCloud.mockResolvedValueOnce(false);
    mockGetLastSyncTime.mockResolvedValueOnce(0);

    const result = await smartSync(testConfig, "auto-sync");

    expect(result.needsConflictResolution).toBe(true);
    expect(mockSmartPush).not.toHaveBeenCalled();
    expect(mockSmartPull).not.toHaveBeenCalled();
  });
});

describe("smartSync - 锁传递修复", () => {
  it("不在子策略调用前释放锁", async () => {
    await smartSync(testConfig, "auto-sync");

    expect(mockAcquire).toHaveBeenCalledTimes(1);
    expect(mockAcquire).toHaveBeenCalledWith("auto-sync");

    if (mockSmartPush.mock.calls.length > 0) {
      expect(mockSmartPush.mock.calls[0][2]).toEqual({ skipLock: true });
    }
  });

  it("finally 中释放锁", async () => {
    await smartSync(testConfig, "auto-sync");

    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith("auto-sync");
  });

  it("异常时 finally 也释放锁", async () => {
    mockSmartPush.mockRejectedValueOnce(new Error("Network error"));

    const result = await smartSync(testConfig, "auto-sync");

    expect(result.success).toBe(false);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("网络离线时不获取锁", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });

    const result = await smartSync(testConfig, "auto-sync");
    expect(result.success).toBe(false);
    expect(mockAcquire).not.toHaveBeenCalled();
  });
});
