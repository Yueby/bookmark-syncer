import { motion } from 'framer-motion'
import { Cloud, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../infrastructure/utils/format'

interface TabNavProps {
  activeTab: 'sync' | 'settings'
  onTabChange: (tab: 'sync' | 'settings') => void
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const { theme, setTheme } = useTheme()

  // 循环切换主题
  const cycleTheme = () => {
    const order = ['dark', 'light', 'system'] as const
    const currentIndex = order.indexOf(theme)
    const nextIndex = (currentIndex + 1) % order.length
    setTheme(order[nextIndex])
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor

  return (
    <div className="flex items-center justify-between">
      {/* Tab 切换 */}
      <div className="flex bg-muted backdrop-blur-md p-1 rounded-full border border-border shadow-sm">
        <button
          onClick={() => onTabChange('sync')}
          className={cn(
            "relative px-4 py-2 rounded-full text-sm font-medium transition-colors z-10 flex items-center gap-2",
            activeTab === 'sync' ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {activeTab === 'sync' && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-indigo-600 rounded-full -z-10 shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <Cloud className="w-4 h-4" />
          同步
        </button>
        
        <button
          onClick={() => onTabChange('settings')}
          className={cn(
            "relative px-4 py-2 rounded-full text-sm font-medium transition-colors z-10 flex items-center gap-2",
            activeTab === 'settings' ? "text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {activeTab === 'settings' && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-indigo-600 rounded-full -z-10 shadow-[0_2px_8px_rgba(99,102,241,0.3)]"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
          <Settings className="w-4 h-4" />
          设置
        </button>
      </div>

      {/* 主题切换按钮 */}
      <button
        onClick={cycleTheme}
        className={cn(
          "p-2 rounded-full transition-all border shadow-sm",
          "bg-muted border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
        )}
        title={`当前: ${theme === 'dark' ? '暗色' : theme === 'light' ? '亮色' : '跟随系统'}`}
      >
        <ThemeIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
