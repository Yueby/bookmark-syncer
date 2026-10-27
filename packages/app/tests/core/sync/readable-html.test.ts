import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWebDAVClient } from "@src/infrastructure/http/webdav-client";
import type { CloudBackup } from "@src/types";
import { createBookmarkHtml } from "@src/infrastructure/utils/bookmark-html";

const { enabled } = vi.hoisted(() => ({ enabled: vi.fn(async () => false) }));
vi.mock("@src/application/state-manager", () => ({
  getReadableBookmarkHtmlEnabled: enabled,
}));

import { refreshReadableBookmarkHtml } from "@src/core/sync/readable-html";

const backup: CloudBackup = {
  metadata: { timestamp: 1791892800000, clientVersion: "1.1.0" },
  data: [{ title: "Example", url: "https://example.com" }],
};
const path = "BookmarkSyncer/bookmark.html";
const html = createBookmarkHtml(backup.data, new Date(backup.metadata.timestamp));
const client = {
  getFile: vi.fn(async () => ""),
  putFile: vi.fn(async (_path: string, _content: string, _contentType?: string) => {}),
  testConnection: vi.fn(),
  createDirectory: vi.fn(),
  exists: vi.fn(),
  listFiles: vi.fn(),
  deleteFile: vi.fn(),
} satisfies IWebDAVClient;

beforeEach(() => {
  vi.resetAllMocks();
  enabled.mockResolvedValue(true);
  client.getFile.mockResolvedValue("");
  client.putFile.mockResolvedValue(undefined);
});

describe("readable HTML copy", () => {
  it("does no network work when disabled", async () => {
    enabled.mockResolvedValue(false);
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(true);
    expect(client.getFile).not.toHaveBeenCalled();
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("creates a missing copy", async () => {
    client.getFile.mockRejectedValueOnce(new Error("404"));
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(true);
    expect(client.putFile).toHaveBeenCalledWith(path, html, "text/html; charset=utf-8");
  });

  it("does not upload an identical copy", async () => {
    client.getFile.mockResolvedValue(html);
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(true);
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("repairs a stale copy without changing the backup timestamp", async () => {
    client.getFile.mockResolvedValue("older HTML");
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(true);
    expect(client.putFile).toHaveBeenCalledWith(path, html, "text/html; charset=utf-8");
  });

  it("retries a failed upload on the next refresh", async () => {
    client.putFile.mockRejectedValueOnce(new Error("503"));
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(false);
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(true);
    expect(client.putFile).toHaveBeenCalledTimes(2);
  });

  it("isolates settings and rendering failures", async () => {
    enabled.mockRejectedValueOnce(new Error("storage unavailable"));
    expect(await refreshReadableBookmarkHtml(client, backup)).toBe(false);
    expect(await refreshReadableBookmarkHtml(client, {
      ...backup, metadata: { ...backup.metadata, timestamp: Infinity },
    })).toBe(false);
    expect(client.putFile).not.toHaveBeenCalled();
  });

  it("repairs a delayed stale writer on a subsequent sync", async () => {
    let remote = "old";
    client.getFile.mockImplementation(async () => remote);
    client.putFile.mockImplementation(async (_path, content) => { remote = content; });
    await refreshReadableBookmarkHtml(client, backup);
    remote = "a delayed device overwrote the HTML";
    await refreshReadableBookmarkHtml(client, backup);
    expect(remote).toBe(html);
    expect(client.putFile).toHaveBeenCalledTimes(2);
  });
});
