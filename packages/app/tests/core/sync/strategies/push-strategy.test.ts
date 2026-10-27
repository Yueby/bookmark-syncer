/**
 * push-strategy.ts 测试
 * 验证原子性（先传后删）+ skipLock 修复 + 基本上传流程
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// 使用 vi.hoisted 确保 mock 变量在 vi.mock 提升后仍可访问
const {
  mockAcquire,
  mockRelease,
  mockClient,
  mockGetLastSyncTime,
  mockSetSyncState,
  mockGetBackupFileInterval,
  mockGetReadableBookmarkHtmlEnabled,
  mockGetLastBackupFileInfo,
  mockSaveLastBackupFileInfo,
  mockGetBrowserInfo,
  mockIsSameBrowser,
  mockCompressText,
  mockCreateBookmarkHtml,
  mockGetTree,
  mockCreateCloudBackup,
  mockCompareWithCloud,
  mockCountBookmarks,
  mockCreateSnapshot,
  mockGetLatestBackupFile,
  mockGenerateBackupFileName,
  mockParseBackupFileName,
  mockCleanOldBackups,
  mockClearBackupListCache,
  mockGetFileWithDedup,
  mockBookmarkTree,
} = vi.hoisted(() => {
  const tree = [
    { title: "Folder", children: [{ title: "Test", url: "https://test.com" }] },
  ];
  return {
    mockAcquire: vi.fn(async () => true),
    mockRelease: vi.fn(async () => {}),
    mockClient: {
      testConnection: vi.fn(async () => true),
      putFile: vi.fn(async () => {}),
      getFile: vi.fn(async () => ""),
      createDirectory: vi.fn(async () => {}),
      exists: vi.fn(async () => true),
      listFiles: vi.fn(async () => []),
      deleteFile: vi.fn(async () => {}),
    },
    mockGetLastSyncTime: vi.fn(async () => 0),
    mockSetSyncState: vi.fn(async () => {}),
    mockGetBackupFileInterval: vi.fn(async () => 1),
    mockGetReadableBookmarkHtmlEnabled: vi.fn(async () => false),
    mockGetLastBackupFileInfo: vi.fn(async () => null),
    mockSaveLastBackupFileInfo: vi.fn(async () => {}),
    mockGetBrowserInfo: vi.fn(() => ({ name: "Chrome", version: "120.0" })),
    mockIsSameBrowser: vi.fn(() => false),
    mockCompressText: vi.fn(async (text: string) => `compressed_${text.length}`),
    mockCreateBookmarkHtml: vi.fn(() => "<!doctype html><title>Bookmarks</title>"),
    mockGetTree: vi.fn(async () => tree),
    mockCreateCloudBackup: vi.fn(async () => ({
      metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
      data: tree,
    })),
    mockCompareWithCloud: vi.fn(async () => false),
    mockCountBookmarks: vi.fn(() => 1),
    mockCreateSnapshot: vi.fn(async () => {}),
    mockGetLatestBackupFile: vi.fn(async () => null),
    mockGenerateBackupFileName: vi.fn(() => "bookmarks_20260206_120000_chrome_1_v1.json"),
    mockParseBackupFileName: vi.fn(() => null),
    mockCleanOldBackups: vi.fn(async () => 0),
    mockClearBackupListCache: vi.fn(async () => {}),
    mockGetFileWithDedup: vi.fn(async () => null),
    mockBookmarkTree: tree,
  };
});

// --- Mock 模块 ---
vi.mock("@src/application/state-manager", () => ({
  getBackupFileInterval: mockGetBackupFileInterval,
  getReadableBookmarkHtmlEnabled: mockGetReadableBookmarkHtmlEnabled,
  getLastBackupFileInfo: mockGetLastBackupFileInfo,
  saveLastBackupFileInfo: mockSaveLastBackupFileInfo,
}));

vi.mock("@src/infrastructure/browser/info", () => ({
  getBrowserInfo: mockGetBrowserInfo,
  isSameBrowser: mockIsSameBrowser,
}));

vi.mock("@src/infrastructure/http/webdav-client", () => ({
  getWebDAVClient: vi.fn(() => mockClient),
}));

vi.mock("@src/infrastructure/utils/compression", () => ({
  compressText: mockCompressText,
}));

vi.mock("@src/infrastructure/utils/bookmark-html", () => ({
  createBookmarkHtml: mockCreateBookmarkHtml,
}));

vi.mock("@src/core/bookmark", () => ({
  bookmarkRepository: {
    getTree: mockGetTree,
    createCloudBackup: mockCreateCloudBackup,
  },
  compareWithCloud: mockCompareWithCloud,
  countBookmarks: mockCountBookmarks,
}));

vi.mock("@src/core/backup", () => ({
  snapshotManager: { createSnapshot: mockCreateSnapshot },
}));

vi.mock("@src/core/storage", () => ({
  fileManager: {
    getLatestBackupFile: mockGetLatestBackupFile,
    generateBackupFileName: mockGenerateBackupFileName,
    parseBackupFileName: mockParseBackupFileName,
    cleanOldBackups: mockCleanOldBackups,
  },
  STORAGE_CONSTANTS: {
    BACKUP_DIR: "BookmarkSyncer",
    LAST_BACKUP_FILE_KEY: "last_backup_file_info",
  },
}));

vi.mock("@src/core/storage/cache-manager", () => ({
  cacheManager: { clearBackupListCache: mockClearBackupListCache },
}));

vi.mock("@src/core/storage/queue-manager", () => ({
  queueManager: { getFileWithDedup: mockGetFileWithDedup },
}));

vi.mock("@src/core/sync/lock-manager", () => ({
  acquireSyncLock: mockAcquire,
  releaseSyncLock: mockRelease,
}));

vi.mock("@src/core/sync/state-manager", () => ({
  getLastSyncTime: mockGetLastSyncTime,
  setSyncState: mockSetSyncState,
}));

import { smartPush } from "@src/core/sync/strategies/push-strategy";

const testConfig = {
  url: "https://dav.example.com",
  username: "user",
  password: "pass",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient.putFile.mockResolvedValue(undefined);
  mockClient.deleteFile.mockResolvedValue(undefined);
  mockClient.exists.mockResolvedValue(true);
  mockAcquire.mockResolvedValue(true);
  mockGetLatestBackupFile.mockResolvedValue(null);
  mockGetLastBackupFileInfo.mockResolvedValue(null);
  mockGetReadableBookmarkHtmlEnabled.mockResolvedValue(false);
  mockGetFileWithDedup.mockResolvedValue(null);
  mockCompareWithCloud.mockResolvedValue(false);
  mockCountBookmarks.mockReturnValue(1);
  mockGenerateBackupFileName.mockReturnValue("bookmarks_20260206_120000_chrome_1_v1.json");

  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: true },
    writable: true,
    configurable: true,
  });
});

describe("smartPush - 基本流程", () => {
  it("首次上传（无云端备份）成功", async () => {
    const result = await smartPush(testConfig, "manual");

    expect(result.success).toBe(true);
    expect(result.action).toBe("uploaded");
    expect(mockClient.putFile).toHaveBeenCalledTimes(1);
  });

  it("启用可读副本时额外上传 bookmark.html", async () => {
    mockGetReadableBookmarkHtmlEnabled.mockResolvedValueOnce(true);

    const result = await smartPush(testConfig, "manual");

    expect(result.success).toBe(true);
    expect(mockClient.putFile).toHaveBeenCalledTimes(2);
    expect(mockClient.putFile).toHaveBeenNthCalledWith(
      2,
      "BookmarkSyncer/bookmark.html",
      "<!doctype html><title>Bookmarks</title>",
      "text/html; charset=utf-8",
    );
  });

  it("内容相同时跳过上传", async () => {
    const cloudTimestamp = Date.now() - 5000;
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: cloudTimestamp, clientVersion: "1.0.0" },
        data: mockBookmarkTree,
      })
    );
    // 确保 lastSyncTime >= cloudTime，避免触发"云端有更新"的阻止逻辑
    mockGetLastSyncTime.mockResolvedValueOnce(cloudTimestamp + 1000);
    mockCompareWithCloud.mockResolvedValueOnce(true);

    const result = await smartPush(testConfig, "auto-sync");
    expect(result.action).toBe("skipped");
    expect(mockClient.putFile).not.toHaveBeenCalled();
  });

  it("网络断开时返回错误", async () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });

    const result = await smartPush(testConfig, "manual");
    expect(result.success).toBe(false);
    expect(result.action).toBe("error");
  });
});

describe("smartPush - HTML 副本可靠性", () => {
  it("HTML 上传失败仍提交主备份状态并删除被替换文件", async () => {
    mockGetReadableBookmarkHtmlEnabled.mockResolvedValue(true);
    mockGetLastBackupFileInfo.mockResolvedValueOnce({
      fileName: "old.json.gz",
      filePath: "BookmarkSyncer/old.json.gz",
      createdAt: Date.now(),
      revisionNumber: 1,
    });
    mockClient.putFile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("HTML rejected"));

    const result = await smartPush(testConfig, "manual");

    expect(result.success).toBe(true);
    expect(result.action).toBe("uploaded");
    expect(result.message).toContain("HTML 副本更新失败");
    expect(mockClient.deleteFile).toHaveBeenCalledWith("BookmarkSyncer/old.json.gz");
    expect(mockSaveLastBackupFileInfo).toHaveBeenCalled();
    expect(mockClearBackupListCache).toHaveBeenCalled();
    expect(mockSetSyncState).toHaveBeenCalledWith(expect.objectContaining({ type: "upload" }));
    expect(mockSetSyncState.mock.invocationCallOrder[0]).toBeLessThan(mockClient.putFile.mock.invocationCallOrder[1]);
  });

  it("内容相同仍刷新 HTML，不重新上传主备份", async () => {
    mockGetReadableBookmarkHtmlEnabled.mockResolvedValue(true);
    const cloud = { metadata: { timestamp: 1000, clientVersion: "1.0.0" }, data: mockBookmarkTree };
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(JSON.stringify(cloud));
    mockGetLastSyncTime.mockResolvedValueOnce(2000);
    mockCompareWithCloud.mockResolvedValueOnce(true);

    const result = await smartPush(testConfig, "auto-sync");

    expect(result.success).toBe(true);
    expect(result.action).toBe("skipped");
    expect(mockClient.putFile).toHaveBeenCalledTimes(1);
    expect(mockClient.putFile).toHaveBeenCalledWith("BookmarkSyncer/bookmark.html", expect.any(String), "text/html; charset=utf-8");
    expect(mockCreateBookmarkHtml).toHaveBeenCalledWith(cloud.data, new Date(1000));
    expect(mockCreateCloudBackup).not.toHaveBeenCalled();
  });

  it("主备份上传失败时不发布 HTML", async () => {
    mockGetReadableBookmarkHtmlEnabled.mockResolvedValue(true);
    mockClient.putFile.mockRejectedValueOnce(new Error("backup rejected"));
    const result = await smartPush(testConfig, "manual");
    expect(result.success).toBe(false);
    expect(mockClient.putFile).toHaveBeenCalledTimes(1);
    expect(mockCreateBookmarkHtml).not.toHaveBeenCalled();
  });
});

describe("smartPush - 原子性修复（先传后删）", () => {
  it("时间窗口内替换: 先 putFile 后 deleteFile", async () => {
    mockGetLastBackupFileInfo.mockResolvedValueOnce({
      fileName: "old_backup.json.gz",
      filePath: "BookmarkSyncer/old_backup.json.gz",
      createdAt: Date.now() - 30000,
      revisionNumber: 1,
    });

    mockGenerateBackupFileName.mockReturnValueOnce(
      "bookmarks_20260206_120000_chrome_1_v2.json"
    );

    const result = await smartPush(testConfig, "manual");
    expect(result.success).toBe(true);

    // 验证调用顺序：先 putFile，后 deleteFile
    const putCallOrder = mockClient.putFile.mock.invocationCallOrder[0];
    const deleteCallOrder = mockClient.deleteFile.mock.invocationCallOrder[0];
    expect(putCallOrder).toBeLessThan(deleteCallOrder);

    // 验证删除的是旧文件
    expect(mockClient.deleteFile).toHaveBeenCalledWith(
      "BookmarkSyncer/old_backup.json.gz"
    );
  });

  it("时间窗口外创建新文件", async () => {
    mockGetLastBackupFileInfo.mockResolvedValueOnce({
      fileName: "old_backup.json.gz",
      filePath: "BookmarkSyncer/old_backup.json.gz",
      createdAt: Date.now() - 120000,
      revisionNumber: 3,
    });

    const result = await smartPush(testConfig, "manual");
    expect(result.success).toBe(true);
    expect(mockClient.deleteFile).not.toHaveBeenCalled();
  });
});

describe("smartPush - skipLock 修复", () => {
  it("skipLock=true 时不获取/释放锁", async () => {
    const result = await smartPush(testConfig, "manual", { skipLock: true });

    expect(result.success).toBe(true);
    expect(mockAcquire).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it("skipLock=false 时正常获取/释放锁", async () => {
    const result = await smartPush(testConfig, "manual", { skipLock: false });

    expect(result.success).toBe(true);
    expect(mockAcquire).toHaveBeenCalledWith("manual");
    expect(mockRelease).toHaveBeenCalledWith("manual");
  });

  it("默认（无 options）获取/释放锁", async () => {
    const result = await smartPush(testConfig, "manual");

    expect(result.success).toBe(true);
    expect(mockAcquire).toHaveBeenCalledWith("manual");
    expect(mockRelease).toHaveBeenCalledWith("manual");
  });

  it("skipLock=false 且无法获取锁时返回错误", async () => {
    mockAcquire.mockResolvedValueOnce(false);
    const result = await smartPush(testConfig, "manual");

    expect(result.success).toBe(false);
    expect(result.message).toContain("同步正在进行中");
  });
});

describe("smartPush - 云端更新阻止自动上传", () => {
  it("自动同步时云端较新则阻止上传", async () => {
    mockGetLatestBackupFile.mockResolvedValueOnce("BookmarkSyncer/backup.json.gz");
    mockGetFileWithDedup.mockResolvedValueOnce(
      JSON.stringify({
        metadata: { timestamp: Date.now(), clientVersion: "1.0.0" },
        data: [{ title: "Cloud", url: "https://cloud.com" }],
      })
    );
    mockGetLastSyncTime.mockResolvedValueOnce(Date.now() - 60000);

    const result = await smartPush(testConfig, "auto-sync");
    expect(result.success).toBe(false);
    expect(result.message).toContain("云端有更新");
    expect(mockClient.putFile).not.toHaveBeenCalled();
  });
});
