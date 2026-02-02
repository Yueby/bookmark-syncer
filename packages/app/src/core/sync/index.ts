/**
 * Sync 领域统一导出
 */

// Types from storage (re-export)
export type {
    CachedBackup,
    CachedBackupList,
    CloudBackupFile,
    CloudInfo
} from "../storage/types";

// Sync-specific types
export type {
    SmartSyncResult,
    SyncLock,
    SyncResult,
    SyncState
} from "./types";

export {
    LOCK_TIMEOUT_MS, SYNC_LOCK_KEY
} from "./types";

// 锁管理
export {
    acquireSyncLock,
    releaseSyncLock, SyncLockManager, syncLockManager
} from "./lock-manager";

// 状态管理
export {
    getLastSyncTime, getSyncState,
    setSyncState, SyncStateManager, syncStateManager
} from "./state-manager";

// 同步策略
export { smartPull } from "./strategies/pull-strategy";
export { smartPush } from "./strategies/push-strategy";
export { smartSync } from "./strategies/smart-sync-strategy";

// 云端操作
export {
    getCloudBackupList, getCloudInfo, restoreFromCloudBackup
} from "./cloud-operations";

// 冲突解决
export { checkNeedsConflictResolution } from "./conflict-resolver";

