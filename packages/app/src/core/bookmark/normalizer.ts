/**
 * 跨浏览器标准化工具
 * 处理 Chrome/Edge 和 Firefox 之间的差异
 */
import type { BookmarkNode } from "../../types";
import {
    FIREFOX_ID_TO_FOLDER_TYPE,
    FIREFOX_SYSTEM_IDS,
    FOLDER_TYPE_TO_FIREFOX_ID,
} from "./types";

/**
 * 判断节点是否为系统根文件夹（不应参与内容比对）
 */
export function isSystemRootFolder(node: BookmarkNode): boolean {
  if (node.url) return false;
  if (!node.id) return false;
  if (node.id === "0" && !node.title) return true;
  if (node.id === "root________") return true;
  if (node.folderType) return true;
  return FIREFOX_SYSTEM_IDS.includes(node.id);
}

/**
 * 判断系统文件夹是否有跨浏览器映射
 * 只有在映射表中的文件夹才应该跨浏览器同步
 */
export function hasCrossBrowserMapping(node: BookmarkNode): boolean {
  // Chrome/Edge folderType → Firefox ID
  if (node.folderType && FOLDER_TYPE_TO_FIREFOX_ID[node.folderType]) {
    return true;
  }
  
  // Firefox ID → Chrome/Edge folderType
  if (node.id && FIREFOX_ID_TO_FOLDER_TYPE[node.id]) {
    return true;
  }
  
  // 没有映射关系（如 Firefox 的 menu________）
  return false;
}

/**
 * 查找本地系统文件夹匹配（跨浏览器）
 */
export function findMatchingSystemFolder(
  backupNode: BookmarkNode,
  localFolders: BookmarkNode[],
): BookmarkNode | null {
  // 先尝试 Chrome/Edge folderType 匹配
  if (backupNode.folderType) {
    const match = localFolders.find((l) => l.folderType === backupNode.folderType);
    if (match) return match;
    
    // 尝试 Firefox ID 映射
    const firefoxId = FOLDER_TYPE_TO_FIREFOX_ID[backupNode.folderType];
    if (firefoxId) {
      const firefoxMatch = localFolders.find((l) => l.id === firefoxId);
      if (firefoxMatch) return firefoxMatch;
    }
  }

  // 尝试 Firefox ID 匹配
  if (backupNode.id) {
    const mappedType = FIREFOX_ID_TO_FOLDER_TYPE[backupNode.id];
    if (mappedType) {
      const match = localFolders.find((l) => l.folderType === mappedType);
      if (match) return match;
      
      const sameIdMatch = localFolders.find((l) => l.id === backupNode.id);
      if (sameIdMatch) return sameIdMatch;
    }
  }

  // 兜底：按标题匹配
  const titleMatch = localFolders.find((l) => l.title === backupNode.title);
  if (titleMatch) return titleMatch;

  return null;
}

/**
 * 标准化 URL
 * 移除尾部斜杠，统一协议大小写
 */
export function normalizeUrl(url: string | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/^(https?):\/\//i, (_, proto) => proto.toLowerCase() + "://");
}
