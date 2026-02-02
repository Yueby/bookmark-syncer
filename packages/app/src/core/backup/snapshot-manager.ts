/**
 * 快照管理器
 * 使用 IndexedDB 存储本地备份快照
 */
import { IDBPDatabase, openDB } from "idb";
import type { BookmarkNode } from "../../types";
import type {
    CreateSnapshotParams,
    Snapshot,
    SnapshotConfig
} from "./types";
import { DEFAULT_SNAPSHOT_CONFIG } from "./types";

/**
 * 快照管理器类
 * 负责本地快照的 CRUD 操作
 */
export class SnapshotManager {
  private config: SnapshotConfig;
  private dbPromise: Promise<IDBPDatabase> | null = null;

  constructor(config: Partial<SnapshotConfig> = {}) {
    this.config = { ...DEFAULT_SNAPSHOT_CONFIG, ...config };
  }

  /**
   * 获取数据库连接
   * 延迟初始化，首次调用时创建数据库
   */
  private async getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.config.dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(DEFAULT_SNAPSHOT_CONFIG.storeName)) {
            db.createObjectStore(DEFAULT_SNAPSHOT_CONFIG.storeName, {
              keyPath: "id",
              autoIncrement: true,
            });
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * 创建快照
   * 自动清理超出限制的旧快照
   * 
   * @param tree 书签树
   * @param count 书签数量
   * @param reason 创建原因
   * @returns 快照 ID
   */
  async createSnapshot(
    tree: BookmarkNode[],
    count: number,
    reason: string = "auto-backup"
  ): Promise<number> {
    const db = await this.getDb();
    
    const snapshot: CreateSnapshotParams = {
      timestamp: Date.now(),
      tree,
      reason,
      count,
    };
    
    const id = await db.add(this.config.storeName, snapshot);

    // 保留最近 N 个快照，删除旧的
    await this.cleanOldSnapshots();

    console.log(`[SnapshotManager] Created snapshot ${id} (reason: ${reason}, count: ${count})`);
    return id as number;
  }

  /**
   * 清理超出限制的旧快照
   */
  private async cleanOldSnapshots(): Promise<void> {
    const db = await this.getDb();
    const keys = await db.getAllKeys(this.config.storeName);
    
    if (keys.length > this.config.maxSnapshots) {
      const toDelete = keys.slice(0, keys.length - this.config.maxSnapshots);
      console.log(`[SnapshotManager] Cleaning ${toDelete.length} old snapshots`);
      
      for (const key of toDelete) {
        await db.delete(this.config.storeName, key);
      }
    }
  }

  /**
   * 获取最新的快照
   * @returns 最新快照，如果不存在则返回 undefined
   */
  async getLatestSnapshot(): Promise<Snapshot | undefined> {
    const db = await this.getDb();
    const keys = await db.getAllKeys(this.config.storeName);
    
    if (keys.length === 0) {
      return undefined;
    }

    const lastKey = keys[keys.length - 1];
    return db.get(this.config.storeName, lastKey);
  }

  /**
   * 获取所有快照
   * @returns 快照列表，按时间倒序排列（最新的在前）
   */
  async getAllSnapshots(): Promise<Snapshot[]> {
    const db = await this.getDb();
    const snapshots = await db.getAll(this.config.storeName);
    
    // 按时间倒序返回
    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 根据 ID 获取快照
   * @param id 快照 ID
   * @returns 快照数据，如果不存在则返回 undefined
   */
  async getSnapshotById(id: number): Promise<Snapshot | undefined> {
    const db = await this.getDb();
    return db.get(this.config.storeName, id);
  }

  /**
   * 删除指定快照
   * @param id 快照 ID
   */
  async deleteSnapshot(id: number): Promise<void> {
    const db = await this.getDb();
    await db.delete(this.config.storeName, id);
    console.log(`[SnapshotManager] Deleted snapshot ${id}`);
  }

  /**
   * 删除所有快照
   */
  async deleteAllSnapshots(): Promise<void> {
    const db = await this.getDb();
    await db.clear(this.config.storeName);
    console.log("[SnapshotManager] Deleted all snapshots");
  }

  /**
   * 获取快照数量
   * @returns 快照总数
   */
  async getSnapshotCount(): Promise<number> {
    const db = await this.getDb();
    const keys = await db.getAllKeys(this.config.storeName);
    return keys.length;
  }
}

/**
 * 默认导出单例实例
 */
export const snapshotManager = new SnapshotManager();
