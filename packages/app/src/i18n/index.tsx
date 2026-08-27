/**
 * 轻量 i18n
 * - 语言优先级：手动设置(storage.local 'app_language') > 浏览器 UI 语言 > navigator.language
 * - 支持手动选项 'auto'（跟随浏览器）
 * - 词典为扁平 key，值支持 {var} 插值
 */
import browser from "webextension-polyfill";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { dictionary as zhCN } from "./locales/zh-CN";
import { dictionary as en } from "./locales/en";

export type Locale = "zh-CN" | "en";
export type LanguageSetting = Locale | "auto";

export const LANGUAGE_STORAGE_KEY = "app_language";
export const SUPPORTED_LOCALES: { value: LanguageSetting; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" },
];

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  "zh-CN": zhCN,
  en,
};

/**
 * 检测浏览器语言对应的 locale
 * 扩展上下文用 browser.i18n.getUILanguage()（跟随浏览器 UI 语言），
 * 不可用时退化为 navigator.language
 */
export function detectBrowserLocale(): Locale {
  let lang = "";
  try {
    lang = browser.i18n?.getUILanguage?.() || "";
  } catch {
    // 某些环境（测试）可能不可用
  }
  if (!lang) lang = navigator.language || "";

  const lower = lang.toLowerCase();
  if (lower.startsWith("zh")) return "zh-CN";
  return "en";
}

/**
 * 解析生效语言：手动设置优先，'auto' 或未设置时跟随浏览器
 */
export function resolveLocale(setting: LanguageSetting | undefined): Locale {
  if (setting && setting !== "auto") return setting;
  return detectBrowserLocale();
}

/** {var} 插值 */
export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** 翻译函数（非 React 上下文可用） */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES["zh-CN"];
  const template = dict[key] ?? DICTIONARIES["zh-CN"][key] ?? key;
  return interpolate(template, vars);
}

// ─── React 集成 ───

interface I18nContextValue {
  locale: Locale;
  /** t('key', {var}) */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh-CN",
  t: (key) => key,
});

/**
 * 读取持久化的语言设置（Provider 挂载时异步读取前使用同步猜测）
 */
export function readLanguageSetting(): Promise<LanguageSetting | undefined> {
  return browser.storage.local
    .get(LANGUAGE_STORAGE_KEY)
    .then((result) => result[LANGUAGE_STORAGE_KEY] as LanguageSetting | undefined)
    .catch(() => undefined);
}

export function writeLanguageSetting(setting: LanguageSetting): Promise<void> {
  return browser.storage.local.set({ [LANGUAGE_STORAGE_KEY]: setting }).catch(() => undefined);
}

/** 初始同步猜测（避免首次渲染闪烁）：先按浏览器语言渲染，异步校正 */
const INITIAL_GUESS = detectBrowserLocale();

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(INITIAL_GUESS);

  // 读取持久化设置 + 监听变化（设置页切换时 Provider 响应）
  useEffect(() => {
    let cancelled = false;

    const apply = (setting: LanguageSetting | undefined) => {
      if (!cancelled) setLocale(resolveLocale(setting));
    };

    readLanguageSetting().then(apply);

    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      if (changes[LANGUAGE_STORAGE_KEY]) {
        apply(changes[LANGUAGE_STORAGE_KEY].newValue as LanguageSetting | undefined);
      }
    };
    browser.storage.onChanged.addListener(listener);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(listener);
    };
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, t }), [locale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
