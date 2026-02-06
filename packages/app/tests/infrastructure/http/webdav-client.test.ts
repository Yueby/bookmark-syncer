/**
 * webdav-client.ts 测试
 * 验证 Issue #9 修复：headers、XML 命名空间解析、401 错误处理
 */
import { WebDAVClient } from "@src/infrastructure/http/webdav-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

const testConfig = {
  url: "https://dav.example.com/remote.php/dav/files/user",
  username: "testuser",
  password: "testpass",
};

function createClient() {
  return new WebDAVClient(testConfig);
}

function expectBasicAuth(headers: Record<string, string>) {
  const expectedAuth = `Basic ${btoa("testuser:testpass")}`;
  expect(headers["Authorization"] || headers["authorization"]).toBe(expectedAuth);
}

// 辅助函数：从 fetch 调用中提取 headers 对象
function getLastFetchHeaders(): Record<string, string> {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return call[1]?.headers || {};
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("WebDAVClient - Headers 修复 (Issue #9)", () => {
  it("testConnection 请求头不包含 Content-Type", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 207 });
    const client = createClient();
    await client.testConnection();

    const headers = getLastFetchHeaders();
    expectBasicAuth(headers);
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("putFile 请求头包含 Content-Type: application/octet-stream", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });
    const client = createClient();
    await client.putFile("test.json.gz", "content");

    const headers = getLastFetchHeaders();
    expectBasicAuth(headers);
    expect(headers["Content-Type"]).toBe("application/octet-stream");
  });

  it("listFiles 请求头不包含 Content-Type", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => '<d:multistatus xmlns:d="DAV:"></d:multistatus>',
    });
    const client = createClient();
    await client.listFiles("BookmarkSyncer");

    const headers = getLastFetchHeaders();
    expectBasicAuth(headers);
    expect(headers["Content-Type"]).toBeUndefined();
  });

  it("所有请求包含正确的 Basic Auth 头", async () => {
    const client = createClient();
    const expectedAuth = `Basic ${btoa("testuser:testpass")}`;

    // testConnection
    mockFetch.mockResolvedValueOnce({ ok: true, status: 207 });
    await client.testConnection();
    expect(getLastFetchHeaders()["Authorization"]).toBe(expectedAuth);

    // getFile
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200, text: async () => "data" });
    await client.getFile("test.txt");
    expect(getLastFetchHeaders()["Authorization"]).toBe(expectedAuth);

    // deleteFile
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });
    await client.deleteFile("test.txt");
    expect(getLastFetchHeaders()["Authorization"]).toBe(expectedAuth);
  });
});

describe("WebDAVClient - XML 命名空间解析", () => {
  function makeMultistatusXml(nsPrefix: string, closingPrefix?: string): string {
    const cp = closingPrefix ?? nsPrefix;
    const href = `${nsPrefix}href`;
    const chref = `${cp}href`;
    const resp = `${nsPrefix}response`;
    const cresp = `${cp}response`;
    const lastmod = `${nsPrefix}getlastmodified`;
    const clastmod = `${cp}getlastmodified`;
    const contentlen = `${nsPrefix}getcontentlength`;
    const ccontentlen = `${cp}getcontentlength`;

    const restype = `${nsPrefix}resourcetype`;
    const crestype = `${cp}resourcetype`;
    const collection = `${nsPrefix}collection`;

    return `<?xml version="1.0" encoding="utf-8"?>
<${nsPrefix}multistatus>
  <${resp}>
    <${href}>/remote.php/dav/files/user/BookmarkSyncer/</${chref}>
    <${nsPrefix}propstat>
      <${nsPrefix}prop>
        <${restype}><${collection}/></${crestype}>
      </${cp}prop>
    </${cp}propstat>
  </${cresp}>
  <${resp}>
    <${href}>/remote.php/dav/files/user/BookmarkSyncer/bookmarks_20260127_143052_edge_157_v1.json.gz</${chref}>
    <${nsPrefix}propstat>
      <${nsPrefix}prop>
        <${lastmod}>Mon, 27 Jan 2026 14:30:52 GMT</${clastmod}>
        <${contentlen}>4096</${ccontentlen}>
      </${cp}prop>
    </${cp}propstat>
  </${cresp}>
  <${resp}>
    <${href}>/remote.php/dav/files/user/BookmarkSyncer/bookmarks_20260128_100000_chrome_200_v1.json.gz</${chref}>
    <${nsPrefix}propstat>
      <${nsPrefix}prop>
        <${lastmod}>Wed, 28 Jan 2026 10:00:00 GMT</${clastmod}>
        <${contentlen}>8192</${ccontentlen}>
      </${cp}prop>
    </${cp}propstat>
  </${cresp}>
</${cp}multistatus>`;
  }

  it("解析 Nextcloud 格式的 XML (d: 前缀)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => makeMultistatusXml("d:"),
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");

    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("bookmarks_20260127_143052_edge_157_v1.json.gz");
    expect(files[1].name).toBe("bookmarks_20260128_100000_chrome_200_v1.json.gz");
    expect(files[0].size).toBe(4096);
    expect(files[1].size).toBe(8192);
  });

  it("解析 Apache/AList 格式的 XML (D: 前缀)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => makeMultistatusXml("D:"),
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");

    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("bookmarks_20260127_143052_edge_157_v1.json.gz");
    expect(files[1].name).toBe("bookmarks_20260128_100000_chrome_200_v1.json.gz");
  });

  it("解析无前缀格式的 XML", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => makeMultistatusXml(""),
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");

    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("bookmarks_20260127_143052_edge_157_v1.json.gz");
  });

  it("空目录返回空数组", async () => {
    const emptyXml = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/dav/files/user/BookmarkSyncer/</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
      </d:prop>
    </d:propstat>
  </d:response>
</d:multistatus>`;
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => emptyXml,
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");
    expect(files).toEqual([]);
  });

  it("正确提取文件名、修改时间、大小", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 207,
      text: async () => makeMultistatusXml("d:"),
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");

    expect(files[0]).toMatchObject({
      name: "bookmarks_20260127_143052_edge_157_v1.json.gz",
      size: 4096,
    });
    expect(files[0].lastModified).toBeGreaterThan(0);
  });
});

describe("WebDAVClient - 错误处理", () => {
  it("401 响应抛出认证错误（而非静默返回空数组）", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });
    const client = createClient();

    await expect(client.listFiles("BookmarkSyncer")).rejects.toThrow(
      "WebDAV 认证失败"
    );
  });

  it("403 响应抛出认证错误", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });
    const client = createClient();

    await expect(client.listFiles("BookmarkSyncer")).rejects.toThrow(
      "WebDAV 认证失败"
    );
  });

  it("404 响应返回空数组", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });
    const client = createClient();
    const files = await client.listFiles("BookmarkSyncer");
    expect(files).toEqual([]);
  });

  it("非 207 响应返回空数组", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    const client = createClient();
    // 500 状态码会被捕获并返回空数组（console.error 后 return []）
    const files = await client.listFiles("BookmarkSyncer");
    expect(files).toEqual([]);
  });

  it("putFile 失败抛出包含状态码的错误", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 507,
      statusText: "Insufficient Storage",
    });
    const client = createClient();
    await expect(client.putFile("test.json", "data")).rejects.toThrow("507");
  });
});
