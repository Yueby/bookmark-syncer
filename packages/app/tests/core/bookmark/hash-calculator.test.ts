/**
 * hash-calculator.ts 测试
 * 测试书签树 hash 赋值逻辑
 */
import { assignHashToNode, assignHashes } from "@src/core/bookmark/hash-calculator";
import type { BookmarkNode } from "@src/types";
import { describe, expect, it, vi } from "vitest";

// Mock generateHash - 返回 url|title 作为简化 hash
vi.mock("@src/infrastructure/utils/crypto", () => ({
  generateHash: vi.fn(async (url: string, title: string) => `hash_${url}_${title}`),
}));

describe("assignHashToNode", () => {
  it("为书签节点计算并赋值 hash", async () => {
    const node: BookmarkNode = {
      title: "Example",
      url: "https://example.com",
    };
    const result = await assignHashToNode(node);
    expect(result.hash).toBe("hash_https://example.com_Example");
  });

  it("保留 title 和 url 字段", async () => {
    const node: BookmarkNode = {
      title: "Test",
      url: "https://test.com",
      id: "123",
      dateAdded: 1234567890,
    };
    const result = await assignHashToNode(node);
    expect(result.title).toBe("Test");
    expect(result.url).toBe("https://test.com");
    // 非必要字段不保留
    expect(result.dateAdded).toBeUndefined();
  });

  it("文件夹节点不计算 hash（没有 url）", async () => {
    const node: BookmarkNode = {
      title: "Folder",
      children: [],
    };
    const result = await assignHashToNode(node);
    expect(result.hash).toBeUndefined();
    expect(result.children).toEqual([]);
  });

  it("递归处理子节点", async () => {
    const node: BookmarkNode = {
      title: "Folder",
      children: [
        { title: "A", url: "https://a.com" },
        {
          title: "Sub",
          children: [{ title: "B", url: "https://b.com" }],
        },
      ],
    };
    const result = await assignHashToNode(node);
    expect(result.children).toHaveLength(2);
    expect(result.children![0].hash).toBe("hash_https://a.com_A");
    expect(result.children![1].children![0].hash).toBe("hash_https://b.com_B");
  });

  it("系统根文件夹保留 id 和 folderType", async () => {
    const node: BookmarkNode = {
      id: "1",
      title: "Bookmarks Bar",
      folderType: "bookmarks-bar",
      children: [],
    };
    const result = await assignHashToNode(node);
    expect(result.id).toBe("1");
    expect(result.folderType).toBe("bookmarks-bar");
  });

  it("普通文件夹不保留 id", async () => {
    const node: BookmarkNode = {
      id: "999",
      title: "My Folder",
      children: [],
    };
    const result = await assignHashToNode(node);
    expect(result.id).toBeUndefined();
  });

  it("对 URL 进行了 normalizeUrl 处理", async () => {
    const node: BookmarkNode = {
      title: "Test",
      url: "HTTPS://Example.com/",
    };
    const result = await assignHashToNode(node);
    // normalizeUrl 会将 HTTPS -> https，去除尾部斜杠
    expect(result.hash).toBe("hash_https://Example.com_Test");
  });
});

describe("assignHashes", () => {
  it("批量处理节点数组", async () => {
    const nodes: BookmarkNode[] = [
      { title: "A", url: "https://a.com" },
      { title: "B", url: "https://b.com" },
    ];
    const result = await assignHashes(nodes);
    expect(result).toHaveLength(2);
    expect(result[0].hash).toBeDefined();
    expect(result[1].hash).toBeDefined();
  });

  it("空数组返回空数组", async () => {
    const result = await assignHashes([]);
    expect(result).toEqual([]);
  });
});
