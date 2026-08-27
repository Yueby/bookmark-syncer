/**
 * 扩展后台脚本入口
 * 初始化自动同步和定时同步
 */
import browser from "webextension-polyfill";
import {
  startAutoSync,
  clearStartupCheckFlag,
  startScheduledSync,
} from "./autoSync";

/** 初始化后台服务 */
export function initBackground(): void {
  // 扩展安装或更新时
  browser.runtime.onInstalled.addListener(() => {
    // 安装/更新后清除会话标志，允许重新执行启动检查
    void clearStartupCheckFlag();
    startAutoSync();
    startScheduledSync();
  });

  // 扩展启动时（浏览器每次启动触发一次）
  // 注意：不要在此处直接调用 checkCloudOnStartup()，
  // startAutoSync 内部已通过 storage.session 做了会话级去重
  browser.runtime.onStartup.addListener(() => {
    startAutoSync();
    startScheduledSync();
  });

  // 注意：不要在顶级作用域无条件调用 startAutoSync()。
  // MV3 Service Worker 被任意事件（书签变化、闹钟）唤醒时都会重新执行顶级代码，
  // 无条件启动会导致每次冷启动都触发一次启动拉取，与防抖上传竞态。
  // 监听器注册由 autoSync.ts 模块顶层的 initializeAutoSync() 完成。
}
