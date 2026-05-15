import { useStore } from '@/store'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageSquare, FileText, Share2, Database,
  Puzzle, Settings, Zap, ChevronLeft, ChevronRight,
  Brain, LayoutDashboard,
} from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { id: 'dashboard', path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'chat',       path: '/chat',       icon: MessageSquare, label: 'Chat AI' },
  { id: 'notes',      path: '/notes',      icon: FileText,      label: 'Notes' },
  { id: 'graph',      path: '/graph',      icon: Share2,        label: 'Knowledge Graph' },
  { id: 'rag',        path: '/rag',        icon: Database,      label: 'RAG / Docs' },
  { id: 'routines',   path: '/routines',   icon: Zap,           label: 'Routines' },
  { id: 'extensions', path: '/extensions', icon: Puzzle,        label: 'Extensions' },
  { id: 'settings',   path: '/settings',   icon: Settings,      label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, setActivePage } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <aside
      className={clsx(
        'flex flex-col h-full bg-surface-100 border-r border-white/5 relative z-50',
        'transition-all duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] flex-shrink-0',
        sidebarOpen ? 'w-64' : 'w-20',
      )}
    >
      {/* Glow Effect Top */}
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-nexus-500/20 to-transparent" />

      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-8">
        <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-nexus-400 to-nexus-600 rounded-xl flex items-center justify-center shadow-glow-indigo rotate-3 hover:rotate-0 transition-transform duration-300">
          <Brain size={22} className="text-white" />
        </div>
        {sidebarOpen && (
          <span className="font-bold text-white text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
            NexusMind
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname.startsWith(item.path)
          return (
            <button
              key={item.id}
              onClick={() => {
                setActivePage(item.id)
                navigate(item.path)
              }}
              className={clsx(
                active ? 'nav-item-active' : 'nav-item',
                'w-full',
                !sidebarOpen && 'justify-center px-0',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon size={20} className={clsx('flex-shrink-0', active ? 'text-nexus-400' : 'group-hover:scale-110 transition-transform')} />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={clsx(
            'flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300',
            'hover:bg-white/5 text-slate-500 hover:text-white border border-transparent hover:border-white/5',
            !sidebarOpen && 'justify-center',
          )}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft size={18} />
              <span className="text-sm font-medium">Collapse Menu</span>
            </>
          ) : (
            <ChevronRight size={18} />
          )}
        </button>
      </div>

      {/* Version badge */}
      {sidebarOpen && (
        <div className="px-6 py-4">
          <div className="p-3 rounded-xl bg-gradient-to-br from-white/5 to-transparent border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">System Status</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
              <p className="text-xs text-slate-300 font-medium font-mono">v1.2.0-STABLE</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
