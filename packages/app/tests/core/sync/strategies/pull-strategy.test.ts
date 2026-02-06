/**
 * pull-strategy.ts 测试
 * 验证 skipLock 修复 + 基本拉取流程
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 提升后仍可访问
const {
  mockAcquire,
  mockRelease,
  mockSetSyncState,
  mockClient,
  mockGetTree,
  mockRestoreFromBackup,
  mockMergeFromBackup,
  mockCountBookmarks,
  mockCreateSnapshot,
  mockGetLatestBackupFile,
  mockParseBackupFileName,
  mockGetFileWithDedup,
} = vi.hoisted(() => ({
  mockAcquire: vi.fn(async () => true),
  mockRelease: vi.fn(async () => {}),
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
  mockGetTree: vi.fn(async () => [{ title: "Test", url: "https://test.com" }]),
  mockRestoreFromBackup: vi.fn(async () => {}),
  mockMergeFromBackup: vi.fn(async () => {}),
  mockCountBookmarks: vi.fn(() => 1),
  mockCreateSnapshot: vi.fn(async () => {}),
  mockGetLatestBackupFile: vi.fn(async () => "BookmarkSyncer/backup.json.gz"),
  mockParseBackupFileName: vi.fn(() => ({
    timestamp: Date.now(),
    browser: "chrome",
    count: 50,
    revisionNumber: 1,
  })),
  mockGetFileWithDedup: vi.fn(async () =>
    JSON.stringify({
      metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
      data: [{ title: "Cloud Bookmark", url: "https://cloud.com" }],
    })
  ),
}));

// --- Mock 模块 ---
vi.mock("@src/infrastructure/http/webdav-client", () => ({
  getWebDAVClient: vi.fn(() => mockClient),
}));

vi.mock("@src/core/bookmark", () => ({
  bookmarkRepository: {
    getTree: mockGetTree,
    restoreFromBackup: mockRestoreFromBackup,
    mergeFromBackup: mockMergeFromBackup,
  },
  countBookmarks: mockCountBookmarks,
}));

vi.mock("@src/core/backup", () => ({
  snapshotManager: { createSnapshot: mockCreateSnapshot },
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

vi.mock("@src/core/sync/lock-manager", () => ({
  acquireSyncLock: mockAcquire,
  releaseSyncLock: mockRelease,
}));

vi.mock("@src/core/sync/state-manager", () => ({
  setSyncState: mockSetSyncState,
}));

import { smartPull } from "@src/core/sync/strategies/pull-strategy";

const testConfig = {
  url: "https://dav.example.com",
  username: "user",
  password: "pass",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAcquire.mockResolvedValue(true);
  mockGetLatestBackupFile.mockResolvedValue("BookmarkSyncer/backup.json.gz");
  mockGetFileWithDedup.mockResolvedValue(
    JSON.stringify({
      metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
      data: [{ title: "Cloud Bookmark", url: "https://cloud.com" }],
    })
  );

  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
});

describe("smartPull - 基本流程", () => {
  it("正常拉取（overwrite 模式）", async () => {
    const result = await smartPull(testConfig, "manual", "overwrite");

    expect(result.success).toBe(true);
    expect(result.action).toBe("downloaded");
    expect(mockRestoreFromBackup).toHaveBeenCalledTimes(1);
    expect(mockMergeFromBackup).not.toHaveBeenCalled();
  });

  it("合并拉取（merge 模式）", async () => {
    const result = await smartPull(testConfig, "manual", "merge");

    expect(result.success).toBe(true);
    expect(result.action).toBe("downloaded");
    expect(mockMergeFromBackup).toHaveBeenCalledTimes(1);
    expect(mockRestoreFromBackup).not.toHaveBeenCalled();
  });

  it("云端无备份时返回错误", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce(null);

    const result = await smartPull(testConfig, "manual");

    expect(result.success).toBe(false);
    expect(result.message).toContain("云端无备份");
  });

  it("网络断开时返回错误", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });

    const result = await smartPull(testConfig, "manual");
    expect(result.success).toBe(false);
  });
});

describe("smartPull - skipLock 修复", () => {
  it("skipLock=true 时不获取/释放锁", async () => {
    const result = await smartPull(testConfig, "manual", "overwrite", {
      skipLock: true,
    });

    expect(result.success).toBe(true);
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("skipLock=false 时正常获取/释放锁", async () => {
    const result = await smartPull(testConfig, "manual", "overwrite", {
      skipLock: false,
    });

    expect(result.success).toBe(true);
    expect(mockAcquire).toHaveBeenCalledWith("manual");
    expect(mockRelease).toHaveBeenCalledWith("manual");
  });

  it("默认（无 options）获取/释放锁", async () => {
    const result = await smartPull(testConfig, "manual");

    expect(result.success).toBe(true);
    expect(mockAcquire).toHaveBeenCalledWith("manual");
    expect(mockRelease).toHaveBeenCalledWith("manual");
  });

  it("skipLock=false 且无法获取锁时返回错误", async () => {
    mockAcquire.mockResolvedValueOnce(false);
    const result = await smartPull(testConfig, "manual");

    expect(result.success).toBe(false);
    expect(result.message).toContain("同步正在进行中");
  });
});
