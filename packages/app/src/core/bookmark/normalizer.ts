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
 * Chromium 系系统根 ID → folderType
 * Chrome/Edge 的书签根节点 id 为 "0"，一级子文件夹固定为：
 * "1"=书签栏, "2"=其他书签, "3"=移动书签
 */
export const CHROMIUM_ROOT_ID_TO_FOLDER_TYPE: Record<string, string> = {
  "1": "bookmarks-bar",
  "2": "other",
  "3": "mobile",
};

/**
 * 为书签树的系统根文件夹标注 folderType
 *
 * 背景：真实 Chrome/Edge 的 bookmarks.getTree() 返回的节点没有 folderType 字段，
 * 只有稳定 id（0/1/2/3）；而跨浏览器匹配逻辑依赖 folderType。
 * 在树的入口统一标注，让 isSystemRootFolder/hasCrossBrowserMapping/findMatchingSystemFolder
 * 在 Chromium 上正常工作。
 *
 * 同时兼容旧版云端数据：旧版 Chrome 上传的备份顶层节点无 id、无 folderType
 * （当时 assignHashToNode 未识别系统根），按位置推断（Chrome 顺序 bar/other/mobile）。
 *
 * @param tree 书签树（就地修改）
 */
export function annotateSystemFolders(tree: BookmarkNode[]): BookmarkNode[] {
  const root = tree[0];
  if (!root || !root.children) return tree;

  root.children.forEach((child, idx) => {
    if (child.url) return; // 书签不是文件夹
    if (child.folderType) return; // 已有标注（新版上传的数据）

    // Firefox 系统根 ID
    if (child.id && FIREFOX_ID_TO_FOLDER_TYPE[child.id]) {
      child.folderType = FIREFOX_ID_TO_FOLDER_TYPE[child.id];
      return;
    }

    // Chromium 系统根 ID（"1"/"2"/"3"）
    if (child.id && CHROMIUM_ROOT_ID_TO_FOLDER_TYPE[child.id]) {
      child.folderType = CHROMIUM_ROOT_ID_TO_FOLDER_TYPE[child.id];
      return;
    }

    // 旧版云端数据：顶层文件夹无 id（assignHashToNode 未保留），
    // 按位置推断（Chrome 顶层顺序固定为 bar/other/mobile）
    if (!child.id) {
      child.folderType = idx === 0 ? "bookmarks-bar" : idx === 1 ? "other" : "mobile";
    }
  });

  return tree;
}

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
