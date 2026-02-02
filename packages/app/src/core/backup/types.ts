/**
 * 备份领域类型定义
 */
import type { BookmarkNode } from "../../types";

/**
 * 快照信息
 * 存储在 IndexedDB 中的本地备份
 */
export interface Snapshot {
  /** 快照 ID（自动递增） */
  id: number;
  
  /** 创建时间戳 */
  timestamp: number;
  
  /** 书签树数据 */
  tree: BookmarkNode[];
  
  /** 创建原因 */
  reason: string;
  
  /** 书签总数 */
  count: number;
}

/**
 * 创建快照的参数（不包含 id，由数据库自动生成）
 */
export type CreateSnapshotParams = Omit<Snapshot, "id">;

/**
 * 快照原因常量
 */
export const SNAPSHOT_REASONS = {
  AUTO_BACKUP: "auto-backup",
  MANUAL: "manual",
  BEFORE_SYNC: "before-sync",
  BEFORE_RESTORE: "before-restore",
} as const;

/**
 * 快照配置
 */
export interface SnapshotConfig {
  /** 保留的快照数量 */
  maxSnapshots: number;
  
  /** 数据库名称 */
  dbName: string;
  
  /** 存储名称 */
  storeName: string;
}

/**
 * 默认快照配置
 */
export const DEFAULT_SNAPSHOT_CONFIG: SnapshotConfig = {
  maxSnapshots: 5,
  dbName: "bookmark-syncer-db",
  storeName: "snapshots",
};
