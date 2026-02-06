import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__mocks__/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "webextension-polyfill": path.resolve(
        __dirname,
        "src/__mocks__/webextension-polyfill.ts"
      ),
      "@src": path.resolve(__dirname, "src"),
    },
  },
});
