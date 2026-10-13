import { createBookmarkHtml } from "@src/infrastructure/utils/bookmark-html";
import { describe, expect, it } from "vitest";

describe("createBookmarkHtml", () => {
  it("renders nested folders and bookmark links", () => {
    const html = createBookmarkHtml([
      {
        title: "Work",
        children: [{ title: "Example", url: "https://example.com/path?a=1&b=2" }],
      },
    ], new Date("2026-10-13T12:00:00.000Z"));

    expect(html).toContain("<summary>Work</summary>");
    expect(html).toContain('href="https://example.com/path?a=1&amp;b=2"');
    expect(html).toContain("2026-10-13T12:00:00.000Z");
  });

  it("escapes titles and does not create links for unsafe URLs", () => {
    const html = createBookmarkHtml([
      { title: "<script>alert(1)</script>", url: "javascript:alert(1)" },
    ]);

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
  });
});