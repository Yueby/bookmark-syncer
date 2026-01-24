import { useEffect, useState } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'

import { motion } from 'framer-motion'
import { AlertTriangle, Cloud, History, RefreshCw, RotateCcw, ShieldCheck, Trash2, WifiOff } from 'lucide-react'
import { useStorage } from '../hooks/useStorage'
import { cn } from '../lib/utils'
import { BackupService, Snapshot } from '../services/backupService'
import { BookmarkService } from '../services/bookmarkService'
import { smartPull, smartPush, smartSync } from '../services/syncService'
import { createWebDAVClient } from '../services/webdav'
import { CloudBackup } from '../types'
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
  const [lastSyncTime] = useStorage('lastSyncTime', 0)
  const isOnline = useOnlineStatus()
  
  const [localCount, setLocalCount] = useState(0)
  const [cloudCount, setCloudCount] = useState(0)
  const [cloudMeta, setCloudMeta] = useState<{ time: number, device: string, count: number, browser?: string } | null>(null)

  const [loading, setLoading] = useState(true)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'checking' | 'syncing' | 'success' | 'error'>('idle')
  const [msg, setMsg] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<'conflict' | 'history'>('conflict')
  const [confirmDrawerOpen, setConfirmDrawerOpen] = useState(false)
  const [pendingRestoreSnapshot, setPendingRestoreSnapshot] = useState<Snapshot | null>(null)

  const isConfigured = !!webdavUrl
  const getClient = () => createWebDAVClient({ url: webdavUrl, username, password })

  const loadCounts = async () => {
    try {
      setLocalCount(await BookmarkService.getLocalCount())
      
      if (isConfigured) {
        setLoading(true) 
        const client = getClient()
        try {
            // First check legacy path, then new path
            // For Phase 5 we force new path
            const dir = 'BookmarkSyncer'
            const json = await client.getFile(`${dir}/bookmarks.json`)
            
            if (json) {
                // Determine if it's new CloudBackup or old array
                const data = JSON.parse(json)
                if (Array.isArray(data)) {
                     // Legacy
                     setCloudCount(BookmarkService.countBookmarks(data))
                     setCloudMeta(null)
                } else {
                     // New CloudBackup
                     const meta = (data as CloudBackup).metadata
                     setCloudCount(meta.totalCount)
                     setCloudMeta({ 
                       time: meta.timestamp, 
                       device: `${meta.browser} ${meta.browserVersion}`, 
                       count: meta.totalCount,
                       browser: meta.browser 
                     })

                }
            } else {
                setCloudCount(0)
                setCloudMeta(null)
            }
        } catch (e) {
            // silent fail
        } finally {
            setLoading(false)
        }
      } else {
        setLoading(false)
      }
    } catch (e) { setLoading(false) }
  }

  useEffect(() => { loadCounts(); loadSnapshots() }, [webdavUrl, lastSyncTime])

  // 加载本地快照列表
  const loadSnapshots = async () => {
    const list = await BackupService.getAllSnapshots()
    setSnapshots(list)
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
      // 先备份当前状态
      const currentTree = await BookmarkService.getTree()
      const currentCount = BookmarkService.countBookmarks(currentTree)
      await BackupService.createSnapshot(currentTree, currentCount, '恢复前自动备份')
      
      await BookmarkService.restoreFromBackup(pendingRestoreSnapshot.tree)
      
      setSyncStatus('success')
      setMsg('快照恢复成功')
      loadCounts()
      loadSnapshots()
    } catch (e) {
      setSyncStatus('error')
      setMsg('恢复失败')
    } finally {
      setPendingRestoreSnapshot(null)
    }
  }

  // 取消恢复
  const cancelRestore = () => {
    setPendingRestoreSnapshot(null)
    setConfirmDrawerOpen(false)
  }

  // --- 智能无感同步逻辑 ---
  
  // 获取 syncService 需要的配置
  const getSyncConfig = () => ({ url: webdavUrl, username, password })
  
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
                  device: `${result.cloudInfo.browser || ''} ${result.cloudInfo.browserVersion || ''}`.trim(),
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
              setTimeout(() => setMsg(''), 3000)
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
      setMsg('正在准备上传...')
      try {
          // UI 层负责创建快照（可选）
          // 由于上传不会覆盖本地数据，所以可以跳过快照
          
          setMsg('正在上传...')
          const result = await smartPush(getSyncConfig(), 'manual')
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(result.message)
              setDrawerOpen(false)
              loadCounts()
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
          setTimeout(() => { if(syncStatus !== 'error') setMsg('') }, 3000)
      }
  }

  const executePull = async (mode: 'overwrite' | 'merge') => {
      setSyncStatus('syncing') 
      setMsg('正在创建快照...')
      try {
          // UI 层负责在同步前创建快照
          const currentTree = await BookmarkService.getTree()
          const currentCount = BookmarkService.countBookmarks(currentTree)
          await BackupService.createSnapshot(currentTree, currentCount, '恢复前自动备份')
          
          setMsg(mode === 'overwrite' ? '覆盖恢复中...' : '正在增量合并...')
          const result = await smartPull(getSyncConfig(), 'manual', mode)
          
          if (result.success) {
              setSyncStatus('success')
              setMsg(result.message)
              setDrawerOpen(false)
              loadCounts()
              loadSnapshots()
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
          setSyncStatus('error')
          setMsg('恢复失败')
          toast.error('恢复失败', { description: (e as Error).message })
      } finally {
          setTimeout(() => { if(syncStatus !== 'error') setMsg('') }, 3000)
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

    {/* Drawer for Conflict / History */}
    <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={drawerMode === 'history' ? '本地快照' : '同步选项'}
    >
        {drawerMode === 'history' ? (
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
                                     await BackupService.deleteSnapshot(s.id)
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
            </div>
        ) : null}
    </Drawer>

    {/* 独立的确认恢复 Drawer */}
    <Drawer
        isOpen={confirmDrawerOpen}
        onClose={cancelRestore}
        title="确认恢复"
    >
        {pendingRestoreSnapshot && (
            <div className="space-y-4 pt-2">
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-400 dark:border-amber-500/20 p-4 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                        <h4 className="text-sm font-bold text-foreground mb-1">确定要恢复此快照吗？</h4>
                        <p className="text-xs text-foreground/80 leading-relaxed">
                            将恢复到 {new Date(pendingRestoreSnapshot.timestamp).toLocaleString()} 的状态<br/>
                            （{pendingRestoreSnapshot.count} 个书签）<br/>
                            这将覆盖当前所有书签。
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
                        onClick={confirmRestoreSnapshot}
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
