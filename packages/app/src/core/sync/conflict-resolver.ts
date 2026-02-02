/**
 * 冲突解决器
 * 检查是否需要用户选择同步方向
 */
import type { CloudInfo, WebDAVConfig } from "../storage/types";
import { getCloudInfo } from "./cloud-operations";
import { getLastSyncTime } from "./state-manager";

/**
 * 检查是否需要用户选择同步方向（用于 UI 预检）
 */
export async function checkNeedsConflictResolution(
  config: WebDAVConfig,
): Promise<{ needsResolution: boolean; cloudInfo: CloudInfo }> {
  const cloudInfo = await getCloudInfo(config);
  if (!cloudInfo.exists) {
    return { needsResolution: false, cloudInfo };
  }

  const lastSyncTime = await getLastSyncTime(config.url);

  // 首次同步且云端有数据
  if (lastSyncTime === 0 && cloudInfo.totalCount && cloudInfo.totalCount > 0) {
    return { needsResolution: true, cloudInfo };
  }

  return { needsResolution: false, cloudInfo };
}
