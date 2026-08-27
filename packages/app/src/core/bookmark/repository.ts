/**
 * 书签仓储层
 * 提供书签的 CRUD 操作和高层 API
 */
import { BrowserBookmarksAPI } from "../../infrastructure/browser/api";
import type { BookmarkMetadata, BookmarkNode, CloudBackup } from "../../types";
import { countBookmarks } from "./comparator";
import { assignHashes } from "./hash-calculator";
import { buildGlobalIndex, createChildren, deleteUnprocessedNodes, mergeNodes, smartSync, type SharedSyncState } from "./merger";
import { findMatchingSystemFolder, hasCrossBrowserMapping, annotateSystemFolders } from "./normalizer";

/**
 * 书签仓储类
 * 封装所有书签相关的业务逻辑
 */
export class BookmarkRepository {
  /**
   * 获取完整书签树
   */
  async getTree(): Promise<BookmarkNode[]> {
    const tree = (await BrowserBookmarksAPI.getTree()) as BookmarkNode[];
    // 为 Chromium 系统根标注 folderType（真实 Chrome API 不提供该字段）
    return annotateSystemFolders(tree);
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

    // 兼容旧版云端数据：顶层系统文件夹可能无 folderType/id，按位置推断
    annotateSystemFolders(tree);

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

    // 跨顶层文件夹共享的同步状态：
    // - processedLocalIds 共享 → 跨文件夹移动/重复书签不会互抢同一物理节点
    // - 删除阶段延后到所有文件夹处理完后统一执行（防止“先删后配”丢数据）
    const shared: SharedSyncState = {
      processedLocalIds: new Set<string>(),
      visitedFolderIds: new Set<string>(),
      folderBookmarkKeys: new Map<string, Set<string>>(),
      folderUsedUrls: new Map<string, Set<string>>(),
    };

    for (const backupChild of root.children) {
      // 检查是否有跨浏览器映射
      if (!hasCrossBrowserMapping(backupChild)) {
        // 静默跳过没有映射的系统文件夹（如 Firefox 的 menu________）
        continue;
      }

      const targetFolder = findMatchingSystemFolder(backupChild, localChildren);

      if (targetFolder && targetFolder.id && backupChild.children) {
        // folderType 优先：与 buildGlobalIndex 的路径前缀一致，
        // 避免 bar/Work 与 other/Work 同路径冲突
        const folderName =
          targetFolder.folderType || targetFolder.title || "system";
        console.log(`[BookmarkRepository] Syncing folder: ${folderName}`);
        await smartSync(
          targetFolder.id,
          backupChild.children,
          localIndex,
          folderName,
          shared,
        );
      } else {
        // 有映射但找不到匹配的本地文件夹
        console.warn(
          `[BookmarkRepository] No matching system folder found for ${backupChild.title}`,
        );
      }
    }

    // 统一删除阶段：清理所有参与同步文件夹中未被云端覆盖的本地节点
    await deleteUnprocessedNodes(shared);

    const elapsed = Date.now() - startTime;
    console.log(`[BookmarkRepository] Restore completed in ${elapsed}ms`);
  }

  /**
   * 清空文件夹
   */
  async emptyFolder(id: string): Promise<void> {
    const children = await BrowserBookmarksAPI.getChildren(id);
    for (const child of children) {
      try {
        await BrowserBookmarksAPI.removeTree(child.id);
      } catch (error) {
        const errorMsg = (error as Error).message || '';
        // 如果书签已被删除，静默跳过
        if (errorMsg.includes("Can't find bookmark")) {
          console.log(`[Repository] Child ${child.id} already removed, skipping`);
        } else {
          console.warn(`[Repository] Failed to remove child ${child.id}:`, error);
        }
      }
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

    // 兼容旧版云端数据：顶层系统文件夹可能无 folderType/id，按位置推断
    annotateSystemFolders(tree);

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
