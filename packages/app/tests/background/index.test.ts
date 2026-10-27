import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  initializeAutoSync: vi.fn(),
  registerBackgroundOpHandler: vi.fn(),
  startAutoSync: vi.fn(),
  startScheduledSync: vi.fn(),
  clearStartupCheckFlag: vi.fn(),
  onInstalled: vi.fn<(listener: () => void) => void>(),
  onStartup: vi.fn<(listener: () => void) => void>(),
}));

vi.mock("@src/application", () => ({
  initializeAutoSync: mocks.initializeAutoSync,
  startAutoSync: mocks.startAutoSync,
  startScheduledSync: mocks.startScheduledSync,
  clearStartupCheckFlag: mocks.clearStartupCheckFlag,
}));
vi.mock("@src/background/op-handler", () => ({
  registerBackgroundOpHandler: mocks.registerBackgroundOpHandler,
}));
vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: {
      onInstalled: { addListener: mocks.onInstalled },
      onStartup: { addListener: mocks.onStartup },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("WXT background initialization", () => {
  it("can import the entrypoint implementation without registering browser listeners", async () => {
    await import("@src/background");
    expect(mocks.initializeAutoSync).not.toHaveBeenCalled();
    expect(mocks.registerBackgroundOpHandler).not.toHaveBeenCalled();
    expect(mocks.onInstalled).not.toHaveBeenCalled();
    expect(mocks.onStartup).not.toHaveBeenCalled();
  });

  it("registers all listeners synchronously without starting a cloud check on worker wake", async () => {
    const { initBackground } = await import("@src/background");
    expect(initBackground()).toBeUndefined();
    expect(mocks.initializeAutoSync).toHaveBeenCalledOnce();
    expect(mocks.registerBackgroundOpHandler).toHaveBeenCalledOnce();
    expect(mocks.onInstalled).toHaveBeenCalledOnce();
    expect(mocks.onStartup).toHaveBeenCalledOnce();
    expect(mocks.startAutoSync).not.toHaveBeenCalled();
    expect(mocks.startScheduledSync).not.toHaveBeenCalled();
  });

  it("clears the startup flag and starts services on installation", async () => {
    const { initBackground } = await import("@src/background");
    initBackground();
    mocks.onInstalled.mock.calls[0][0]();
    expect(mocks.clearStartupCheckFlag).toHaveBeenCalledOnce();
    expect(mocks.startAutoSync).toHaveBeenCalledOnce();
    expect(mocks.startScheduledSync).toHaveBeenCalledOnce();
  });

  it("starts services without clearing the session flag on browser startup", async () => {
    const { initBackground } = await import("@src/background");
    initBackground();
    mocks.onStartup.mock.calls[0][0]();
    expect(mocks.clearStartupCheckFlag).not.toHaveBeenCalled();
    expect(mocks.startAutoSync).toHaveBeenCalledOnce();
    expect(mocks.startScheduledSync).toHaveBeenCalledOnce();
  });
});
