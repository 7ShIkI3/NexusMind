import { useEffect, useState } from 'react'
import { ragApi } from '@/utils/api'
import { Upload, Database, Search, Trash2, Plus, Loader2, FileText, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

export default function RAGPage() {
  const [stats, setStats] = useState<any>(null)
  const [collections, setCollections] = useState<string[]>([])
  const [activeCollection, setActiveCollection] = useState('nexusmind')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [newCollectionName, setNewCollectionName] = useState('')
  const [docIds, setDocIds] = useState<string[]>([])
  const [loadingDocs, setLoadingDocs] = useState(false)

  useEffect(() => {
    loadData()
  }, [activeCollection])

  async function loadData() {
    try {
      const [statsRes, collRes] = await Promise.all([
        ragApi.getStats(activeCollection),
        ragApi.listCollections(),
      ])
      setStats(statsRes.data)
      setCollections(collRes.data.collections || [])
    } catch {}
    loadDocIds()
  }

  async function loadDocIds() {
    setLoadingDocs(true)
    try {
      const { data } = await ragApi.listDocIds(activeCollection)
      setDocIds(data.doc_ids || [])
    } catch {} finally { setLoadingDocs(false) }
  }

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const { data } = await ragApi.query({ query, top_k: 10, collection: activeCollection })
      setResults(data.results || [])
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function ingestText() {
    if (!textInput.trim()) return
    try {
      await ragApi.ingest({ text: textInput, collection: activeCollection })
      setTextInput('')
      toast.success('Text ingested successfully')
      loadData()
    } catch {
      toast.error('Ingestion failed')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('collection', activeCollection)
      const { data } = await ragApi.ingestFile(form)
      toast.success(`Ingested: ${data.chunks_count} chunks`)
      loadData()
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function createCollection() {
    if (!newCollectionName.trim()) return
    try {
      await ragApi.createCollection(newCollectionName)
      setCollections([...collections, newCollectionName])
      setNewCollectionName('')
      toast.success('Collection created')
    } catch {
      toast.error('Failed to create collection')
    }
  }

  async function deleteCollection(name: string) {
    if (name === 'nexusmind') return toast.error('Cannot delete default collection')
    if (!confirm(`Delete collection "${name}"?`)) return
    try {
      await ragApi.deleteCollection(name)
      setCollections(collections.filter((c) => c !== name))
      if (activeCollection === name) setActiveCollection('nexusmind')
      toast.success('Collection deleted')
    } catch {}
  }

  async function deleteDocument(docId: string) {
    try {
      await ragApi.deleteDocument(docId, activeCollection)
      setDocIds(docIds.filter((d) => d !== docId))
      toast.success('Document deleted')
      loadData()
    } catch { toast.error('Delete failed') }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Collections */}
      <div className="w-56 flex-shrink-0 border-r border-white/5 bg-[#111425] flex flex-col">
        <div className="p-3 border-b border-white/5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Collections</h2>
          <div className="flex gap-1">
            <input
              className="input text-xs py-1 flex-1"
              value={newCollectionName}
              onChange={(e) => setNewCollectionName(e.target.value)}
              placeholder="New collection…"
              onKeyDown={(e) => e.key === 'Enter' && createCollection()}
            />
            <button onClick={createCollection} className="btn-primary px-2 py-1">
              <Plus size={12} />
            </button>
          </div>
        </div>
        <div className="flex-1 p-2 space-y-1 overflow-y-auto">
          {collections.map((c) => (
            <div
              key={c}
              className={`group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-all ${
                activeCollection === c
                  ? 'bg-nexus-500/20 text-nexus-300'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
              onClick={() => setActiveCollection(c)}
            >
              <div className="flex items-center gap-2 truncate">
                <Database size={13} />
                <span className="truncate">{c}</span>
              </div>
              {c !== 'nexusmind' && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCollection(c) }}
                  className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden p-6 space-y-6 overflow-y-auto">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="Collection" value={stats.collection} />
            <StatCard label="Document Chunks" value={stats.document_chunks?.toString() || '0'} />
            <StatCard label="Status" value={stats.available ? '✓ Available' : '✗ Offline'} />
          </div>
        )}

        {/* Ingest */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Upload size={16} className="text-nexus-400" /> Ingest Content
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Text */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Paste Text</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste text to add to the knowledge base…"
                className="input resize-none h-32 text-sm"
              />
              <button onClick={ingestText} disabled={!textInput.trim()} className="btn-primary mt-2 text-sm">
                <Plus size={14} /> Ingest Text
              </button>
            </div>
            {/* File */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Upload File</label>
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-white/10 rounded-lg cursor-pointer hover:border-nexus-500/50 transition-colors">
                <input type="file" className="hidden" onChange={handleFileUpload}
                  accept=".txt,.md,.pdf,.json,.csv" />
                {uploading ? (
                  <Loader2 size={24} className="text-nexus-400 animate-spin" />
                ) : (
                  <>
                    <FileText size={24} className="text-gray-600 mb-2" />
                    <span className="text-xs text-gray-500">Click to upload</span>
                    <span className="text-[10px] text-gray-700 mt-1">TXT, MD, PDF, JSON, CSV</span>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>

        {/* Documents */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <FileText size={16} className="text-nexus-400" /> Documents ({docIds.length})
            </h2>
            <button onClick={loadDocIds} className="btn-ghost text-xs py-1">
              <RefreshCw size={12} className={loadingDocs ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {loadingDocs ? (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="text-nexus-400 animate-spin" />
            </div>
          ) : docIds.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No documents yet — ingest some content above</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {docIds.map((docId) => (
                <div key={docId} className="flex items-center justify-between bg-[#0f1117] rounded-lg px-3 py-2 border border-white/5">
                  <span className="text-xs text-gray-300 font-mono truncate flex-1 mr-3">{docId}</span>
                  <button
                    onClick={() => deleteDocument(docId)}
                    className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Delete document"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="card p-5">
          <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Search size={16} className="text-nexus-400" /> Semantic Search
          </h2>
          <div className="flex gap-2 mb-4">
            <input
              className="input flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Search your knowledge base…"
            />
            <button onClick={search} disabled={searching || !query.trim()} className="btn-primary">
              {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            </button>
          </div>

          {results.length > 0 && (
            <div className="space-y-3">
              {results.map((r, i) => (
                <div key={i} className="bg-[#0f1117] rounded-lg p-4 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-nexus-400">
                      Match #{i + 1}
                    </span>
                    <span className="badge bg-green-500/10 text-green-400">
                      Score: {(r.score * 100).toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed">{r.text}</p>
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {Object.entries(r.metadata)
                        .filter(([k]) => ['title', 'filename', 'type', 'doc_id'].includes(k))
                        .map(([k, v]) => (
                          <span key={k} className="badge bg-white/5 text-gray-500 text-[10px]">
                            {k}: {String(v)}
                          </span>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && query && !searching && (
            <p className="text-sm text-gray-600 text-center py-4">No results found</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  )
}
