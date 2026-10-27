import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";
import { version } from "../../package.json";

const root = path.dirname(fileURLToPath(import.meta.url));
const profileDir = path.join(root, ".dev-profiles");
const icons = {
  "16": "icon-16.png",
  "32": "icon-32.png",
  "48": "icon-48.png",
  "128": "icon.png",
};

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  imports: false,
  manifestVersion: 3,
  publicDir: path.resolve(root, "../../packages/app/assets"),
  manifest: ({ browser }) => ({
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    version,
    default_locale: "zh_CN",
    permissions: ["bookmarks", "storage", "alarms"],
    host_permissions: ["<all_urls>"],
    icons,
    action: { default_icon: icons },
    ...(browser === "firefox" ? {
      browser_specific_settings: {
        gecko: {
          id: "bookmark-syncer@example.com",
          strict_min_version: "140.0",
          data_collection_permissions: { required: ["none"] },
        },
      },
    } : {
      key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAre85rGBne82EDP9Li+fAXbWuOEXVtsRC0J9fI5tKa1H4kQDxBqkC1QhfC4QOyYogCf9LEOICa1nqtVA6KQ078WotRO1lH9XxUT6krTofG3iS78JUX8JPF9PQ4PODLogGcx8H7wk63fa7hMcGJ1aszXCKkiVf2sNioCo0LXNEfwv2yfBiDlB0QFUFKwpT9T2yaB3bP86o6KhiodjpuzQWIBwdu2oyjg7WVDcdmbJb3sc3dcDIi5//uGKoz0aa4fq8AaY1H+3ctNO+BKu/uhPbcwRc8acR1Zw+o00MnDZs5mBO35AfLCQhy5fjZVyhb8zHEkzkGwbxBEhj9krmBNKM8QIDAQAB",
    }),
  }),
  webExt: {
    chromiumProfile: path.join(profileDir, "chromium"),
    firefoxProfile: path.join(profileDir, "firefox"),
    keepProfileChanges: true,
    startUrls: ["about:blank"],
  },
  hooks: {
    "server:started": () => {
      // Browser runners require existing profile directories, especially on Windows.
      fs.mkdirSync(path.join(profileDir, "chromium"), { recursive: true });
      fs.mkdirSync(path.join(profileDir, "firefox"), { recursive: true });
    },
  },
  vite: () => ({
    server: { watch: { usePolling: true, interval: 500 } },
  }),
});
