import type { BookmarkNode } from "../../types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getSafeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "ftp:", "file:"].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

function renderNodes(nodes: BookmarkNode[]): string {
  return nodes.map((node) => {
    const title = escapeHtml(node.title || "Untitled");

    if (node.children) {
      return `<details open><summary>${title}</summary><div class="children">${renderNodes(node.children)}</div></details>`;
    }

    const safeUrl = node.url ? getSafeUrl(node.url) : null;
    if (!safeUrl) {
      return `<div class="bookmark"><span>${title}</span></div>`;
    }

    return `<div class="bookmark"><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${title}</a><span class="url">${escapeHtml(safeUrl)}</span></div>`;
  }).join("");
}

export function createBookmarkHtml(nodes: BookmarkNode[], generatedAt = new Date()): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bookmarks</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { max-width: 960px; margin: 0 auto; padding: 32px 20px 64px; line-height: 1.5; background: Canvas; color: CanvasText; }
    header { border-bottom: 1px solid color-mix(in srgb, CanvasText 18%, transparent); margin-bottom: 24px; }
    h1 { margin: 0; font-size: 28px; }
    header p, .url { color: color-mix(in srgb, CanvasText 58%, transparent); }
    details { margin: 10px 0; }
    summary { cursor: pointer; font-weight: 650; padding: 8px 0; }
    .children { margin-left: 10px; padding-left: 18px; border-left: 1px solid color-mix(in srgb, CanvasText 18%, transparent); }
    .bookmark { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(180px, 1.4fr); gap: 16px; padding: 7px 0; }
    a { color: LinkText; text-decoration: none; overflow-wrap: anywhere; }
    a:hover { text-decoration: underline; }
    .url { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (max-width: 640px) { .bookmark { grid-template-columns: 1fr; gap: 2px; } }
  </style>
</head>
<body>
  <header><h1>Bookmarks</h1><p>Updated ${escapeHtml(generatedAt.toISOString())}</p></header>
  <main>${renderNodes(nodes)}</main>
</body>
</html>`;
}