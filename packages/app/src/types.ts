export interface BookmarkMetadata {
  timestamp: number;
  totalCount: number;
  clientVersion: string;
  browser: string; // 浏览器名称，如 "Chrome", "Firefox", "Edge"
  browserVersion: string; // 浏览器版本，如 "120.0.0"
  stats?: {
    totalFolders: number;
  };
}

export interface BookmarkNode {
  id?: string; // 浏览器原生 ID（仅本地/系统文件夹使用，云端数据可能没有）
  hash?: string; // 内容哈希（用于跨浏览器同步）= sha256(url + "|" + title)
  parentId?: string;
  index?: number;
  url?: string;
  title: string;
  dateAdded?: number;
  dateGroupModified?: number;
  children?: BookmarkNode[];
  // Chrome 134+ 支持：系统文件夹类型
  // "bookmarks-bar" | "other" | "mobile" | "managed"
  folderType?: string;
}

export interface CloudBackup {
  metadata: BookmarkMetadata;
  data: BookmarkNode[];
}

export interface SyncHistoryItem {
  timestamp: number;
  type: "push" | "pull";
  status: "success" | "failed";
  message?: string;
  count?: number;
  browser?: string;
}
