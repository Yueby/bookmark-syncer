/**
 * cloud-operations.ts 测试
 * 测试 getCloudInfo、getCloudBackupList、restoreFromCloudBackup
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── 使用 vi.hoisted 确保 mock 变量在 vi.mock 提升后可用 ───

const mocks = vi.hoisted(() => ({
  listFiles: vi.fn(),
  getFile: vi.fn(),
  putFile: vi.fn(),
  deleteFile: vi.fn(),
  ensureDir: vi.fn(),
  getCachedBackupList: vi.fn(),
  cacheBackupList: vi.fn(),
  getFileWithDedup: vi.fn(),
  parseBackupFileName: vi.fn(),
  createSnapshot: vi.fn(),
  getTree: vi.fn(),
  restoreFromBackup: vi.fn(),
  countBookmarks: vi.fn(() => 10),
  acquireSyncLock: vi.fn(),
  releaseSyncLock: vi.fn(),
  setSyncState: vi.fn(),
}));

vi.mock("@src/infrastructure/http/webdav-client", () => ({
  getWebDAVClient: vi.fn(() => ({
    listFiles: mocks.listFiles,
    getFile: mocks.getFile,
    putFile: mocks.putFile,
    deleteFile: mocks.deleteFile,
    ensureDir: mocks.ensureDir,
  })),
}));

vi.mock("@src/core/storage/cache-manager", () => ({
  cacheManager: {
    getCachedBackupList: (...args: any[]) => mocks.getCachedBackupList(...args),
    cacheBackupList: (...args: any[]) => mocks.cacheBackupList(...args),
    clearBackupCache: vi.fn(),
    clearBackupListCache: vi.fn(),
    clearAllCaches: vi.fn(),
  },
}));

vi.mock("@src/core/storage/queue-manager", () => ({
  queueManager: {
    getFileWithDedup: (...args: any[]) => mocks.getFileWithDedup(...args),
  },
}));

vi.mock("@src/core/storage", () => ({
  fileManager: {
    parseBackupFileName: (...args: any[]) => mocks.parseBackupFileName(...args),
  },
  STORAGE_CONSTANTS: {
    BACKUP_DIR: "BookmarkSyncer",
  },
}));

vi.mock("@src/core/backup", () => ({
  snapshotManager: {
    createSnapshot: (...args: any[]) => mocks.createSnapshot(...args),
  },
}));

vi.mock("@src/core/bookmark", () => ({
  bookmarkRepository: {
    getTree: (...args: any[]) => mocks.getTree(...args),
    restoreFromBackup: (...args: any[]) => mocks.restoreFromBackup(...args),
  },
  countBookmarks: (...args: any[]) => mocks.countBookmarks(...args),
}));

vi.mock("@src/core/sync/lock-manager", () => ({
  acquireSyncLock: (...args: any[]) => mocks.acquireSyncLock(...args),
  releaseSyncLock: (...args: any[]) => mocks.releaseSyncLock(...args),
}));

vi.mock("@src/core/sync/state-manager", () => ({
  setSyncState: (...args: any[]) => mocks.setSyncState(...args),
}));

// ─── 必须在 mock 声明之后导入 ───

import {
  getCloudBackupList,
  getCloudInfo,
  restoreFromCloudBackup,
} from "@src/core/sync/cloud-operations";
import type { BookmarkNode, CloudBackup } from "@src/types";

const config = { url: "https://dav.example.com", username: "u", password: "p" };

describe("getCloudBackupList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCachedBackupList.mockResolvedValue(null);
    mocks.cacheBackupList.mockResolvedValue(undefined);
    mocks.parseBackupFileName.mockReturnValue(null);
  });

  it("缓存命中时返回缓存数据", async () => {
    const cached = {
      backups: [{ name: "a.json.gz", path: "/a.json.gz", timestamp: 1 }],
      cachedAt: Date.now(),
    };
    mocks.getCachedBackupList.mockResolvedValueOnce(cached);

    const result = await getCloudBackupList(config);
    expect(result).toEqual(cached.backups);
    expect(mocks.listFiles).not.toHaveBeenCalled();
  });

  it("缓存未命中时从云端获取", async () => {
    mocks.listFiles.mockResolvedValueOnce([
      {
        name: "bookmarks_12345_chrome_100.json.gz",
        path: "/BookmarkSyncer/bookmarks_12345_chrome_100.json.gz",
        lastModified: 12345,
      },
    ]);
    mocks.parseBackupFileName.mockReturnValueOnce({
      timestamp: 12345,
      browser: "chrome",
      count: 100,
      revisionNumber: 0,
    });

    const result = await getCloudBackupList(config);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("bookmarks_12345_chrome_100.json.gz");
    expect(result[0].browser).toBe("chrome");
    expect(mocks.cacheBackupList).toHaveBeenCalled();
  });

  it("强制刷新时跳过缓存", async () => {
    const cached = { backups: [], cachedAt: Date.now() };
    mocks.getCachedBackupList.mockResolvedValueOnce(cached);
    mocks.listFiles.mockResolvedValueOnce([]);

    const result = await getCloudBackupList(config, true);
    expect(result).toEqual([]);
    expect(mocks.listFiles).toHaveBeenCalled();
  });

  it("过滤非备份文件", async () => {
    mocks.listFiles.mockResolvedValueOnce([
      { name: "bookmarks_123.json.gz", path: "/a", lastModified: 1 },
      { name: "other_file.txt", path: "/b", lastModified: 2 },
      { name: "readme.json", path: "/c", lastModified: 3 },
    ]);

    const result = await getCloudBackupList(config);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("bookmarks_123.json.gz");
  });

  it("离线时返回空数组", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const result = await getCloudBackupList(config);
    expect(result).toEqual([]);
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });
});

describe("getCloudInfo", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCachedBackupList.mockResolvedValue(null);
    mocks.cacheBackupList.mockResolvedValue(undefined);
    mocks.parseBackupFileName.mockReturnValue(null);
  });

  it("无备份时返回 { exists: false }", async () => {
    mocks.listFiles.mockResolvedValueOnce([]);
    const info = await getCloudInfo(config);
    expect(info.exists).toBe(false);
  });

  it("有备份时返回最新备份信息", async () => {
    mocks.listFiles.mockResolvedValueOnce([
      { name: "bookmarks_2000_chrome_50.json.gz", path: "/a", lastModified: 2000 },
      { name: "bookmarks_1000_chrome_30.json.gz", path: "/b", lastModified: 1000 },
    ]);
    mocks.parseBackupFileName
      .mockReturnValueOnce({ timestamp: 2000, browser: "chrome", count: 50 })
      .mockReturnValueOnce({ timestamp: 1000, browser: "chrome", count: 30 });

    const info = await getCloudInfo(config);
    expect(info.exists).toBe(true);
    expect(info.timestamp).toBe(2000);
    expect(info.totalCount).toBe(50);
    expect(info.browser).toBe("chrome");
  });
});

describe("restoreFromCloudBackup", () => {
  const sampleTree: BookmarkNode[] = [
    { id: "0", title: "", children: [{ id: "1", title: "Bar", children: [] }] },
  ];
  const sampleBackup: CloudBackup = {
    metadata: { timestamp: 12345, clientVersion: "2.0.0" },
    data: sampleTree,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.acquireSyncLock.mockResolvedValue(true);
    mocks.releaseSyncLock.mockResolvedValue(undefined);
    mocks.getTree.mockResolvedValue(sampleTree);
    mocks.createSnapshot.mockResolvedValue(1);
    mocks.getFileWithDedup.mockResolvedValue(JSON.stringify(sampleBackup));
    mocks.restoreFromBackup.mockResolvedValue(undefined);
    mocks.parseBackupFileName.mockReturnValue({ browser: "chrome" });
    mocks.setSyncState.mockResolvedValue(undefined);
    mocks.countBookmarks.mockReturnValue(10);
  });

  it("成功恢复返回 success", async () => {
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(true);
    expect(result.action).toBe("downloaded");
    expect(mocks.releaseSyncLock).toHaveBeenCalledWith("manual");
  });

  it("获取锁失败时返回错误", async () => {
    mocks.acquireSyncLock.mockResolvedValueOnce(false);
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("同步正在进行中");
  });

  it("离线时返回错误", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, writable: true, configurable: true });
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("网络断开");
    Object.defineProperty(navigator, "onLine", { value: true, writable: true, configurable: true });
  });

  it("JSON 解析失败时返回错误", async () => {
    mocks.getFileWithDedup.mockResolvedValueOnce("invalid json!!!");
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("备份数据格式损坏");
  });

  it("下载失败返回空内容时返回错误", async () => {
    mocks.getFileWithDedup.mockResolvedValueOnce("");
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain("无法读取备份文件");
  });

  it("快照创建失败不影响恢复", async () => {
    mocks.createSnapshot.mockRejectedValueOnce(new Error("snapshot fail"));
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(true);
  });

  it("锁在 finally 中释放", async () => {
    mocks.restoreFromBackup.mockRejectedValueOnce(new Error("restore fail"));
    const result = await restoreFromCloudBackup(
      config,
      "/BookmarkSyncer/backup.json.gz",
      "manual"
    );
    expect(result.success).toBe(false);
    expect(mocks.releaseSyncLock).toHaveBeenCalledWith("manual");
  });
});
