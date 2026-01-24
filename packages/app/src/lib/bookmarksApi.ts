/**
 * WebExtension Bookmarks API 兼容层
 * 使用 webextension-polyfill 实现跨浏览器兼容
 */
import browser from "webextension-polyfill";

export const BookmarksAPI = {
  /**
   * 获取书签树
   */
  getTree(): Promise<browser.Bookmarks.BookmarkTreeNode[]> {
    return browser.bookmarks.getTree();
  },

  /**
   * 获取子节点
   */
  getChildren(id: string): Promise<browser.Bookmarks.BookmarkTreeNode[]> {
    return browser.bookmarks.getChildren(id);
  },

  /**
   * 创建书签/文件夹
   */
  create(
    bookmark: browser.Bookmarks.CreateDetails,
  ): Promise<browser.Bookmarks.BookmarkTreeNode> {
    return browser.bookmarks.create(bookmark);
  },

  /**
   * 删除书签树（包括子节点）
   */
  removeTree(id: string): Promise<void> {
    return browser.bookmarks.removeTree(id);
  },

  /**
   * 更新书签/文件夹的标题或URL
   */
  update(
    id: string,
    changes: browser.Bookmarks.UpdateChangesType,
  ): Promise<browser.Bookmarks.BookmarkTreeNode> {
    return browser.bookmarks.update(id, changes);
  },

  /**
   * 删除单个书签或空文件夹
   */
  remove(id: string): Promise<void> {
    return browser.bookmarks.remove(id);
  },

  /**
   * 移动书签/文件夹
   */
  move(
    id: string,
    destination: browser.Bookmarks.MoveDestinationType,
  ): Promise<browser.Bookmarks.BookmarkTreeNode> {
    return browser.bookmarks.move(id, destination);
  },
};
