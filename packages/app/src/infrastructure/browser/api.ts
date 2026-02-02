/**
 * WebExtension Bookmarks API 封装层
 * 提供跨浏览器兼容的书签操作接口
 */
import browser from "webextension-polyfill";

export type BookmarkTreeNode = browser.Bookmarks.BookmarkTreeNode;
export type CreateDetails = browser.Bookmarks.CreateDetails;
export type UpdateChanges = browser.Bookmarks.UpdateChangesType;
export type MoveDestination = browser.Bookmarks.MoveDestinationType;

/**
 * 书签 API 封装
 * 统一封装浏览器书签 API，便于测试和扩展
 */
export const BrowserBookmarksAPI = {
  /**
   * 获取完整的书签树
   */
  async getTree(): Promise<BookmarkTreeNode[]> {
    return browser.bookmarks.getTree();
  },

  /**
   * 获取指定节点的子节点
   */
  async getChildren(id: string): Promise<BookmarkTreeNode[]> {
    return browser.bookmarks.getChildren(id);
  },

  /**
   * 获取指定ID的书签或文件夹信息
   */
  async get(id: string): Promise<BookmarkTreeNode[]> {
    return browser.bookmarks.get(id);
  },

  /**
   * 创建书签或文件夹
   */
  async create(details: CreateDetails): Promise<BookmarkTreeNode> {
    return browser.bookmarks.create(details);
  },

  /**
   * 更新书签/文件夹的属性
   */
  async update(id: string, changes: UpdateChanges): Promise<BookmarkTreeNode> {
    return browser.bookmarks.update(id, changes);
  },

  /**
   * 移动书签/文件夹到新位置
   */
  async move(id: string, destination: MoveDestination): Promise<BookmarkTreeNode> {
    return browser.bookmarks.move(id, destination);
  },

  /**
   * 删除单个书签或空文件夹
   */
  async remove(id: string): Promise<void> {
    return browser.bookmarks.remove(id);
  },

  /**
   * 递归删除文件夹及其所有子节点
   */
  async removeTree(id: string): Promise<void> {
    return browser.bookmarks.removeTree(id);
  },
};
