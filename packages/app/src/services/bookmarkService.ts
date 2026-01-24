import { BookmarksAPI } from "../lib/bookmarksApi";
import { getBrowserInfo } from "../lib/browser";
import { generateHash } from "../lib/utils";
import { BookmarkMetadata, BookmarkNode, CloudBackup } from "../types";

// ============================================================================
// 跨浏览器系统文件夹映射
// Chrome/Edge: 使用 folderType 属性 ("bookmarks-bar", "other", "mobile", "managed")
// Firefox: 使用 ID 模式 ("toolbar_____", "unfiled_____", "menu________", "mobile______")
// ============================================================================

/** Chrome/Edge folderType -> Firefox ID */
const FOLDER_TYPE_TO_FIREFOX_ID: Record<string, string> = {
  "bookmarks-bar": "toolbar_____",
  other: "unfiled_____",
  mobile: "mobile______",
};

/** Firefox ID -> Chrome/Edge folderType */
const FIREFOX_ID_TO_FOLDER_TYPE: Record<string, string> = {
  toolbar_____: "bookmarks-bar",
  unfiled_____: "other",
  mobile______: "mobile",
};

/** Firefox 系统文件夹 ID 列表 */
const FIREFOX_SYSTEM_IDS = [
  "toolbar_____",
  "unfiled_____",
  "menu________",
  "mobile______",
];

/**
 * 判断节点是否为系统根文件夹（不应参与内容比对）
 */
function isSystemRootFolder(node: BookmarkNode): boolean {
  if (node.url) return false;
  if (!node.id) return false; // 没有 id 的节点不是系统文件夹
  if (node.id === "0" && !node.title) return true;
  if (node.id === "root________") return true;
  if (node.folderType) return true;
  return FIREFOX_SYSTEM_IDS.includes(node.id);
}

/**
 * 查找本地系统文件夹匹配（跨浏览器）
 */
function findMatchingSystemFolder(
  backupNode: BookmarkNode,
  localFolders: BookmarkNode[],
): BookmarkNode | null {
  if (backupNode.folderType) {
    const match = localFolders.find(
      (l) => l.folderType === backupNode.folderType,
    );
    if (match) return match;
    const firefoxId = FOLDER_TYPE_TO_FIREFOX_ID[backupNode.folderType];
    if (firefoxId) {
      const firefoxMatch = localFolders.find((l) => l.id === firefoxId);
      if (firefoxMatch) return firefoxMatch;
    }
  }

  if (backupNode.id) {
    const mappedType = FIREFOX_ID_TO_FOLDER_TYPE[backupNode.id];
    if (mappedType) {
      const match = localFolders.find((l) => l.folderType === mappedType);
      if (match) return match;
      const sameIdMatch = localFolders.find((l) => l.id === backupNode.id);
      if (sameIdMatch) return sameIdMatch;
    }
  }

  const titleMatch = localFolders.find((l) => l.title === backupNode.title);
  if (titleMatch) return titleMatch;

  return null;
}

// ============================================================================
// 全局索引类型定义
// ============================================================================

/** 节点位置信息（通用） */
interface NodeLocation {
  id?: string; // 云端数据可能没有 id
  hash?: string; // 内容哈希（用于跨浏览器匹配）
  parentId: string;
  index: number;
  title: string;
  url?: string; // 书签有 URL
  path?: string; // 文件夹有路径
  isFolder: boolean;
}

/** 书签位置信息 */
interface BookmarkLocation {
  id?: string; // 云端数据可能没有 id
  hash?: string; // 内容哈希
  parentId: string;
  index: number;
  title: string;
  url: string;
}

/** 文件夹位置信息 */
interface FolderLocation {
  id?: string; // 云端数据可能没有 id
  hash?: string; // 内容哈希（文件夹通常不需要 hash，但保留字段一致性）
  parentId: string;
  index: number;
  title: string;
  path: string;
}

/** 全局索引 */
interface GlobalIndex {
  /** Hash -> 节点信息（主要匹配方式） */
  hashToNode: Map<string, NodeLocation>;
  /** URL -> 书签列表（兜底匹配，可能有多个相同 URL） */
  urlToBookmarks: Map<string, BookmarkLocation[]>;
  /** 路径 -> 文件夹信息（兜底匹配） */
  pathToFolder: Map<string, FolderLocation>;
  /** ID -> 路径 */
  idToPath: Map<string, string>;
}

// ============================================================================
// 全局索引构建
// ============================================================================

/**
 * 标准化 URL
 */
function normalizeUrl(url: string | undefined): string {
  if (!url) return "";
  return url
    .trim()
    .replace(/\/+$/, "")
    .replace(/^(https?):\/\//i, (_, proto) => proto.toLowerCase() + "://");
}

/**
 * 通过 Hash 查找节点（优先从本地子节点查找，否则从全局索引构建）
 */
function findNodeByHash(
  hash: string,
  localIndex: GlobalIndex,
  localChildren: BookmarkNode[],
  processedLocalIds: Set<string>,
): BookmarkNode | undefined {
  const hashMatch = localIndex.hashToNode.get(hash);
  if (!hashMatch || !hashMatch.id || processedLocalIds.has(hashMatch.id)) {
    return undefined;
  }

  // 先尝试从本地子节点获取完整信息
  const localNode = localChildren.find((l) => l.id === hashMatch.id);
  if (localNode) {
    return localNode;
  }

  // 节点不在当前文件夹，从全局索引构建基本信息
  return {
    id: hashMatch.id,
    title: hashMatch.title,
    url: hashMatch.url,
    parentId: hashMatch.parentId,
    index: hashMatch.index,
    children: hashMatch.isFolder ? [] : undefined,
  };
}

/**
 * 构建全局索引（本地树：动态计算 hash）
 */
async function buildGlobalIndex(tree: BookmarkNode[]): Promise<GlobalIndex> {
  const hashToNode = new Map<string, NodeLocation>();
  const urlToBookmarks = new Map<string, BookmarkLocation[]>();
  const pathToFolder = new Map<string, FolderLocation>();
  const idToPath = new Map<string, string>();

  async function traverse(node: BookmarkNode, parentPath: string) {
    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;

    if (node.url) {
      // 书签：计算 hash
      const normalizedUrl = normalizeUrl(node.url);
      const hash = await generateHash(normalizedUrl, node.title);
      
      const location: BookmarkLocation = {
        id: node.id,
        hash,
        parentId: node.parentId || "",
        index: node.index ?? 0,
        title: node.title,
        url: normalizedUrl,
      };
      
      // Hash 索引（主要匹配方式）
      hashToNode.set(hash, {
        id: node.id,
        hash,
        parentId: node.parentId || "",
        index: node.index ?? 0,
        title: node.title,
        url: normalizedUrl,
        isFolder: false,
      });
      
      // URL 索引（兜底匹配）
      const existing = urlToBookmarks.get(normalizedUrl) || [];
      existing.push(location);
      urlToBookmarks.set(normalizedUrl, existing);
    } else if (node.children) {
      // 文件夹
      if (!isSystemRootFolder(node)) {
        const location: FolderLocation = {
          id: node.id,
          parentId: node.parentId || "",
          index: node.index ?? 0,
          title: node.title,
          path: currentPath,
        };
        
        // 路径索引（文件夹不需要 hash，按路径匹配）
        pathToFolder.set(currentPath, location);
        if (node.id) {
          idToPath.set(node.id, currentPath);
        }
      }

      for (const child of node.children) {
        await traverse(child, isSystemRootFolder(node) ? "" : currentPath);
      }
    }
  }

  for (const node of tree) {
    await traverse(node, "");
  }

  return { hashToNode, urlToBookmarks, pathToFolder, idToPath };
}

// ============================================================================
// 三阶段同步实现
// ============================================================================

/**
 * 执行智能同步（三阶段）
 * @param localParentId 本地系统文件夹 ID
 * @param cloudNodes 云端该文件夹下的节点
 * @param localIndex 本地全局索引
 * @param localParentPath 本地父路径
 */
async function smartSync(
  localParentId: string,
  cloudNodes: BookmarkNode[],
  localIndex: GlobalIndex,
  localParentPath: string,
): Promise<void> {
  console.log(
    `[BookmarkService] Syncing folder "${localParentPath}" (${cloudNodes.length} cloud nodes)`,
  );

  // 获取当前本地文件夹的子节点
  const localChildren = (await BookmarksAPI.getChildren(
    localParentId,
  )) as BookmarkNode[];

  console.log(
    `[BookmarkService] Local folder has ${localChildren.length} children`,
  );

  // 已处理的本地 ID（防止重复处理）
  const processedLocalIds = new Set<string>();
  // 已使用的 URL（用于检测重复）
  const usedUrls = new Set<string>();

  // 统计信息
  let stats = {
    bookmarksCreated: 0,
    bookmarksMoved: 0,
    bookmarksUpdated: 0,
    foldersCreated: 0,
    foldersMoved: 0,
    itemsDeleted: 0,
  };

  // Phase 1 & 2: 处理云端节点（创建/移动/更新）
  for (let i = 0; i < cloudNodes.length; i++) {
    const cloudNode = cloudNodes[i];

    if (cloudNode.url) {
      // === 处理书签 ===
      const normalizedUrl = normalizeUrl(cloudNode.url);
      let matchedLocal: BookmarkNode | undefined;

      // 1. 优先通过 Hash 匹配（最可靠）
      if (cloudNode.hash) {
        matchedLocal = findNodeByHash(
          cloudNode.hash,
          localIndex,
          localChildren,
          processedLocalIds,
        );
      }

      // 2. Hash 匹配失败，通过 URL 兜底匹配（兼容旧数据或重复URL）
      if (!matchedLocal) {
        // 先在当前文件夹找
        matchedLocal = localChildren.find(
          (local) =>
            local.id &&
            normalizeUrl(local.url) === normalizedUrl &&
            !processedLocalIds.has(local.id),
        );

        // 如果当前文件夹没有，从全局索引找
        if (!matchedLocal && !usedUrls.has(normalizedUrl)) {
          const globalMatches = localIndex.urlToBookmarks.get(normalizedUrl);
          if (globalMatches && globalMatches.length > 0) {
            for (const gm of globalMatches) {
              if (gm.id && !processedLocalIds.has(gm.id)) {
                matchedLocal = {
                  id: gm.id,
                  title: gm.title,
                  url: gm.url,
                  parentId: gm.parentId,
                  index: gm.index,
                };
                break;
              }
            }
          }
        }
      }

      if (matchedLocal && matchedLocal.id) {
        processedLocalIds.add(matchedLocal.id);
        usedUrls.add(normalizedUrl);

        // 检查是否需要更新
        const updates: { title?: string; url?: string } = {};

        // 更新标题
        if ((matchedLocal.title?.trim() || "") !== (cloudNode.title?.trim() || "")) {
          updates.title = cloudNode.title;
        }

        // 更新 URL（新功能！）
        if (normalizeUrl(matchedLocal.url) !== normalizedUrl) {
          updates.url = cloudNode.url;
        }

        if (Object.keys(updates).length > 0) {
          try {
            await BookmarksAPI.update(matchedLocal.id, updates);
            stats.bookmarksUpdated++;
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to update bookmark ${matchedLocal.id}:`,
              error,
            );
          }
        }

        // 调整位置（如果不在当前文件夹或索引不对）
        if (
          matchedLocal.parentId !== localParentId ||
          matchedLocal.index !== i
        ) {
          try {
            await BookmarksAPI.move(matchedLocal.id, {
              parentId: localParentId,
              index: i,
            });
            stats.bookmarksMoved++;
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to move bookmark ${matchedLocal.id}:`,
              error,
            );
          }
        }
      } else {
        // 创建新书签
        usedUrls.add(normalizedUrl);
        try {
          const newBookmark = await BookmarksAPI.create({
            parentId: localParentId,
            title: cloudNode.title,
            url: cloudNode.url,
            index: i,
          });
          if (newBookmark.id) {
            processedLocalIds.add(newBookmark.id); // 记录新创建的 ID，防止 Phase 3 误删
            stats.bookmarksCreated++;
          }
        } catch (error) {
          console.warn(
            `[BookmarkService] Failed to create bookmark "${cloudNode.title}":`,
            error,
          );
        }
      }
    } else if (cloudNode.children) {
      // === 处理文件夹 ===
      const cloudFolderPath = localParentPath
        ? `${localParentPath}/${cloudNode.title}`
        : cloudNode.title;
      let matchedFolder: BookmarkNode | undefined;

      // 1. 先在当前文件夹找同名文件夹（简单匹配）
      matchedFolder = localChildren.find(
        (local) =>
          local.id &&
          !local.url &&
          (local.title?.trim() || "") === (cloudNode.title?.trim() || "") &&
          !processedLocalIds.has(local.id),
      );

      // 2. 如果没找到，从全局索引按路径找
      if (!matchedFolder) {
        const globalFolder = localIndex.pathToFolder.get(cloudFolderPath);
        if (globalFolder && globalFolder.id && !processedLocalIds.has(globalFolder.id)) {
          matchedFolder = {
            id: globalFolder.id,
            title: globalFolder.title,
            parentId: globalFolder.parentId,
            index: globalFolder.index,
            children: [],
          };
        }
      }

      if (matchedFolder && matchedFolder.id) {
        processedLocalIds.add(matchedFolder.id);

        // 更新标题（如果改名了）
        if ((matchedFolder.title?.trim() || "") !== (cloudNode.title?.trim() || "")) {
          try {
            await BookmarksAPI.update(matchedFolder.id, { title: cloudNode.title });
            stats.bookmarksUpdated++; // 复用统计字段
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to update folder title ${matchedFolder.id}:`,
              error,
            );
          }
        }

        // 调整位置（如果移动了）
        if (
          matchedFolder.parentId !== localParentId ||
          matchedFolder.index !== i
        ) {
          try {
            await BookmarksAPI.move(matchedFolder.id, {
              parentId: localParentId,
              index: i,
            });
            stats.foldersMoved++;
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to move folder ${matchedFolder.id}:`,
              error,
            );
          }
        }

        // 递归同步子节点
        await smartSync(
          matchedFolder.id,
          cloudNode.children,
          localIndex,
          cloudFolderPath,
        );
      } else {
        // 创建新文件夹
        try {
          const created = await BookmarksAPI.create({
            parentId: localParentId,
            title: cloudNode.title,
            index: i,
          });
          if (created.id) {
            processedLocalIds.add(created.id); // 记录新创建的 ID，防止 Phase 3 误删
            stats.foldersCreated++;
            
            // 递归创建子节点
            await createChildren(created.id, cloudNode.children);
          }
        } catch (error) {
          console.warn(
            `[BookmarkService] Failed to create folder "${cloudNode.title}":`,
            error,
          );
        }
      }
    }
  }

  // Phase 3: 删除本地多余的节点
  // 重新获取当前子节点（因为可能有移动/创建）
  const finalLocalChildren = (await BookmarksAPI.getChildren(
    localParentId,
  )) as BookmarkNode[];

  for (const localNode of finalLocalChildren) {
    if (!localNode.id || processedLocalIds.has(localNode.id)) continue;

    // 这个节点在云端不存在，删除它
    try {
      const removeMethod = localNode.url
        ? BookmarksAPI.remove(localNode.id)
        : BookmarksAPI.removeTree(localNode.id);
      
      await removeMethod;
      stats.itemsDeleted++;
    } catch (error) {
      const nodeType = localNode.url ? "bookmark" : "folder";
      console.warn(
        `[BookmarkService] Failed to delete ${nodeType} ${localNode.id}:`,
        error,
      );
    }
  }

  // 输出统计信息
  if (
    stats.bookmarksCreated +
      stats.bookmarksMoved +
      stats.bookmarksUpdated +
      stats.foldersCreated +
      stats.foldersMoved +
      stats.itemsDeleted >
    0
  ) {
    console.log(
      `[BookmarkService] Sync stats for "${localParentPath}":`,
      `Created: ${stats.bookmarksCreated} bookmarks, ${stats.foldersCreated} folders`,
      `| Moved: ${stats.bookmarksMoved} bookmarks, ${stats.foldersMoved} folders`,
      `| Updated: ${stats.bookmarksUpdated} bookmarks`,
      `| Deleted: ${stats.itemsDeleted} items`,
    );
  }
}

/**
 * 递归创建子节点
 */
async function createChildren(
  parentId: string,
  children: BookmarkNode[],
): Promise<void> {
  for (const node of children) {
    try {
      const created = await BookmarksAPI.create({
        parentId,
        title: node.title,
        url: node.url,
        index: node.index,
      });

      if (created.id && node.children && node.children.length > 0) {
        await createChildren(created.id, node.children);
      }
    } catch {
      // 忽略创建失败
    }
  }
}

// ============================================================================
// 导出的 BookmarkService
// ============================================================================

/**
 * 为单个书签节点分配 Hash（递归处理子节点）
 * 只保留云端同步必需的字段
 */
async function assignHashToNode(node: BookmarkNode): Promise<BookmarkNode> {
  const newNode: BookmarkNode = {
    title: node.title, // 显示名称
    url: node.url,  // 书签地址（书签必需）
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

export const BookmarkService = {
  /** 获取完整书签树 */
  async getTree(): Promise<BookmarkNode[]> {
    return (await BookmarksAPI.getTree()) as BookmarkNode[];
  },

  /** 创建云端备份 */
  async createCloudBackup(): Promise<CloudBackup> {
    const tree = await this.getTree();
    
    // 为所有节点分配 Hash（动态计算）
    const treeWithHash = await this.assignHashes(tree);
    
    const count = this.countBookmarks(treeWithHash);
    const browserInfo = getBrowserInfo();

    const metadata: BookmarkMetadata = {
      timestamp: Date.now(),
      totalCount: count,
      clientVersion: "2.0.0-hash", // Hash 版本
      browser: browserInfo.name,
      browserVersion: browserInfo.version,
      stats: {
        totalFolders: this.countFolders(treeWithHash),
      },
    };

    return { metadata, data: treeWithHash };
  },

  /**
   * 为书签树的所有节点分配 Hash
   */
  async assignHashes(nodes: BookmarkNode[]): Promise<BookmarkNode[]> {
    return Promise.all(nodes.map((node) => assignHashToNode(node)));
  },

  /** 标准化 URL */
  normalizeUrl,

  /**
   * 从备份恢复（使用全局索引 + 三阶段同步）
   */
  async restoreFromBackup(backup: CloudBackup | BookmarkNode[]): Promise<void> {
    const startTime = Date.now();
    console.log("[BookmarkService] Starting restore from backup...");

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

    const backupCount = this.countBookmarks(tree);
    console.log(`[BookmarkService] Backup contains ${backupCount} bookmarks`);

    // 获取本地书签树并构建全局索引
    console.log("[BookmarkService] Building global index...");
    const localTree = await this.getTree();
    const localIndex = await buildGlobalIndex(localTree);
    console.log(
      `[BookmarkService] Index: ${localIndex.urlToBookmarks.size} URLs, ${localIndex.pathToFolder.size} folders`,
    );

    const localRoot = localTree[0];
    if (!localRoot || !localRoot.children) {
      throw new Error("无法获取本地书签根结构");
    }

    const localChildren = localRoot.children;

    // 对每个系统文件夹执行智能同步
    console.log(
      `[BookmarkService] Syncing ${root.children.length} system folders...`,
    );

    for (const backupChild of root.children) {
      const targetFolder = findMatchingSystemFolder(backupChild, localChildren);

      if (targetFolder && targetFolder.id && backupChild.children) {
        const folderName =
          targetFolder.title || targetFolder.folderType || "system";
        console.log(`[BookmarkService] Syncing folder: ${folderName}`);
        await smartSync(
          targetFolder.id,
          backupChild.children,
          localIndex,
          folderName,
        );
      } else {
        // 静默忽略跨浏览器不兼容的系统文件夹
        // Firefox: "书签菜单" (menu________)、"移动设备书签" (mobile______)
        // 这些文件夹在 Chrome/Edge 中可能不存在
        const ignoredFolderIds = ["menu________", "mobile______"];
        const shouldIgnore = backupChild.id && ignoredFolderIds.includes(backupChild.id);
        
        if (!shouldIgnore) {
          console.warn(
            `[BookmarkService] No matching system folder found for ${backupChild.title}`,
          );
        }
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[BookmarkService] Restore completed in ${elapsed}ms`);
  },

  /** 清空文件夹 */
  async emptyFolder(id: string): Promise<void> {
    const children = await BookmarksAPI.getChildren(id);
    for (const child of children) {
      await BookmarksAPI.removeTree(child.id);
    }
  },

  /** 递归创建子节点 */
  async createChildren(
    parentId: string,
    children: BookmarkNode[],
  ): Promise<void> {
    await createChildren(parentId, children);
  },

  /** 统计书签数量 */
  countBookmarks(nodes: BookmarkNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (node.url) count++;
      if (node.children && node.children.length > 0) {
        count += this.countBookmarks(node.children);
      }
    }
    return count;
  },

  /** 统计文件夹数量 */
  countFolders(nodes: BookmarkNode[]): number {
    let count = 0;
    for (const node of nodes) {
      if (!node.url && node.children) {
        if (node.id !== "0") count++;
        count += this.countFolders(node.children);
      }
    }
    return count;
  },

  /** 合并备份（只添加不存在的） */
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

    for (const child of root.children) {
      if (child.id === "1" || child.id === "2") {
        await this.mergeNodes(child.id, child.children || []);
      }
    }
  },

  /** 合并节点（只添加新的） */
  async mergeNodes(parentId: string, nodes: BookmarkNode[]): Promise<void> {
    const localChildren = await BookmarksAPI.getChildren(parentId);
    let addedCount = 0;

    for (const node of nodes) {
      if (node.url) {
        const exists = localChildren.some((local) => local.url === node.url);
        if (!exists) {
          try {
            await BookmarksAPI.create({
              parentId,
              title: node.title,
              url: node.url,
              index: node.index,
            });
            addedCount++;
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to create bookmark during merge: ${node.title}`,
              error,
            );
          }
        }
      } else {
        const existingFolder = localChildren.find(
          (local) => !local.url && local.title === node.title,
        );

        if (existingFolder) {
          if (node.children && node.children.length > 0) {
            await this.mergeNodes(existingFolder.id, node.children);
          }
        } else {
          try {
            const newFolder = await BookmarksAPI.create({
              parentId,
              title: node.title,
              index: node.index,
            });
            addedCount++;

            if (node.children && node.children.length > 0) {
              await createChildren(newFolder.id, node.children);
            }
          } catch (error) {
            console.warn(
              `[BookmarkService] Failed to create folder during merge: ${node.title}`,
              error,
            );
          }
        }
      }
    }

    if (addedCount > 0) {
      console.log(`[BookmarkService] Merged ${addedCount} new items`);
    }
  },

  /** 获取本地书签数量 */
  async getLocalCount(): Promise<number> {
    const tree = await this.getTree();
    return this.countBookmarks(tree);
  },

  /** 提取签名（用于快速比对） */
  extractSignatures(nodes: BookmarkNode[]): string[] {
    const signatures: string[] = [];

    for (const node of nodes) {
      if (!isSystemRootFolder(node)) {
        if (node.url) {
          signatures.push(`B|${node.url.trim()}|${node.title.trim()}`);
        } else {
          signatures.push(
            `F|${node.title.trim()}|${node.children?.length ?? 0}`,
          );
        }
      }

      if (node.children?.length) {
        signatures.push(...this.extractSignatures(node.children));
      }
    }

    return signatures;
  },

  /** 提取签名（使用 hash，用于精确比对）*/
  extractSignaturesWithHash(nodes: BookmarkNode[]): string[] {
    const signatures: string[] = [];

    for (const node of nodes) {
      if (!isSystemRootFolder(node)) {
        if (node.url && node.hash) {
          // 书签：使用 hash 作为唯一标识
          signatures.push(`B|${node.hash}`);
        } else if (!node.url) {
          // 文件夹：使用标题和子节点数量
          signatures.push(
            `F|${node.title.trim()}|${node.children?.length ?? 0}`,
          );
        }
      }

      if (node.children?.length) {
        signatures.push(...this.extractSignaturesWithHash(node.children));
      }
    }

    return signatures;
  },

  /** 比对本地和云端是否一致 */
  async compareWithCloud(
    localTree: BookmarkNode[],
    cloudData: CloudBackup | BookmarkNode[],
  ): Promise<boolean> {
    const cloudTree = Array.isArray(cloudData) ? cloudData : cloudData.data;

    // 为了准确比对，先将本地树也转换为云端格式（精简字段 + 添加 hash）
    const normalizedLocalTree = await this.assignHashes(localTree);

    const localSigs = this.extractSignaturesWithHash(normalizedLocalTree);
    const cloudSigs = this.extractSignaturesWithHash(cloudTree);

    console.log(
      `[BookmarkService] Comparing signatures: local=${localSigs.length}, cloud=${cloudSigs.length}`,
    );

    if (localSigs.length !== cloudSigs.length) {
      console.log("[BookmarkService] Signature count differs");
      return false;
    }

    // 找出第一个不同的签名（用于调试）
    for (let i = 0; i < localSigs.length; i++) {
      if (localSigs[i] !== cloudSigs[i]) {
        console.log(
          `[BookmarkService] Signature differs at index ${i}:\nLocal: ${localSigs[i]}\nCloud: ${cloudSigs[i]}`,
        );
        return false;
      }
    }

    console.log("[BookmarkService] Signatures match");
    return true;
  },
};
