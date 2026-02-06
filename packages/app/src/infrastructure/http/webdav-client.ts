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

      if (response.status === 401 || response.status === 403) {
        console.warn("[WebDAV] Authentication/permission failed when listing files");
        // 这里必须抛错：
        // 1) UI 才能提示“认证失败”，而不是误显示为 0
        // 2) 上层才能避免把“401 导致的空列表”缓存起来，造成后续看不到任何网络请求
        throw new Error("WebDAV 认证失败（用户名/密码或权限不正确）");
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
      const baseUrlPathRaw = new URL(this.config.url).pathname;
      const baseUrlPath = baseUrlPathRaw.replace(/\/+$/, "");

      // WebDAV 的 XML 命名空间前缀在不同服务端可能是 d:/D:/a:...
      // 之前用正则硬匹配 <d:response> 会导致部分服务端解析不到文件列表，最终表现为“云端备份显示 0”。
      // 这里改用 DOMParser，按 localName 解析（忽略命名空间前缀），更健壮。
      try {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const parserError = doc.getElementsByTagName("parsererror")[0];
        if (parserError) {
          throw new Error("Invalid XML response");
        }

        const responseEls = Array.from(doc.getElementsByTagNameNS("*", "response"));

        for (const responseEl of responseEls) {
          const hrefEl = responseEl.getElementsByTagNameNS("*", "href")[0];
          const href = hrefEl?.textContent?.trim();
          if (!href) continue;

          const resourceTypeEl = responseEl.getElementsByTagNameNS("*", "resourcetype")[0];
          const isCollection = !!resourceTypeEl?.getElementsByTagNameNS("*", "collection")[0];
          if (isCollection) continue;

          let decodedHref = decodeURIComponent(href);
          try {
            decodedHref = new URL(decodedHref).pathname;
          } catch {
            // Keep as is
          }

          // 移除 base path 前缀，避免重复
          // 例如：/dav/BookmarkSyncer/xxx -> BookmarkSyncer/xxx
          if (decodedHref.startsWith(baseUrlPath + "/")) {
            decodedHref = decodedHref.substring((baseUrlPath + "/").length);
          } else if (decodedHref === baseUrlPath) {
            decodedHref = "";
          }

          // 移除前导斜杠
          decodedHref = decodedHref.replace(/^\/+/, "");

          const name = decodedHref.split("/").filter(Boolean).pop() || "";

          const lastModifiedEl = responseEl.getElementsByTagNameNS("*", "getlastmodified")[0];
          const lastModifiedStr = lastModifiedEl?.textContent?.trim() || "";
          const lastModified = lastModifiedStr ? new Date(lastModifiedStr).getTime() : 0;

          const sizeEl = responseEl.getElementsByTagNameNS("*", "getcontentlength")[0];
          const sizeStr = sizeEl?.textContent?.trim() || "0";
          const size = parseInt(sizeStr, 10);

          if (!name || !decodedHref) continue;

          files.push({
            name,
            path: decodedHref, // 相对路径：BookmarkSyncer/xxx
            lastModified,
            size,
          });
        }
      } catch (error) {
        console.warn("[WebDAV] DOMParser failed, falling back to regex parser:", error);

        // 兼容可选前缀（例如 d:/D:）以及无前缀（默认命名空间）
        const responseRegex = /<(?:\w+:)?response[^>]*>([\s\S]*?)<\/(?:\w+:)?response>/gi;
        const responses = [...xml.matchAll(responseRegex)];

        for (const m of responses) {
          const responseBlock = m[1];

          const hrefMatch = responseBlock.match(/<(?:\w+:)?href[^>]*>(.*?)<\/(?:\w+:)?href>/i);
          if (!hrefMatch) continue;

          const isCollection = /<(?:\w+:)?collection\s*\/>/i.test(responseBlock);
          if (isCollection) continue;

          let decodedHref = decodeURIComponent(hrefMatch[1].trim());
          try {
            decodedHref = new URL(decodedHref).pathname;
          } catch {
            // Keep as is
          }

          if (decodedHref.startsWith(baseUrlPath + "/")) {
            decodedHref = decodedHref.substring((baseUrlPath + "/").length);
          } else if (decodedHref === baseUrlPath) {
            decodedHref = "";
          }

          decodedHref = decodedHref.replace(/^\/+/, "");
          const name = decodedHref.split("/").filter(Boolean).pop() || "";

          const lastModifiedMatch = responseBlock.match(/<\w+:getlastmodified[^>]*>(.*?)<\/\w+:getlastmodified>/i);
          const lastModifiedStr = lastModifiedMatch ? lastModifiedMatch[1].trim() : "";
          const lastModified = lastModifiedStr ? new Date(lastModifiedStr).getTime() : 0;

          const sizeMatch = responseBlock.match(/<\w+:getcontentlength[^>]*>(.*?)<\/\w+:getcontentlength>/i);
          const sizeStr = sizeMatch ? sizeMatch[1].trim() : "0";
          const size = parseInt(sizeStr, 10);

          if (!name || !decodedHref) continue;

          files.push({
            name,
            path: decodedHref,
            lastModified,
            size,
          });
        }
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
