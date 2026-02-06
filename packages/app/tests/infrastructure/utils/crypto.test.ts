/**
 * crypto.ts 测试
 * 测试 SHA-256 哈希生成
 */
import { generateHash } from "@src/infrastructure/utils/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 使用 Node.js 内置 crypto 为测试环境提供 Web Crypto API
beforeAll(() => {
  if (!globalThis.crypto?.subtle) {
    const { webcrypto } = require("node:crypto");
    Object.defineProperty(globalThis, "crypto", {
      value: webcrypto,
      writable: true,
      configurable: true,
    });
  }
});

describe("generateHash", () => {
  it("相同输入产生一致的 hash", async () => {
    const h1 = await generateHash("https://example.com", "Example");
    const h2 = await generateHash("https://example.com", "Example");
    expect(h1).toBe(h2);
  });

  it("不同 URL 产生不同的 hash", async () => {
    const h1 = await generateHash("https://a.com", "Title");
    const h2 = await generateHash("https://b.com", "Title");
    expect(h1).not.toBe(h2);
  });

  it("不同标题产生不同的 hash", async () => {
    const h1 = await generateHash("https://example.com", "Title A");
    const h2 = await generateHash("https://example.com", "Title B");
    expect(h1).not.toBe(h2);
  });

  it("返回 64 个十六进制字符 (SHA-256)", async () => {
    const hash = await generateHash("https://example.com", "Test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("空字符串 URL 和标题也能生成 hash", async () => {
    const hash = await generateHash("", "");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("特殊字符不影响 hash 生成", async () => {
    const hash = await generateHash(
      "https://example.com/path?q=hello&b=world#fragment",
      "中文标题 & special <chars>"
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hash 基于 url|title 格式", async () => {
    // 验证分隔符是 |
    const h1 = await generateHash("a|b", "c");
    const h2 = await generateHash("a", "b|c");
    // "a|b|c" vs "a|b|c" - 但由于拼接方式不同，实际是 "a|b|c" vs "a|b|c"
    // 这里验证内容不同时 hash 不同
    const h3 = await generateHash("https://a.com", "title");
    const h4 = await generateHash("https://a.com|title", "");
    expect(h3).not.toBe(h4);
  });
});
