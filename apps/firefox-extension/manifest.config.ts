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
    scripts: ["src/background.ts"],
    type: "module",
  },
  icons: {
    "16": "icon-16.png",
    "32": "icon-32.png",
    "48": "icon-48.png",
    "128": "icon.png",
  },
});

// Firefox 特定配置 - 手动添加到最终 manifest
// @ts-expect-error Firefox-specific property not in Chrome types
manifest.browser_specific_settings = {
  gecko: {
    id: "bookmark-syncer@example.com",
    strict_min_version: "140.0", // Firefox 140+ 支持 data_collection_permissions
    data_collection_permissions: {
      required: ["none"], // 声明不收集任何数据
    },
  },
};

export default manifest;
