/**
 * Mock: webextension-polyfill
 * 模拟 browser.storage.local, browser.storage.session, browser.bookmarks, browser.alarms
 */
import { vi } from "vitest";

const localStore: Record<string, unknown> = {};

const browser = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
        if (!keys) return { ...localStore };
        if (typeof keys === "string") {
          return { [keys]: localStore[keys] };
        }
        if (Array.isArray(keys)) {
          const result: Record<string, unknown> = {};
          for (const key of keys) {
            result[key] = localStore[key];
          }
          return result;
        }
        // keys is an object with defaults
        const result: Record<string, unknown> = {};
        for (const [key, defaultValue] of Object.entries(keys)) {
          result[key] = localStore[key] ?? defaultValue;
        }
        return result;
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          delete localStore[key];
        }
      }),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
  bookmarks: {
    getTree: vi.fn(async () => []),
    create: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    remove: vi.fn(async () => {}),
    removeTree: vi.fn(async () => {}),
    move: vi.fn(async () => ({})),
    getChildren: vi.fn(async () => []),
    get: vi.fn(async () => []),
    onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    onMoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(async () => true),
    get: vi.fn(async () => null),
    getAll: vi.fn(async () => []),
    onAlarm: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    getManifest: vi.fn(() => ({ version: "1.0.0" })),
  },
};

/**
 * 清除 mock store 的辅助函数（供测试使用）
 */
export function __resetMockStore() {
  for (const key of Object.keys(localStore)) {
    delete localStore[key];
  }
}

export default browser;
