import { defineManifest } from "@crxjs/vite-plugin";

// @ts-ignore
import { version } from "../../package.json";

const manifest = defineManifest({
  manifest_version: 3,
  // 名称/描述通过 _locales 本地化（packages/app/assets/_locales/）
  default_locale: "zh_CN",
  name: "__MSG_extName__",
  version: version,
  description: "__MSG_extDescription__",
  key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAre85rGBne82EDP9Li+fAXbWuOEXVtsRC0J9fI5tKa1H4kQDxBqkC1QhfC4QOyYogCf9LEOICa1nqtVA6KQ078WotRO1lH9XxUT6krTofG3iS78JUX8JPF9PQ4PODLogGcx8H7wk63fa7hMcGJ1aszXCKkiVf2sNioCo0LXNEfwv2yfBiDlB0QFUFKwpT9T2yaB3bP86o6KhiodjpuzQWIBwdu2oyjg7WVDcdmbJb3sc3dcDIi5//uGKoz0aa4fq8AaY1H+3ctNO+BKu/uhPbcwRc8acR1Zw+o00MnDZs5mBO35AfLCQhy5fjZVyhb8zHEkzkGwbxBEhj9krmBNKM8QIDAQAB",
  action: {
    default_popup: "index.html",
    default_icon: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon.png",
    },
  },
  permissions: ["bookmarks", "storage", "alarms"],
  host_permissions: ["<all_urls>"],
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  icons: {
    "16": "icon-16.png",
    "32": "icon-32.png",
    "48": "icon-48.png",
    "128": "icon.png",
  },
});

export default manifest;
