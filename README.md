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

1. 下载最新版本的 `chrome-extension.zip`
2. 解压到本地文件夹
3. 打开 `chrome://extensions/`
4. 开启「开发者模式」
5. 点击「加载已解压的扩展程序」
6. 选择解压后的文件夹

#### Firefox

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

### 🛠️ 开发与构建

```bash
# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev:chrome   # Chrome 扩展开发
pnpm dev:firefox  # Firefox 扩展开发

# 构建生产版本
pnpm build

# 打包分发（自动签名 Firefox，打包 Chrome）
pnpm package
```

### 📦 分发扩展

#### 方式 1：GitHub Actions 自动化（推荐）

配置 GitHub Secrets 后，每次发布自动构建和签名。

**一次性配置：**

1. 访问 [AMO API Key](https://addons.mozilla.org/developers/addon/api/key/) 获取 Firefox 签名凭证
2. 在 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
3. 添加两个 Secret：

| Secret 名称 | 值（示例） | 说明 |
|------------|-----------|------|
| `FIREFOX_WEB_EXT_API_KEY` | `user:12345678:123` | AMO 的 JWT 签发者 |
| `FIREFOX_WEB_EXT_API_SECRET` | `abc123def456...` | AMO 的 JWT 私钥（很长） |

> 💡 **扩展性提示**：将来如需添加 Chrome Web Store 自动发布，可添加 `CHROME_*` 开头的 Secrets

**发布流程：**

```bash
# 1. 更新版本号
# 编辑 package.json 中的 version

# 2. 提交并推送
git add .
git commit -m "chore: bump version to 1.0.5"
git push

# 3. 在 GitHub 创建 Release
# 访问仓库 → Releases → Draft a new release
# 输入 tag: v1.0.5，点击 Publish release

# 🤖 GitHub Actions 会自动：
# - 构建 Chrome 扩展
# - 签名 Firefox 扩展
# - 上传到 Release
```

#### 方式 2：本地手动打包

如果不想用 GitHub Actions，可以本地打包。

**一次性配置（Firefox 签名）：**

1. 访问 [AMO API Key](https://addons.mozilla.org/developers/addon/api/key/)
2. 点击"生成新的凭据"，获取凭证
3. 配置环境变量：

```powershell
# Windows PowerShell
$env:WEB_EXT_API_KEY = "user:12345678:123"           # JWT 签发者
$env:WEB_EXT_API_SECRET = "abc123def456ghi789..."   # JWT 私钥
```

```bash
# Linux/Mac
export WEB_EXT_API_KEY="user:12345678:123"
export WEB_EXT_API_SECRET="abc123def456ghi789..."
```

#### 打包命令

```bash
# 一键打包两个平台
pnpm package

# 或单独打包
pnpm package:chrome  # Chrome zip
pnpm sign:firefox    # Firefox 已签名 xpi
```

**输出：**
- Chrome: `apps/chrome-extension/chrome-extension.zip`
- Firefox: `apps/firefox-extension/*.xpi`（已签名，可直接安装）

### 📥 安装方式

**Firefox（推荐）：**
- 拖拽 `.xpi` 文件到 Firefox 窗口即可安装

**Chrome：**
1. 解压 `chrome-extension.zip`
2. 访问 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择解压后的目录

### 📄 许可证

[GNU AGPLv3](./LICENSE) - 开源协议
