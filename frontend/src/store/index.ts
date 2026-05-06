import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Note {
  id: number
  title: string
  content: string
  content_html: string
  tags: string[]
  folder_id: number | null
  color: string | null
  is_pinned: boolean
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Folder {
  id: number
  name: string
  parent_id: number | null
  color: string | null
  icon: string | null
}

export interface Conversation {
  id: number
  title: string
  provider: string
  model: string
  system_prompt?: string
  messages?: Message[]
}

export interface Message {
  id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface AIProvider {
  name: string
  available: boolean
  models?: string[]
}

interface AppState {
  // Theme
  theme: 'dark' | 'light'
  setTheme: (t: 'dark' | 'light') => void

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
  activePage: string
  setActivePage: (p: string) => void

  // Notes
  notes: Note[]
  folders: Folder[]
  activeNoteId: number | null
  setNotes: (notes: Note[]) => void
  setFolders: (folders: Folder[]) => void
  setActiveNoteId: (id: number | null) => void
  addNote: (note: Note) => void
  updateNote: (id: number, data: Partial<Note>) => void
  deleteNote: (id: number) => void

  // Chat
  conversations: Conversation[]
  activeConversationId: number | null
  setConversations: (convs: Conversation[]) => void
  setActiveConversationId: (id: number | null) => void
  addConversation: (conv: Conversation) => void
  deleteConversation: (id: number) => void

  // AI Providers
  providers: AIProvider[]
  selectedProvider: string
  selectedModel: string
  setProviders: (providers: AIProvider[]) => void
  setSelectedProvider: (p: string) => void
  setSelectedModel: (m: string) => void

  // RAG
  ragEnabled: boolean
  ragCollection: string
  setRagEnabled: (v: boolean) => void
  setRagCollection: (c: string) => void
  useNotesContext: boolean
  useGraphContext: boolean
  setUseNotesContext: (v: boolean) => void
  setUseGraphContext: (v: boolean) => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      setTheme: (t) => set({ theme: t }),

      sidebarOpen: true,
      setSidebarOpen: (v) => set({ sidebarOpen: v }),
      activePage: 'chat',
      setActivePage: (p) => set({ activePage: p }),

      notes: [],
      folders: [],
      activeNoteId: null,
      setNotes: (notes) => set({ notes }),
      setFolders: (folders) => set({ folders }),
      setActiveNoteId: (id) => set({ activeNoteId: id }),
      addNote: (note) => set((s) => ({ notes: [note, ...s.notes] })),
      updateNote: (id, data) =>
        set((s) => ({
          notes: s.notes.map((n) => (n.id === id ? { ...n, ...data } : n)),
        })),
      deleteNote: (id) =>
        set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

      conversations: [],
      activeConversationId: null,
      setConversations: (convs) => set({ conversations: convs }),
      setActiveConversationId: (id) => set({ activeConversationId: id }),
      addConversation: (conv) =>
        set((s) => ({ conversations: [conv, ...s.conversations] })),
      deleteConversation: (id) =>
        set((s) => ({
          conversations: s.conversations.filter((c) => c.id !== id),
        })),

      providers: [],
      selectedProvider: 'ollama',
      selectedModel: 'llama3',
      setProviders: (providers) => set({ providers }),
      setSelectedProvider: (p) => set({ selectedProvider: p }),
      setSelectedModel: (m) => set({ selectedModel: m }),

      ragEnabled: false,
      ragCollection: 'nexusmind',
      setRagEnabled: (v) => set({ ragEnabled: v }),
      setRagCollection: (c) => set({ ragCollection: c }),
      useNotesContext: false,
      useGraphContext: false,
      setUseNotesContext: (v) => set({ useNotesContext: v }),
      setUseGraphContext: (v) => set({ useGraphContext: v }),
    }),
    {
      name: 'nexusmind-store',
      partialize: (state) => ({
        theme: state.theme,
        selectedProvider: state.selectedProvider,
        selectedModel: state.selectedModel,
        ragEnabled: state.ragEnabled,
        ragCollection: state.ragCollection,
        useNotesContext: state.useNotesContext,
        useGraphContext: state.useGraphContext,
        sidebarOpen: state.sidebarOpen,
      }),
    },
  ),
)
