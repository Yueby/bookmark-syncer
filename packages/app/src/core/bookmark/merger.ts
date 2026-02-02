/**
 * 书签树合并与智能同步
 * 包含全局索引构建、三阶段同步算法
 */
import { BrowserBookmarksAPI } from "../../infrastructure/browser/api";
import { generateHash } from "../../infrastructure/utils/crypto";
import type { BookmarkNode } from "../../types";
import { isSystemRootFolder, normalizeUrl } from "./normalizer";
import type {
  BookmarkLocation,
  FolderLocation,
  GlobalIndex,
  NodeLocation,
} from "./types";

/**
 * 构建全局索引（本地树：动态计算 hash）
 * 优化：并行计算所有书签的 hash，提升大量书签时的性能
 */
export async function buildGlobalIndex(tree: BookmarkNode[]): Promise<GlobalIndex> {
  const hashToNode = new Map<string, NodeLocation>();
  const urlToBookmarks = new Map<string, BookmarkLocation[]>();
  const pathToFolder = new Map<string, FolderLocation>();
  const idToPath = new Map<string, string>();

  // 第一步：收集所有书签和文件夹（不计算 hash）
  interface BookmarkInfo {
    node: BookmarkNode;
    normalizedUrl: string;
    parentId: string;
    index: number;
  }

  interface FolderInfo {
    node: BookmarkNode;
    path: string;
    parentId: string;
    index: number;
  }

  const bookmarksToHash: BookmarkInfo[] = [];
  const foldersToIndex: FolderInfo[] = [];

  function collect(node: BookmarkNode, parentPath: string) {
    const currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;

    if (node.url) {
      // 收集书签信息
      bookmarksToHash.push({
        node,
        normalizedUrl: normalizeUrl(node.url),
        parentId: node.parentId || "",
        index: node.index ?? 0,
      });
    } else if (node.children) {
      // 收集文件夹信息
      if (!isSystemRootFolder(node)) {
        foldersToIndex.push({
          node,
          path: currentPath,
          parentId: node.parentId || "",
          index: node.index ?? 0,
        });
      }

      // 递归收集子节点
      for (const child of node.children) {
        collect(child, isSystemRootFolder(node) ? "" : currentPath);
      }
    }
  }

  // 收集所有节点
  for (const node of tree) {
    collect(node, "");
  }

  // 第二步：并行计算所有书签的 hash（性能优化关键）
  const hashes = await Promise.all(
    bookmarksToHash.map(({ normalizedUrl, node }) =>
      generateHash(normalizedUrl, node.title)
    )
  );

  // 第三步：构建索引（同步操作，很快）
  bookmarksToHash.forEach(({ node, normalizedUrl, parentId, index }, i) => {
    const hash = hashes[i];

    const location: BookmarkLocation = {
      id: node.id,
      hash,
      parentId,
      index,
      title: node.title,
      url: normalizedUrl,
    };

    // Hash 索引（主要匹配方式）
    hashToNode.set(hash, {
      id: node.id,
      hash,
      parentId,
      index,
      title: node.title,
      url: normalizedUrl,
      isFolder: false,
    });

    // URL 索引（兜底匹配）
    const existing = urlToBookmarks.get(normalizedUrl) || [];
    existing.push(location);
    urlToBookmarks.set(normalizedUrl, existing);
  });

  // 第四步：索引文件夹
  foldersToIndex.forEach(({ node, path, parentId, index }) => {
    const location: FolderLocation = {
      id: node.id,
      parentId,
      index,
      title: node.title,
      path,
    };

    pathToFolder.set(path, location);
    if (node.id) {
      idToPath.set(node.id, path);
    }
  });

  return { hashToNode, urlToBookmarks, pathToFolder, idToPath };
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
 * 递归创建子节点
 */
export async function createChildren(
  parentId: string,
  children: BookmarkNode[],
): Promise<void> {
  for (const child of children) {
    if (child.url) {
      // 创建书签
      try {
        await BrowserBookmarksAPI.create({
          parentId,
          title: child.title,
          url: child.url,
        });
      } catch (error) {
        console.warn(
          `[Merger] Failed to create bookmark "${child.title}":`,
          error
        );
      }
    } else if (child.children) {
      // 创建文件夹并递归
      try {
        const newFolder = await BrowserBookmarksAPI.create({
          parentId,
          title: child.title,
        });
        if (newFolder.id && child.children.length > 0) {
          await createChildren(newFolder.id, child.children);
        }
      } catch (error) {
        console.warn(
          `[Merger] Failed to create folder "${child.title}":`,
          error
        );
      }
    }
  }
}

/**
 * 执行智能同步（三阶段）
 * @param localParentId 本地系统文件夹 ID
 * @param cloudNodes 云端该文件夹下的节点
 * @param localIndex 本地全局索引
 * @param localParentPath 本地父路径
 */
export async function smartSync(
  localParentId: string,
  cloudNodes: BookmarkNode[],
  localIndex: GlobalIndex,
  localParentPath: string,
): Promise<void> {
  console.log(
    `[Merger] Syncing folder "${localParentPath}" (${cloudNodes.length} cloud nodes)`,
  );

  // 获取当前本地文件夹的子节点
  const localChildren = (await BrowserBookmarksAPI.getChildren(
    localParentId,
  )) as BookmarkNode[];

  console.log(`[Merger] Local folder has ${localChildren.length} children`);

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

        // 更新 URL
        if (normalizeUrl(matchedLocal.url) !== normalizedUrl) {
          updates.url = cloudNode.url;
        }

        if (Object.keys(updates).length > 0) {
          try {
            await BrowserBookmarksAPI.update(matchedLocal.id, updates);
            stats.bookmarksUpdated++;
          } catch (error) {
            console.warn(
              `[Merger] Failed to update bookmark ${matchedLocal.id}:`,
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
            await BrowserBookmarksAPI.move(matchedLocal.id, {
              parentId: localParentId,
              index: i,
            });
            stats.bookmarksMoved++;
          } catch (error) {
            const errorMsg = (error as Error).message || '';
            // 书签ID不存在是正常情况（可能被其他文件夹处理过）
            if (errorMsg.includes("Can't find bookmark")) {
              console.log(
                `[Merger] Bookmark ${matchedLocal.id} already processed, skipping move`,
              );
            } else {
              // 其他错误才需要警告
              console.warn(
                `[Merger] Failed to move bookmark ${matchedLocal.id}:`,
                error,
              );
            }
          }
        }
      } else {
        // 创建新书签
        usedUrls.add(normalizedUrl);
        try {
          const newBookmark = await BrowserBookmarksAPI.create({
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
            `[Merger] Failed to create bookmark "${cloudNode.title}":`,
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
            await BrowserBookmarksAPI.update(matchedFolder.id, { title: cloudNode.title });
            stats.bookmarksUpdated++; // 复用统计字段
          } catch (error) {
            console.warn(
              `[Merger] Failed to update folder title ${matchedFolder.id}:`,
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
            await BrowserBookmarksAPI.move(matchedFolder.id, {
              parentId: localParentId,
              index: i,
            });
            stats.foldersMoved++;
          } catch (error) {
            const errorMsg = (error as Error).message || '';
            // 文件夹ID不存在是正常情况（可能被其他文件夹处理过）
            if (errorMsg.includes("Can't find bookmark")) {
              console.log(
                `[Merger] Folder ${matchedFolder.id} already processed, skipping move`,
              );
            } else {
              // 其他错误才需要警告
              console.warn(
                `[Merger] Failed to move folder ${matchedFolder.id}:`,
                error,
              );
            }
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
          const created = await BrowserBookmarksAPI.create({
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
            `[Merger] Failed to create folder "${cloudNode.title}":`,
            error,
          );
        }
      }
    }
  }

  // Phase 3: 删除本地多余的节点
  // 重新获取当前子节点（因为可能有移动/创建）
  const finalLocalChildren = (await BrowserBookmarksAPI.getChildren(
    localParentId,
  )) as BookmarkNode[];

  for (const localNode of finalLocalChildren) {
    if (!localNode.id || processedLocalIds.has(localNode.id)) continue;

    // 这个节点在云端不存在，删除它
    try {
      const removeMethod = localNode.url
        ? BrowserBookmarksAPI.remove(localNode.id)
        : BrowserBookmarksAPI.removeTree(localNode.id);

      await removeMethod;
      stats.itemsDeleted++;
    } catch (error) {
      const errorMsg = (error as Error).message || '';
      const nodeType = localNode.url ? "bookmark" : "folder";
      
      // 节点已被删除是正常情况（可能被其他操作处理过）
      if (errorMsg.includes("Can't find bookmark")) {
        console.log(
          `[Merger] ${nodeType} ${localNode.id} already deleted, skipping`,
        );
      } else {
        // 其他错误才需要警告
        console.warn(
          `[Merger] Failed to delete ${nodeType} ${localNode.id}:`,
          error,
        );
      }
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
      `[Merger] Sync stats for "${localParentPath}":`,
      `Created: ${stats.bookmarksCreated} bookmarks, ${stats.foldersCreated} folders`,
      `| Moved: ${stats.bookmarksMoved} bookmarks, ${stats.foldersMoved} folders`,
      `| Updated: ${stats.bookmarksUpdated} bookmarks`,
      `| Deleted: ${stats.itemsDeleted} items`,
    );
  }
}

/**
 * 合并节点（只添加新的）
 * 用于保守的合并策略
 */
export async function mergeNodes(parentId: string, nodes: BookmarkNode[]): Promise<void> {
  const localChildren = await BrowserBookmarksAPI.getChildren(parentId);
  let addedCount = 0;

  for (const node of nodes) {
    if (node.url) {
      const exists = localChildren.some((local) => local.url === node.url);
      if (!exists) {
        try {
          await BrowserBookmarksAPI.create({
            parentId,
            title: node.title,
            url: node.url,
            index: node.index,
          });
          addedCount++;
        } catch (error) {
          console.warn(
            `[Merger] Failed to create bookmark during merge: ${node.title}`,
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
          await mergeNodes(existingFolder.id, node.children);
        }
      } else {
        try {
          const newFolder = await BrowserBookmarksAPI.create({
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
            `[Merger] Failed to create folder during merge: ${node.title}`,
            error,
          );
        }
      }
    }
  }

  if (addedCount > 0) {
    console.log(`[Merger] Merged ${addedCount} new items`);
  }
}
