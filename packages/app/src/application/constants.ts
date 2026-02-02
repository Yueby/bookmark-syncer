/**
 * Application 层常量定义
 */

/** 自动同步的锁持有者标识 */
export const LOCK_HOLDER_AUTO = "auto_sync";

/** 定时同步闹钟名称 */
export const ALARM_NAME = "scheduledSync";

/** 防抖闹钟名称 */
export const DEBOUNCE_ALARM = "autoSyncDebounce";

/** 重置恢复状态闹钟名称 */
export const RESET_RESTORING_ALARM = "resetRestoring";

/** storage.session 中的恢复状态键 */
export const RESTORING_KEY = "isRestoring";

/** 同步状态键（与 syncService 保持一致） */
export const SYNC_STATE_KEY = "syncState";

/** 恢复状态超时时间（10秒） */
export const RESTORING_TIMEOUT_MS = 10000;

/** 防抖延迟时间（1秒） */
export const DEBOUNCE_DELAY_MS = 1000;

/** 重置恢复状态延迟（3秒） */
export const RESET_RESTORING_DELAY_MS = 3000;
