/**
 * 缓存管理器
 * 使用 Session Storage 缓存云端备份信息，减少网络请求
 * 注意：Firefox 不支持 storage.session API
 */
import browser from "webextension-polyfill";
import { CachedBackup, CachedBackupList, STORAGE_CONSTANTS } from "./types";

const CACHE_KEY = "cloud_backup_cache";
const LIST_CACHE_KEY = "cloud_backup_list_cache";

/**
 * 缓存管理器类
 * 封装所有缓存操作，支持单个备份和备份列表的缓存
 */
export class CacheManager {
  private readonly cacheExpireMs: number;

  constructor(cacheExpireMs: number = STORAGE_CONSTANTS.CACHE_EXPIRE_MS) {
    this.cacheExpireMs = cacheExpireMs;
  }

  /**
   * 检查浏览器是否支持 Session Storage
   * Firefox 不支持此 API
   */
  private isSessionStorageAvailable(): boolean {
    return !!browser.storage.session;
  }

  /**
   * 检查缓存是否过期
   */
  private isCacheExpired(cachedAt: number): boolean {
    const cacheAge = Date.now() - cachedAt;
    return cacheAge > this.cacheExpireMs;
  }

  /**
   * 获取缓存的最新云端备份
   * @returns 缓存的备份数据，如果不存在或已过期则返回 null
   */
  async getCachedLatestBackup(): Promise<CachedBackup | null> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return null;
      }

      const result = await browser.storage.session.get(CACHE_KEY);
      const cached = result[CACHE_KEY] as CachedBackup | undefined;

      if (!cached) {
        return null;
      }

      if (this.isCacheExpired(cached.cachedAt)) {
        console.log("[CacheManager] Backup cache expired");
        await this.clearBackupCache();
        return null;
      }

      console.log(`[CacheManager] Using cached backup: ${cached.fileName}`);
      return cached;
    } catch (error) {
      console.error("[CacheManager] Failed to get cached backup:", error);
      return null;
    }
  }

  /**
   * 缓存最新的云端备份
   * @param data 备份数据
   */
  async cacheLatestBackup(data: CachedBackup): Promise<void> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return;
      }

      await browser.storage.session.set({
        [CACHE_KEY]: data,
      });

      console.log(`[CacheManager] Cached backup: ${data.fileName}`);
    } catch (error) {
      console.error("[CacheManager] Failed to cache backup:", error);
    }
  }

  /**
   * 清除单个备份缓存
   */
  async clearBackupCache(): Promise<void> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return;
      }

      await browser.storage.session.remove(CACHE_KEY);
      console.log("[CacheManager] Backup cache cleared");
    } catch (error) {
      console.error("[CacheManager] Failed to clear backup cache:", error);
    }
  }

  /**
   * 获取缓存的备份文件列表
   * @returns 缓存的备份列表，如果不存在或已过期则返回 null
   */
  async getCachedBackupList(): Promise<CachedBackupList | null> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return null;
      }

      const result = await browser.storage.session.get(LIST_CACHE_KEY);
      const cached = result[LIST_CACHE_KEY] as CachedBackupList | undefined;

      if (!cached) {
        return null;
      }

      if (this.isCacheExpired(cached.cachedAt)) {
        console.log("[CacheManager] Backup list cache expired");
        await this.clearBackupListCache();
        return null;
      }

      const cacheAge = Date.now() - cached.cachedAt;
      console.log(
        `[CacheManager] Using cached backup list (${cached.backups.length} files, age: ${Math.round(cacheAge / 1000)}s)`
      );
      return cached;
    } catch (error) {
      console.error("[CacheManager] Failed to get cached backup list:", error);
      return null;
    }
  }

  /**
   * 缓存备份文件列表
   * @param data 备份列表数据
   */
  async cacheBackupList(data: CachedBackupList): Promise<void> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return;
      }

      await browser.storage.session.set({
        [LIST_CACHE_KEY]: data,
      });

      console.log(`[CacheManager] Cached backup list: ${data.backups.length} files`);
    } catch (error) {
      console.error("[CacheManager] Failed to cache backup list:", error);
    }
  }

  /**
   * 清除备份列表缓存
   */
  async clearBackupListCache(): Promise<void> {
    try {
      if (!this.isSessionStorageAvailable()) {
        return;
      }

      await browser.storage.session.remove(LIST_CACHE_KEY);
      console.log("[CacheManager] Backup list cache cleared");
    } catch (error) {
      console.error("[CacheManager] Failed to clear backup list cache:", error);
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAllCaches(): Promise<void> {
    await Promise.all([
      this.clearBackupCache(),
      this.clearBackupListCache(),
    ]);
  }
}

/**
 * 默认导出单例实例
 * 大多数场景使用默认实例即可
 */
export const cacheManager = new CacheManager();
