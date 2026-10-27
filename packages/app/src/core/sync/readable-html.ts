import { getReadableBookmarkHtmlEnabled } from "../../application/state-manager";
import type { IWebDAVClient } from "../../infrastructure/http/webdav-client";
import { createBookmarkHtml } from "../../infrastructure/utils/bookmark-html";
import type { CloudBackup } from "../../types";
import { STORAGE_CONSTANTS } from "../storage/types";

/**
 * Refresh the optional, best-effort browsing copy independently of JSON deduplication.
 * Read the remote copy each time so deleted, stale or previously failed copies heal.
 * Concurrent devices can temporarily overwrite each other; a later sync repairs the copy.
 */
export async function refreshReadableBookmarkHtml(
  client: IWebDAVClient,
  backup: CloudBackup,
): Promise<boolean> {
  try {
    if (!(await getReadableBookmarkHtmlEnabled())) return true;

    const path = `${STORAGE_CONSTANTS.BACKUP_DIR}/bookmark.html`;
    const html = createBookmarkHtml(backup.data, new Date(backup.metadata?.timestamp || 0));
    let existing: string | null = null;
    try {
      existing = await client.getFile(path);
    } catch {
      // A missing or unreadable copy must not prevent attempting to publish it.
    }
    if (existing !== html) {
      await client.putFile(path, html, "text/html; charset=utf-8");
    }
    return true;
  } catch (error) {
    console.warn("[ReadableHtml] Failed to refresh optional HTML copy:", error);
    return false;
  }
}
