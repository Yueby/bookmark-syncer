/**
 * Bookmark 领域统一导出
 */

// 类型定义
export type {
    BookmarkCreateOptions, BookmarkLocation,
    FolderLocation,
    GlobalIndex, NodeLocation
} from "./types";

export {
    FIREFOX_ID_TO_FOLDER_TYPE,
    FIREFOX_SYSTEM_IDS, FOLDER_TYPE_TO_FIREFOX_ID
} from "./types";

// 标准化工具
export {
    findMatchingSystemFolder, isSystemRootFolder, normalizeUrl
} from "./normalizer";

// 哈希计算
export { assignHashToNode, assignHashes } from "./hash-calculator";

// 树比对
export {
    compareWithCloud,
    countBookmarks,
    extractSignaturesWithHash
} from "./comparator";

// 树合并与同步
export {
    buildGlobalIndex, createChildren, mergeNodes
} from "./merger";

// 仓储层（推荐使用）
export { BookmarkRepository, bookmarkRepository } from "./repository";
