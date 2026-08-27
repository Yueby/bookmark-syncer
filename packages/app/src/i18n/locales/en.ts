/**
 * English dictionary
 * Keys must stay in sync with zh-CN.ts
 */
export const dictionary: Record<string, string> = {
  // ─── Common ───
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.restore": "Restore",
  "common.unknownError": "Unknown error",
  "errorBoundary.title": "An unexpected error occurred",
  "errorBoundary.retry": "Retry",

  // ─── TabNav / theme ───
  "tab.sync": "Sync",
  "tab.settings": "Settings",
  "theme.dark": "Dark",
  "theme.light": "Light",
  "theme.system": "System",
  "theme.current": "Current: {theme}",

  // ─── Sync main view ───
  "sync.offlineBanner": "Offline, sync paused",
  "sync.stats.local": "Local bookmarks",
  "sync.stats.cloud": "Cloud backup",
  "sync.stats.notConfigured": "Open \"Settings\" above to configure your WebDAV service",
  "sync.needConfigFirst": "Configure a connection first",
  "sync.syncButton.offline": "Offline",
  "sync.syncButton.analyzing": "Analyzing",
  "sync.syncButton.syncing": "Syncing",
  "sync.syncButton.done": "Done",
  "sync.syncButton.syncNow": "Sync now",
  "sync.syncButton.moreOptions": "More sync options",
  "sync.cloudUpdatedAt": "Cloud updated at {time}",
  "sync.viewSnapshots": "View local snapshots",
  "sync.status.analyzing": "Analyzing...",
  "sync.status.uploading": "Uploading...",
  "sync.status.restoring": "Restoring...",
  "sync.status.merging": "Merging...",
  "sync.status.restoreFromCloud": "Restoring from cloud...",
  "sync.status.restoreSnapshot": "Restoring snapshot...",

  // ─── Toasts ───
  "sync.toast.backgroundHint": "Running in the background — safe to close this panel",
  "sync.toast.restoreSuccess": "Restore succeeded",
  "sync.toast.restoredBookmarks": "Bookmarks restored",
  "sync.toast.restoredMergedBookmarks": "Bookmarks restored and merged",
  "sync.toast.restoredFromCloud": "Bookmarks restored from cloud",
  "sync.toast.restoreFailed": "Restore failed",
  "sync.toast.syncInProgress": "Sync in progress, please try again later",
  "sync.toast.loadCloudInfoFailed": "Failed to load cloud info",
  "sync.toast.checkNetworkAndConfig": "Check your network connection and WebDAV settings",
  "sync.toast.loadCloudListFailed": "Failed to load cloud backups",
  "sync.toast.snapshotDeleted": "Snapshot deleted",
  "sync.toast.snapshotRestoreSuccess": "Snapshot restored",
  "sync.toast.forceNewBackupTitle": "Time window cleared",
  "sync.toast.forceNewBackupDesc": "The next sync will create a new backup file",
  "sync.toast.opFailed": "Operation failed",
  "sync.connectionFailed": "Connection failed",
  "sync.uploadFailed": "Upload failed",

  // ─── Drawer titles ───
  "sync.drawer.title.conflict": "Sync options",
  "sync.drawer.title.history": "Local snapshots",
  "sync.drawer.title.cloudBackups": "Cloud backups",
  "sync.drawer.title.actions": "More sync options",

  // ─── More actions ───
  "sync.actions.viewCloudBackups": "View cloud backups",
  "sync.actions.viewCloudBackupsDesc": "Browse historical cloud backups and restore",
  "sync.actions.overwriteCloud": "Overwrite cloud with local…",
  "sync.actions.overwriteCloudEmpty": "Local bookmarks are empty, cannot upload",
  "sync.actions.overwriteCloudDesc": "Overwrite the latest cloud backup with local bookmarks",

  // ─── Cloud backup list ───
  "sync.cloudBackups.pick": "Pick a cloud backup to restore (a local snapshot is created automatically):",
  "sync.cloudBackups.empty": "No cloud backups",
  "sync.cloudBackups.bookmarks": "{count} bookmarks",
  "sync.cloudBackups.browserWithCount": "{browser} · {count} bookmarks",

  // ─── Local snapshot list ───
  "sync.history.pick": "A snapshot is created before each operation — click to restore:",
  "sync.history.autoBackup": "Automatic backup",
  "sync.history.empty": "No snapshots",
  "sync.history.bookmarks": "{count} bookmarks",

  // ─── Conflict resolution ───
  "sync.conflict.title": "Choose sync direction",
  "sync.conflict.cloudHas": "Cloud has {count} bookmarks",
  "sync.conflict.updatedAt": ", updated at {time}.",
  "sync.conflict.unknownTime": "unknown time",
  "sync.conflict.localHas": "Local has {count} bookmarks.",
  "sync.conflict.restoreLocal": "Restore to local",
  "sync.conflict.restoreLocalDesc": "A local snapshot will be created",
  "sync.conflict.uploadCloud": "Upload to cloud",
  "sync.conflict.uploadCloudDesc": "Overwrites the cloud copy",
  "sync.conflict.uploadForbidden": "Upload unavailable",
  "sync.conflict.uploadForbiddenDesc": "No local bookmarks",
  "sync.conflict.forceNewBackup": "Force new backup",

  // ─── Overwrite confirmation ───
  "sync.confirmPush.title": "Overwrite cloud data?",
  "sync.confirmPush.heading": "This will overwrite the latest cloud backup",
  "sync.confirmPush.body1": "The latest cloud backup will be replaced with your local bookmarks.",
  "sync.confirmPush.body2": "Unsynced bookmarks on other devices may be lost.",
  "sync.confirmPush.confirm": "Overwrite cloud",

  // ─── Restore confirmation ───
  "sync.confirmRestore.title": "Confirm restore",
  "sync.confirmRestore.snapshotTitle": "Restore this local snapshot?",
  "sync.confirmRestore.cloudTitle": "Restore this cloud backup?",
  "sync.confirmRestore.snapshotBody1": "Restores to the state of {time}",
  "sync.confirmRestore.snapshotBody2": "({count} bookmarks)",
  "sync.confirmRestore.overwriteAll": "This will replace all current bookmarks.",
  "sync.confirmRestore.cloudBody1": "Restores the cloud backup of {time}",
  "sync.confirmRestore.cloudBody3": "from {browser}",
  "sync.confirmRestore.cloudBody4": "This will replace all current bookmarks; a local snapshot is created automatically.",
  "sync.confirmRestore.confirm": "Restore",
  "sync.confirmRestore.snapshotBackupReason": "Automatic backup before snapshot restore",

  // ─── Settings main ───
  "settings.item.webdav.label": "WebDAV settings",
  "settings.item.webdav.desc": "Configure server connection",
  "settings.item.sync.label": "Sync settings",
  "settings.item.sync.desc": "Auto sync, scheduled sync",
  "settings.item.general.label": "General",
  "settings.item.general.desc": "Language and preferences",
  "settings.item.about.label": "About",
  "settings.item.about.desc": "Version info",

  // ─── General / language ───
  "settings.general.title": "General",
  "settings.general.language": "Language",
  "settings.general.languageDesc": "Interface display language",
  "settings.general.language.auto": "Follow browser",
  "settings.general.currentLocale": "Current",
  "settings.general.language.zh-CN": "简体中文",
  "settings.general.language.en": "English",

  // ─── WebDAV page ───
  "settings.webdav.title": "WebDAV settings",
  "settings.webdav.serverUrl": "Server URL",
  "settings.webdav.username": "Username",
  "settings.webdav.password": "Password",
  "settings.webdav.testBtn": "Save and test connection",
  "settings.webdav.testing": "Testing...",
  "settings.webdav.urlInvalid": "Invalid URL",
  "settings.webdav.urlInvalidDesc": "Enter an address starting with http:// or https://",
  "settings.webdav.connectFailed": "Connection failed",
  "settings.webdav.connected": "Connected",
  "settings.webdav.connectedDesc": "Successfully connected to the WebDAV server",
  "settings.webdav.connectedBackupDesc": "Connected to the WebDAV server and created a backup",
  "settings.webdav.connectedNoBackupDesc": "Connected to the WebDAV server (backup failed)",
  "settings.webdav.configChanged": "Configuration changed, creating backup...",

  // ─── Sync settings page ───
  "settings.sync.title": "Sync settings",
  "settings.sync.autoSync": "Auto sync",
  "settings.sync.autoSyncDesc": "Upload automatically on bookmark changes",
  "settings.sync.scheduled": "Scheduled sync",
  "settings.sync.scheduledDesc": "Check for cloud updates periodically",
  "settings.sync.interval": "Sync interval (minutes)",
  "settings.sync.intervalHint": "Recommended 15–60 min, min 1, max 1440",
  "settings.sync.backupInterval": "Backup file interval (minutes)",
  "settings.sync.minute1": "1 minute",
  "settings.sync.minute5": "5 minutes (recommended)",
  "settings.sync.minute10": "10 minutes",
  "settings.sync.minute30": "30 minutes",
  "settings.sync.backupIntervalHint": "Changes within this window overwrite the same file to avoid excess backups",

  // ─── About page ───
  "settings.about.title": "About",
  "settings.about.desc": "A privacy-first cross-browser bookmark sync tool using WebDAV — your data stays under your control.",
  "settings.about.support": "Supports Chrome, Edge, Firefox and other Chromium/Firefox-based browsers.",
  "settings.about.checkUpdate": "Check for updates",
  "settings.about.checking": "Checking...",
  "settings.about.upToDate": "You are on the latest version",
  "settings.about.newVersion": "New version {version} available",
  "settings.about.download": "Download",
  "settings.about.downloadNew": "Download {version}",
  "settings.about.checkFailed": "Update check failed",
  "settings.about.checkFailedDesc": "Check your network connection",
};
