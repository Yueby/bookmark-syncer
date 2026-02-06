/**
 * Bookmark 领域类型定义
 */

/**
 * 节点位置信息（通用）
 */
export interface NodeLocation {
  /** 节点 ID（云端数据可能没有 id） */
  id?: string;
  
  /** 内容哈希（用于跨浏览器匹配） */
  hash?: string;
  
  /** 父节点 ID */
  parentId: string;
  
  /** 在父节点中的索引位置 */
  index: number;
  
  /** 标题 */
  title: string;
  
  /** URL（书签有） */
  url?: string;
  
  /** 路径（文件夹有） */
  path?: string;
  
  /** 是否为文件夹 */
  isFolder: boolean;
}

/**
 * 书签位置信息
 */
export interface BookmarkLocation {
  id?: string;
  hash?: string;
  parentId: string;
  index: number;
  title: string;
  url: string;
}

/**
 * 文件夹位置信息
 */
export interface FolderLocation {
  id?: string;
  hash?: string;
  parentId: string;
  index: number;
  title: string;
  path: string;
}

/**
 * 全局索引
 * 用于快速查找和匹配书签节点
 */
export interface GlobalIndex {
  /** Hash -> 节点信息列表（同 URL+title 可能出现在多个文件夹） */
  hashToNode: Map<string, NodeLocation[]>;
  
  /** URL -> 书签列表（兜底匹配，可能有多个相同 URL） */
  urlToBookmarks: Map<string, BookmarkLocation[]>;
  
  /** 路径 -> 文件夹信息（兜底匹配） */
  pathToFolder: Map<string, FolderLocation>;
  
  /** ID -> 路径 */
  idToPath: Map<string, string>;
}

/**
 * 跨浏览器系统文件夹映射
 */

/** Chrome/Edge folderType -> Firefox ID */
export const FOLDER_TYPE_TO_FIREFOX_ID: Record<string, string> = {
  "bookmarks-bar": "toolbar_____",
  other: "unfiled_____",
  mobile: "mobile______",
};

/** Firefox ID -> Chrome/Edge folderType */
export const FIREFOX_ID_TO_FOLDER_TYPE: Record<string, string> = {
  toolbar_____: "bookmarks-bar",
  unfiled_____: "other",
  mobile______: "mobile",
};

/** Firefox 系统文件夹 ID 列表 */
export const FIREFOX_SYSTEM_IDS = [
  "toolbar_____",
  "unfiled_____",
  "menu________",
  "mobile______",
];

/**
 * 书签操作选项
 */
export interface BookmarkCreateOptions {
  parentId: string;
  title: string;
  url?: string;
  index?: number;
}
