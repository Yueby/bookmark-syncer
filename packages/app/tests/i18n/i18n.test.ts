/**
 * i18n 测试
 * 语言检测优先级、插值、词典完整性、同步消息映射
 */
import { __resetMockStore } from "@src/__mocks__/webextension-polyfill";
import {
  detectBrowserLocale,
  interpolate,
  resolveLocale,
  translate,
  LANGUAGE_STORAGE_KEY,
  readLanguageSetting,
  writeLanguageSetting,
  type LanguageSetting,
} from "@src/i18n";
import { translateSyncMessage } from "@src/i18n/sync-messages";
import { dictionary as zhCN } from "@src/i18n/locales/zh-CN";
import { dictionary as en } from "@src/i18n/locales/en";
import { beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";

describe("i18n 基础", () => {
  it("interpolate 支持 {var} 插值", () => {
    expect(interpolate("云端有 {count} 个书签", { count: 42 })).toBe("云端有 42 个书签");
    expect(interpolate("无变量")).toBe("无变量");
    // 未提供的变量保留原样
    expect(interpolate("保留 {missing}")).toBe("保留 {missing}");
  });

  it("两个词典的 key 集合一致（防止漂移）", () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it("translate 命中词典，缺失 key 回退中文再回退 key 本身", () => {
    expect(translate("en", "common.cancel")).toBe("Cancel");
    expect(translate("zh-CN", "common.cancel")).toBe("取消");
    // 词典中不存在的 key：返回 key
    expect(translate("en", "nonexistent.key")).toBe("nonexistent.key");
  });

  it("中文 locale 的翻译等于中文原文", () => {
    expect(translate("zh-CN", "sync.stats.local")).toBe("本地书签");
  });
});

describe("语言检测", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetMockStore();
  });

  it("browser.i18n 返回 zh 系语言时检测为 zh-CN", () => {
    vi.mocked(browser.i18n.getUILanguage).mockReturnValue("zh-CN" as never);
    expect(detectBrowserLocale()).toBe("zh-CN");
  });

  it("browser.i18n 返回 en 时检测为 en", () => {
    vi.mocked(browser.i18n.getUILanguage).mockReturnValue("en-US" as never);
    expect(detectBrowserLocale()).toBe("en");
  });

  it("i18n API 不可用时退化为 navigator.language", () => {
    vi.mocked(browser.i18n.getUILanguage).mockImplementation(() => {
      throw new Error("unavailable");
    });
    // jsdom/happy-dom 的 navigator.language 通常是 en-US
    expect(detectBrowserLocale()).toBe("en");
  });

  it("resolveLocale：手动设置优先于浏览器语言", () => {
    vi.mocked(browser.i18n.getUILanguage).mockReturnValue("en-US" as never);
    expect(resolveLocale("zh-CN")).toBe("zh-CN");
    expect(resolveLocale("en")).toBe("en");
  });

  it("resolveLocale：auto / 未设置时跟随浏览器", () => {
    vi.mocked(browser.i18n.getUILanguage).mockReturnValue("zh-CN" as never);
    expect(resolveLocale("auto")).toBe("zh-CN");
    expect(resolveLocale(undefined)).toBe("zh-CN");
  });
});

describe("语言设置持久化", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    __resetMockStore();
  });

  it("读写 app_language", async () => {
    await writeLanguageSetting("en" as LanguageSetting);
    expect(await readLanguageSetting()).toBe("en");

    await writeLanguageSetting("auto");
    expect(await readLanguageSetting()).toBe("auto");
  });

  it("写入的 key 正确", async () => {
    await writeLanguageSetting("zh-CN");
    expect(browser.storage.local.set).toHaveBeenCalledWith({
      [LANGUAGE_STORAGE_KEY]: "zh-CN",
    });
  });
});

describe("同步消息翻译", () => {
  it("zh-CN 原样返回", () => {
    expect(translateSyncMessage("zh-CN", "同步正在进行中")).toBe("同步正在进行中");
  });

  it("已知消息映射到英文", () => {
    expect(translateSyncMessage("en", "同步正在进行中")).toBe("Sync in progress");
    expect(translateSyncMessage("en", "云端有更新，请先拉取")).toBe(
      "Cloud has newer data, please pull first",
    );
    expect(translateSyncMessage("en", "上传成功")).toBe("Upload succeeded");
  });

  it("模板消息（自动备份前缀）正确转换", () => {
    expect(translateSyncMessage("en", "下载前自动备份 (手动, 覆盖)")).toBe(
      "Pre-download backup (manual, overwrite)",
    );
  });

  it("超时消息转换", () => {
    expect(translateSyncMessage("en", "WebDAV 请求超时（30秒）: GET https://dav.example.com")).toBe(
      "WebDAV request timeout (30s): GET https://dav.example.com",
    );
  });

  it("未知消息原样返回（保持可读）", () => {
    expect(translateSyncMessage("en", "某个未映射的新消息")).toBe("某个未映射的新消息");
  });
});
