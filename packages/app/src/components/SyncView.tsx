import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

import { motion } from 'framer-motion'
import { AlertTriangle, Cloud, Download, FilePlus, History, MoreHorizontal, RefreshCw, RotateCcw, ShieldCheck, Trash2, WifiOff } from 'lucide-react'
import { clearLastBackupFileInfo, holdRestoringUntil, setIsRestoring } from '../application/state-manager'
import { resetScheduledSync } from '../application'
import {
  restoreCloudBackupInBackground,
  smartPullInBackground,
  smartPushInBackground,
  smartSyncInBackground,
} from '../application/background-ops'
import { snapshotManager, type Snapshot } from '../core/backup'
import { bookmarkRepository, countBookmarks } from '../core/bookmark'
import { getCloudBackupList, getCloudInfo, type CloudBackupFile } from '../core/sync'
import { useI18n } from '../i18n'
import { translateSyncMessage } from '../i18n/sync-messages'
import { useStorage } from '../hooks/useStorage'
import { cn } from '../infrastructure/utils/format'
import { Button } from './Button'
import { Drawer } from './Drawer'
import { StatsCard } from './StatsCard'

import { toast } from 'sonner'

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { y: 20, opacity: 0 },
  show: { y: 0, opacity: 1 }
}

export function SyncView() {
  const { t, locale } = useI18n()
  const [webdavUrl] = useStorage('webdav_url', '')
  const [username] = useStorage('webdav_username', '')
  const [password] = useStorage('webdav_password', '')
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [syncState] = useStorage<{ time: number; url: string; type: string } | null>('syncState', null)
  const isOnline = useOnlineStatus()
  
  const [localCount, setLocalCount] = useState(0)
  const [cloudCount, setCloudCount] = useState(0)
  const [cloudMeta, setCloudMeta] = useState<{ time: number, device: string, count: number, browser?: string } | null>(null)

  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'syncing' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'conflict' | 'history' | 'cloudBackups' | 'actions'>('conflict')
  const [confirmDrawerOpen, setConfirmDrawerOpen] = useState(false)
  const [confirmPushOpen, setConfirmPushOpen] = useState(false)
  const [pendingRestoreSnapshot, setPendingRestoreSnapshot] = useState<Snapshot | null>(null)
  const [cloudBackups, setCloudBackups] = useState<CloudBackupFile[]>([])
  const [loadingCloudBackups, setLoadingCloudBackups] = useState(false)
  const [pendingRestoreCloudBackup, setPendingRestoreCloudBackup] = useState<CloudBackupFile | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 安全设置消息清除定时器
  const scheduleMsgClear = useCallback((delayMs = 3000) => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current)
    msgTimerRef.current = setTimeout(() => { setMsg(''); msgTimerRef.current = null }, delayMs)
  }, [])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => { if (msgTimerRef.current) clearTimeout(msgTimerRef.current) }
  }, [])

  const isConfigured = !!webdavUrl

  const loadCounts = async (signal?: { aborted: boolean }) => {
    try {
      const count = await bookmarkRepository.getLocalCount()
      if (signal?.aborted) return
      setLocalCount(count)
      
      if (isConfigured) {
        setLoading(true) 
        try {
            // 使用 getCloudInfo 获取最新备份信息
            // 注意：由于可能有多设备同步，这里需要实时获取最新数据
            const cloudInfo = await getCloudInfo(getSyncConfig(), true)
            if (signal?.aborted) return
            
            if (cloudInfo.exists && cloudInfo.totalCount !== undefined) {
                setCloudCount(cloudInfo.totalCount)
                setCloudMeta({ 
                  time: cloudInfo.timestamp || 0, 
                  device: cloudInfo.browser || '', 
                  count: cloudInfo.totalCount,
                  browser: cloudInfo.browser 
                })
            } else {
                setCloudCount(0)
                setCloudMeta(null)
            }
        } catch (e) {
            if (signal?.aborted) return
            console.error('[SyncView] Failed to load cloud info:', e)
            toast.error(t('sync.toast.loadCloudInfoFailed'), {
              description: (e as Error).message || t('sync.toast.checkNetworkAndConfig')
            })
            setCloudCount(0)
            setCloudMeta(null)
        } finally {
            if (!signal?.aborted) setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch (e) { 
      if (signal?.aborted) return
      console.error('Failed to load counts:', e)
      setLoading(false) 
    }
  }

  // 注意：WebDAV 用户名/密码是异步从 storage 读取的。
  // 如果这里只依赖 webdavUrl，会出现「URL 先加载 → 立刻发请求但账号/密码还是空」的情况，导致首次 401。
  useEffect(() => {
    const signal = { aborted: false }
    loadCounts(signal); loadSnapshots()
    return () => { signal.aborted = true }
  }, [webdavUrl, username, password, syncState?.time])

  // 加载本地快照列表
  const loadSnapshots = async () => {
    try {
      const list = await snapshotManager.getAllSnapshots()
      setSnapshots(list)
    } catch (error) {
      console.error('[SyncView] Failed to load snapshots:', error)
      // 快照加载失败不影响主要功能，仅记录日志
    }
  }

  // 加载云端备份列表
  const loadCloudBackups = async () => {
    if (!isConfigured) return
    
    setLoadingCloudBackups(true)
    try {
      // 使用缓存，避免频繁 PROPFIND
      const list = await getCloudBackupList(getSyncConfig(), false)
      setCloudBackups(list)
    } catch (error) {
      console.error('Failed to load cloud backups:', error)
      toast.error(t('sync.toast.loadCloudListFailed'))
    } finally {
      setLoadingCloudBackups(false)
    }
  }

  // 请求从云端备份恢复
  const requestRestoreCloudBackup = (backup: CloudBackupFile) => {
    setPendingRestoreCloudBackup(backup)
    setConfirmDrawerOpen(true)
  }

  // 确认从云端备份恢复
  const confirmRestoreCloudBackup = async () => {
    if (!pendingRestoreCloudBackup) return
    
    setSyncStatus('syncing')
    setMsg(t('sync.status.restoreFromCloud'))
    setConfirmDrawerOpen(false)
    setDrawerOpen(false)
    
    // 提示用户操作在后台执行（运行于 Service Worker，关闭面板不会中断）
    const loadingToast = toast.loading(t('sync.status.restoreFromCloud'), { 
      description: t('sync.toast.backgroundHint') 
    })
    
    try {
      const result = await restoreCloudBackupInBackground(getSyncConfig(), pendingRestoreCloudBackup.path)
      
      toast.dismiss(loadingToast)
      
      if (result.success) {
        setSyncStatus('success')
        setMsg(translateSyncMessage(locale, result.message))
        loadCounts()
        loadSnapshots() // 刷新快照列表
        toast.success(t('sync.toast.restoreSuccess'), { description: t('sync.toast.restoredFromCloud') })
      } else {
        setSyncStatus('error')
        setMsg(translateSyncMessage(locale, result.message))
        toast.error(t('sync.toast.restoreFailed'), { description: translateSyncMessage(locale, result.message) })
      }
    } catch (e) {
      toast.dismiss(loadingToast)
      setSyncStatus('error')
      setMsg(t('sync.toast.restoreFailed'))
      toast.error(t('sync.toast.restoreFailed'), { description: (e as Error).message })
    } finally {
      setPendingRestoreCloudBackup(null)
    }
  }

  // 请求恢复快照（打开确认 Drawer）
  const requestRestoreSnapshot = (snapshot: Snapshot) => {
    setPendingRestoreSnapshot(snapshot)
    setConfirmDrawerOpen(true)
  }

  // 确认恢复快照
  const confirmRestoreSnapshot = async () => {
    if (!pendingRestoreSnapshot) return
    
    setSyncStatus('syncing')
    setMsg(t('sync.status.restoreSnapshot'))
    setConfirmDrawerOpen(false)
    setDrawerOpen(false)
    
    try {
            await setIsRestoring(true)

      // 先备份当前状态（本地快照恢复前）
      const currentTree = await bookmarkRepository.getTree()
      const currentCount = countBookmarks(currentTree)
      await snapshotManager.createSnapshot(currentTree, currentCount, t('sync.confirmRestore.snapshotBackupReason'))
      
      await bookmarkRepository.restoreFromBackup(pendingRestoreSnapshot.tree)
      
      setSyncStatus('success')
      setMsg(t('sync.toast.snapshotRestoreSuccess'))
      loadCounts()
      loadSnapshots()
      toast.success(t('sync.toast.snapshotRestoreSuccess'))
    } catch (e) {
      setSyncStatus('error')
      setMsg(t('sync.toast.restoreFailed'))
      toast.error(t('sync.toast.restoreFailed'), { description: (e as Error).message })
    } finally {
            await holdRestoringUntil()

      setPendingRestoreSnapshot(null)
    }
  }

  // 取消恢复
  const cancelRestore = () => {
    setPendingRestoreSnapshot(null)
    setPendingRestoreCloudBackup(null)
    setConfirmDrawerOpen(false)
  }

  const openMoreActions = () => {
    setDrawerMode('actions')
    setDrawerOpen(true)
  }

  const requestForcePush = () => {
    if (!isOnline || localCount === 0 || isSyncBusy) return
    setDrawerOpen(false)
    setConfirmPushOpen(true)
  }

  const confirmForcePush = async () => {
    if (!isOnline || localCount === 0 || isSyncBusy) return
    setConfirmPushOpen(false)
    await executePush()
  }

  // 打开云端备份列表
  const openCloudBackups = () => {
    setDrawerMode('cloudBackups')
    setDrawerOpen(true)
    loadCloudBackups()
  }

  // --- 智能无感同步逻辑 ---
  
  // 获取 syncService 需要的配置（URL/用户名去首尾空格；密码保留原样，避免破坏含首尾空格的真实密码）
  const getSyncConfig = () => {
    const config = { 
      url: webdavUrl.trim(), 
      username: username.trim(), 
      password: password
    };
    console.log('[SyncView] Getting sync config:', { url: config.url, hasPassword: !!config.password });
    return config;
  }
  
  const handleSmartSync = async () => {
      if (!isConfigured) return
      
      setSyncStatus('checking')
      setMsg(t('sync.status.analyzing'))
      
      try {
          // 在后台 Service Worker 中执行，关闭面板不会中断
          const result = await smartSyncInBackground(getSyncConfig())
          
          // 更新云端信息显示
          if (result.cloudInfo?.exists) {
              setCloudMeta({
                  time: result.cloudInfo.timestamp || 0,
                  device: result.cloudInfo.browser || '',
                  count: result.cloudInfo.totalCount || 0,
                  browser: result.cloudInfo.browser
              })
          }
          
          // 处理结果
          if (result.needsConflictResolution) {
              // 需要用户选择同步方向
              setMsg(translateSyncMessage(locale, result.message))
              setDrawerMode('conflict')
              setDrawerOpen(true)
              setSyncStatus('idle')
              return
          }
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(translateSyncMessage(locale, result.message))
              loadCounts()
              
              // 重置定时同步计时器，避免手动同步后立即触发定时同步
              await resetScheduledSync()
              
              scheduleMsgClear()
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info(t('sync.toast.syncInProgress'))
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(translateSyncMessage(locale, result.message))
              }
          }
      } catch (e) {
          setSyncStatus('error')
          setMsg(t('sync.connectionFailed'))
      }
  }

  const executePush = async () => {
      setSyncStatus('syncing')
      setMsg(t('sync.status.uploading'))
      try {
          // 在后台 Service Worker 中执行，关闭面板不会中断
          const result = await smartPushInBackground(getSyncConfig())
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(translateSyncMessage(locale, result.message))
              setDrawerOpen(false)
              loadCounts()
              loadSnapshots() // 刷新快照列表
              
              // 重置定时同步计时器
              await resetScheduledSync()
              scheduleMsgClear()
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info(t('sync.toast.syncInProgress'))
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(translateSyncMessage(locale, result.message))
              }
          }
      } catch (e) {
          setSyncStatus('error')
          setMsg(t('sync.uploadFailed'))
      }
  }

  // 强制创建新备份（忽略时间窗口）
  const forceNewBackup = async () => {
      try {
          await clearLastBackupFileInfo()
          toast.success(t('sync.toast.forceNewBackupTitle'), { 
              description: t('sync.toast.forceNewBackupDesc') 
          })
      } catch (e) {
          toast.error(t('sync.toast.opFailed'), {
              description: (e as Error).message || t('common.unknownError')
          })
      }
  }

  const executePull = async (mode: 'overwrite' | 'merge') => {
      setSyncStatus('syncing') 
      setMsg(mode === 'overwrite' ? t('sync.status.restoring') : t('sync.status.merging'))
      
      // 提示用户操作在后台执行（运行于 Service Worker，关闭面板不会中断）
      const loadingToast = toast.loading(
        mode === 'overwrite' ? t('sync.status.restoring') : t('sync.status.merging'), 
        { description: t('sync.toast.backgroundHint') }
      )
      
      try {
          const result = await smartPullInBackground(getSyncConfig(), mode)
          
          toast.dismiss(loadingToast)
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(translateSyncMessage(locale, result.message))
              setDrawerOpen(false)
              loadCounts()
              loadSnapshots() // 刷新快照列表
              
              // 重置定时同步计时器
              await resetScheduledSync()
              
              scheduleMsgClear()
              toast.success(t('sync.toast.restoreSuccess'), { 
                description: mode === 'merge' ? t('sync.toast.restoredMergedBookmarks') : t('sync.toast.restoredBookmarks') 
              })
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info(t('sync.toast.syncInProgress'))
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(translateSyncMessage(locale, result.message))
                  toast.error(t('sync.toast.restoreFailed'), { description: translateSyncMessage(locale, result.message) })
              }
          }
      } catch (e) {
          toast.dismiss(loadingToast)
          setSyncStatus('error')
          setMsg(t('sync.toast.restoreFailed'))
          toast.error(t('sync.toast.restoreFailed'), { description: (e as Error).message })
      }
  }

  const isSyncBusy = syncStatus === 'checking' || syncStatus === 'syncing'

  return (
    <>
    <motion.div 
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-6 pt-4 h-full flex flex-col relative"
    >
      {/* Offline Alert */}
      {!isOnline && (
         <motion.div variants={item} className="px-4 py-2 mx-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-center gap-2">
            <WifiOff className="w-4 h-4" />
            <span>{t('sync.offlineBanner')}</span>
         </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 gap-4 px-1">
        <StatsCard label={t('sync.stats.local')} count={localCount} loading={false} color="zinc" />
        <StatsCard label={t('sync.stats.cloud')} count={cloudCount} loading={loading} color="indigo" />
      </motion.div>
      
      {/* 提示信息：未配置 */}
      {!isConfigured && (
         <motion.div variants={item} className="px-4 py-2 mx-4 rounded-lg bg-primary/10 border border-primary/20 text-muted-foreground text-sm text-center">
            {t('sync.stats.notConfigured')}
         </motion.div>
      )}

      {/* Main Action - One Click Sync */}
      <motion.div variants={item} className="flex-1 flex flex-col justify-center items-center space-y-4 px-4">
         {!isConfigured ? (
             <div className="text-center text-muted-foreground py-8">{t('sync.needConfigFirst')}</div>
         ) : (
             <>
                <div className="relative">
                  <button
                      onClick={handleSmartSync}
                      disabled={!isOnline || (syncStatus !== 'idle' && syncStatus !== 'success' && syncStatus !== 'error')}
                      className={cn(
                          "group relative w-40 h-40 rounded-full glass-panel flex flex-col items-center justify-center transition-all shadow-xl",
                          isOnline 
                              ? "hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100" 
                              : "opacity-50 grayscale cursor-not-allowed"
                      )}
                  >
                      {isOnline && <div className="absolute inset-0 rounded-full bg-indigo-600/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity" />}
                      
                      {!isOnline ? (
                          <WifiOff className="w-12 h-12 text-muted-foreground" />
                      ) : (syncStatus === 'syncing' || syncStatus === 'checking') ? (
                          <RefreshCw className="w-12 h-12 text-primary animate-spin" />
                      ) : (
                          <Cloud className="w-12 h-12 text-muted-foreground group-hover:text-primary transition-colors" />
                      )}
                      
                      <span className="mt-3 text-sm font-medium text-secondary-foreground">
                          {!isOnline ? t('sync.syncButton.offline') :
                           syncStatus === 'checking' ? t('sync.syncButton.analyzing') : 
                           syncStatus === 'syncing' ? t('sync.syncButton.syncing') : 
                           syncStatus === 'success' ? t('sync.syncButton.done') : t('sync.syncButton.syncNow')}
                      </span>
                  </button>

                  {/* 小的圆形更多操作按钮 */}
                  <button
                      onClick={openMoreActions}
                      disabled={!isOnline || isSyncBusy}
                      className={cn(
                          "absolute bottom-0 right-0 w-12 h-12 rounded-full glass-panel flex items-center justify-center transition-all shadow-lg",
                          isOnline && !isSyncBusy
                              ? "hover:scale-110 active:scale-95" 
                              : "opacity-50 cursor-not-allowed"
                      )}
                      title={t('sync.syncButton.moreOptions')}
                  >
                      <MoreHorizontal className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
                  </button>
                </div>

                <div className="h-6 text-center">
                    {msg && (
                        <motion.span 
                            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                            className={cn("text-xs font-medium", syncStatus === 'error' ? "text-destructive" : "text-muted-foreground")}
                        >
                            {msg}
                        </motion.span>
                    )}
                    {cloudMeta && !msg && (
                        <span className="text-[10px] text-muted-foreground">
                             {t('sync.cloudUpdatedAt', { time: new Date(cloudMeta.time).toLocaleString() })}
                             {cloudMeta.device ? ` (${cloudMeta.device})` : ''}
                        </span>
                    )}
                </div>
             </>
         )}
      </motion.div>

      {/* Footer History Trigger */}
      <motion.div variants={item} className="mt-auto glass-panel border-x-0 border-b-0 rounded-b-none -mx-4 px-6 py-3 flex justify-between items-center cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => { setDrawerMode('history'); setDrawerOpen(true); }}>
        <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('sync.viewSnapshots')}</span>
        </div>
        <div className="flex -space-x-2">
            {/* Avatars or logic dots */}
             <div className="w-2 h-2 rounded-full bg-indigo-500" />
             <div className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
      </motion.div>
    </motion.div>

    {/* Drawer for Conflict / History / Cloud Backups */}
    <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'history' ? t('sync.drawer.title.history') : drawerMode === 'cloudBackups' ? t('sync.drawer.title.cloudBackups') : drawerMode === 'actions' ? t('sync.drawer.title.actions') : t('sync.drawer.title.conflict')}
    >
        {drawerMode === 'actions' ? (
             <div className="space-y-2 pt-2">
                 <button
                      type="button"
                      onClick={openCloudBackups}
                      disabled={!isOnline || isSyncBusy}
                      className={cn(
                          "w-full rounded-xl bg-muted/70 border border-border p-4 text-left transition-colors",
                          !isOnline || isSyncBusy
                              ? "opacity-50 cursor-not-allowed"
                              : "hover:border-primary/50 hover:bg-accent/70"
                      )}
                 >
                     <div className="flex items-center gap-3">
                         <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                             <Download className="w-4 h-4 text-primary" />
                         </div>
                         <div className="min-w-0 flex-1">
                             <div className="text-sm font-medium text-foreground">{t('sync.actions.viewCloudBackups')}</div>
                             <div className="text-xs text-muted-foreground mt-0.5">{t('sync.actions.viewCloudBackupsDesc')}</div>
                         </div>
                     </div>
                 </button>

                 <div className="h-px bg-border/70 my-3" />

                  <button
                      type="button"
                      onClick={requestForcePush}
                      disabled={!isOnline || localCount === 0 || isSyncBusy}
                      className={cn(
                          "w-full rounded-xl border p-4 text-left transition-colors",
                          !isOnline || localCount === 0 || isSyncBusy
                              ? "bg-muted/40 border-border opacity-50 cursor-not-allowed"
                              : "bg-destructive/5 border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40"
                      )}
                  >
                     <div className="flex items-center gap-3">
                         <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                             <AlertTriangle className="w-4 h-4 text-destructive" />
                         </div>
                         <div className="min-w-0 flex-1">
                             <div className="text-sm font-medium text-destructive">{t('sync.actions.overwriteCloud')}</div>
                             <div className="text-xs text-muted-foreground mt-0.5">
                                 {localCount === 0 ? t('sync.actions.overwriteCloudEmpty') : t('sync.actions.overwriteCloudDesc')}
                             </div>
                         </div>
                     </div>
                 </button>
             </div>
        ) : drawerMode === 'cloudBackups' ? (
             <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground mb-2">{t('sync.cloudBackups.pick')}</p>
                {loadingCloudBackups ? (
                    <div className="text-center py-8">
                        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-2" />
                        <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
                    </div>
                ) : cloudBackups.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">{t('sync.cloudBackups.empty')}</p>
                ) : (
                    cloudBackups.map((backup) => (
                        <div key={backup.path} className="bg-muted border border-border rounded-lg p-3 flex items-center justify-between group transition-colors hover:border-primary/50">
                             <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-foreground">
                                    {new Date(backup.timestamp).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {backup.browser ? (
                                        backup.totalCount
                                            ? t('sync.cloudBackups.browserWithCount', { browser: backup.browser, count: backup.totalCount })
                                            : backup.browser
                                    ) : (
                                        backup.name
                                    )}
                                </span>
                             </div>
                             <div className="flex items-center gap-3">
                                 <span className="text-xs text-muted-foreground font-mono">
                                     {backup.totalCount !== undefined ? t('sync.cloudBackups.bookmarks', { count: backup.totalCount }) : ''}
                                 </span>
                                 <Button 
                                     size="sm" 
                                     variant="ghost"
                                     className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2"
                                     onClick={() => requestRestoreCloudBackup(backup)}
                                 >
                                     <Download className="w-3 h-3 mr-1" />
                                     恢复
                                 </Button>
                             </div>
                        </div>
                    ))
                )}
             </div>
        ) : drawerMode === 'history' ? (
             <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground mb-2">{t('sync.history.pick')}</p>
                {snapshots.map((s) => (
                    <div key={s.id} className="bg-muted border border-border rounded-lg p-3 flex items-center justify-between group transition-colors hover:border-primary/50">
                         <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-foreground">
                                {s.reason || t('sync.history.autoBackup')}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{new Date(s.timestamp).toLocaleString()}</span>
                         </div>
                         <div className="flex items-center gap-3">
                             <span className="text-xs text-muted-foreground font-mono">
                                 {t('sync.history.bookmarks', { count: s.count })}
                             </span>
                             <Button 
                                 size="sm" 
                                 variant="ghost"
                                 className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2"
                                 onClick={() => requestRestoreSnapshot(s)}
                             >
                                 <RotateCcw className="w-3 h-3 mr-1" />
                                 {t('common.restore')}
                             </Button>
                             <Button 
                                 size="sm" 
                                 variant="ghost"
                                 className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                 onClick={async (e) => {
                                     e.stopPropagation()
                                    await snapshotManager.deleteSnapshot(s.id)
                                    loadSnapshots()
                                    toast.success(t('sync.toast.snapshotDeleted'))
                                 }}
                             >
                                 <Trash2 className="w-3 h-3" />
                             </Button>
                         </div>
                    </div>
                ))}
                {snapshots.length === 0 && <p className="text-center text-muted-foreground py-4">{t('sync.history.empty')}</p>}
             </div>
        ) : drawerMode === 'conflict' ? (
            <div className="space-y-4 pt-2">
                {/* 跨浏览器警告 */}

                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/20 p-4 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">{t('sync.conflict.title')}</h4>
                        <p className="text-xs text-foreground/70 leading-relaxed">
                            {t('sync.conflict.cloudHas', { count: cloudCount })}
                            {cloudMeta?.browser && <span className="text-muted-foreground"> ({cloudMeta.browser})</span>}
                            {t('sync.conflict.updatedAt', { time: cloudMeta ? new Date(cloudMeta.time).toLocaleTimeString() : t('sync.conflict.unknownTime') })}
                            <br/>{t('sync.conflict.localHas', { count: localCount })}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button 
                        variant="outline" 
                        className={cn("h-20 flex flex-col gap-1 hover:bg-accent hover:text-accent-foreground", (!isOnline || isSyncBusy) && "opacity-50")}
                        onClick={() => executePull('overwrite')}
                        disabled={!isOnline || isSyncBusy}
                    >
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        <span className="text-foreground text-sm">{t('sync.conflict.restoreLocal')}</span>
                        <span className="text-[10px] text-muted-foreground">{t('sync.conflict.restoreLocalDesc')}</span>
                    </Button>
                    <Button 
                        className={cn("h-20 flex flex-col gap-1", (localCount === 0 || !isOnline || isSyncBusy) && "opacity-50")}
                        onClick={requestForcePush}
                        disabled={localCount === 0 || !isOnline || isSyncBusy}
                    >
                        {localCount === 0 ? (
                            <>
                                <Cloud className="w-5 h-5 text-muted-foreground" />
                                <span className="text-sm text-foreground/50">{t('sync.conflict.uploadForbidden')}</span>
                                <span className="text-[10px] text-foreground/30">{t('sync.conflict.uploadForbiddenDesc')}</span>
                            </>
                        ) : (
                            <>
                                <Cloud className="w-5 h-5" />
                                <span className="text-sm">{t('sync.conflict.uploadCloud')}</span>
                                <span className="text-[10px] text-primary-foreground/70">{t('sync.conflict.uploadCloudDesc')}</span>
                            </>
                        )}
                    </Button>
                </div>
                
                {/* 强制新备份按钮 */}
                <div className="flex justify-end mt-2">
                    <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-xs h-7 gap-1"
                        onClick={forceNewBackup}
                    >
                        <FilePlus className="w-3 h-3" />
                        {t('sync.conflict.forceNewBackup')}
                    </Button>
                </div>
            </div>
        ) : null}
    </Drawer>

    {/* 覆盖云端二次确认 Drawer */}
    <Drawer
        isOpen={confirmPushOpen}
        onClose={() => setConfirmPushOpen(false)}
        title={t('sync.confirmPush.title')}
    >
        <div className="space-y-4 pt-2">
            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl flex gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                <div>
                    <h4 className="text-sm font-bold text-foreground mb-1">{t('sync.confirmPush.heading')}</h4>
                    <p className="text-xs text-foreground/80 leading-relaxed">
                        {t('sync.confirmPush.body1')}<br/>
                        {t('sync.confirmPush.body2')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <Button
                    variant="outline"
                    onClick={() => setConfirmPushOpen(false)}
                >
                    {t('common.cancel')}
                </Button>
                <Button
                    variant="destructive"
                    onClick={confirmForcePush}
                    disabled={isSyncBusy || !isOnline || localCount === 0}
                >
                    {t('sync.confirmPush.confirm')}
                </Button>
            </div>
        </div>
    </Drawer>

    {/* 独立的确认恢复 Drawer */}
    <Drawer
        isOpen={confirmDrawerOpen}
        onClose={cancelRestore}
        title={t('sync.confirmRestore.title')}
    >
        {(pendingRestoreSnapshot || pendingRestoreCloudBackup) && (
            <div className="space-y-4 pt-2">
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/20 p-4 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">
                            {pendingRestoreSnapshot ? t('sync.confirmRestore.snapshotTitle') : t('sync.confirmRestore.cloudTitle')}
                        </h4>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                            {pendingRestoreSnapshot ? (
                                <>
                                    {t('sync.confirmRestore.snapshotBody1', { time: new Date(pendingRestoreSnapshot.timestamp).toLocaleString() })}<br/>
                                    {t('sync.confirmRestore.snapshotBody2', { count: pendingRestoreSnapshot.count })}<br/>
                                    {t('sync.confirmRestore.overwriteAll')}
                                </>
                            ) : pendingRestoreCloudBackup ? (
                                <>
                                    {t('sync.confirmRestore.cloudBody1', { time: new Date(pendingRestoreCloudBackup.timestamp).toLocaleString() })}<br/>
                                    {pendingRestoreCloudBackup.totalCount && t('sync.confirmRestore.snapshotBody2', { count: pendingRestoreCloudBackup.totalCount })}<br/>
                                    {pendingRestoreCloudBackup.browser && t('sync.confirmRestore.cloudBody3', { browser: pendingRestoreCloudBackup.browser })}<br/>
                                    {t('sync.confirmRestore.cloudBody4')}
                                </>
                            ) : null}
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button 
                        variant="outline" 
                        onClick={cancelRestore}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button 
                        onClick={pendingRestoreSnapshot ? confirmRestoreSnapshot : confirmRestoreCloudBackup}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        {t('sync.confirmRestore.confirm')}
                    </Button>
                </div>
            </div>
        )}
    </Drawer>
    </>
  )
}
