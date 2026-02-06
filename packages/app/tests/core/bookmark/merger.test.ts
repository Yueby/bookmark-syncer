/**
 * merger.ts 测试
 * 测试 buildGlobalIndex、mergeNodes、createChildren
 */
import { buildGlobalIndex, createChildren, mergeNodes } from "@src/core/bookmark/merger";
import type { BookmarkNode } from "@src/types";
import browser from "webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock generateHash
vi.mock("@src/infrastructure/utils/crypto", () => ({
  generateHash: vi.fn(async (url: string, title: string) => `hash_${url}_${title}`),
}));

describe("buildGlobalIndex", () => {
  it("构建 URL 索引", async () => {
    const tree: BookmarkNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bar",
            folderType: "bookmarks-bar",
            children: [
              {
                id: "10",
                title: "Google",
                url: "https://google.com",
                parentId: "1",
                index: 0,
              },
            ],
          },
        ],
      },
    ];
    const index = await buildGlobalIndex(tree);

    expect(index.urlToBookmarks.size).toBe(1);
    expect(index.urlToBookmarks.has("https://google.com")).toBe(true);
    const bookmarks = index.urlToBookmarks.get("https://google.com")!;
    expect(bookmarks[0].title).toBe("Google");
  });

  it("构建 Hash 索引", async () => {
    const tree: BookmarkNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bar",
            folderType: "bookmarks-bar",
            children: [
              {
                id: "10",
                title: "Test",
                url: "https://test.com",
                parentId: "1",
                index: 0,
              },
            ],
          },
        ],
      },
    ];
    const index = await buildGlobalIndex(tree);

    expect(index.hashToNode.size).toBe(1);
    const hashKey = "hash_https://test.com_Test";
    expect(index.hashToNode.has(hashKey)).toBe(true);
    const nodes = index.hashToNode.get(hashKey)!;
    expect(nodes[0].id).toBe("10");
  });

  it("构建文件夹路径索引", async () => {
    const tree: BookmarkNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bar",
            folderType: "bookmarks-bar",
            children: [
              {
                id: "20",
                title: "Dev",
                parentId: "1",
                index: 0,
                children: [],
              },
            ],
          },
        ],
      },
    ];
    const index = await buildGlobalIndex(tree);

    expect(index.pathToFolder.has("Dev")).toBe(true);
    expect(index.pathToFolder.get("Dev")!.id).toBe("20");
  });

  it("空树返回空索引", async () => {
    const index = await buildGlobalIndex([]);
    expect(index.hashToNode.size).toBe(0);
    expect(index.urlToBookmarks.size).toBe(0);
    expect(index.pathToFolder.size).toBe(0);
  });

  it("同 hash 节点存为数组（支持 hash 碰撞）", async () => {
    const tree: BookmarkNode[] = [
      {
        id: "0",
        title: "",
        children: [
          {
            id: "1",
            title: "Bar",
            folderType: "bookmarks-bar",
            children: [
              { id: "10", title: "Same", url: "https://x.com", parentId: "1", index: 0 },
              { id: "11", title: "Same", url: "https://x.com", parentId: "1", index: 1 },
            ],
          },
        ],
      },
    ];
    const index = await buildGlobalIndex(tree);
    const hashKey = "hash_https://x.com_Same";
    const nodes = index.hashToNode.get(hashKey)!;
    expect(nodes).toHaveLength(2);
  });
});

describe("createChildren", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.bookmarks.create).mockResolvedValue({
      id: "new-1",
      title: "",
    } as any);
  });

  it("创建书签子节点", async () => {
    const children: BookmarkNode[] = [
      { title: "A", url: "https://a.com" },
      { title: "B", url: "https://b.com" },
    ];
    await createChildren("parent-1", children);
    expect(browser.bookmarks.create).toHaveBeenCalledTimes(2);
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: "parent-1",
      title: "A",
      url: "https://a.com",
    });
  });

  it("递归创建文件夹和子节点", async () => {
    const children: BookmarkNode[] = [
      {
        title: "Folder",
        children: [{ title: "C", url: "https://c.com" }],
      },
    ];
    await createChildren("parent-1", children);
    // 创建文件夹 + 创建子书签 = 2
    expect(browser.bookmarks.create).toHaveBeenCalledTimes(2);
  });

  it("创建失败时静默跳过", async () => {
    vi.mocked(browser.bookmarks.create).mockRejectedValueOnce(new Error("fail"));
    const children: BookmarkNode[] = [
      { title: "A", url: "https://a.com" },
    ];
    await expect(createChildren("parent-1", children)).resolves.toBeUndefined();
  });
});

describe("mergeNodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browser.bookmarks.getChildren).mockResolvedValue([]);
    vi.mocked(browser.bookmarks.create).mockResolvedValue({
      id: "new-1",
      title: "",
    } as any);
  });

  it("新书签被添加", async () => {
    vi.mocked(browser.bookmarks.getChildren).mockResolvedValueOnce([]);
    const nodes: BookmarkNode[] = [
      { title: "New Site", url: "https://new.com" },
    ];
    await mergeNodes("parent-1", nodes);
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: "parent-1",
      title: "New Site",
      url: "https://new.com",
      index: undefined,
    });
  });

  it("已存在的书签不重复添加（URL 匹配）", async () => {
    vi.mocked(browser.bookmarks.getChildren).mockResolvedValueOnce([
      { id: "10", title: "Existing", url: "https://existing.com" } as any,
    ]);
    const nodes: BookmarkNode[] = [
      { title: "Existing", url: "https://existing.com" },
    ];
    await mergeNodes("parent-1", nodes);
    expect(browser.bookmarks.create).not.toHaveBeenCalled();
  });

  it("已存在的文件夹递归合并", async () => {
    // 父文件夹有一个子文件夹
    vi.mocked(browser.bookmarks.getChildren)
      .mockResolvedValueOnce([
        { id: "f1", title: "Folder", children: [] } as any,
      ])
      // 子文件夹的子节点
      .mockResolvedValueOnce([]);

    const nodes: BookmarkNode[] = [
      {
        title: "Folder",
        children: [{ title: "New", url: "https://new.com" }],
      },
    ];
    await mergeNodes("parent-1", nodes);
    // 递归调用时创建新书签
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: "f1",
      title: "New",
      url: "https://new.com",
      index: undefined,
    });
  });

  it("不存在的文件夹被新建", async () => {
    vi.mocked(browser.bookmarks.getChildren).mockResolvedValueOnce([]);
    const nodes: BookmarkNode[] = [
      { title: "New Folder", children: [] },
    ];
    await mergeNodes("parent-1", nodes);
    expect(browser.bookmarks.create).toHaveBeenCalledWith({
      parentId: "parent-1",
      title: "New Folder",
      index: undefined,
    });
  });
});
