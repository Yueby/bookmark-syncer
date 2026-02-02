/**
 * 快照辅助函数
 * 提供同步前自动创建快照的功能
 */
import { snapshotManager } from "../../backup";
import { bookmarkRepository, countBookmarks } from "../../bookmark";

/**
 * 创建同步前快照
 * 自动捕获当前书签树状态并创建快照
 * 
 * @param lockHolder 锁持有者（"manual" 或 "auto"）
 * @param operation 操作类型（如 "上传"、"下载"、"智能同步"）
 */
export async function createPreSyncSnapshot(
  lockHolder: string,
  operation: string
): Promise<void> {
  try {
    const currentTree = await bookmarkRepository.getTree();
    const currentCount = countBookmarks(currentTree);
    const reason = `${operation}前自动备份 (${
      lockHolder === "manual" ? "手动" : "自动"
    })`;
    await snapshotManager.createSnapshot(currentTree, currentCount, reason);
    console.log(`[Snapshot] Created snapshot: ${reason}`);
  } catch (error) {
    console.warn(`[Snapshot] Failed to create snapshot before ${operation}:`, error);
    // 快照创建失败不影响同步
  }
}
