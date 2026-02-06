/**
 * queue-manager.ts 测试
 * 测试下载队列去重、超时、非 .gz 拒绝
 */
import { QueueManager } from "@src/core/storage/queue-manager";
import type { IWebDAVClient } from "@src/infrastructure/http/webdav-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock decompressText
vi.mock("@src/infrastructure/utils/compression", () => ({
  decompressText: vi.fn(async (input: string) => `decompressed_${input}`),
}));

function createMockClient(response: string | Error = "compressed_data"): IWebDAVClient {
  return {
    getFile: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
    putFile: vi.fn(),
    deleteFile: vi.fn(),
    listFiles: vi.fn(),
    ensureDir: vi.fn(),
  } as unknown as IWebDAVClient;
}

describe("QueueManager", () => {
  let manager: QueueManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new QueueManager(5000); // 5 秒超时
  });

  afterEach(() => {
    manager.clearAll();
    vi.useRealTimers();
  });

  it("正常下载并解压 .gz 文件", async () => {
    const client = createMockClient("compressed_data");
    const resultPromise = manager.getFileWithDedup(client, "/backup/file.json.gz");
    // advance timers to let microtasks resolve
    await vi.advanceTimersByTimeAsync(0);
    const result = await resultPromise;
    expect(result).toBe("decompressed_compressed_data");
    expect(client.getFile).toHaveBeenCalledWith("/backup/file.json.gz");
  });

  it("拒绝非 .gz 文件", async () => {
    const client = createMockClient("data");
    const promise = manager.getFileWithDedup(client, "/backup/file.json");
    // 先附加 rejection handler，避免 unhandled rejection 警告
    const assertion = expect(promise).rejects.toThrow("不支持的文件格式");
    await vi.advanceTimersByTimeAsync(0);
    await assertion;
  });

  it("并发下载同一文件复用 Promise（去重）", async () => {
    const client = createMockClient("data");
    const p1 = manager.getFileWithDedup(client, "/backup/a.json.gz");
    const p2 = manager.getFileWithDedup(client, "/backup/a.json.gz");

    // 应该是同一个 Promise
    expect(manager.isDownloading("/backup/a.json.gz")).toBe(true);
    expect(manager.getQueueSize()).toBe(1);

    await vi.advanceTimersByTimeAsync(0);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toBe(r2);
    // getFile 只调用一次
    expect(client.getFile).toHaveBeenCalledTimes(1);
  });

  it("不同文件并行下载", async () => {
    const client = createMockClient("data");
    const p1 = manager.getFileWithDedup(client, "/backup/a.json.gz");
    const p2 = manager.getFileWithDedup(client, "/backup/b.json.gz");
    expect(manager.getQueueSize()).toBe(2);

    await vi.advanceTimersByTimeAsync(0);
    await Promise.all([p1, p2]);
    expect(client.getFile).toHaveBeenCalledTimes(2);
  });

  it("下载完成后从队列中移除", async () => {
    const client = createMockClient("data");
    const promise = manager.getFileWithDedup(client, "/backup/a.json.gz");
    expect(manager.getQueueSize()).toBe(1);

    await vi.advanceTimersByTimeAsync(0);
    await promise;
    expect(manager.getQueueSize()).toBe(0);
    expect(manager.isDownloading("/backup/a.json.gz")).toBe(false);
  });

  it("超时触发错误", async () => {
    // 创建一个永不 resolve 的 client
    const client = {
      getFile: vi.fn(() => new Promise<string>(() => {})), // never resolves
      putFile: vi.fn(),
      deleteFile: vi.fn(),
      listFiles: vi.fn(),
      ensureDir: vi.fn(),
    } as unknown as IWebDAVClient;

    const promise = manager.getFileWithDedup(client, "/backup/slow.json.gz");
    // 先附加 rejection handler，避免 unhandled rejection 警告
    const assertion = expect(promise).rejects.toThrow("下载超时");

    // 超过超时时间
    await vi.advanceTimersByTimeAsync(6000);

    await assertion;
  });

  it("clearAll 清空所有任务", () => {
    const client = createMockClient("data");
    manager.getFileWithDedup(client, "/backup/a.json.gz");
    manager.getFileWithDedup(client, "/backup/b.json.gz");
    expect(manager.getQueueSize()).toBe(2);

    manager.clearAll();
    expect(manager.getQueueSize()).toBe(0);
  });

  it("getDownloadingFiles 返回正在下载的路径", () => {
    const client = createMockClient("data");
    manager.getFileWithDedup(client, "/backup/a.json.gz");
    manager.getFileWithDedup(client, "/backup/b.json.gz");

    const files = manager.getDownloadingFiles();
    expect(files).toContain("/backup/a.json.gz");
    expect(files).toContain("/backup/b.json.gz");
  });
});
