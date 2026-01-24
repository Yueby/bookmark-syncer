# 书签同步助手 / Bookmark Syncer

[English](#english) | [简体中文](#简体中文)

---

## 简体中文

一个隐私优先的跨浏览器书签同步工具，基于 WebDAV 协议，数据完全由你掌控。

### 📸 预览

|              深色模式               |               浅色模式               |
| :---------------------------------: | :----------------------------------: |
| ![深色模式](./screenshots/dark.png) | ![浅色模式](./screenshots/light.png) |

### ✨ 特性

- 🔒 **隐私优先** - 使用你自己的 WebDAV 服务器，无第三方数据存储
- 🌐 **跨浏览器** - 支持 Chrome、Edge、Firefox 等主流浏览器
- 🔄 **智能同步** - 增量同步，只传输变化的内容
- 📱 **自动同步** - 书签变化时自动上传
- ⏰ **定时同步** - 定期检查云端更新
- 📦 **本地快照** - 同步前自动备份，支持一键恢复

### 📦 安装

#### Chrome / Edge

1. 下载最新版本的 `chrome-extension.zip`
2. 解压到本地文件夹
3. 打开 `chrome://extensions/`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」
6. 选择解压后的文件夹

#### Firefox

1. 下载最新版本的 `firefox-extension.zip`
2. 打开 `about:debugging#/runtime/this-firefox`
3. 点击「临时载入附加组件」
4. 选择 zip 文件

### ⚙️ 使用方法

1. 点击扩展图标打开面板
2. 进入「设置」→「WebDAV 配置」
3. 填写你的 WebDAV 服务器信息
4. 点击「保存并测试连接」
5. 返回主页点击「同步」按钮

### 🛠️ 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev:chrome   # Chrome 扩展
pnpm dev:firefox  # Firefox 扩展

# 构建
pnpm build
```

---

## English

A privacy-first cross-browser bookmark sync tool using WebDAV protocol. Your data, your control.

### 📸 Preview

|              Dark Mode               |               Light Mode               |
| :----------------------------------: | :------------------------------------: |
| ![Dark Mode](./screenshots/dark.png) | ![Light Mode](./screenshots/light.png) |

### ✨ Features

- 🔒 **Privacy First** - Use your own WebDAV server, no third-party data storage
- 🌐 **Cross-Browser** - Supports Chrome, Edge, Firefox and more
- 🔄 **Smart Sync** - Incremental sync, only transfers changes
- 📱 **Auto Sync** - Automatically uploads when bookmarks change
- ⏰ **Scheduled Sync** - Periodically checks for cloud updates
- 📦 **Local Snapshots** - Auto backup before sync, one-click restore

### 📦 Installation

#### Chrome / Edge

1. Download the latest `chrome-extension.zip`
2. Extract to a local folder
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extracted folder

#### Firefox

1. Download the latest `firefox-extension.zip`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on"
4. Select the zip file

### ⚙️ Usage

1. Click the extension icon to open the panel
2. Go to "Settings" → "WebDAV Configuration"
3. Enter your WebDAV server details
4. Click "Save and Test Connection"
5. Return to home and click "Sync"

### 🛠️ Development

```bash
# Install dependencies
pnpm install

# Development mode
pnpm dev:chrome   # Chrome extension
pnpm dev:firefox  # Firefox extension

# Build
pnpm build
```

### 📄 License

MIT
