/**
 * file-manager.ts 测试
 * 测试文件名生成、解析、识别功能
 */
import { FileManager } from "@src/core/storage/file-manager";
import { describe, expect, it } from "vitest";

const fm = new FileManager();

describe("FileManager - generateBackupFileName", () => {
  it("生成正确格式的文件名", () => {
    const name = fm.generateBackupFileName("Edge", 157, 1);
    // 格式: bookmarks_YYYYMMDD_HHMMSS_edge_157_v1.json
    expect(name).toMatch(
      /^bookmarks_\d{8}_\d{6}_edge_157_v1\.json$/
    );
  });

  it("浏览器名称转为小写并去除空格", () => {
    const name = fm.generateBackupFileName("Microsoft Edge", 100, 2);
    expect(name).toMatch(/_microsoftedge_100_v2\.json$/);
  });

  it("默认修订号为 1", () => {
    const name = fm.generateBackupFileName("Chrome", 200);
    expect(name).toMatch(/_v1\.json$/);
  });

  it("修订号大于 1 时正确写入", () => {
    const name = fm.generateBackupFileName("Firefox", 50, 5);
    expect(name).toMatch(/_firefox_50_v5\.json$/);
  });
});

describe("FileManager - parseBackupFileName", () => {
  it("正确解析标准文件名", () => {
    const result = fm.parseBackupFileName(
      "bookmarks_20260127_143052_edge_157_v1.json"
    );
    expect(result).not.toBeNull();
    expect(result!.browser).toBe("edge");
    expect(result!.count).toBe(157);
    expect(result!.revisionNumber).toBe(1);
    expect(result!.timestamp).toBeGreaterThan(0);
  });

  it("正确解析带 .gz 扩展名的文件名", () => {
    const result = fm.parseBackupFileName(
      "bookmarks_20260127_143052_edge_157_v3.json.gz"
    );
    expect(result).not.toBeNull();
    expect(result!.browser).toBe("edge");
    expect(result!.count).toBe(157);
    expect(result!.revisionNumber).toBe(3);
  });

  it("正确解析时间戳", () => {
    const result = fm.parseBackupFileName(
      "bookmarks_20260127_143052_chrome_200_v1.json"
    );
    expect(result).not.toBeNull();
    // 2026-01-27 14:30:52
    const date = new Date(result!.timestamp);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0); // January = 0
    expect(date.getDate()).toBe(27);
    expect(date.getHours()).toBe(14);
    expect(date.getMinutes()).toBe(30);
    expect(date.getSeconds()).toBe(52);
  });

  it("不匹配格式返回 null", () => {
    expect(fm.parseBackupFileName("random_file.json")).toBeNull();
    expect(fm.parseBackupFileName("bookmarks.json")).toBeNull();
    expect(fm.parseBackupFileName("")).toBeNull();
    expect(fm.parseBackupFileName("bookmarks_invalid.json")).toBeNull();
  });
});

describe("FileManager - isBackupFile", () => {
  it("识别正确的 .json.gz 备份文件", () => {
    expect(
      fm.isBackupFile("bookmarks_20260127_143052_edge_157_v1.json.gz")
    ).toBe(true);
  });

  it("不匹配的文件名返回 false", () => {
    expect(fm.isBackupFile("bookmarks_20260127.json")).toBe(false);
    expect(fm.isBackupFile("readme.txt")).toBe(false);
    expect(fm.isBackupFile("bookmarks_.json.gz")).toBe(true); // starts with bookmarks_ and ends with .json.gz
  });

  it("没有 .gz 扩展名返回 false", () => {
    expect(
      fm.isBackupFile("bookmarks_20260127_143052_edge_157_v1.json")
    ).toBe(false);
  });
});
