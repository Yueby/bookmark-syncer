/**
 * 文件管理器
 * 负责备份文件的命名、解析、查询和清理
 */
import type { IWebDAVClient } from "../../infrastructure/http/webdav-client";
import type { BackupFileMetadata, CloudBackupFile, WebDAVFile } from "./types";
import { STORAGE_CONSTANTS } from "./types";

/**
 * 文件管理器类
 * 提供文件操作的高级封装
 */
export class FileManager {
  private readonly backupDir: string;

  constructor(backupDir: string = STORAGE_CONSTANTS.BACKUP_DIR) {
    this.backupDir = backupDir;
  }

  /**
   * 生成带时间戳和修订号的备份文件名
   * 格式：bookmarks_YYYYMMDD_HHMMSS_browser_count_vN.json
   * 
   * @param browser 浏览器名称（如 "Chrome", "Edge", "Firefox"）
   * @param count 书签总数
   * @param revisionNumber 修订版本号（默认1）
   * @returns 文件名（不含 .gz 扩展名）
   * 
   * @example
   * generateBackupFileName("Edge", 157, 1)
   * // => "bookmarks_20260127_143052_edge_157_v1.json"
   * generateBackupFileName("Edge", 157, 3)
   * // => "bookmarks_20260127_143052_edge_157_v3.json"
   */
  generateBackupFileName(browser: string, count: number, revisionNumber: number = 1): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    // 浏览器名称转为小写并移除空格
    const browserSlug = browser.toLowerCase().replace(/\s+/g, "");

    return `bookmarks_${year}${month}${day}_${hours}${minutes}${seconds}_${browserSlug}_${count}_v${revisionNumber}.json`;
  }

  /**
   * 解析备份文件名，提取元数据
   * 格式：bookmarks_20260127_143052_edge_157_v3.json.gz
   * 
   * @param fileName 文件名
   * @returns 解析结果，如果无法解析则返回 null
   */
  parseBackupFileName(fileName: string): BackupFileMetadata | null {
    // 移除 .gz 扩展名
    const cleanFileName = fileName.replace(/\.gz$/, '');
    
    // 解析格式: bookmarks_20260127_143052_edge_157_v3.json
    const match = cleanFileName.match(
      /^bookmarks_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_([a-z]+)_(\d+)_v(\d+)\.json$/
    );
    
    if (!match) {
      return null;
    }
    
    const [, year, month, day, hours, minutes, seconds, browser, count, revision] = match;
    const timestamp = new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hours),
      parseInt(minutes),
      parseInt(seconds)
    ).getTime();

    return {
      timestamp,
      browser,
      count: parseInt(count),
      revisionNumber: parseInt(revision),
    };
  }

  /**
   * 判断是否为备份文件
   * @param fileName 文件名
   * @returns 是否为备份文件
   */
  isBackupFile(fileName: string): boolean {
    return fileName.startsWith("bookmarks_") && fileName.endsWith(".json.gz");
  }

  /**
   * 获取完整的文件路径
   * @param fileName 文件名
   * @returns 完整路径
   */
  getFullPath(fileName: string): string {
    return `${this.backupDir}/${fileName}`;
  }

  /**
   * 列出所有备份文件
   * @param client WebDAV 客户端
   * @returns 备份文件列表
   */
  async listBackupFiles(client: IWebDAVClient): Promise<WebDAVFile[]> {
    const files = await client.listFiles(this.backupDir);
    return files.filter((file) => this.isBackupFile(file.name));
  }

  /**
   * 获取最新的备份文件
   * @param client WebDAV 客户端
   * @returns 最新备份文件的完整路径，如果没有则返回 null
   */
  async getLatestBackupFile(client: IWebDAVClient): Promise<string | null> {
    try {
      const backupFiles = await this.listBackupFiles(client);

      if (backupFiles.length === 0) {
        console.log("[FileManager] No backup files found");
        return null;
      }

      // 按最后修改时间排序，获取最新的
      backupFiles.sort((a, b) => b.lastModified - a.lastModified);
      const latest = backupFiles[0];

      console.log(
        `[FileManager] Found latest backup: ${latest.name} (${new Date(latest.lastModified).toISOString()})`
      );

      return this.getFullPath(latest.name);
    } catch (error) {
      console.error("[FileManager] Failed to get latest backup file:", error);
      return null;
    }
  }

  /**
   * 将 WebDAV 文件转换为云端备份文件信息
   * @param file WebDAV 文件
   * @returns 云端备份文件信息
   */
  toCloudBackupFile(file: WebDAVFile): CloudBackupFile {
    const metadata = this.parseBackupFileName(file.name);
    
    return {
      name: file.name,
      path: file.path,
      timestamp: metadata?.timestamp ?? file.lastModified,
      totalCount: metadata?.count,
      browser: metadata?.browser,
      browserVersion: undefined, // 文件名中不包含版本信息
    };
  }

  /**
   * 清理超过指定天数的备份文件
   * @param client WebDAV 客户端
   * @param daysToKeep 保留最近几天的备份，默认 3 天
   * @returns 删除的文件数量
   */
  async cleanOldBackups(
    client: IWebDAVClient,
    daysToKeep: number = STORAGE_CONSTANTS.DEFAULT_DAYS_TO_KEEP
  ): Promise<number> {
    try {
      const backupFiles = await this.listBackupFiles(client);

      if (backupFiles.length === 0) {
        console.log("[FileManager] No backup files to clean");
        return 0;
      }

      // 计算截止时间
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

      // 找出需要删除的旧文件
      const filesToDelete = backupFiles.filter(
        (file) => file.lastModified < cutoffTime
      );

      if (filesToDelete.length === 0) {
        console.log(`[FileManager] No backups older than ${daysToKeep} days to clean`);
        return 0;
      }

      console.log(
        `[FileManager] Cleaning ${filesToDelete.length} old backups (older than ${daysToKeep} days)`
      );

      // 删除旧文件
      let deletedCount = 0;
      for (const file of filesToDelete) {
        try {
          await client.deleteFile(file.path);
          console.log(`[FileManager] Deleted old backup: ${file.name}`);
          deletedCount++;
        } catch (error) {
          console.error(`[FileManager] Failed to delete ${file.name}:`, error);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error("[FileManager] Failed to clean old backups:", error);
      return 0;
    }
  }
}

/**
 * 默认导出单例实例
 */
export const fileManager = new FileManager();
