/**
 * 后台操作处理器（background 侧）
 *
 * 在 Service Worker 中执行 popup 触发的长时 WebDAV 操作。
 * 必须在 background script 顶级作用域注册（与书签/闹钟监听器相同要求），
 * 确保 SW 被消息唤醒后监听器可用。
 *
 * 执行上下文说明：操作在 SW 中运行，即使发起操作的 popup 已关闭，
 * 操作仍会继续执行完毕（锁/恢复状态由策略内部的 finally 正确清理）。
 */
import browser from "webextension-polyfill";
import type { BackgroundOpMessage } from "../application/background-ops";
import { smartPull, smartPush, smartSync, restoreFromCloudBackup } from "../core/sync";
import { getWebDAVClient } from "../infrastructure/http/webdav-client";

/** 防止重复注册（模块可能被多个入口引入） */
let registered = false;

async function dispatch(message: BackgroundOpMessage): Promise<unknown> {
  switch (message.type) {
    case "webdav:test": {
      // 连接测试的错误单独包装：popup 需要区分「认证失败」等具体原因
      try {
        const client = getWebDAVClient(message.config);
        const ok = await client.testConnection();
        return { ok };
      } catch (error) {
        return { ok: false, error: (error as Error).message || "连接失败" };
      }
    }

    case "sync:push":
      return smartPush(message.config, "manual");

    case "sync:pull":
      return smartPull(message.config, "manual", message.mode);

    case "sync:smart":
      return smartSync(message.config, "manual");

    case "sync:restoreCloudBackup":
      return restoreFromCloudBackup(message.config, message.path, "manual");

    default:
      // 非本模块的消息，交给其他监听器
      return undefined;
  }
}

/** 处理的消息类型（用于过滤无关消息） */
const HANDLED_TYPES = new Set([
  "webdav:test",
  "sync:push",
  "sync:pull",
  "sync:smart",
  "sync:restoreCloudBackup",
]);

/**
 * 注册后台操作消息监听器
 * 必须在顶级作用域调用
 */
export function registerBackgroundOpHandler(): void {
  if (registered) return;
  registered = true;

  browser.runtime.onMessage.addListener((message: unknown) => {
    const typed = message as BackgroundOpMessage;
    if (!typed?.type || !HANDLED_TYPES.has(typed.type)) {
      // 不是本处理器的消息：返回 undefined 表示不响应
      return undefined;
    }

    console.log(`[BackgroundOpHandler] Executing: ${typed.type}`);
    return dispatch(typed).catch((error) => {
      console.error(`[BackgroundOpHandler] ${typed.type} failed:`, error);
      return {
        success: false,
        action: "error",
        message: (error as Error).message || "后台操作失败",
      };
    });
  });

  console.log("[BackgroundOpHandler] Message handler registered");
}
