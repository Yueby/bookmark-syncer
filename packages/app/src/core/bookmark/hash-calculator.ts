/**
 * 书签哈希计算
 * 用于跨浏览器匹配和变更检测
 */
import { generateHash } from "../../infrastructure/utils/crypto";
import type { BookmarkNode } from "../../types";
import { isSystemRootFolder, normalizeUrl } from "./normalizer";

/**
 * 为单个书签节点分配 Hash（递归处理子节点）
 * 只保留云端同步必需的字段
 */
export async function assignHashToNode(node: BookmarkNode): Promise<BookmarkNode> {
  const newNode: BookmarkNode = {
    title: node.title, // 显示名称
    url: node.url, // 书签地址（书签必需）
  };

  // 为系统文件夹保留识别字段（用于跨浏览器匹配）
  if (isSystemRootFolder(node)) {
    newNode.id = node.id; // Firefox ID 或 Chrome/Edge 的特殊 ID
    newNode.folderType = node.folderType; // Chrome/Edge 的 folderType
  }

  // 为书签计算 hash
  if (node.url) {
    newNode.hash = await generateHash(normalizeUrl(node.url), node.title);
  }

  // 递归处理子节点
  if (node.children) {
    newNode.children = await Promise.all(
      node.children.map((child) => assignHashToNode(child))
    );
  }

  return newNode;
}

/**
 * 为书签树的所有节点分配 Hash
 */
export async function assignHashes(nodes: BookmarkNode[]): Promise<BookmarkNode[]> {
  return Promise.all(nodes.map((node) => assignHashToNode(node)));
}
