/**
 * comparator.ts 测试
 * 测试书签树统计和签名提取逻辑
 */
import { countBookmarks, extractSignaturesWithHash } from "@src/core/bookmark/comparator";
import type { BookmarkNode } from "@src/types";
import { describe, expect, it, vi } from "vitest";

// Mock hash-calculator 和 normalizer 中被 comparator 间接引用的函数
vi.mock("@src/core/bookmark/hash-calculator", () => ({
  assignHashes: vi.fn(async (nodes: BookmarkNode[]) => nodes),
}));

vi.mock("@src/core/bookmark/normalizer", () => ({
  isSystemRootFolder: vi.fn((node: BookmarkNode) => {
    // 模拟系统根文件夹判断
    return node.id === "0" && !node.title;
  }),
  normalizeUrl: vi.fn((url: string) => url),
}));

describe("countBookmarks", () => {
  it("正确统计扁平结构的书签数量", () => {
    const nodes: BookmarkNode[] = [
      { title: "A", url: "https://a.com" },
      { title: "B", url: "https://b.com" },
      { title: "C", url: "https://c.com" },
    ];
    expect(countBookmarks(nodes)).toBe(3);
  });

  it("正确统计嵌套树的书签数量", () => {
    const nodes: BookmarkNode[] = [
      {
        title: "Folder",
        children: [
          { title: "A", url: "https://a.com" },
          {
            title: "Sub Folder",
            children: [
              { title: "B", url: "https://b.com" },
              { title: "C", url: "https://c.com" },
            ],
          },
        ],
      },
      { title: "D", url: "https://d.com" },
    ];
    expect(countBookmarks(nodes)).toBe(4);
  });

  it("空数组返回 0", () => {
    expect(countBookmarks([])).toBe(0);
  });

  it("只有文件夹没有书签返回 0", () => {
    const nodes: BookmarkNode[] = [
      { title: "Folder", children: [] },
      {
        title: "Another Folder",
        children: [{ title: "Sub Folder", children: [] }],
      },
    ];
    expect(countBookmarks(nodes)).toBe(0);
  });
});

describe("extractSignaturesWithHash", () => {
  it("提取书签签名 (B|hash 格式)", () => {
    const nodes: BookmarkNode[] = [
      { title: "A", url: "https://a.com", hash: "hash_a" },
      { title: "B", url: "https://b.com", hash: "hash_b" },
    ];
    const sigs = extractSignaturesWithHash(nodes);
    expect(sigs).toContain("B|hash_a");
    expect(sigs).toContain("B|hash_b");
  });

  it("提取文件夹签名 (F|title|childCount 格式)", () => {
    const nodes: BookmarkNode[] = [
      {
        title: "My Folder",
        children: [
          { title: "A", url: "https://a.com", hash: "hash_a" },
          { title: "B", url: "https://b.com", hash: "hash_b" },
        ],
      },
    ];
    const sigs = extractSignaturesWithHash(nodes);
    expect(sigs).toContain("F|My Folder|2");
    expect(sigs).toContain("B|hash_a");
    expect(sigs).toContain("B|hash_b");
  });

  it("跳过系统根文件夹", () => {
    const nodes: BookmarkNode[] = [
      {
        id: "0",
        title: "",
        children: [
          { title: "A", url: "https://a.com", hash: "hash_a" },
        ],
      },
    ];
    const sigs = extractSignaturesWithHash(nodes);
    // 系统根文件夹本身不产生签名，但它的子节点会被提取
    expect(sigs).not.toContain("F||1");
    expect(sigs).toContain("B|hash_a");
  });

  it("空数组返回空签名", () => {
    expect(extractSignaturesWithHash([])).toEqual([]);
  });
});
