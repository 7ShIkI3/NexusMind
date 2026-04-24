import { useStore } from '@/store'
import { Moon, Sun, Wifi, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '@/utils/api'

export default function TopBar({ title }: { title?: string }) {
  const { theme, setTheme } = useStore()
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    const check = async () => {
      try {
        await api.get('/health')
        setOnline(true)
      } catch {
        setOnline(false)
      }
    }
    check()
    const t = setInterval(check, 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-white/5 bg-[#13162a]/50 backdrop-blur-sm flex-shrink-0">
      <h1 className="text-sm font-semibold text-gray-200">{title || 'NexusMind'}</h1>

      <div className="flex items-center gap-2">
        {/* Backend status */}
        <div
          className="flex items-center gap-1.5 text-xs"
          title={online === null ? 'Checking...' : online ? 'Backend connected' : 'Backend offline'}
        >
          {online === true && <Wifi size={14} className="text-green-400" />}
          {online === false && <WifiOff size={14} className="text-red-400" />}
          {online === null && <Wifi size={14} className="text-gray-500 animate-pulse" />}
          <span className={online ? 'text-green-400' : online === false ? 'text-red-400' : 'text-gray-500'}>
            {online === true ? 'Connected' : online === false ? 'Offline' : '...'}
          </span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="btn-ghost p-2"
          title="Toggle theme"
        >
          {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      </div>
    </header>
  )
}
