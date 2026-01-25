<p align="center">
  <img src="./packages/app/assets/icon.png" alt="Logo" width="80" height="80">
</p>

<h1 align="center">书签同步助手</h1>

<p align="center">
  跨浏览器书签同步工具，基于 WebDAV 协议的自托管方案。
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

### 📄 许可证

[GNU AGPLv3](./LICENSE) - 开源协议
