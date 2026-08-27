/**
 * 中文（默认）词典
 * key 命名：<页面>.<区块>.<文案>
 */
export const dictionary: Record<string, string> = {
  // ─── 通用 ───
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.loading": "加载中...",
  "common.restore": "恢复",
  "common.unknownError": "未知错误",
  "errorBoundary.title": "出现了意外错误",
  "errorBoundary.retry": "重试",

  // ─── TabNav / 主题 ───
  "tab.sync": "同步",
  "tab.settings": "设置",
  "theme.dark": "暗色",
  "theme.light": "亮色",
  "theme.system": "跟随系统",
  "theme.current": "当前: {theme}",

  // ─── 同步主视图 ───
  "sync.offlineBanner": "网络断开，同步暂停",
  "sync.stats.local": "本地书签",
  "sync.stats.cloud": "云端备份",
  "sync.stats.notConfigured": "点击上方 \"设置\" 配置 WebDAV 服务",
  "sync.needConfigFirst": "请先配置连接",
  "sync.syncButton.offline": "离线",
  "sync.syncButton.analyzing": "分析中",
  "sync.syncButton.syncing": "同步中",
  "sync.syncButton.done": "已完成",
  "sync.syncButton.syncNow": "立即同步",
  "sync.syncButton.moreOptions": "更多同步选项",
  "sync.cloudUpdatedAt": "云端更新于 {time}",
  "sync.viewSnapshots": "查看本地快照",
  "sync.status.analyzing": "正在分析...",
  "sync.status.uploading": "正在上传...",
  "sync.status.restoring": "正在恢复...",
  "sync.status.merging": "正在合并...",
  "sync.status.restoreFromCloud": "正在从云端恢复...",
  "sync.status.restoreSnapshot": "正在恢复快照...",

  // ─── Toast ───
  "sync.toast.backgroundHint": "操作在后台进行，关闭面板后仍会继续完成",
  "sync.toast.restoreSuccess": "恢复成功",
  "sync.toast.restoredBookmarks": "已恢复书签",
  "sync.toast.restoredMergedBookmarks": "已恢复并合并书签",
  "sync.toast.restoredFromCloud": "已从云端恢复书签",
  "sync.toast.restoreFailed": "恢复失败",
  "sync.toast.syncInProgress": "同步正在进行中，请稍后重试",
  "sync.toast.loadCloudInfoFailed": "加载云端信息失败",
  "sync.toast.checkNetworkAndConfig": "请检查网络连接和 WebDAV 配置",
  "sync.toast.loadCloudListFailed": "加载云端备份列表失败",
  "sync.toast.snapshotDeleted": "快照已删除",
  "sync.toast.snapshotRestoreSuccess": "快照恢复成功",
  "sync.toast.forceNewBackupTitle": "已清除时间窗口",
  "sync.toast.forceNewBackupDesc": "下次同步将创建新备份文件",
  "sync.toast.opFailed": "操作失败",
  "sync.connectionFailed": "连接失败",
  "sync.uploadFailed": "上传失败",

  // ─── Drawer 标题 ───
  "sync.drawer.title.conflict": "同步选项",
  "sync.drawer.title.history": "本地快照",
  "sync.drawer.title.cloudBackups": "云端备份",
  "sync.drawer.title.actions": "更多同步操作",

  // ─── 更多操作 ───
  "sync.actions.viewCloudBackups": "查看云端备份",
  "sync.actions.viewCloudBackupsDesc": "查看历史云端备份并恢复到本地",
  "sync.actions.overwriteCloud": "以本地覆盖云端…",
  "sync.actions.overwriteCloudEmpty": "本地书签为空，无法上传",
  "sync.actions.overwriteCloudDesc": "使用当前本地书签覆盖云端最新备份",

  // ─── 云端备份列表 ───
  "sync.cloudBackups.pick": "选择一个云端备份恢复到本地（会自动创建本地快照）：",
  "sync.cloudBackups.empty": "暂无云端备份",
  "sync.cloudBackups.bookmarks": "{count} 书签",
  "sync.cloudBackups.browserWithCount": "{browser} · {count} 书签",

  // ─── 本地快照列表 ───
  "sync.history.pick": "操作前会自动创建快照，点击可恢复到历史状态：",
  "sync.history.autoBackup": "自动备份",
  "sync.history.empty": "暂无快照",
  "sync.history.bookmarks": "{count} 书签",

  // ─── 冲突解决 ───
  "sync.conflict.title": "请选择同步方向",
  "sync.conflict.cloudHas": "云端有 {count} 个书签",
  "sync.conflict.updatedAt": "，更新于 {time}。",
  "sync.conflict.unknownTime": "未知时间",
  "sync.conflict.localHas": "本地有 {count} 个书签。",
  "sync.conflict.restoreLocal": "恢复到本地",
  "sync.conflict.restoreLocalDesc": "将创建本地自动快照",
  "sync.conflict.uploadCloud": "上传到云端",
  "sync.conflict.uploadCloudDesc": "覆盖云端版本",
  "sync.conflict.uploadForbidden": "禁止上传",
  "sync.conflict.uploadForbiddenDesc": "本地书签为空",
  "sync.conflict.forceNewBackup": "强制新备份",

  // ─── 覆盖云端确认 ───
  "sync.confirmPush.title": "确认覆盖云端数据？",
  "sync.confirmPush.heading": "此操作会覆盖云端最新备份",
  "sync.confirmPush.body1": "将使用当前本地书签覆盖云端最新备份。",
  "sync.confirmPush.body2": "如果其他设备上有未同步的新书签，它们可能会被覆盖。",
  "sync.confirmPush.confirm": "确认覆盖云端",

  // ─── 恢复确认 ───
  "sync.confirmRestore.title": "确认恢复",
  "sync.confirmRestore.snapshotTitle": "确定要恢复此本地快照吗？",
  "sync.confirmRestore.cloudTitle": "确定要从云端恢复此备份吗？",
  "sync.confirmRestore.snapshotBody1": "将恢复到 {time} 的状态",
  "sync.confirmRestore.snapshotBody2": "（{count} 个书签）",
  "sync.confirmRestore.overwriteAll": "这将覆盖当前所有书签。",
  "sync.confirmRestore.cloudBody1": "将恢复到 {time} 的云端备份",
  "sync.confirmRestore.cloudBody3": "来自 {browser}",
  "sync.confirmRestore.cloudBody4": "这将覆盖当前所有书签，并会自动创建本地快照。",
  "sync.confirmRestore.confirm": "确认恢复",
  "sync.confirmRestore.snapshotBackupReason": "本地快照恢复前自动备份",

  // ─── 设置主页 ───
  "settings.item.webdav.label": "WebDAV 配置",
  "settings.item.webdav.desc": "配置服务器连接",
  "settings.item.sync.label": "同步设置",
  "settings.item.sync.desc": "自动同步、定时同步",
  "settings.item.general.label": "通用设置",
  "settings.item.general.desc": "语言等偏好",
  "settings.item.about.label": "关于",
  "settings.item.about.desc": "版本信息",

  // ─── 通用/语言设置 ───
  "settings.general.title": "通用设置",
  "settings.general.language": "语言",
  "settings.general.languageDesc": "界面显示语言",
  "settings.general.language.auto": "跟随浏览器",
  "settings.general.currentLocale": "当前语言",
  "settings.general.language.zh-CN": "简体中文",
  "settings.general.language.en": "English",

  // ─── WebDAV 配置页 ───
  "settings.webdav.title": "WebDAV 配置",
  "settings.webdav.serverUrl": "服务器地址 (URL)",
  "settings.webdav.username": "用户名",
  "settings.webdav.password": "密码",
  "settings.webdav.testBtn": "保存并测试连接",
  "settings.webdav.testing": "测试中...",
  "settings.webdav.urlInvalid": "URL 格式无效",
  "settings.webdav.urlInvalidDesc": "请输入以 http:// 或 https:// 开头的地址",
  "settings.webdav.connectFailed": "连接失败",
  "settings.webdav.connected": "连接成功",
  "settings.webdav.connectedDesc": "已成功连接到 WebDAV 服务器",
  "settings.webdav.connectedBackupDesc": "已成功连接到 WebDAV 服务器并创建备份",
  "settings.webdav.connectedNoBackupDesc": "已成功连接到 WebDAV 服务器（备份失败）",
  "settings.webdav.configChanged": "检测到配置变更，正在创建备份...",

  // ─── 同步设置页 ───
  "settings.sync.title": "同步设置",
  "settings.sync.autoSync": "自动同步",
  "settings.sync.autoSyncDesc": "书签变化时自动上传",
  "settings.sync.scheduled": "定时同步",
  "settings.sync.scheduledDesc": "定期检查云端更新",
  "settings.sync.interval": "同步间隔（分钟）",
  "settings.sync.intervalHint": "建议 15-60 分钟，最小 1 分钟，最大 1440 分钟",
  "settings.sync.backupInterval": "备份文件间隔（分钟）",
  "settings.sync.minute1": "1 分钟",
  "settings.sync.minute5": "5 分钟（推荐）",
  "settings.sync.minute10": "10 分钟",
  "settings.sync.minute30": "30 分钟",
  "settings.sync.backupIntervalHint": "在此时间内的修改将覆盖同一个文件，避免产生过多备份",

  // ─── 关于页 ───
  "settings.about.title": "关于",
  "settings.about.desc": "一个隐私优先的跨浏览器书签同步工具，使用 WebDAV 协议，数据完全由你掌控。",
  "settings.about.support": "支持 Chrome、Edge、Firefox 等基于 Chromium 和 Firefox 的浏览器。",
  "settings.about.checkUpdate": "检查更新",
  "settings.about.checking": "检查中...",
  "settings.about.upToDate": "当前已是最新版本",
  "settings.about.newVersion": "发现新版本 {version}",
  "settings.about.download": "去下载",
  "settings.about.downloadNew": "下载新版本 {version}",
  "settings.about.checkFailed": "检查更新失败",
  "settings.about.checkFailedDesc": "请检查网络连接",
};
