/**
 * Sync 领域类型定义
 */

/**
 * 同步结果
 */
export interface SyncResult {
  success: boolean;
  action: "uploaded" | "downloaded" | "skipped" | "error";
  message: string;
}

/**
 * 同步状态
 */
export interface SyncState {
  /** 同步时间戳 */
  time: number;
  
  /** 同步的 URL */
  url: string;
  
  /** 同步类型 */
  type: "upload" | "download" | "skip_identical" | "restore";
}

/**
 * 智能同步结果
 */
export interface SmartSyncResult extends SyncResult {
  /** 是否需要冲突解决 */
  needsConflictResolution?: boolean;
  
  /** 云端信息 */
  cloudInfo?: import("../storage/types").CloudInfo;
}

/**
 * 同步锁
 */
export interface SyncLock {
  /** 锁持有者 */
  holder: string;
  
  /** 获取锁的时间戳 */
  timestamp: number;
  
  /** 锁 ID（用于验证锁的有效性，防止 race condition） */
  lockId: string;
}

/**
 * 常量
 */
export const SYNC_LOCK_KEY = "sync_lock";
export const LOCK_TIMEOUT_MS = 60000; // 60 秒超时自动释放
