import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LayoutWrapper } from './components/LayoutWrapper'
import { SettingsView } from './components/SettingsView'
import { SyncView } from './components/SyncView'
import { TabNav } from './components/TabNav'
import { Toaster } from './components/Toaster'

function App() {
  const [activeTab, setActiveTab] = useState<'sync' | 'settings'>('sync')

  return (
    <ErrorBoundary>
    <LayoutWrapper>
      {/* Top Nav */}
      <div className="pt-6 pb-2 px-4 z-20">
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden px-4">
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: activeTab === 'sync' ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: activeTab === 'sync' ? 20 : -20 }}
                transition={{ duration: 0.2 }}
                className="h-full"
            >
                {activeTab === 'sync' ? <SyncView /> : <SettingsView />}
            </motion.div>
        </AnimatePresence>
      </div>

      {/* Toast Notifications */}
      <Toaster position="bottom-center" duration={2000} />
    </LayoutWrapper>
    </ErrorBoundary>
  )
}

export { App }
