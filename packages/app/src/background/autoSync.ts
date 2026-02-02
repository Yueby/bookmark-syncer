/**
 * 自动同步服务
 * 监听书签变化，自动上传到云端
 * 定时检查云端更新，自动合并到本地
 *
 * 注意：MV3 Service Worker 是事件驱动的
 * - 书签事件会自动唤醒 SW
 * - Alarm 事件会自动唤醒 SW
 * - 状态使用 storage.session 持久化，避免 SW 休眠后丢失
 */

// 重新导出所有 Application 层的公共 API
export {
    checkCloudOnStartup, initializeAutoSync, resetScheduledSync, startAutoSync, startScheduledSync, stopAutoSync, stopScheduledSync,
    updateScheduledSync
} from "../application";

// 在顶级作用域初始化（注册监听器）
import { initializeAutoSync } from "../application";

initializeAutoSync();
