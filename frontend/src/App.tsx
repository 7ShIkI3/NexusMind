import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useStore } from '@/store'
import Sidebar from '@/components/Layout/Sidebar'
import TopBar from '@/components/Layout/TopBar'
import ChatPage from '@/pages/Chat'
import DashboardPage from '@/pages/CognitiveDashboard'
import NotesPage from '@/pages/Notes'
import GraphPage from '@/pages/Graph'
import RAGPage from '@/pages/RAG'
import RoutinesPage from '@/pages/Routines'
import ExtensionsPage from '@/pages/Extensions'
import SettingsPage from '@/pages/Settings'
import { clsx } from 'clsx'

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  chat: 'Intelligence',
  notes: 'Knowledge Base',
  graph: 'Cognitive Map',
  rag: 'Document Neural',
  routines: 'Automations',
  extensions: 'Plugins',
  settings: 'Configuration',
}

export default function App() {
  const { theme } = useStore()

  return (
    <div className={clsx(theme === 'light' && 'light', 'selection:bg-nexus-500/30')}>
      <BrowserRouter>
        <AppLayout />
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: 'glass-card !border-white/5 !text-slate-200 !bg-surface-100/80 !backdrop-blur-xl',
            style: {
              borderRadius: '12px',
              fontSize: '13px',
            },
          }}
        />
      </BrowserRouter>
    </div>
  )
}

function AppLayout() {
  const location = useLocation()
  const page = location.pathname.split('/')[1] || 'chat'

  return (
    <div className="flex h-screen overflow-hidden bg-surface-300 text-slate-200 font-sans">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 relative bg-surface-300">
        {/* Background blobs for depth */}
        <div className="absolute top-[-10%] -right-[10%] w-[40%] h-[40%] bg-nexus-600/10 rounded-full blur-[120px] pointer-events-none z-0" />
        <div className="absolute bottom-[-10%] -left-[10%] w-[40%] h-[40%] bg-accent-violet/5 rounded-full blur-[120px] pointer-events-none z-0" />
        
        <TopBar title={PAGE_TITLES[page] || 'NexusMind'} />
        
        <main className="flex-1 overflow-hidden relative z-10">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/rag" element={<RAGPage />} />
            <Route path="/routines" element={<RoutinesPage />} />
            <Route path="/extensions" element={<ExtensionsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
