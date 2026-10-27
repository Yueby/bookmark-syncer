<p align="center">
  <img src="./packages/app/assets/icon.png" alt="Logo" width="80" height="80">
</p>

<h1 align="center">书签同步助手</h1>

<p align="center">
  跨浏览器书签同步工具，基于 WebDAV 协议的自托管方案。
</p>

<p align="center">
  <a href="https://github.com/Yueby/bookmark-syncer/releases/latest">
    <img src="https://img.shields.io/github/downloads/Yueby/bookmark-syncer/total?style=flat-square&logo=github" alt="Downloads">
  </a>
  <a href="https://github.com/Yueby/bookmark-syncer/releases/latest">
    <img src="https://img.shields.io/github/v/release/Yueby/bookmark-syncer?style=flat-square&logo=github" alt="Release">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/github/license/Yueby/bookmark-syncer?style=flat-square" alt="License">
  </a>
</p>

<p align="center">
  <a href="./README_en.md">English</a>
</p>

---

### 📸 预览

|              深色模式               |               浅色模式               |
| :---------------------------------: | :----------------------------------: |
| ![深色模式](./screenshots/dark.png) | ![浅色模式](./screenshots/light.png) |

### ✨ 特性

- 🔒 **自托管数据** - 使用你自己的 WebDAV 服务器存储书签
- 🌐 **跨浏览器** - 支持 Chrome、Edge、Firefox 等主流浏览器
- 🔄 **智能同步** - 增量同步，只传输变化的内容
- 📱 **自动同步** - 书签变化时自动上传
- ⏰ **定时同步** - 定期检查云端更新
- 📦 **本地快照** - 同步前自动备份，支持一键恢复

### 📦 安装

#### Chrome / Edge

**扩展 ID：** `fpccfkjndkjiljfj`（固定，更新时不会变化）

1. 下载最新版本的 `chrome-extension.zip`
2. 解压到本地文件夹
3. 打开 `chrome://extensions/`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」
6. 选择解压后的文件夹

**更新扩展：**
- 下载新版本 zip，解压到**相同文件夹**（覆盖旧文件）
- 在 `chrome://extensions/` 点击扩展卡片的「刷新」按钮
- 扩展 ID 和所有数据都会保留

#### Firefox

**最低版本要求：Firefox 140+**

1. 下载最新版本的 `bookmark-syncer-firefox-vX.X.X.xpi`（已签名）
2. 拖拽 `.xpi` 文件到 Firefox 窗口
3. 点击「添加」按钮确认安装

**或手动安装：**
1. 打开 `about:addons`
2. 点击右上角齿轮图标 ⚙️
3. 选择「从文件安装附加组件」
4. 选择 `.xpi` 文件

### ⚙️ 使用方法

1. 点击扩展图标打开面板
2. 进入「设置」→「WebDAV 配置」
3. 填写你的 WebDAV 服务器信息
4. 点击「保存并测试连接」
5. 返回主页点击「同步」按钮

#### 可读 HTML 书签副本

在「设置 → 同步设置」开启「同步可读 HTML 副本」（默认关闭），再执行一次同步，即可在 WebDAV 的 `BookmarkSyncer/bookmark.html` 获取可折叠、适配手机的书签网页。即使书签内容没有变化，同步也会检查并补建或刷新副本；内容相同时不重复上传 HTML。

- 可下载后在浏览器中打开；能否通过服务器 URL 直接浏览，取决于 WebDAV 服务的认证和文件展示策略。
- HTML 是只读浏览副本，不替代压缩备份，也不用于浏览器书签导入或双向同步。
- 开关按设备保存，需要更新副本的设备应分别开启。覆盖拉取完成后也会刷新副本；合并拉取后的新增本地内容需上传后才会发布。
- 主备份与 HTML 分别处理：副本失败会提示，并在后续同步时重试，不影响已完成的备份或恢复。
- 多设备并发时副本可能暂时落后；并发结束后，后续启用设备与云端内容一致的同步可修复副本。没有后续同步时，不保证副本始终最新。
- HTML 包含明文书签标题和网址，沿用所在 WebDAV 目录的访问权限。关闭开关仅停止本设备更新，不删除服务器上的已有副本，其他已开启设备仍可更新。

### 🛠️ 开发与构建

使用 Node.js 22.12+ 和 pnpm 10.26.2。扩展入口与 WXT 配置统一位于 `apps/extension`，业务代码位于 `packages/app`。

```bash
# 安装依赖
pnpm install

# 开发模式：自动打开已加载扩展的独立测试浏览器，支持热重载
pnpm dev         # Chrome（等同于 pnpm dev:chrome）
pnpm dev:firefox # Firefox

# 类型检查与单元测试
pnpm typecheck
pnpm test

# 构建 Chrome 和 Firefox 的生产版本
pnpm build

# 打包分发（自动签名 Firefox，打包 Chrome）
pnpm package
```

测试浏览器使用 `apps/extension/.dev-profiles/` 下的独立 profile，重启 dev 后保留书签、扩展配置与登录状态，不使用日常浏览器的数据。需安装对应浏览器；启动后从工具栏扩展菜单打开「书签同步助手」。首次测试请添加测试书签并配置测试 WebDAV，覆盖拉取只作用于测试浏览器。

开发产物位于 `apps/extension/.output/chrome-mv3-dev` 和 `firefox-mv3-dev`；生产产物位于同目录的 `chrome-mv3` 和 `firefox-mv3`。Chrome 打包文件为 `apps/extension/.output/chrome-extension.zip`；Firefox 签名仍使用环境变量 `WEB_EXT_API_KEY`、`WEB_EXT_API_SECRET`，签名产物输出到 `.output`。profile 与生成目录均不提交 Git。

### 🤝 贡献者

感谢所有为项目贡献代码、反馈和建议的朋友。

- [@Ancientwood](https://github.com/Ancientwood) — 贡献可读 HTML 书签副本功能（[#14](https://github.com/Yueby/bookmark-syncer/pull/14)）。

### 📄 许可证

[GNU AGPLv3](./LICENSE) - 开源协议
