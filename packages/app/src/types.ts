export interface BookmarkMetadata {
  timestamp: number; // 精确时间戳（毫秒）
  clientVersion: string; // 扩展版本号
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
