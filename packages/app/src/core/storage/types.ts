/**
 * 存储领域类型定义
 * 包括 WebDAV 配置、缓存、文件信息等
 */

/**
 * WebDAV 配置
 */
export interface WebDAVConfig {
  url: string;
  username: string;
  password: string;
}

/**
 * WebDAV 文件信息
 */
export interface WebDAVFile {
  name: string;
  path: string;
  lastModified: number;
  size?: number;
}

/**
 * 云端备份文件信息
 */
export interface CloudBackupFile {
  name: string;
  path: string;
  timestamp: number;
  totalCount?: number;
  browser?: string;
  browserVersion?: string;
}

/**
 * 云端信息
 */
export interface CloudInfo {
  exists: boolean;
  timestamp?: number;
  totalCount?: number;
  browser?: string;
  browserVersion?: string;
}

/**
 * 缓存的备份数据
 */
export interface CachedBackup {
  fileName: string;
  timestamp: number;
  browser: string;
  totalCount: number;
  content: string; // JSON 字符串
  cachedAt: number;
}

/**
 * 缓存的备份文件列表
 */
export interface CachedBackupList {
  backups: CloudBackupFile[];
  cachedAt: number;
}

/**
 * 备份文件元数据（从文件名解析）
 */
export interface BackupFileMetadata {
  timestamp: number;
  browser: string;
  count: number;
  revisionNumber: number;
}

/**
 * 最后创建的备份文件信息
 * 用于时间间隔备份策略
 */
export interface LastBackupFileInfo {
  fileName: string;        // 文件名
  filePath: string;        // 完整路径
  createdAt: number;       // 创建时间戳
  revisionNumber: number;  // 修订版本号（用于智能命名）
}

/**
 * 常量配置
 */
export const STORAGE_CONSTANTS = {
  /** 默认备份目录 */
  BACKUP_DIR: 'BookmarkSyncer',
  
  /** 缓存有效期（毫秒）- 5分钟 */
  CACHE_EXPIRE_MS: 5 * 60 * 1000,
  
  /** 下载超时时间（毫秒）- 30秒 */
  DOWNLOAD_TIMEOUT_MS: 30000,
  
  /** 保留备份的天数 */
  DEFAULT_DAYS_TO_KEEP: 3,
  
  /** 最后备份文件信息存储键 */
  LAST_BACKUP_FILE_KEY: 'last_backup_file_info',
} as const;
