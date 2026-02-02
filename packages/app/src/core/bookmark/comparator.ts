/**
 * 书签树比对工具
 * 用于检测本地和云端的差异
 */
import type { BookmarkNode, CloudBackup } from "../../types";
import { assignHashes } from "./hash-calculator";
import { isSystemRootFolder } from "./normalizer";

/**
 * 提取签名（使用 hash，用于精确比对）
 * 格式：B|hash（书签）或 F|title|childCount（文件夹）
 */
export function extractSignaturesWithHash(nodes: BookmarkNode[]): string[] {
  const signatures: string[] = [];

  for (const node of nodes) {
    if (!isSystemRootFolder(node)) {
      if (node.url && node.hash) {
        // 书签：使用 hash 作为唯一标识
        signatures.push(`B|${node.hash}`);
      } else if (!node.url) {
        // 文件夹：使用标题和子节点数量
        signatures.push(`F|${node.title.trim()}|${node.children?.length ?? 0}`);
      }
    }

    if (node.children?.length) {
      signatures.push(...extractSignaturesWithHash(node.children));
    }
  }

  return signatures;
}

/**
 * 比对本地和云端是否一致
 */
export async function compareWithCloud(
  localTree: BookmarkNode[],
  cloudData: CloudBackup | BookmarkNode[],
): Promise<boolean> {
  const cloudTree = Array.isArray(cloudData) ? cloudData : cloudData.data;

  // 为了准确比对，先将本地树也转换为云端格式（精简字段 + 添加 hash）
  const normalizedLocalTree = await assignHashes(localTree);

  const localSigs = extractSignaturesWithHash(normalizedLocalTree);
  const cloudSigs = extractSignaturesWithHash(cloudTree);

  console.log(
    `[Comparator] Comparing signatures: local=${localSigs.length}, cloud=${cloudSigs.length}`,
  );

  if (localSigs.length !== cloudSigs.length) {
    console.log("[Comparator] Signature count differs");
    return false;
  }

  // 找出第一个不同的签名（用于调试）
  for (let i = 0; i < localSigs.length; i++) {
    if (localSigs[i] !== cloudSigs[i]) {
      console.log(
        `[Comparator] Signature differs at index ${i}:\nLocal: ${localSigs[i]}\nCloud: ${cloudSigs[i]}`,
      );
      return false;
    }
  }

  console.log("[Comparator] Signatures match");
  return true;
}

/**
 * 统计书签数量
 */
export function countBookmarks(nodes: BookmarkNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.url) count++;
    if (node.children && node.children.length > 0) {
      count += countBookmarks(node.children);
    }
  }
  return count;
}
