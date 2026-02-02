// 主入口
export { App } from "./App";

// 组件
export { Drawer } from "./components/Drawer";
export { LayoutWrapper } from "./components/LayoutWrapper";
export { SettingsView } from "./components/SettingsView";
export { StatsCard } from "./components/StatsCard";
export { SyncView } from "./components/SyncView";
export { TabNav } from "./components/TabNav";

// UI 基础组件
export { Badge, badgeVariants } from "./components/Badge";
export { Button, buttonVariants } from "./components/Button";
export {
    Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle
} from "./components/Card";
export { Input } from "./components/Input";
export { Label } from "./components/Label";

// Hooks
export { useStorage } from "./hooks/useStorage";
export { useTheme } from "./hooks/useTheme";

// Services
export { SnapshotManager, snapshotManager } from "./core/backup";
export type { Snapshot } from "./core/backup";
export { getWebDAVClient, WebDAVClient, createWebDAVClient } from "./infrastructure/http/webdav-client";
export type { IWebDAVClient } from "./infrastructure/http/webdav-client";
// 导出 Bookmark 领域（推荐使用）
export { bookmarkRepository } from "./core/bookmark";

// Utils
export { cn } from "./infrastructure/utils/format";

// Types
export * from "./types";
