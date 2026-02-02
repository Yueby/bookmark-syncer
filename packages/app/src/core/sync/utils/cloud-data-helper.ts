/**
 * 云端数据辅助函数
 * 提供云端备份下载和解析的通用功能
 */
import type { CloudBackup } from "../../../types";
import { countBookmarks } from "../../bookmark";
import type { IWebDAVClient } from "../../../infrastructure/http/webdav-client";
import { queueManager } from "../../storage/queue-manager";

/**
 * 下载并解析云端备份
 * 自动处理下载、解压和解析JSON
 * 
 * @param client WebDAV 客户端
 * @param backupPath 备份文件路径
 * @returns 解析后的备份数据及元信息，如果失败返回 null
 */
export async function downloadAndParseCloudBackup(
  client: IWebDAVClient,
  backupPath: string
): Promise<{
  data: CloudBackup;
  count: number;
  timestamp: number;
} | null> {
  const json = await queueManager.getFileWithDedup(client, backupPath);
  if (!json) {
    return null;
  }
  
  const cloudData = JSON.parse(json) as CloudBackup;
  return {
    data: cloudData,
    count: countBookmarks(cloudData.data),
    timestamp: cloudData.metadata?.timestamp || 0,
  };
}
