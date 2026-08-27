/**
 * 重复书签专项回归测试
 * 场景:云端备份存在同名兄弟文件夹(历史污染的典型产物),且各自含同一书签。
 * folderTargets 会将它们合并到同一本地文件夹,若书签身份去重集是每次
 * smartSync 调用独立的,第二次递归会重复创建书签 —— 同文件夹内同名同址重复。
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";

describe("同名兄弟文件夹的去重", () => {
  let localTree: any[];
  let nextId: number;

  beforeEach(() => {
    vi.resetAllMocks();
    __resetMockStore();
    nextId = 100;

    // 本地:真实 Chrome 结构(无 folderType,靠 annotateSystemFolders 标注)
    localTree = [
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
        ],
      },
    ];

    vi.mocked(browser.bookmarks.getTree).mockResolvedValue(localTree as any);
    vi.mocked(browser.bookmarks.create).mockImplementation(async (opts: any) => {
      const node = {
        id: String(nextId++),
        title: opts.title,
        url: opts.url,
        parentId: opts.parentId,
        index: opts.index,
        children: opts.url ? undefined : [],
      };
      // 写入模拟树,让后续 getChildren 能看到
      const parent = findNode(localTree, opts.parentId);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(node);
      }
      return node as any;
    });
    vi.mocked(browser.bookmarks.getChildren).mockImplementation(async (id: any) => {
      const node = findNode(localTree, id);
      return (node?.children || []) as any;
    });
    vi.mocked(browser.bookmarks.removeTree).mockImplementation(async (id: any) => {
      removeFromTree(localTree, id);
    });
    vi.mocked(browser.bookmarks.remove).mockImplementation(async (id: any) => {
      removeFromTree(localTree, id);
    });
    vi.mocked(browser.bookmarks.move).mockImplementation(async (id: any, opts: any) => {
      const node = findNode(localTree, id);
      if (node && opts.parentId) {
        removeFromTree(localTree, id);
        const parent = findNode(localTree, opts.parentId);
        if (parent) {
          parent.children = parent.children || [];
          parent.children.push(node);
        }
      }
      return node;
    });
    vi.mocked(browser.bookmarks.update).mockImplementation(async (id: any, changes: any) => {
      const node = findNode(localTree, id);
      if (node) Object.assign(node, changes);
      return node;
    });
  });

  it("两个同名文件夹含同一书签 → 恢复后只创建一份", async () => {
    // 云端备份:bar 下有两个同名 "Work" 文件夹,各含同一书签 X
    const backup = {
      metadata: { timestamp: Date.now() },
      data: [
        {
          id: "0",
          title: "",
          children: [
            {
              title: "Bookmarks Bar",
              children: [
                {
                  title: "Work",
                  children: [
                    { title: "Docs", url: "https://docs.example.com", hash: "h-docs" },
                  ],
                },
                {
                  title: "Work",
                  children: [
                    { title: "Docs", url: "https://docs.example.com", hash: "h-docs" },
                  ],
                },
              ],
            },
            { title: "Other Bookmarks", children: [] },
          ],
        },
      ],
    };

    const { BookmarkRepository } = await import("@src/core/bookmark/repository");
    const repo = new BookmarkRepository();
    await repo.restoreFromBackup(backup as any);

    // 断言:本地 bar 下只有一个 Work 文件夹(同名合并)
    const bar = localTree[0].children.find((c: any) => c.id === "1");
    const workFolders = bar.children.filter((c: any) => c.title === "Work" && !c.url);
    expect(workFolders.length).toBe(1);

    // 关键断言:合并后的 Work 里 Docs 只有一份(而非每个同名文件夹各创建一次)
    const docsBookmarks = workFolders[0].children.filter(
      (c: any) => c.url === "https://docs.example.com",
    );
    expect(docsBookmarks.length).toBe(1);
  });

  it("不同文件夹含同一书签 → 保留两份(合法跨文件夹副本)", async () => {
    // 云端备份:bar 下 Work 和 Reading 各含同一书签 —— 用户有意保存两份
    const backup = {
      metadata: { timestamp: Date.now() },
      data: [
        {
          id: "0",
          title: "",
          children: [
            {
              title: "Bookmarks Bar",
              children: [
                {
                  title: "Work",
                  children: [
                    { title: "Docs", url: "https://docs.example.com", hash: "h-docs" },
                  ],
                },
                {
                  title: "Reading",
                  children: [
                    { title: "Docs", url: "https://docs.example.com", hash: "h-docs" },
                  ],
                },
              ],
            },
            { title: "Other Bookmarks", children: [] },
          ],
        },
      ],
    };

    const { BookmarkRepository } = await import("@src/core/bookmark/repository");
    const repo = new BookmarkRepository();
    await repo.restoreFromBackup(backup as any);

    const bar = localTree[0].children.find((c: any) => c.id === "1");
    const work = bar.children.find((c: any) => c.title === "Work");
    const reading = bar.children.find((c: any) => c.title === "Reading");

    // 两个不同文件夹各保留一份 —— 不被误去重
    expect(work.children.filter((c: any) => c.url === "https://docs.example.com").length).toBe(1);
    expect(reading.children.filter((c: any) => c.url === "https://docs.example.com").length).toBe(1);
  });

  it("本地已有同名重复书签 + 云端只有一份 → 覆盖恢复后只剩一份", async () => {
    // 本地 bar 顶层已有两份同名同址书签(历史污染)
    localTree[0].children[0].children = [
      { id: "50", title: "News", url: "https://news.example.com", parentId: "1", index: 0 },
      { id: "51", title: "News", url: "https://news.example.com", parentId: "1", index: 1 },
    ];

    // 云端只有一份
    const backup = {
      metadata: { timestamp: Date.now() },
      data: [
        {
          id: "0",
          title: "",
          children: [
            {
              title: "Bookmarks Bar",
              children: [
                { title: "News", url: "https://news.example.com", hash: "h-news" },
              ],
            },
            { title: "Other Bookmarks", children: [] },
          ],
        },
      ],
    };

    const { BookmarkRepository } = await import("@src/core/bookmark/repository");
    const repo = new BookmarkRepository();
    await repo.restoreFromBackup(backup as any);

    // 覆盖恢复的删除阶段应清掉未被云端覆盖的那份重复
    const bar = localTree[0].children.find((c: any) => c.id === "1");
    const news = bar.children.filter((c: any) => c.url === "https://news.example.com");
    expect(news.length).toBe(1);
  });
});

// ── 模拟树辅助函数 ──

function findNode(nodes: any[], id: string): any {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function removeFromTree(nodes: any[], id: string): void {
  for (const n of nodes) {
    if (!n.children) continue;
    const idx = n.children.findIndex((c: any) => c.id === id);
    if (idx >= 0) {
      n.children.splice(idx, 1);
      return;
    }
    removeFromTree(n.children, id);
  }
}
