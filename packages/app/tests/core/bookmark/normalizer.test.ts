/**
 * normalizer.ts 测试
 * 测试跨浏览器标准化工具函数
 */
import {
  findMatchingSystemFolder,
  hasCrossBrowserMapping,
  isSystemRootFolder,
  normalizeUrl,
} from "@src/core/bookmark/normalizer";
import type { BookmarkNode } from "@src/types";
import { describe, expect, it } from "vitest";

// ─── normalizeUrl ───

describe("normalizeUrl", () => {
  it("移除尾部斜杠", () => {
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("移除多个尾部斜杠", () => {
    expect(normalizeUrl("https://example.com///")).toBe("https://example.com");
  });

  it("统一协议为小写 (HTTP)", () => {
    expect(normalizeUrl("HTTP://Example.com")).toBe("http://Example.com");
  });

  it("统一协议为小写 (HTTPS)", () => {
    expect(normalizeUrl("HTTPS://Example.com/path")).toBe(
      "https://Example.com/path"
    );
  });

  it("混合大小写协议", () => {
    expect(normalizeUrl("HtTpS://Example.com/")).toBe(
      "https://Example.com"
    );
  });

  it("空字符串返回空字符串", () => {
    expect(normalizeUrl("")).toBe("");
  });

  it("undefined 返回空字符串", () => {
    expect(normalizeUrl(undefined)).toBe("");
  });

  it("去除前后空白", () => {
    expect(normalizeUrl("  https://example.com  ")).toBe(
      "https://example.com"
    );
  });

  it("无协议 URL 原样返回（去尾部斜杠）", () => {
    expect(normalizeUrl("example.com/")).toBe("example.com");
  });

  it("保留路径和查询参数", () => {
    expect(normalizeUrl("https://example.com/path?q=1")).toBe(
      "https://example.com/path?q=1"
    );
  });
});

// ─── isSystemRootFolder ───

describe("isSystemRootFolder", () => {
  it("识别 Chrome/Edge 根节点 (id=0, title=空)", () => {
    expect(isSystemRootFolder({ id: "0", title: "" })).toBe(true);
  });

  it("有 title 的 id=0 不是根节点", () => {
    expect(isSystemRootFolder({ id: "0", title: "some title" })).toBe(false);
  });

  it("识别 Firefox 根节点 (root________)", () => {
    expect(isSystemRootFolder({ id: "root________", title: "" })).toBe(true);
  });

  it("带 folderType 的节点是系统文件夹", () => {
    expect(
      isSystemRootFolder({ id: "1", title: "Bookmarks Bar", folderType: "bookmarks-bar" })
    ).toBe(true);
  });

  it("识别 Firefox 系统 ID: toolbar_____", () => {
    expect(isSystemRootFolder({ id: "toolbar_____", title: "Toolbar" })).toBe(true);
  });

  it("识别 Firefox 系统 ID: unfiled_____", () => {
    expect(isSystemRootFolder({ id: "unfiled_____", title: "Other" })).toBe(true);
  });

  it("识别 Firefox 系统 ID: menu________", () => {
    expect(isSystemRootFolder({ id: "menu________", title: "Menu" })).toBe(true);
  });

  it("识别 Firefox 系统 ID: mobile______", () => {
    expect(isSystemRootFolder({ id: "mobile______", title: "Mobile" })).toBe(true);
  });

  it("有 url 的节点不是系统文件夹", () => {
    expect(
      isSystemRootFolder({ id: "1", title: "Site", url: "https://example.com" })
    ).toBe(false);
  });

  it("普通文件夹不是系统文件夹", () => {
    expect(
      isSystemRootFolder({ id: "123", title: "My Folder" })
    ).toBe(false);
  });

  it("没有 id 的节点不是系统文件夹", () => {
    expect(isSystemRootFolder({ title: "No ID" })).toBe(false);
  });
});

// ─── hasCrossBrowserMapping ───

describe("hasCrossBrowserMapping", () => {
  it("Chrome folderType=bookmarks-bar 有映射", () => {
    expect(
      hasCrossBrowserMapping({ title: "bar", folderType: "bookmarks-bar" })
    ).toBe(true);
  });

  it("Chrome folderType=other 有映射", () => {
    expect(
      hasCrossBrowserMapping({ title: "other", folderType: "other" })
    ).toBe(true);
  });

  it("Chrome folderType=mobile 有映射", () => {
    expect(
      hasCrossBrowserMapping({ title: "mobile", folderType: "mobile" })
    ).toBe(true);
  });

  it("Firefox toolbar_____ 有映射", () => {
    expect(
      hasCrossBrowserMapping({ id: "toolbar_____", title: "Toolbar" })
    ).toBe(true);
  });

  it("Firefox unfiled_____ 有映射", () => {
    expect(
      hasCrossBrowserMapping({ id: "unfiled_____", title: "Other" })
    ).toBe(true);
  });

  it("Firefox menu________ 没有映射", () => {
    expect(
      hasCrossBrowserMapping({ id: "menu________", title: "Menu" })
    ).toBe(false);
  });

  it("普通文件夹没有映射", () => {
    expect(
      hasCrossBrowserMapping({ id: "123", title: "Custom" })
    ).toBe(false);
  });
});

// ─── findMatchingSystemFolder ───

describe("findMatchingSystemFolder", () => {
  const localFolders: BookmarkNode[] = [
    { id: "1", title: "Bookmarks Bar", folderType: "bookmarks-bar" },
    { id: "2", title: "Other Bookmarks", folderType: "other" },
    { id: "3", title: "Mobile", folderType: "mobile" },
  ];

  it("Chrome folderType 直接匹配", () => {
    const backup: BookmarkNode = { title: "Bar", folderType: "bookmarks-bar" };
    const match = findMatchingSystemFolder(backup, localFolders);
    expect(match).toEqual(localFolders[0]);
  });

  it("Firefox ID 匹配到 Chrome folderType", () => {
    const backup: BookmarkNode = { id: "toolbar_____", title: "Toolbar" };
    const match = findMatchingSystemFolder(backup, localFolders);
    expect(match).toEqual(localFolders[0]);
  });

  it("Chrome folderType 匹配到 Firefox ID", () => {
    const firefoxLocalFolders: BookmarkNode[] = [
      { id: "toolbar_____", title: "Toolbar" },
      { id: "unfiled_____", title: "Other" },
    ];
    const backup: BookmarkNode = { title: "Bar", folderType: "bookmarks-bar" };
    const match = findMatchingSystemFolder(backup, firefoxLocalFolders);
    expect(match).toEqual(firefoxLocalFolders[0]);
  });

  it("按标题兜底匹配", () => {
    const localWithTitle: BookmarkNode[] = [
      { id: "10", title: "Custom Folder" },
    ];
    const backup: BookmarkNode = { title: "Custom Folder" };
    const match = findMatchingSystemFolder(backup, localWithTitle);
    expect(match).toEqual(localWithTitle[0]);
  });

  it("找不到匹配时返回 null", () => {
    const backup: BookmarkNode = { title: "NonExistent" };
    const match = findMatchingSystemFolder(backup, localFolders);
    expect(match).toBeNull();
  });
});
