import { useStore } from '@/store'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  MessageSquare, FileText, Share2, Database,
  Puzzle, Settings, Zap, ChevronLeft, ChevronRight,
  Brain, Folder, Plus,
} from 'lucide-react'
import { clsx } from 'clsx'

const navItems = [
  { id: 'chat',       path: '/chat',       icon: MessageSquare, label: 'Chat AI' },
  { id: 'notes',      path: '/notes',      icon: FileText,      label: 'Notes' },
  { id: 'graph',      path: '/graph',      icon: Share2,        label: 'Knowledge Graph' },
  { id: 'rag',        path: '/rag',        icon: Database,      label: 'RAG / Docs' },
  { id: 'routines',   path: '/routines',   icon: Zap,           label: 'Routines' },
  { id: 'extensions', path: '/extensions', icon: Puzzle,        label: 'Extensions' },
  { id: 'settings',   path: '/settings',   icon: Settings,      label: 'Settings' },
]

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useStore()
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <aside
      className={clsx(
        'flex flex-col h-full bg-[#13162a] border-r border-white/5',
        'transition-all duration-300 flex-shrink-0',
        sidebarOpen ? 'w-56' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5">
        <div className="flex-shrink-0 w-8 h-8 bg-nexus-500 rounded-lg flex items-center justify-center">
          <Brain size={18} className="text-white" />
        </div>
        {sidebarOpen && (
          <span className="font-bold text-white text-lg tracking-tight">
            NexusMind
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = location.pathname.startsWith(item.path)
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.path)}
              className={clsx(
                'nav-item w-full',
                active && 'active',
                !sidebarOpen && 'justify-center px-2',
              )}
              title={!sidebarOpen ? item.label : undefined}
            >
              <Icon size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 pb-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={clsx(
            'btn-ghost w-full',
            !sidebarOpen && 'justify-center px-2',
          )}
        >
          {sidebarOpen ? (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          ) : (
            <ChevronRight size={16} />
          )}
        </button>
      </div>
    </aside>
  )
}
