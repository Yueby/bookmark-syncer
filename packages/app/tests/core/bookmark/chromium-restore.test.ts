/**
 * Chrome/Edge 真实结构回归测试
 * 真实 Chromium 的 bookmarks.getTree() 返回的节点没有 folderType 字段，
 * 只有稳定 id（root=0, bar=1, other=2, mobile=3）。
 * 此前的测试 fixture 手工构造了 folderType，掩盖了「恢复在 Chromium 上完全无效」的 bug。
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { annotateSystemFolders } from "@src/core/bookmark/normalizer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";

// 本测试不用模块级 mock，直接用有状态的 browser mock

/** 构造真实 Chrome 风格的本地书签树（无 folderType） */
function chromeTree(): any[] {
  return [
    {
      id: "0",
      title: "",
      children: [
        {
          id: "1",
          title: "Bookmarks Bar",
          parentId: "0",
          index: 0,
          children: [],
        },
        {
          id: "2",
          title: "Other Bookmarks",
          parentId: "0",
          index: 1,
          children: [],
        },
        {
          id: "3",
          title: "Mobile Bookmarks",
          parentId: "0",
          index: 2,
          children: [],
        },
      ],
    },
  ];
}

describe("annotateSystemFolders（Chrome 真实结构）", () => {
  beforeEach(() => {
    __resetMockStore();
    vi.clearAllMocks();
  });

  it("为 Chromium 系统 id 标注 folderType", () => {
    const tree = chromeTree();
    annotateSystemFolders(tree);

    const [bar, other, mobile] = tree[0].children;
    expect(bar.folderType).toBe("bookmarks-bar");
    expect(other.folderType).toBe("other");
    expect(mobile.folderType).toBe("mobile");
  });

  it("Firefox id 映射到 folderType", () => {
    const tree = [
      {
        id: "root________",
        title: "",
        children: [
          { id: "toolbar_____", title: "书签工具栏", children: [] },
          { id: "menu________", title: "书签菜单", children: [] },
        ],
      },
    ];
    annotateSystemFolders(tree);

    expect(tree[0].children[0].folderType).toBe("bookmarks-bar");
    // menu 无跨浏览器映射，不标注
    expect(tree[0].children[1].folderType).toBeUndefined();
  });

  it("旧版云端数据（顶层无 id）按位置推断", () => {
    // 旧版 Chrome 上传：assignHashToNode 未识别系统根 → 顶层无 id 无 folderType
    const tree = [
      {
        id: "0",
        title: "",
        children: [
          { title: "Bookmarks Bar", children: [] },
          { title: "Other Bookmarks", children: [] },
        ],
      },
    ];
    annotateSystemFolders(tree);

    expect(tree[0].children[0].folderType).toBe("bookmarks-bar");
    expect(tree[0].children[1].folderType).toBe("other");
  });

  it("已有标注的数据不被覆盖", () => {
    const tree = [
      {
        id: "0",
        title: "",
        children: [{ id: "1", title: "Bar", folderType: "other", children: [] }],
      },
    ];
    annotateSystemFolders(tree);
    expect(tree[0].children[0].folderType).toBe("other");
  });
});

describe("Chromium 恢复回归（无 folderType 的真实结构）", () => {
  beforeEach(() => {
    __resetMockStore();
    vi.clearAllMocks();
  });

  it("Chrome 本地树 + 旧版 Chrome 云端数据 → 恢复不再 no-op", async () => {
    // 本地：真实 Chrome 结构（空书签栏）
    const tree = chromeTree();
    vi.mocked(browser.bookmarks.getTree).mockResolvedValue(tree as any);

    // 云端备份：旧版 Chrome 上传格式（顶层无 id/folderType，子节点无 id）
    const backup = {
      metadata: { timestamp: Date.now() },
      data: [
        {
          title: "",
          id: "0",
          children: [
            {
              title: "Bookmarks Bar",
              children: [
                { title: "Example", url: "https://example.com", hash: "h1" },
              ],
            },
            { title: "Other Bookmarks", children: [] },
          ],
        },
      ],
    };

    // 模拟 create：返回带 id 的节点
    let nextId = 100;
    vi.mocked(browser.bookmarks.create).mockImplementation(async (opts: any) => {
      return {
        id: String(nextId++),
        title: opts.title,
        url: opts.url,
        parentId: opts.parentId,
        index: opts.index,
      } as any;
    });
    vi.mocked(browser.bookmarks.getChildren).mockImplementation(async (id: any) => {
      // 从模拟树中查找
      const find = (nodes: any[]): any[] => {
        for (const n of nodes) {
          if (n.id === id) return n.children || [];
          if (n.children) {
            const r = find(n.children);
            if (r) return r;
          }
        }
        return null as any;
      };
      return (find(tree) || []) as any;
    });
    vi.mocked(browser.bookmarks.removeTree).mockResolvedValue(undefined as any);
    vi.mocked(browser.bookmarks.remove).mockResolvedValue(undefined as any);
    vi.mocked(browser.bookmarks.move).mockResolvedValue({} as any);
    vi.mocked(browser.bookmarks.update).mockResolvedValue({} as any);

    const { BookmarkRepository } = await import("@src/core/bookmark/repository");
    const repo = new BookmarkRepository();
    await repo.restoreFromBackup(backup as any);

    // 关键断言：云端的书签确实被创建到书签栏（此前整个恢复是 no-op）
    expect(browser.bookmarks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "1", // Chrome 书签栏
        title: "Example",
        url: "https://example.com",
      }),
    );
  });
});
