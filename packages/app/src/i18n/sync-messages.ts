/**
 * 同步消息翻译
 *
 * core 层（同步策略）返回的 SyncResult.message 是硬编码中文。
 * 为了不大规模改动 core 层，UI 显示时通过本表把已知中文消息映射为当前语言。
 * 未匹配的消息原样返回（保持可读，只是不翻译）。
 */
import type { Locale } from "./index";
import { interpolate } from "./index";

/** 已知中文消息 → 各语言译文（中文无需映射，原样返回） */
const MESSAGE_TRANSLATIONS: Record<string, string> = {
  // pull-strategy / cloud-operations
  "网络断开": "Network offline",
  "同步正在进行中": "Sync in progress",
  "云端无备份数据": "No cloud backup found",
  "无法读取云端备份": "Failed to read cloud backup",
  "云端备份数据格式损坏": "Cloud backup data corrupted",
  "云端备份数据结构无效": "Invalid cloud backup structure",
  "同步完成": "Sync completed",
  "恢复失败": "Restore failed",
  "无法读取备份文件": "Failed to read backup file",
  "备份数据格式损坏": "Backup data corrupted",
  "恢复成功": "Restore succeeded",

  // push-strategy
  "本地书签为空": "Local bookmarks are empty",
  "云端备份数据格式损坏，无法解析": "Cloud backup corrupted, cannot parse",
  "云端有更新，请先拉取": "Cloud has newer data, please pull first",
  "书签已同步，无需更新": "Bookmarks already in sync",
  "生成的备份数据无效": "Invalid backup data generated",
  "书签数据为空，无法上传": "Bookmark data is empty, cannot upload",
  "上传成功": "Upload succeeded",
  "上传失败": "Upload failed",

  // smart-sync-strategy
  "书签已同步，无需操作": "Bookmarks already in sync, nothing to do",
  "需要选择同步方向": "Choose a sync direction",
  "同步失败": "Sync failed",

  // background-ops / op-handler
  "无法连接扩展后台服务": "Cannot reach the extension background service",
  "连接失败": "Connection failed",
  "后台操作失败": "Background operation failed",

  // webdav-client 中抛出、可能透传到 UI 的
  "WebDAV 认证失败（用户名/密码或权限不正确）": "WebDAV authentication failed (wrong username/password or permissions)",
};

/**
 * 把 core 层返回的同步消息翻译为当前语言
 * @param locale 当前语言
 * @param message core 返回的原始消息（中文）
 */
export function translateSyncMessage(locale: Locale, message: string): string {
  if (locale === "zh-CN") return message;
  if (!message) return message;

  // 精确匹配
  const exact = MESSAGE_TRANSLATIONS[message];
  if (exact) return exact;

  // 带动态部分的模板消息：如“下载前自动备份 (手动, 覆盖)”
  const backupPrefix = message.match(/^(下载前|上传前|云端恢复前)自动备份\s*\((.*)\)$/);
  if (backupPrefix) {
    const context = backupPrefix[2]
      .replace(/手动/g, "manual")
      .replace(/自动/g, "auto")
      .replace(/覆盖/g, "overwrite")
      .replace(/合并/g, "merge");
    const prefixMap: Record<string, string> = {
      "下载前": "Pre-download",
      "上传前": "Pre-upload",
      "云端恢复前": "Pre-restore",
    };
    return interpolate("{prefix} backup ({context})", {
      prefix: prefixMap[backupPrefix[1]] || backupPrefix[1],
      context,
    });
  }

  // WebDAV 超时/错误消息带动态部分
  const timeoutMatch = message.match(/^WebDAV 请求超时（(\d+)秒）: (.+)$/);
  if (timeoutMatch) {
    return `WebDAV request timeout (${timeoutMatch[1]}s): ${timeoutMatch[2]}`;
  }
  const listFailMatch = message.match(/^WebDAV 列出文件失败（(\d+)）$/);
  if (listFailMatch) {
    return `WebDAV failed to list files (${listFailMatch[1]})`;
  }

  return message;
}
