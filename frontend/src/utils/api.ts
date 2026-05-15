import axios from 'axios'

const BASE = import.meta.env.VITE_API_URL || '/api/v1'

export const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
})

// --- Chat ---
export const chatApi = {
  send: (data: any) => api.post('chat/', data),
  listConversations: () => api.get('chat/conversations'),
  getConversation: (id: number) => api.get(`chat/conversations/${id}`),
  createConversation: (data: any) => api.post('chat/conversations', data),
  updateConversation: (id: number, data: any) => api.put(`chat/conversations/${id}`, data),
  deleteConversation: (id: number) => api.delete(`chat/conversations/${id}`),
  listProviders: () => api.get('chat/providers'),
  listModels: (provider: string) => api.get(`chat/models/${provider}`),
}

// --- Notes ---
export const notesApi = {
  list: (params?: any) => api.get('notes/', { params }),
  create: (data: any) => api.post('notes/', data),
  get: (id: number) => api.get(`notes/${id}`),
  update: (id: number, data: any) => api.put(`notes/${id}`, data),
  delete: (id: number) => api.delete(`notes/${id}`),
  listFolders: () => api.get('notes/folders/all'),
  createFolder: (data: any) => api.post('notes/folders/', data),
  deleteFolder: (id: number) => api.delete(`notes/folders/${id}`),
}

// --- Graph ---
export const graphApi = {
  getAll: () => api.get('graph/'),
  addNode: (data: any) => api.post('graph/nodes', data),
  updateNode: (id: string, data: any) => api.put(`graph/nodes/${id}`, data),
  deleteNode: (id: string) => api.delete(`graph/nodes/${id}`),
  addEdge: (data: any) => api.post('graph/edges', data),
  deleteEdge: (id: string) => api.delete(`graph/edges/${id}`),
  getNeighbors: (id: string, depth?: number) =>
    api.get(`graph/neighbors/${id}`, { params: { depth } }),
  search: (q: string) => api.get('graph/search', { params: { q } }),
  extractEntities: (data: any) => api.post('graph/extract-entities', data),
}

// --- RAG ---
export const ragApi = {
  getStats: (collection?: string) =>
    api.get('rag/stats', { params: { collection } }),
  listCollections: () => api.get('rag/collections'),
  createCollection: (name: string) => api.post(`rag/collections/${name}`),
  deleteCollection: (name: string) => api.delete(`rag/collections/${name}`),
  query: (data: any) => api.post('rag/query', data),
  ingest: (data: any) => api.post('rag/ingest', data),
  ingestFile: (formData: FormData) =>
    api.post('rag/ingest/file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteDocument: (docId: string, collection?: string) =>
    api.delete(`rag/documents/${docId}`, { params: { collection } }),
  listDocuments: (params?: any) => api.get('rag/documents', { params }),
  deleteDocuments: (params?: any) => api.delete('rag/documents', { params }),
}

// --- Extensions ---
export const extensionsApi = {
  list: () => api.get('extensions/'),
  toggle: (slug: string) => api.post(`extensions/${slug}/toggle`),
  updateConfig: (slug: string, data: any) =>
    api.put(`extensions/${slug}/config`, data),
  uninstall: (slug: string) => api.delete(`extensions/${slug}`),
}

// --- Dashboard ---
export const dashboardApi = {
  getOverview: () => api.get('dashboard/overview'),
}

// --- Routines ---
export const routinesApi = {
  list: () => api.get('routines/'),
  create: (data: any) => api.post('routines/', data),
  update: (id: number, data: any) => api.put(`routines/${id}`, data),
  delete: (id: number) => api.delete(`routines/${id}`),
  run: (id: number) => api.post(`routines/${id}/run`),
  listTypes: () => api.get('routines/types'),
  listJobs: () => api.get('routines/scheduler/jobs'),
}

// --- AI Providers ---
export const aiApi = {
  listProviders: () => api.get('ai/providers'),
  getModels: (provider: string) => api.get(`ai/providers/${provider}/models`),
  getConfig: () => api.get('ai/config'),
  updateConfig: (data: any) => api.put('ai/config', data),
  testProvider: (provider: string) => api.post(`ai/test/${provider}`),
}

// Streaming helper
export function streamChat(
  data: any,
  onChunk: (chunk: string) => void,
  onDone: (messageId: number) => void,
  onError: (error: string) => void,
  onToolAction?: (action: { type: 'start' | 'result'; name: string; id?: string; result?: any }) => void,
) {
  const url = `${BASE}${BASE.endsWith('/') ? '' : '/'}chat/`
  const controller = new AbortController()

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, stream: true }),
    signal: controller.signal,
  }).then(async (resp) => {
    if (!resp.ok) {
      const fallback = `Chat request failed (${resp.status})`
      try {
        const payload = await resp.json()
        const detail = payload?.detail || payload?.error || payload?.message
        onError(detail ? String(detail) : fallback)
      } catch {
        const text = await resp.text().catch(() => '')
        onError(text.trim() || fallback)
      }
      return
    }

    const reader = resp.body?.getReader()
    if (!reader) {
      onError('Streaming response is unavailable')
      return
    }
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const lines = text.split('\n').filter((l) => l.startsWith('data: '))
      for (const line of lines) {
        try {
          const payload = JSON.parse(line.slice(6))
          if (payload.type === 'chunk') onChunk(payload.content)
          else if (payload.type === 'done') onDone(payload.message_id)
          else if (payload.type === 'error') {
            const errorMsg = typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error)
            onError(errorMsg)
          }
          else if (payload.type === 'tool_start') onToolAction?.({ type: 'start', name: payload.name, id: payload.id })
          else if (payload.type === 'tool_result') onToolAction?.({ type: 'result', name: payload.name, result: payload.result })
        } catch (parseErr) {
          console.debug('[streamChat] Failed to parse SSE line:', line, parseErr)
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      const errorMsg = typeof err === 'string' ? err : err?.message || 'Unknown streaming error'
      onError(errorMsg)
    }
  })

  return () => controller.abort()
}
