/**
 * Application 层常量定义
 */

/** 自动同步的锁持有者标识 */
export const LOCK_HOLDER_AUTO = "auto_sync";

/** 定时同步闹钟名称 */
export const ALARM_NAME = "scheduledSync";

/** 防抖闹钟名称 */
export const DEBOUNCE_ALARM = "autoSyncDebounce";

/** storage.session 中的恢复状态键 */
export const RESTORING_KEY = "isRestoring";

/** 同步状态键（与 syncService 保持一致） */
export const SYNC_STATE_KEY = "syncState";

/** 恢复状态超时时间（10秒） */
export const RESTORING_TIMEOUT_MS = 10000;

/** 防抖延迟时间（1秒） */
export const DEBOUNCE_DELAY_MS = 1000;

/** 重置恢复状态延迟（30秒，给浏览器原生书签同步留出收敛时间） */
export const RESET_RESTORING_DELAY_MS = 30000;

/** 下载/恢复后自动上传抑制窗口（2分钟，避免把原生同步的短暂重复状态写回云端） */
export const POST_PULL_UPLOAD_SUPPRESSION_MS = 120000;
