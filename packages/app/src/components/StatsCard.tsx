import { cn } from '../infrastructure/utils/format'

export function StatsCard({ label, count, loading, color }: { label: string, count: number, loading: boolean, color: 'indigo' | 'zinc' }) {
  return (
    <div className={cn(
        "relative overflow-hidden rounded-2xl p-4 transition-all border",
        color === 'indigo' 
            ? "bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]" 
            : "bg-secondary/50 border-border"
    )}>
      {/* 只有 indigo 卡片有微光装饰 */}
      {color === 'indigo' && (
        <div className="absolute top-0 right-0 p-3">
          <div className="w-16 h-16 rounded-full blur-xl bg-indigo-400/30" />
        </div>
      )}
      
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <div className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
        {loading ? (
            <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        ) : (
            <span>{count}</span>
        )}
      </div>
    </div>
  )
}
