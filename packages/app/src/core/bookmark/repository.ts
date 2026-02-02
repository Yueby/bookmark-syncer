/**
 * 书签仓储层
 * 提供书签的 CRUD 操作和高层 API
 */
import { BrowserBookmarksAPI } from "../../infrastructure/browser/api";
import type { BookmarkMetadata, BookmarkNode, CloudBackup } from "../../types";
import { countBookmarks } from "./comparator";
import { assignHashes } from "./hash-calculator";
import { buildGlobalIndex, createChildren, mergeNodes, smartSync } from "./merger";
import { findMatchingSystemFolder, hasCrossBrowserMapping } from "./normalizer";

/**
 * 书签仓储类
 * 封装所有书签相关的业务逻辑
 */
export class BookmarkRepository {
  /**
   * 获取完整书签树
   */
  async getTree(): Promise<BookmarkNode[]> {
    return (await BrowserBookmarksAPI.getTree()) as BookmarkNode[];
  }

  /**
   * 创建云端备份
   * 包含元数据和完整的书签树（带 hash）
   */
  async createCloudBackup(): Promise<CloudBackup> {
    const tree = await this.getTree();

    // 为所有节点分配 Hash（动态计算）
    const treeWithHash = await assignHashes(tree);

    const metadata: BookmarkMetadata = {
      timestamp: Date.now(),
      clientVersion: "2.0.0-hash", // Hash 版本
    };

    return { metadata, data: treeWithHash };
  }

  /**
   * 从备份恢复（使用全局索引 + 三阶段同步）
   */
  async restoreFromBackup(backup: CloudBackup | BookmarkNode[]): Promise<void> {
    const startTime = Date.now();
    console.log("[BookmarkRepository] Starting restore from backup...");

    // 验证备份数据
    let tree: BookmarkNode[];

    if (Array.isArray(backup)) {
      tree = backup;
    } else if (backup && backup.data) {
      tree = backup.data;
    } else {
      throw new Error("备份数据格式无效");
    }

    if (!tree || tree.length === 0) {
      throw new Error("备份数据为空");
    }

    const root = tree[0];
    if (!root || !root.children) {
      throw new Error("备份数据格式无效：缺少根节点或子节点");
    }

    const backupCount = countBookmarks(tree);
    console.log(`[BookmarkRepository] Backup contains ${backupCount} bookmarks`);

    // 获取本地书签树并构建全局索引
    console.log("[BookmarkRepository] Building global index...");
    const localTree = await this.getTree();
    const localIndex = await buildGlobalIndex(localTree);
    console.log(
      `[BookmarkRepository] Index: ${localIndex.urlToBookmarks.size} URLs, ${localIndex.pathToFolder.size} folders`,
    );

    const localRoot = localTree[0];
    if (!localRoot || !localRoot.children) {
      throw new Error("无法获取本地书签根结构");
    }

    const localChildren = localRoot.children;

    // 对每个系统文件夹执行智能同步
    console.log(
      `[BookmarkRepository] Syncing ${root.children.length} system folders...`,
    );

    for (const backupChild of root.children) {
      // 检查是否有跨浏览器映射
      if (!hasCrossBrowserMapping(backupChild)) {
        // 静默跳过没有映射的系统文件夹（如 Firefox 的 menu________）
        continue;
      }

      const targetFolder = findMatchingSystemFolder(backupChild, localChildren);

      if (targetFolder && targetFolder.id && backupChild.children) {
        const folderName =
          targetFolder.title || targetFolder.folderType || "system";
        console.log(`[BookmarkRepository] Syncing folder: ${folderName}`);
        await smartSync(
          targetFolder.id,
          backupChild.children,
          localIndex,
          folderName,
        );
      } else {
        // 有映射但找不到匹配的本地文件夹
        console.warn(
          `[BookmarkRepository] No matching system folder found for ${backupChild.title}`,
        );
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[BookmarkRepository] Restore completed in ${elapsed}ms`);
  }

  /**
   * 清空文件夹
   */
  async emptyFolder(id: string): Promise<void> {
    const children = await BrowserBookmarksAPI.getChildren(id);
    for (const child of children) {
      await BrowserBookmarksAPI.removeTree(child.id);
    }
  }

  /**
   * 递归创建子节点
   */
  async createChildren(parentId: string, children: BookmarkNode[]): Promise<void> {
    await createChildren(parentId, children);
  }

  /**
   * 获取本地书签数量
   */
  async getLocalCount(): Promise<number> {
    const tree = await this.getTree();
    return countBookmarks(tree);
  }

  /**
   * 合并备份（只添加不存在的）
   */
  async mergeFromBackup(backup: CloudBackup | BookmarkNode[]): Promise<void> {
    let tree: BookmarkNode[];

    if (Array.isArray(backup)) {
      tree = backup;
    } else {
      tree = backup.data;
    }

    const root = tree[0];
    if (!root || !root.children) {
      throw new Error("Invalid bookmark backup format");
    }

    // 获取本地书签树
    const localTree = await this.getTree();
    const localRoot = localTree[0];
    if (!localRoot || !localRoot.children) {
      throw new Error("无法获取本地书签根结构");
    }

    console.log(`[BookmarkRepository] Merging ${root.children.length} system folders...`);

    // 遍历云端的系统文件夹
    for (const child of root.children) {
      // 检查是否有跨浏览器映射
      if (!hasCrossBrowserMapping(child)) {
        // 静默跳过没有映射的系统文件夹（如 Firefox 的 menu________）
        continue;
      }

      // 使用 findMatchingSystemFolder 匹配本地文件夹
      const targetFolder = findMatchingSystemFolder(child, localRoot.children);

      if (targetFolder && targetFolder.id && child.children) {
        const folderName = targetFolder.title || child.title;
        console.log(`[BookmarkRepository] Merging folder: ${folderName} (${child.children.length} items)`);
        await mergeNodes(targetFolder.id, child.children);
      } else {
        // 有映射但找不到匹配的本地文件夹
        console.warn(
          `[BookmarkRepository] No matching system folder found for ${child.title}`,
        );
      }
    }

    console.log(`[BookmarkRepository] Merge completed`);
  }
}

/**
 * 导出单例实例
 */
export const bookmarkRepository = new BookmarkRepository();
