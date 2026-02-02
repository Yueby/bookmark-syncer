import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Clock, Info, Link2, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { updateScheduledSync } from '../application'
import { smartPush } from '../core/sync'
import { useStorage } from '../hooks/useStorage'
import { getWebDAVClient } from '../infrastructure/http/webdav-client'
import { Button } from './Button'
import { Input } from './Input'
import { Label } from './Label'

type SubPage = 'main' | 'webdav' | 'sync' | 'about'

// 设置项组件
function SettingsItem({ icon: Icon, label, description, onClick }: {
  icon: React.ElementType
  label: string
  description?: string
  onClick: () => void
}) {
  return (
    <div
      className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-medium text-foreground">{label}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-muted-foreground" />
    </div>
  )
}

// 子页面头部
function SubPageHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <button
        onClick={onBack}
        className="w-8 h-8 rounded-lg bg-secondary/50 hover:bg-secondary flex items-center justify-center transition-colors"
      >
        <ChevronLeft className="w-5 h-5 text-foreground" />
      </button>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  )
}

// WebDAV 配置子页面
function WebDAVPage({ onBack }: { onBack: () => void }) {
  const [webdavUrl, setWebdavUrl] = useStorage('webdav_url', '')
  const [username, setUsername] = useStorage('webdav_username', '')
  const [password, setPassword] = useStorage('webdav_password', '')
  const [testing, setTesting] = useState(false)

  const testConnection = async () => {
    setTesting(true)
    try {
      // 保存时自动 trim 去除首尾空格
      const trimmedUrl = webdavUrl.trim();
      const trimmedUsername = username.trim();
      const trimmedPassword = password.trim();
      
      // 检查配置是否变更（用于决定是否需要自动备份）
      const previousUrl = webdavUrl.trim();
      const previousUsername = username.trim();
      const configChanged = 
        (previousUrl && previousUrl !== trimmedUrl) || 
        (previousUsername && previousUsername !== trimmedUsername);
      
      // 测试连接
      const client = getWebDAVClient({ 
        url: trimmedUrl, 
        username: trimmedUsername, 
        password: trimmedPassword 
      })
      await client.testConnection()
      
      // 更新存储的值
      if (trimmedUrl !== webdavUrl) setWebdavUrl(trimmedUrl);
      if (trimmedUsername !== username) setUsername(trimmedUsername);
      if (trimmedPassword !== password) setPassword(trimmedPassword);
      
      // 配置变更且连接成功 → 自动备份
      if (configChanged && previousUrl) { // 确保之前有配置（不是首次设置）
        toast.info('检测到配置变更，正在创建备份...', { duration: 2000 });
        try {
          const result = await smartPush(
            { url: trimmedUrl, username: trimmedUsername, password: trimmedPassword }, 
            'manual'
          );
          
          if (result.success) {
            toast.success('连接成功', { 
              description: '已成功连接到 WebDAV 服务器并创建备份' 
            });
          } else {
            console.warn('[Settings] Auto backup skipped:', result.message);
            toast.success('连接成功', { 
              description: '已成功连接到 WebDAV 服务器' 
            });
          }
        } catch (backupError) {
          console.warn('[Settings] Auto backup failed:', backupError);
          toast.success('连接成功', { 
            description: '已成功连接到 WebDAV 服务器（备份失败）' 
          });
        }
      } else {
        toast.success('连接成功', { description: '已成功连接到 WebDAV 服务器' });
      }
    } catch (e) {
      toast.error('连接失败', { description: (e as Error).message || '未知错误' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SubPageHeader title="WebDAV 配置" onBack={onBack} />
      <div className="space-y-4 pb-4">
        <div className="space-y-2">
          <Label className="text-muted-foreground">服务器地址 (URL)</Label>
          <Input
            placeholder="https://dav.example.com/"
            value={webdavUrl}
            onChange={(e) => setWebdavUrl(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground">用户名</Label>
          <Input
            placeholder="user@example.com"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-muted-foreground">密码</Label>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button onClick={testConnection} disabled={testing} className="w-full mt-4">
          {testing ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 测试中...</>
          ) : (
            '保存并测试连接'
          )}
        </Button>
      </div>
    </div>
  )
}

// 同步设置子页面
function SyncSettingsPage({ onBack }: { onBack: () => void }) {
  const [autoSyncEnabled, setAutoSyncEnabled] = useStorage('auto_sync_enabled', true)
  const [scheduledSyncEnabled, setScheduledSyncEnabled] = useStorage('scheduled_sync_enabled', false)
  const [scheduledSyncInterval, setScheduledSyncInterval] = useStorage('scheduled_sync_interval', 30)
  const [backupFileInterval, setBackupFileInterval] = useStorage('backup_file_interval', 1)

  // 监听定时同步配置变化，立即更新 Alarm
  useEffect(() => {
    const updateAlarm = async () => {
      try {
        await updateScheduledSync();
      } catch (error) {
        console.error('[Settings] Failed to update scheduled sync:', error);
      }
    };
    updateAlarm();
  }, [scheduledSyncEnabled, scheduledSyncInterval])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SubPageHeader title="同步设置" onBack={onBack} />
      <div className="space-y-4 pb-4">
        {/* 自动同步 */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
          <div>
            <Label className="text-foreground">自动同步</Label>
            <p className="text-xs text-muted-foreground">书签变化时自动上传</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* 定时同步 */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
          <div>
            <Label className="text-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" /> 定时同步
            </Label>
            <p className="text-xs text-muted-foreground">定期检查云端更新</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={scheduledSyncEnabled}
              onChange={(e) => setScheduledSyncEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
          </label>
        </div>

        {/* 间隔设置 */}
        {scheduledSyncEnabled && (
          <div className="space-y-2 p-4 rounded-xl bg-secondary/30">
            <Label className="text-muted-foreground">同步间隔（分钟）</Label>
            <Input
              type="number"
              min={1}
              max={1440}
              value={scheduledSyncInterval}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (val >= 1 && val <= 1440) setScheduledSyncInterval(val)
              }}
              placeholder="30"
            />
            <p className="text-xs text-muted-foreground">
              建议 15-60 分钟，最小 1 分钟，最大 1440 分钟
            </p>
          </div>
        )}

        {/* 备份文件间隔 */}
        <div className="space-y-2 p-4 rounded-xl bg-secondary/30">
          <Label className="text-muted-foreground">备份文件间隔（分钟）</Label>
          <select
            value={backupFileInterval}
            onChange={(e) => setBackupFileInterval(parseInt(e.target.value, 10))}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-foreground"
          >
            <option value={1}>1 分钟</option>
            <option value={5}>5 分钟（推荐）</option>
            <option value={10}>10 分钟</option>
            <option value={30}>30 分钟</option>
          </select>
          <p className="text-xs text-muted-foreground">
            在此时间内的修改将覆盖同一个文件，避免产生过多备份
          </p>
        </div>
      </div>
    </div>
  )
}

// 顶部引入 semver
import semver from 'semver'
import browser from 'webextension-polyfill'
// ...

// ...
function AboutPage({ onBack }: { onBack: () => void }) {
  const [checking, setChecking] = useState(false)
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)
  
  // 获取当前版本
  const currentVersion = browser.runtime.getManifest().version 

  const checkUpdate = async () => {
    setChecking(true)
    try {
      const res = await fetch('https://api.github.com/repos/Yueby/bookmark-syncer/releases/latest')
      const data = await res.json()
      // GitHub release tag might be "v1.0.1", semver needs "1.0.1"
      const remoteVersion = data.tag_name?.replace(/^v/, '')
      
      if (remoteVersion && semver.gt(remoteVersion, currentVersion)) {
        setUpdateAvailable(data.tag_name)
        toast.success(`发现新版本 ${data.tag_name}`, {
          description: '点击按钮前往下载',
          action: {
            label: '去下载',
            onClick: () => window.open(data.html_url, '_blank')
          }
        })
      } else {
        toast.info('当前已是最新版本')
      }
    } catch (e) {
      toast.error('检查更新失败', { description: '请检查网络连接' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <SubPageHeader title="关于" onBack={onBack} />
      <div className="space-y-4 pb-4">
        <div className="p-4 rounded-xl bg-secondary/30 text-center">
          <h3 className="text-xl font-bold text-foreground">Bookmark Syncer</h3>
          <p className="text-sm text-muted-foreground mt-1">v{currentVersion}</p>
        </div>
        <div className="p-4 rounded-xl bg-secondary/30">
          <p className="text-sm text-muted-foreground">
            一个隐私优先的跨浏览器书签同步工具，使用 WebDAV 协议，数据完全由你掌控。
          </p>
        </div>
        <div className="p-4 rounded-xl bg-secondary/30">
          <p className="text-xs text-muted-foreground">
            支持 Chrome、Edge、Firefox 等基于 Chromium 和 Firefox 的浏览器。
          </p>
        </div>
        
        {updateAvailable ? (
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={() => window.open(`https://github.com/Yueby/bookmark-syncer/releases/tag/${updateAvailable}`, '_blank')}
          >
            下载新版本 {updateAvailable}
          </Button>
        ) : (
          <Button
            className="w-full"
            onClick={checkUpdate}
            disabled={checking}
          >
            {checking ? (
               <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 检查中...</>
            ) : '检查更新'}
          </Button>
        )}
      </div>
    </div>
  )
}

// 主设置视图
export function SettingsView() {
  const [subPage, setSubPage] = useState<SubPage>('main')

  const slideVariants = {
    enter: (direction: number) => ({ x: direction > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({ x: direction > 0 ? '-100%' : '100%', opacity: 0 }),
  }

  const direction = subPage === 'main' ? -1 : 1

  return (
    <div className="flex flex-col h-full pt-4">
      <AnimatePresence mode="wait" custom={direction}>
        {subPage === 'main' && (
          <motion.div
            key="main"
            custom={-1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1"
          >
            <div className="space-y-3">
              <SettingsItem
                icon={Link2}
                label="WebDAV 配置"
                description="配置服务器连接"
                onClick={() => setSubPage('webdav')}
              />
              <SettingsItem
                icon={RefreshCw}
                label="同步设置"
                description="自动同步、定时同步"
                onClick={() => setSubPage('sync')}
              />
              <SettingsItem
                icon={Info}
                label="关于"
                description="版本信息"
                onClick={() => setSubPage('about')}
              />
            </div>
          </motion.div>
        )}

        {subPage === 'webdav' && (
          <motion.div
            key="webdav"
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden"
          >
            <WebDAVPage onBack={() => setSubPage('main')} />
          </motion.div>
        )}

        {subPage === 'sync' && (
          <motion.div
            key="sync"
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden"
          >
            <SyncSettingsPage onBack={() => setSubPage('main')} />
          </motion.div>
        )}

        {subPage === 'about' && (
          <motion.div
            key="about"
            custom={1}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-1 overflow-hidden"
          >
            <AboutPage onBack={() => setSubPage('main')} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
