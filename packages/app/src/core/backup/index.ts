/**
 * Backup 领域统一导出
 * 提供本地快照管理功能
 */

// 类型定义
export type {
    CreateSnapshotParams, Snapshot, SnapshotConfig
} from "./types";

export {
    DEFAULT_SNAPSHOT_CONFIG, SNAPSHOT_REASONS
} from "./types";

// 快照管理
export { SnapshotManager, snapshotManager } from "./snapshot-manager";
