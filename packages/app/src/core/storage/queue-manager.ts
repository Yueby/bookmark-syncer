/**
 * 下载队列管理器
 * 确保同一文件同一时间只有一个下载请求，避免并发冲突
 * 提供超时保护和队列状态管理
 */
import type { IWebDAVClient } from "../../infrastructure/http/webdav-client";
import { decompressText } from "../../infrastructure/utils/compression";
import { STORAGE_CONSTANTS } from "./types";

/**
 * 队列管理器类
 * 管理文件下载的去重和超时控制
 */
export class QueueManager {
  private readonly downloadQueue = new Map<string, Promise<string>>();
  private readonly downloadTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timeoutMs: number;

  constructor(timeoutMs: number = STORAGE_CONSTANTS.DOWNLOAD_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * 带去重的文件下载
   * 如果同一文件正在下载，会复用现有的下载 Promise
   * 
   * @param client WebDAV 客户端
   * @param path 文件路径
   * @returns 文件内容
   */
  async getFileWithDedup(
    client: IWebDAVClient,
    path: string,
  ): Promise<string> {
    // 如果正在下载，返回同一个 Promise
    if (this.downloadQueue.has(path)) {
      console.log(`[QueueManager] Reusing ongoing download: ${path}`);
      return this.downloadQueue.get(path)!;
    }

    console.log(`[QueueManager] Starting new download: ${path}`);

    // 创建超时 Promise
    const timeoutPromise = new Promise<string>((_, reject) => {
      const timerId = setTimeout(() => {
        console.error(
          `[QueueManager] Download timeout after ${this.timeoutMs}ms: ${path}`
        );
        this.cleanupDownload(path);
        reject(new Error(`下载超时 (${this.timeoutMs / 1000}秒)`));
      }, this.timeoutMs);

      this.downloadTimers.set(path, timerId);
    });

    // 创建下载任务，与超时竞争
    const downloadPromise = Promise.race([
      client.getFile(path),
      timeoutPromise,
    ]).then(async (content) => {
      // 所有文件都必须是 .gz 压缩格式，自动解压
      if (!path.endsWith('.gz')) {
        throw new Error(`不支持的文件格式：${path}（必须是 .gz 压缩文件）`);
      }
      
      console.log(`[QueueManager] Decompressing file: ${path}`);
      try {
        const decompressed = await decompressText(content);
        console.log(`[QueueManager] Decompression: ${content.length} → ${decompressed.length} bytes`);
        return decompressed;
      } catch (error) {
        console.error("[QueueManager] Decompression failed:", error);
        throw new Error("解压备份文件失败");
      }
    }).finally(() => {
      this.cleanupDownload(path);
      console.log(`[QueueManager] Download completed, queue size: ${this.downloadQueue.size}`);
    });

    // 将下载任务加入队列
    this.downloadQueue.set(path, downloadPromise);

    return downloadPromise;
  }

  /**
   * 清理单个下载任务
   * @param path 文件路径
   */
  private cleanupDownload(path: string): void {
    // 清理超时定时器
    const timerId = this.downloadTimers.get(path);
    if (timerId !== undefined) {
      clearTimeout(timerId);
      this.downloadTimers.delete(path);
    }

    // 从队列中移除
    this.downloadQueue.delete(path);
  }

  /**
   * 清空所有下载队列
   * 通常在出现严重错误或需要重置时使用
   */
  clearAll(): void {
    // 清理所有超时定时器
    this.downloadTimers.forEach((timerId) => {
      clearTimeout(timerId);
    });
    this.downloadTimers.clear();

    // 清空下载队列
    this.downloadQueue.clear();
    
    console.log("[QueueManager] All downloads cleared");
  }

  /**
   * 获取当前队列大小
   * @returns 正在进行的下载任务数量
   */
  getQueueSize(): number {
    return this.downloadQueue.size;
  }

  /**
   * 检查指定文件是否正在下载
   * @param path 文件路径
   * @returns 是否正在下载
   */
  isDownloading(path: string): boolean {
    return this.downloadQueue.has(path);
  }

  /**
   * 获取所有正在下载的文件路径
   * @returns 文件路径列表
   */
  getDownloadingFiles(): string[] {
    return Array.from(this.downloadQueue.keys());
  }
}

/**
 * 默认导出单例实例
 * 大多数场景使用默认实例即可
 */
export const queueManager = new QueueManager();
