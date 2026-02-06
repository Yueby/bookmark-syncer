import { useCallback, useEffect, useRef, useState } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

import { motion } from 'framer-motion'
import { AlertTriangle, Cloud, Download, FilePlus, History, RefreshCw, RotateCcw, ShieldCheck, Trash2, WifiOff } from 'lucide-react'
import { clearLastBackupFileInfo } from '../application/state-manager'
import { snapshotManager, type Snapshot } from '../core/backup'
import { bookmarkRepository, countBookmarks } from '../core/bookmark'
import { getCloudBackupList, getCloudInfo, restoreFromCloudBackup, smartPull, smartPush, smartSync, type CloudBackupFile } from '../core/sync'
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
  const [drawerMode, setDrawerMode] = useState<'conflict' | 'history' | 'cloudBackups'>('conflict')
  const [confirmDrawerOpen, setConfirmDrawerOpen] = useState(false)
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
            toast.error('加载云端信息失败', {
              description: (e as Error).message || '请检查网络连接和 WebDAV 配置'
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
      toast.error('加载云端备份列表失败')
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
    setMsg('正在从云端恢复...')
    setConfirmDrawerOpen(false)
    setDrawerOpen(false)
    
    // 提示用户操作会在后台继续
    const loadingToast = toast.loading('正在从云端恢复书签...', { 
      description: '即使关闭面板，操作也会在后台完成' 
    })
    
    try {
      const result = await restoreFromCloudBackup(getSyncConfig(), pendingRestoreCloudBackup.path, 'manual')
      
      toast.dismiss(loadingToast)
      
      if (result.success) {
        setSyncStatus('success')
        setMsg(result.message)
        loadCounts()
        loadSnapshots() // 刷新快照列表
        toast.success('恢复成功', { description: '已从云端恢复书签' })
      } else {
        setSyncStatus('error')
        setMsg(result.message)
        toast.error('恢复失败', { description: result.message })
      }
    } catch (e) {
      toast.dismiss(loadingToast)
      setSyncStatus('error')
      setMsg('恢复失败')
      toast.error('恢复失败', { description: (e as Error).message })
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
    setMsg('正在恢复快照...')
    setConfirmDrawerOpen(false)
    setDrawerOpen(false)
    
    try {
      // 先备份当前状态（本地快照恢复前）
      const currentTree = await bookmarkRepository.getTree()
      const currentCount = countBookmarks(currentTree)
      await snapshotManager.createSnapshot(currentTree, currentCount, '本地快照恢复前自动备份')
      
      await bookmarkRepository.restoreFromBackup(pendingRestoreSnapshot.tree)
      
      setSyncStatus('success')
      setMsg('快照恢复成功')
      loadCounts()
      loadSnapshots()
      toast.success('快照恢复成功')
    } catch (e) {
      setSyncStatus('error')
      setMsg('恢复失败')
      toast.error('恢复失败', { description: (e as Error).message })
    } finally {
      setPendingRestoreSnapshot(null)
    }
  }

  // 取消恢复
  const cancelRestore = () => {
    setPendingRestoreSnapshot(null)
    setPendingRestoreCloudBackup(null)
    setConfirmDrawerOpen(false)
  }

  // 打开云端备份列表
  const openCloudBackups = () => {
    setDrawerMode('cloudBackups')
    setDrawerOpen(true)
    loadCloudBackups()
  }

  // --- 智能无感同步逻辑 ---
  
  // 获取 syncService 需要的配置（去除首尾空格）
  const getSyncConfig = () => {
    const config = { 
      url: webdavUrl.trim(), 
      username: username.trim(), 
      password: password.trim() 
    };
    console.log('[SyncView] Getting sync config:', { url: config.url, username: config.username, hasPassword: !!config.password });
    return config;
  }
  
  const handleSmartSync = async () => {
      if (!isConfigured) return
      
      setSyncStatus('checking')
      setMsg('正在分析...')
      
      try {
          const result = await smartSync(getSyncConfig(), 'manual')
          
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
              setMsg('需要选择同步方向')
              setDrawerMode('conflict')
              setDrawerOpen(true)
              setSyncStatus('idle')
              return
          }
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(result.message)
              loadCounts()
              
              // 重置定时同步计时器，避免手动同步后立即触发定时同步
              const { resetScheduledSync } = await import('../background/autoSync')
              await resetScheduledSync()
              
              scheduleMsgClear()
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info('同步正在进行中，请稍后重试')
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(result.message)
              }
          }
      } catch (e) {
          setSyncStatus('error')
          setMsg('连接失败')
      }
  }

  const executePush = async () => {
      setSyncStatus('syncing')
      setMsg('正在上传...')
      try {
          const result = await smartPush(getSyncConfig(), 'manual')
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(result.message)
              setDrawerOpen(false)
              loadCounts()
              loadSnapshots() // 刷新快照列表
              
              // 重置定时同步计时器
              const { resetScheduledSync } = await import('../background/autoSync')
              await resetScheduledSync()
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info('同步正在进行中，请稍后重试')
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(result.message)
              }
          }
      } catch (e) {
          setSyncStatus('error')
          setMsg('上传失败')
      } finally {
          if(syncStatus !== 'error') scheduleMsgClear()
      }
  }

  // 强制创建新备份（忽略时间窗口）
  const forceNewBackup = async () => {
      try {
          await clearLastBackupFileInfo()
          toast.success('已清除时间窗口', { 
              description: '下次同步将创建新备份文件' 
          })
      } catch (e) {
          toast.error('操作失败', {
              description: (e as Error).message || '未知错误'
          })
      }
  }

  const executePull = async (mode: 'overwrite' | 'merge') => {
      setSyncStatus('syncing') 
      setMsg(mode === 'overwrite' ? '正在恢复...' : '正在合并...')
      
      // 提示用户操作会在后台继续
      const loadingToast = toast.loading(
        mode === 'overwrite' ? '正在恢复书签...' : '正在合并书签...', 
        { description: '即使关闭面板，操作也会在后台完成' }
      )
      
      try {
          const result = await smartPull(getSyncConfig(), 'manual', mode)
          
          toast.dismiss(loadingToast)
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(result.message)
              setDrawerOpen(false)
              loadCounts()
              loadSnapshots() // 刷新快照列表
              
              // 重置定时同步计时器
              const { resetScheduledSync } = await import('../background/autoSync')
              await resetScheduledSync()
              
              toast.success('恢复成功', { 
                description: `已恢复${mode === 'merge' ? '并合并' : ''}书签` 
              })
          } else {
              if (result.message === '同步正在进行中') {
                  toast.info('同步正在进行中，请稍后重试')
                  setSyncStatus('idle')
              } else {
                  setSyncStatus('error')
                  setMsg(result.message)
                  toast.error('恢复失败', { description: result.message })
              }
          }
      } catch (e) {
          toast.dismiss(loadingToast)
          setSyncStatus('error')
          setMsg('恢复失败')
          toast.error('恢复失败', { description: (e as Error).message })
      } finally {
          if(syncStatus !== 'error') scheduleMsgClear()
      }
  }

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
            <span>网络断开，同步暂停</span>
         </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={item} className="grid grid-cols-2 gap-4 px-1">
        <StatsCard label="本地书签" count={localCount} loading={false} color="zinc" />
        <StatsCard label="云端备份" count={cloudCount} loading={loading} color="indigo" />
      </motion.div>
      
      {/* 提示信息：未配置 */}
      {!isConfigured && (
         <motion.div variants={item} className="px-4 py-2 mx-4 rounded-lg bg-primary/10 border border-primary/20 text-muted-foreground text-sm text-center">
            点击上方 "设置" 配置 WebDAV 服务
         </motion.div>
      )}

      {/* Main Action - One Click Sync */}
      <motion.div variants={item} className="flex-1 flex flex-col justify-center items-center space-y-4 px-4">
         {!isConfigured ? (
             <div className="text-center text-muted-foreground py-8">请先配置连接</div>
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
                          {!isOnline ? '离线' :
                           syncStatus === 'checking' ? '分析中' : 
                           syncStatus === 'syncing' ? '同步中' : 
                           syncStatus === 'success' ? '已完成' : '立即同步'}
                      </span>
                  </button>

                  {/* 小的圆形恢复按钮 */}
                  <button
                      onClick={openCloudBackups}
                      disabled={!isOnline}
                      className={cn(
                          "absolute bottom-0 right-0 w-12 h-12 rounded-full glass-panel flex items-center justify-center transition-all shadow-lg",
                          isOnline 
                              ? "hover:scale-110 active:scale-95" 
                              : "opacity-50 cursor-not-allowed"
                      )}
                      title="查看云端备份"
                  >
                      <Download className="w-5 h-5 text-muted-foreground hover:text-primary transition-colors" />
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
                             云端更新于 {new Date(cloudMeta.time).toLocaleString()} 
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
            <span className="text-xs text-muted-foreground">查看本地快照</span>
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
        title={drawerMode === 'history' ? '本地快照' : drawerMode === 'cloudBackups' ? '云端备份' : '同步选项'}
    >
        {drawerMode === 'cloudBackups' ? (
             <div className="space-y-3 pt-2">
                <p className="text-xs text-muted-foreground mb-2">选择一个云端备份恢复到本地（会自动创建本地快照）：</p>
                {loadingCloudBackups ? (
                    <div className="text-center py-8">
                        <RefreshCw className="w-6 h-6 text-muted-foreground animate-spin mx-auto mb-2" />
                        <span className="text-xs text-muted-foreground">加载中...</span>
                    </div>
                ) : cloudBackups.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">暂无云端备份</p>
                ) : (
                    cloudBackups.map((backup) => (
                        <div key={backup.path} className="bg-muted border border-border rounded-lg p-3 flex items-center justify-between group transition-colors hover:border-primary/50">
                             <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium text-foreground">
                                    {new Date(backup.timestamp).toLocaleString()}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                    {backup.browser ? (
                                        `${backup.browser}${backup.totalCount ? ` · ${backup.totalCount} 书签` : ''}`
                                    ) : (
                                        backup.name
                                    )}
                                </span>
                             </div>
                             <div className="flex items-center gap-3">
                                 <span className="text-xs text-muted-foreground font-mono">
                                     {backup.totalCount !== undefined ? `${backup.totalCount} 书签` : ''}
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
                <p className="text-xs text-muted-foreground mb-2">操作前会自动创建快照，点击可恢复到历史状态：</p>
                {snapshots.map((s) => (
                    <div key={s.id} className="bg-muted border border-border rounded-lg p-3 flex items-center justify-between group transition-colors hover:border-primary/50">
                         <div className="flex flex-col min-w-0">
                            <span className="text-xs font-medium text-foreground">
                                {s.reason || '自动备份'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{new Date(s.timestamp).toLocaleString()}</span>
                         </div>
                         <div className="flex items-center gap-3">
                             <span className="text-xs text-muted-foreground font-mono">
                                 {s.count} 书签
                             </span>
                             <Button 
                                 size="sm" 
                                 variant="ghost"
                                 className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 px-2"
                                 onClick={() => requestRestoreSnapshot(s)}
                             >
                                 <RotateCcw className="w-3 h-3 mr-1" />
                                 恢复
                             </Button>
                             <Button 
                                 size="sm" 
                                 variant="ghost"
                                 className="opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                 onClick={async (e) => {
                                     e.stopPropagation()
                                    await snapshotManager.deleteSnapshot(s.id)
                                    loadSnapshots()
                                    toast.success('快照已删除')
                                 }}
                             >
                                 <Trash2 className="w-3 h-3" />
                             </Button>
                         </div>
                    </div>
                ))}
                {snapshots.length === 0 && <p className="text-center text-muted-foreground py-4">暂无快照</p>}
             </div>
        ) : drawerMode === 'conflict' ? (
            <div className="space-y-4 pt-2">
                {/* 跨浏览器警告 */}

                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/20 p-4 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">请选择同步方向</h4>
                        <p className="text-xs text-foreground/70 leading-relaxed">
                            云端有 {cloudCount} 个书签
                            {cloudMeta?.browser && <span className="text-muted-foreground"> ({cloudMeta.browser})</span>}
                            ，更新于 {cloudMeta ? new Date(cloudMeta.time).toLocaleTimeString() : '未知时间'}。
                            <br/>本地有 {localCount} 个书签。
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <Button 
                        variant="outline" 
                        className="h-20 flex flex-col gap-1 hover:bg-accent hover:text-accent-foreground"
                        onClick={() => executePull('overwrite')}
                        disabled={!isOnline}
                    >
                        <ShieldCheck className="w-5 h-5 text-emerald-500" />
                        <span className="text-foreground text-sm">恢复到本地</span>
                        <span className="text-[10px] text-muted-foreground">将创建本地自动快照</span>
                    </Button>
                    <Button 
                        className={cn("h-20 flex flex-col gap-1", (localCount === 0 || !isOnline) && "opacity-50")}
                        onClick={executePush}
                        disabled={localCount === 0 || !isOnline}
                    >
                        {localCount === 0 ? (
                            <>
                                <Cloud className="w-5 h-5 text-muted-foreground" />
                                <span className="text-sm text-foreground/50">禁止上传</span>
                                <span className="text-[10px] text-foreground/30">本地书签为空</span>
                            </>
                        ) : (
                            <>
                                <Cloud className="w-5 h-5" />
                                <span className="text-sm">上传到云端</span>
                                <span className="text-[10px] text-primary-foreground/70">覆盖云端版本</span>
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
                        强制新备份
                    </Button>
                </div>
            </div>
        ) : null}
    </Drawer>

    {/* 独立的确认恢复 Drawer */}
    <Drawer
        isOpen={confirmDrawerOpen}
        onClose={cancelRestore}
        title="确认恢复"
    >
        {(pendingRestoreSnapshot || pendingRestoreCloudBackup) && (
            <div className="space-y-4 pt-2">
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/20 p-4 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">
                            {pendingRestoreSnapshot ? '确定要恢复此本地快照吗？' : '确定要从云端恢复此备份吗？'}
                        </h4>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                            {pendingRestoreSnapshot ? (
                                <>
                                    将恢复到 {new Date(pendingRestoreSnapshot.timestamp).toLocaleString()} 的状态<br/>
                                    （{pendingRestoreSnapshot.count} 个书签）<br/>
                                    这将覆盖当前所有书签。
                                </>
                            ) : pendingRestoreCloudBackup ? (
                                <>
                                    将恢复到 {new Date(pendingRestoreCloudBackup.timestamp).toLocaleString()} 的云端备份<br/>
                                    {pendingRestoreCloudBackup.totalCount && `（${pendingRestoreCloudBackup.totalCount} 个书签）`}<br/>
                                    {pendingRestoreCloudBackup.browser && `来自 ${pendingRestoreCloudBackup.browser}`}<br/>
                                    这将覆盖当前所有书签，并会自动创建本地快照。
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
                        取消
                    </Button>
                    <Button 
                        onClick={pendingRestoreSnapshot ? confirmRestoreSnapshot : confirmRestoreCloudBackup}
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        确认恢复
                    </Button>
                </div>
            </div>
        )}
    </Drawer>
    </>
  )
}
