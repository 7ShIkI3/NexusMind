import { useStore } from '@/store'
import { Moon, Sun, Wifi, WifiOff, Bell, User, Activity } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/utils/api'
import { clsx } from 'clsx'

export default function TopBar({ title }: { title?: string }) {
  const { theme, setTheme } = useStore()
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        await api.get('health')
        setOnline(true)
      } catch (err) {
        setOnline(false)
      }
    }
    check()
    const t = setInterval(check, 10_000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-white/5 bg-surface-300/80 backdrop-blur-md flex-shrink-0 z-[60] relative shadow-lg">
      <div className="flex items-center gap-4">
        <h1 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
          <span className="text-slate-500 font-normal">/</span> {title || 'NexusMind'}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Backend status */}
        <div
          className={clsx(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all duration-500",
            online === true ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
            online === false ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
            'bg-nexus-500/10 text-nexus-400 border-nexus-500/20 animate-pulse'
          )}
        >
          {online === true ? <Wifi size={12} /> : online === false ? <WifiOff size={12} /> : <Activity size={12} />}
          <span className="uppercase tracking-wider">
            {online === true ? 'Core Active' : online === false ? 'Core Offline' : 'Synchronizing...'}
          </span>
        </div>

        <div className="w-px h-6 bg-white/5 mx-1" />

        {/* Action buttons */}
        <button className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5" title="Notifications">
          <Bell size={18} />
        </button>

        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <div className="w-px h-6 bg-white/5 mx-1" />

        <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 transition-all group">
          <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">Admin</span>
          <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-nexus-500 to-accent-violet flex items-center justify-center text-white shadow-glow-indigo">
            <User size={14} />
          </div>
        </button>
      </div>
    </header>
  )
}
