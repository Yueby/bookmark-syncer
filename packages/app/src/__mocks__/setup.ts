/**
 * Vitest 全局 setup
 * 设置 navigator.onLine 默认值 + 其他全局 mock
 */
import { vi } from "vitest";

// 默认 navigator.onLine = true
Object.defineProperty(globalThis, "navigator", {
  value: {
    onLine: true,
  },
  writable: true,
  configurable: true,
});

// Mock console 避免测试输出噪音
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
