import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useStore } from '@/store'
import Sidebar from '@/components/Layout/Sidebar'
import TopBar from '@/components/Layout/TopBar'
import ChatPage from '@/pages/Chat'
import NotesPage from '@/pages/Notes'
import GraphPage from '@/pages/Graph'
import RAGPage from '@/pages/RAG'
import RoutinesPage from '@/pages/Routines'
import ExtensionsPage from '@/pages/Extensions'
import SettingsPage from '@/pages/Settings'
import { clsx } from 'clsx'

const PAGE_TITLES: Record<string, string> = {
  chat: 'Chat AI',
  notes: 'Notes',
  graph: 'Knowledge Graph',
  rag: 'RAG / Documents',
  routines: 'AI Routines',
  extensions: 'Extensions',
  settings: 'Settings',
}

function AppContent() {
  const { theme } = useStore()
  const location = useLocation()
  const segment = location.pathname.replace(/^\//, '').split('/')[0] || 'chat'
  const title = PAGE_TITLES[segment] || 'NexusMind'

  return (
    <div className={clsx(theme === 'light' && 'light')}>
      <div className="flex h-screen overflow-hidden bg-[#0f1117]">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TopBar title={title} />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/chat" replace />} />
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
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1d2e',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.05)',
            fontSize: '13px',
          },
        }}
      />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}
