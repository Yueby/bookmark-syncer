/**
 * repository.ts 测试
 * 测试书签仓储层的 createCloudBackup 和 restoreFromBackup
 */
import { BookmarkRepository } from "@src/core/bookmark/repository";
import type { BookmarkNode, CloudBackup } from "@src/types";
import browser from "webextension-polyfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock 依赖模块
vi.mock("@src/core/bookmark/hash-calculator", () => ({
  assignHashes: vi.fn(async (nodes: BookmarkNode[]) => {
    // 递归添加 hash
    function addHash(node: BookmarkNode): BookmarkNode {
      return {
        ...node,
        hash: node.url ? `hash_${node.url}` : undefined,
        children: node.children?.map(addHash),
      };
    }
    return nodes.map(addHash);
  }),
}));

vi.mock("@src/core/bookmark/merger", () => ({
  buildGlobalIndex: vi.fn(async () => ({
    hashToNode: new Map(),
    urlToBookmarks: new Map(),
    pathToFolder: new Map(),
    idToPath: new Map(),
  })),
  smartSync: vi.fn(async () => {}),
  mergeNodes: vi.fn(async () => {}),
  createChildren: vi.fn(async () => {}),
}));

vi.mock("@src/core/bookmark/normalizer", () => ({
  isSystemRootFolder: vi.fn((node: BookmarkNode) => {
    return (node.id === "0" && !node.title) || !!node.folderType;
  }),
  findMatchingSystemFolder: vi.fn(
    (backup: BookmarkNode, locals: BookmarkNode[]) =>
      locals.find((l) => l.folderType === backup.folderType) || null
  ),
  hasCrossBrowserMapping: vi.fn((node: BookmarkNode) => {
    return !!node.folderType;
  }),
  normalizeUrl: vi.fn((url: string) => url),
}));

vi.mock("@src/core/bookmark/comparator", () => ({
  countBookmarks: vi.fn((nodes: BookmarkNode[]) => {
    let count = 0;
    const walk = (ns: BookmarkNode[]) => {
      for (const n of ns) {
        if (n.url) count++;
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return count;
  }),
}));

describe("BookmarkRepository", () => {
  let repo: BookmarkRepository;

  const sampleTree: BookmarkNode[] = [
    {
      id: "0",
      title: "",
      children: [
        {
          id: "1",
          title: "Bookmarks Bar",
          folderType: "bookmarks-bar",
          children: [
            { id: "10", title: "Google", url: "https://google.com" },
            { id: "11", title: "GitHub", url: "https://github.com" },
          ],
        },
        {
          id: "2",
          title: "Other Bookmarks",
          folderType: "other",
          children: [],
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new BookmarkRepository();
    vi.mocked(browser.bookmarks.getTree).mockResolvedValue(sampleTree as any);
    vi.mocked(browser.bookmarks.getChildren).mockResolvedValue([]);
    vi.mocked(browser.bookmarks.create).mockResolvedValue({ id: "100", title: "" } as any);
    vi.mocked(browser.bookmarks.removeTree).mockResolvedValue(undefined);
  });

  // ─── getTree ───

  describe("getTree", () => {
    it("返回浏览器书签树", async () => {
      const tree = await repo.getTree();
      expect(tree).toEqual(sampleTree);
      expect(browser.bookmarks.getTree).toHaveBeenCalled();
    });
  });

  // ─── createCloudBackup ───

  describe("createCloudBackup", () => {
    it("生成包含 metadata 和 data 的 CloudBackup", async () => {
      const backup = await repo.createCloudBackup();
      expect(backup).toHaveProperty("metadata");
      expect(backup).toHaveProperty("data");
      expect(backup.metadata.timestamp).toBeGreaterThan(0);
      expect(backup.metadata.clientVersion).toBe("2.0.0-hash");
    });

    it("data 中的书签带有 hash", async () => {
      const backup = await repo.createCloudBackup();
      const bar = backup.data[0].children![0];
      const bookmark = bar.children![0];
      expect(bookmark.hash).toBe("hash_https://google.com");
    });
  });

  // ─── getLocalCount ───

  describe("getLocalCount", () => {
    it("返回书签数量", async () => {
      const count = await repo.getLocalCount();
      expect(count).toBe(2); // Google + GitHub
    });
  });

  // ─── restoreFromBackup ───

  describe("restoreFromBackup", () => {
    it("接受 CloudBackup 格式", async () => {
      const backup: CloudBackup = {
        metadata: { timestamp: Date.now(), clientVersion: "2.0.0" },
        data: sampleTree,
      };
      await expect(repo.restoreFromBackup(backup)).resolves.toBeUndefined();
    });

    it("接受 BookmarkNode[] 格式", async () => {
      await expect(repo.restoreFromBackup(sampleTree)).resolves.toBeUndefined();
    });

    it("空数据抛出错误", async () => {
      await expect(repo.restoreFromBackup([])).rejects.toThrow("备份数据为空");
    });

    it("缺少根节点子节点抛出错误", async () => {
      const badTree: BookmarkNode[] = [{ title: "" }]; // 没有 children
      await expect(repo.restoreFromBackup(badTree)).rejects.toThrow("缺少根节点或子节点");
    });

    it("无效的备份格式抛出错误", async () => {
      const badBackup = { metadata: {}, data: null } as unknown as CloudBackup;
      await expect(repo.restoreFromBackup(badBackup)).rejects.toThrow("备份数据格式无效");
    });
  });

  // ─── emptyFolder ───

  describe("emptyFolder", () => {
    it("删除所有子节点", async () => {
      vi.mocked(browser.bookmarks.getChildren).mockResolvedValueOnce([
        { id: "a", title: "A" },
        { id: "b", title: "B" },
      ] as any);

      await repo.emptyFolder("1");
      expect(browser.bookmarks.removeTree).toHaveBeenCalledTimes(2);
    });

    it("静默跳过已删除的子节点", async () => {
      vi.mocked(browser.bookmarks.getChildren).mockResolvedValueOnce([
        { id: "a", title: "A" },
      ] as any);
      vi.mocked(browser.bookmarks.removeTree).mockRejectedValueOnce(
        new Error("Can't find bookmark for id.")
      );

      await expect(repo.emptyFolder("1")).resolves.toBeUndefined();
    });
  });
});
