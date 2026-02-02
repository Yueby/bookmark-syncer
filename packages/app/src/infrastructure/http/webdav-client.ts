/**
 * WebDAV HTTP 客户端（单例模式）
 * 纯 HTTP 协议操作，不包含业务逻辑
 */
import type { WebDAVConfig } from "../../core/storage/types";

export interface WebDAVFile {
  name: string;
  path: string;
  lastModified: number;
  size: number;
}

/**
 * WebDAV 客户端接口
 */
export interface IWebDAVClient {
  testConnection(): Promise<boolean>;
  putFile(path: string, content: string): Promise<void>;
  getFile(path: string): Promise<string>;
  createDirectory(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listFiles(dirPath: string): Promise<WebDAVFile[]>;
  deleteFile(path: string): Promise<void>;
}

/**
 * WebDAV 客户端类（支持单例缓存）
 */
export class WebDAVClient implements IWebDAVClient {
  private readonly config: WebDAVConfig;

  constructor(config: WebDAVConfig) {
    this.config = config;
    console.log(`[WebDAVClient] Instance created for ${config.url}`);
  }

  private getHeaders() {
    const auth = btoa(`${this.config.username}:${this.config.password}`);
    return {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  private normalizeUrl(path: string): string {
    const baseUrl = this.config.url.endsWith("/") ? this.config.url : `${this.config.url}/`;
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    return `${baseUrl}${cleanPath}`;
  }

  async testConnection(): Promise<boolean> {
    const response = await fetch(this.normalizeUrl(""), {
      method: "PROPFIND",
      headers: {
        ...this.getHeaders(),
        Depth: "0",
        Connection: "close",
      },
      credentials: "omit",
    });
    return response.ok || response.status === 207;
  }

  async putFile(path: string, content: string): Promise<void> {
    const response = await fetch(this.normalizeUrl(path), {
      method: "PUT",
      headers: {
        ...this.getHeaders(),
        Connection: "close",
      },
      body: content,
      credentials: "omit",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to upload file: ${response.status} ${response.statusText}`
      );
    }
  }

  async getFile(path: string): Promise<string> {
    const fullUrl = this.normalizeUrl(path);
    const fileName = path.split("/").pop() || path;
    console.log(`[WebDAV] Getting file: ${fileName}`);

    // 直接下载，不重试 409（409 说明有并发问题，应该在上层解决）
    const response = await fetch(fullUrl, {
      method: "GET",
      headers: {
        ...this.getHeaders(),
        Connection: "close",
        // 添加缓存控制，确保不使用缓存
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
      credentials: "omit",
      // 强制不使用缓存
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[WebDAV] File not found: ${path}`);
        throw new Error(`文件不存在: ${path}`);
      }

      if (response.status === 401 || response.status === 403) {
        console.error(`[WebDAV] Authentication/permission error for: ${path}`);
        throw new Error(`认证失败: ${path}`);
      }

      if (response.status === 409) {
        // 获取响应体查看详细错误信息
        const errorBody = await response.text().catch(() => "");
        console.error(
          `[WebDAV] ❌ CONFLICT (409) on GET request!`,
          `\n  File: ${fileName}`,
          `\n  URL: ${fullUrl}`,
          `\n  Response: ${errorBody.substring(0, 200)}`
        );
        throw new Error(`文件访问冲突，请稍后再试 (409)`);
      }

      throw new Error(
        `Failed to download file: ${response.status} ${response.statusText}`
      );
    }

    const content = await response.text();
    console.log(`[WebDAV] ✓ Successfully retrieved ${fileName} (${content.length} bytes)`);
    return content;
  }

  async createDirectory(path: string): Promise<void> {
    const response = await fetch(this.normalizeUrl(path), {
      method: "MKCOL",
      headers: {
        ...this.getHeaders(),
        Connection: "close",
      },
      credentials: "omit",
    });

    if (!response.ok && response.status !== 405) {
      throw new Error(
        `Failed to create directory: ${response.status} ${response.statusText}`
      );
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const response = await fetch(this.normalizeUrl(path), {
        method: "PROPFIND",
        headers: {
          ...this.getHeaders(),
          Depth: "0",
          Connection: "close",
        },
        credentials: "omit",
      });
      return response.ok || response.status === 207;
    } catch {
      return false;
    }
  }

  async listFiles(dirPath: string): Promise<WebDAVFile[]> {
    try {
      const response = await fetch(this.normalizeUrl(dirPath), {
        method: "PROPFIND",
        headers: {
          ...this.getHeaders(),
          Depth: "1",
          Connection: "close",
        },
        credentials: "omit",
      });

      if (response.status === 401) {
        console.warn("[WebDAV] Authentication failed when listing files");
        return [];
      }

      if (response.status === 404) {
        console.log("[WebDAV] Directory not found, returning empty list");
        return [];
      }

      if (!response.ok && response.status !== 207) {
        console.error(
          `[WebDAV] Failed to list files: ${response.status} ${response.statusText}`
        );
        return [];
      }

      const xml = await response.text();
      const files: WebDAVFile[] = [];

      // 提取 base path 用于后续路径规范化
      const baseUrlPath = new URL(this.config.url).pathname;

      const responseRegex = /<d:response[^>]*>([\s\S]*?)<\/d:response>/g;
      const responses = [...xml.matchAll(responseRegex)];

      for (let i = 0; i < responses.length; i++) {
        const responseBlock = responses[i][1];

        const hrefMatch = responseBlock.match(/<d:href[^>]*>(.*?)<\/d:href>/);
        if (!hrefMatch) continue;

        let href = hrefMatch[1].trim();

        if (i === 0 && href.endsWith("/")) continue;

        const isCollection = /<d:collection\s*\/>/.test(responseBlock);
        if (isCollection) continue;

        let decodedHref = decodeURIComponent(href);

        try {
          const url = new URL(decodedHref);
          decodedHref = url.pathname;
        } catch {
          // Keep as is
        }

        // 移除 base path 前缀，避免重复
        // 例如：/dav/BookmarkSyncer/xxx -> BookmarkSyncer/xxx
        if (decodedHref.startsWith(baseUrlPath)) {
          decodedHref = decodedHref.substring(baseUrlPath.length);
        }
        // 移除前导斜杠
        decodedHref = decodedHref.replace(/^\/+/, '');

        const name = decodedHref.split("/").filter(Boolean).pop() || "";

        const lastModifiedMatch = responseBlock.match(
          /<d:getlastmodified[^>]*>(.*?)<\/d:getlastmodified>/
        );
        const lastModifiedStr = lastModifiedMatch
          ? lastModifiedMatch[1].trim()
          : "";
        const lastModified = lastModifiedStr
          ? new Date(lastModifiedStr).getTime()
          : 0;

        const sizeMatch = responseBlock.match(
          /<d:getcontentlength[^>]*>(.*?)<\/d:getcontentlength>/
        );
        const sizeStr = sizeMatch ? sizeMatch[1].trim() : "0";
        const size = parseInt(sizeStr, 10);

        files.push({
          name,
          path: decodedHref,  // 现在是相对路径：BookmarkSyncer/xxx
          lastModified,
          size,
        });
      }

      console.log(`[WebDAV] Listed ${files.length} files from ${dirPath}`);
      if (files.length > 0) {
        console.log(
          `[WebDAV] Sample file - name: ${files[0].name}, path: ${files[0].path}`
        );
      }

      return files;
    } catch (error) {
      console.error("[WebDAV] Failed to list files:", error);
      return [];
    }
  }

  async deleteFile(path: string): Promise<void> {
    const response = await fetch(this.normalizeUrl(path), {
      method: "DELETE",
      headers: {
        ...this.getHeaders(),
        Connection: "close",
      },
      credentials: "omit",
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(
        `Failed to delete file: ${response.status} ${response.statusText}`
      );
    }
  }
}

/**
 * 获取 WebDAV 客户端
 * @param config WebDAV 配置
 * @returns WebDAV 客户端实例（每次创建新实例，避免连接复用导致的 409 冲突）
 */
export function getWebDAVClient(config: WebDAVConfig): WebDAVClient {
  console.log(`[WebDAVClient] Creating fresh client instance for ${config.url}`);
  return new WebDAVClient(config);
}

/**
 * @deprecated 使用 getWebDAVClient 代替
 * 兼容旧 API 的工厂函数
 */
export function createWebDAVClient(config: WebDAVConfig): IWebDAVClient {
  return getWebDAVClient(config);
}
