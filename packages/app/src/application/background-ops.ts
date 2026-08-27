/**
 * 后台操作代理（popup 侧）
 *
 * popup 通过 runtime.sendMessage 触发在 background(Service Worker)中执行的
 * 长时 WebDAV 操作（测试连接/智能同步/上传/下载/恢复），解决两个问题：
 * 1. popup 关闭时 JS 上下文销毁，操作随之中断，isRestoring/锁残留、书签树半恢复
 * 2. popup 与 background 的重复防抖/竞争
 *
 * 本文件只包含消息类型与 popup 侧辅助函数：
 * 真正的执行逻辑在 background/op-handler.ts（按需加载，不进 popup bundle）。
 */
import browser from "webextension-polyfill";
import type { WebDAVConfig } from "../core/storage/types";
import type { SmartSyncResult, SyncResult } from "../core/sync/types";

// ─── 消息定义 ───

export type BackgroundOpMessage =
  | { type: "webdav:test"; config: WebDAVConfig }
  | { type: "sync:push"; config: WebDAVConfig }
  | { type: "sync:pull"; config: WebDAVConfig; mode: "overwrite" | "merge" }
  | { type: "sync:smart"; config: WebDAVConfig }
  | { type: "sync:restoreCloudBackup"; config: WebDAVConfig; path: string };

/** WebDAV 连接测试（登录）结果 */
export type WebDAVTestResult =
  | { ok: true }
  | { ok: false; error: string };

// ─── popup 侧调用辅助 ───

/**
 * 发送后台操作消息，失败时返回统一的错误结果
 */
async function sendBackgroundOp<T>(message: BackgroundOpMessage, fallback: T): Promise<T> {
  try {
    return (await browser.runtime.sendMessage(message)) as T;
  } catch (error) {
    console.error("[BackgroundOps] Failed to send message:", error);
    return fallback;
  }
}

/** 在后台测试 WebDAV 连接（登录验证） */
export async function webdavTestInBackground(config: WebDAVConfig): Promise<WebDAVTestResult> {
  return sendBackgroundOp<WebDAVTestResult>(
    { type: "webdav:test", config },
    { ok: false, error: "无法连接扩展后台服务" },
  );
}

/** 在后台执行智能同步 */
export async function smartSyncInBackground(config: WebDAVConfig): Promise<SmartSyncResult> {
  return sendBackgroundOp<SmartSyncResult>(
    { type: "sync:smart", config },
    { success: false, action: "error", message: "无法连接扩展后台服务" },
  );
}

/** 在后台执行上传（Push） */
export async function smartPushInBackground(config: WebDAVConfig): Promise<SyncResult> {
  return sendBackgroundOp<SyncResult>(
    { type: "sync:push", config },
    { success: false, action: "error", message: "无法连接扩展后台服务" },
  );
}

/** 在后台执行下载（Pull） */
export async function smartPullInBackground(
  config: WebDAVConfig,
  mode: "overwrite" | "merge",
): Promise<SyncResult> {
  return sendBackgroundOp<SyncResult>(
    { type: "sync:pull", config, mode },
    { success: false, action: "error", message: "无法连接扩展后台服务" },
  );
}

/** 在后台从指定云端备份恢复 */
export async function restoreCloudBackupInBackground(
  config: WebDAVConfig,
  path: string,
): Promise<SyncResult> {
  return sendBackgroundOp<SyncResult>(
    { type: "sync:restoreCloudBackup", config, path },
    { success: false, action: "error", message: "无法连接扩展后台服务" },
  );
}
