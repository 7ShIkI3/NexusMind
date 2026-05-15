import { useEffect, useState } from 'react'
import { ragApi } from '@/utils/api'
import { 
  Upload, Database, Search, Trash2, Plus, Loader2, FileText, 
  RefreshCw, BarChart3, Globe, ShieldCheck, Cpu, Layers, HardDrive
} from 'lucide-react'
import { clsx } from 'clsx'
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
  const [documents, setDocuments] = useState<any[]>([])
  const [docSourceFilter, setDocSourceFilter] = useState('')
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
      await loadDocuments()
    } catch {}
  }

  async function loadDocuments(source?: string) {
    setLoadingDocs(true)
    try {
      const { data } = await ragApi.listDocuments({
        collection: activeCollection,
        source: source || undefined,
      })
      setDocuments(data.documents || [])
    } catch {
      setDocuments([])
    } finally {
      setLoadingDocs(false)
    }
  }

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      const { data } = await ragApi.query({ query, top_k: 10, collection: activeCollection })
      setResults(data.results || [])
    } catch {
      toast.error('Neural retrieval failed')
    } finally {
      setSearching(false)
    }
  }

  async function ingestText() {
    if (!textInput.trim()) return
    try {
      await ragApi.ingest({ text: textInput, collection: activeCollection })
      setTextInput('')
      toast.success('Cognitive data ingested')
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
      toast.success(`Synchronized ${data.chunks_count} neural chunks`)
      loadData()
    } catch {
      toast.error('Transmission failed')
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
      toast.success('Neural sector created')
    } catch {
      toast.error('Failed to create sector')
    }
  }

  async function deleteCollection(name: string) {
    if (name === 'nexusmind') return toast.error('Cannot purge core sector')
    try {
      await ragApi.deleteCollection(name)
      setCollections(collections.filter((c) => c !== name))
      if (activeCollection === name) setActiveCollection('nexusmind')
      toast.success('Sector purged')
    } catch {}
  }

  async function deleteDocument(docId: string) {
    try {
      await ragApi.deleteDocument(docId, activeCollection)
      toast.success('Sequence deleted')
      loadData()
    } catch {
      toast.error('Purge failed')
    }
  }

  async function deleteBySource(source: string) {
    try {
      const { data } = await ragApi.deleteDocuments({
        collection: activeCollection,
        source,
      })
      toast.success(`Deleted ${data.deleted_chunks || 0} chunks`)
      setDocSourceFilter('')
      loadData()
    } catch {
      toast.error('Bulk purge failed')
    }
  }

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl page-enter relative">
      {/* Sidebar: Sectors */}
      <div className="w-80 flex-shrink-0 border-r border-white/5 bg-surface-100/40 backdrop-blur-2xl flex flex-col relative z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-nexus-500/20 to-transparent" />
        
        <div className="p-8 border-b border-white/5">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-2">
            <Layers size={14} className="text-nexus-400" /> Neural Sectors
          </h2>
          <div className="relative group">
            <div className="absolute -inset-1 bg-nexus-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
            <div className="relative">
              <input
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-xs focus:outline-none focus:border-nexus-500/50 transition-all placeholder:text-slate-600 font-medium text-white shadow-inner"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="Initialize sector..."
                onKeyDown={(e) => e.key === 'Enter' && createCollection()}
              />
              <button onClick={createCollection} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-nexus-400 hover:text-white transition-all hover:scale-110 active:scale-90">
                <Plus size={18} />
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
          {collections.map((c) => (
            <div
              key={c}
              className={clsx(
                'group flex items-center justify-between px-5 py-4 rounded-2xl cursor-pointer transition-all duration-500 border relative overflow-hidden',
                activeCollection === c
                  ? 'bg-nexus-500/10 text-white border-nexus-500/20 shadow-glow-indigo'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border-transparent'
              )}
              onClick={() => setActiveCollection(c)}
            >
              {activeCollection === c && (
                <div className="absolute left-0 top-0 w-1 h-full bg-nexus-500 shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
              )}
              <div className="flex items-center gap-4 truncate">
                <Database size={16} className={clsx("transition-colors duration-500", activeCollection === c ? 'text-nexus-400' : 'text-slate-600 group-hover:text-slate-400')} />
                <span className="text-sm font-bold tracking-tight truncate">{c}</span>
              </div>
              {c !== 'nexusmind' && (
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCollection(c) }}
                  className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1.5 hover:scale-110"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-nexus-500/10 flex items-center justify-center text-nexus-400 border border-nexus-500/20">
              <Cpu size={20} className="animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">RAG Engine</p>
              <p className="text-xs font-bold text-slate-300">v2.4 Neural-Link</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface-200/40 overflow-y-auto custom-scrollbar relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-nexus-500/5 to-transparent pointer-events-none" />
        
        <div className="p-8 md:p-12 space-y-12 max-w-7xl mx-auto w-full relative z-10">
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <StatCard 
              icon={<Globe size={24} />} 
              label="Active Sector" 
              value={stats?.collection || activeCollection} 
              color="text-nexus-400"
              glow="shadow-glow-indigo"
            />
            <StatCard 
              icon={<BarChart3 size={24} />} 
              label="Neural Chunks" 
              value={stats?.document_chunks?.toLocaleString() || '0'} 
              color="text-accent-violet"
              glow="shadow-glow-violet"
            />
            <StatCard 
              icon={<ShieldCheck size={24} />} 
              label="System Status" 
              value={stats?.available ? 'Operational' : 'Syncing...'} 
              color={stats?.available ? 'text-emerald-400' : 'text-amber-400'}
              glow={stats?.available ? 'shadow-glow-emerald' : 'shadow-glow-amber'}
            />
          </div>

          {/* Ingestion & Upload */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            <div className="glass-panel p-10 rounded-[3rem] border border-white/5 shadow-2xl bg-white/5 relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-nexus-500/5 rounded-full blur-3xl group-hover:bg-nexus-500/10 transition-colors duration-700" />
              
              <h3 className="text-xl font-bold text-white flex items-center gap-4 mb-8">
                <div className="p-3 rounded-2xl bg-nexus-500/10 text-nexus-400 shadow-glow-indigo">
                  <Plus size={24} />
                </div>
                Sequence Injection
              </h3>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste raw sequence data here for neural indexing..."
                className="w-full bg-surface-300/50 border border-white/10 rounded-[2.5rem] p-8 text-sm focus:outline-none focus:border-nexus-500/40 min-h-[220px] transition-all placeholder:text-slate-600 resize-none text-slate-200 shadow-inner"
              />
              <button 
                onClick={ingestText} 
                disabled={!textInput.trim()} 
                className="btn-primary w-full py-5 rounded-2xl shadow-glow-indigo active:scale-[0.98] disabled:opacity-30 disabled:grayscale transition-all font-bold tracking-[0.2em] text-xs uppercase mt-4"
              >
                Inject Neural Sequence
              </button>
            </div>

            <div className="glass-panel p-10 rounded-[3rem] border border-white/5 shadow-2xl bg-white/5 relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-accent-violet/5 rounded-full blur-3xl group-hover:bg-accent-violet/10 transition-colors duration-700" />
              
              <h3 className="text-xl font-bold text-white flex items-center gap-4 mb-8">
                <div className="p-3 rounded-2xl bg-accent-violet/10 text-accent-violet shadow-glow-violet">
                  <Upload size={24} />
                </div>
                Mass Transmission
              </h3>
              <label className="flex flex-col items-center justify-center min-h-[220px] border-2 border-dashed border-white/10 rounded-[2.5rem] cursor-pointer hover:border-nexus-500/40 hover:bg-nexus-500/5 transition-all group/upload shadow-inner">
                <input type="file" className="hidden" onChange={handleFileUpload} accept=".txt,.md,.pdf,.json,.csv" />
                {uploading ? (
                  <div className="flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="absolute inset-0 bg-nexus-500/20 blur-xl rounded-full animate-pulse" />
                      <Loader2 size={48} className="text-nexus-400 animate-spin relative z-10" />
                    </div>
                    <span className="text-[11px] font-mono text-nexus-400 animate-pulse uppercase tracking-[0.4em] font-bold">TRANSMITTING...</span>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover/upload:scale-110 group-hover/upload:text-nexus-400 transition-all duration-500 text-slate-600">
                      <FileText size={40} />
                    </div>
                    <span className="text-base font-bold text-slate-300 group-hover/upload:text-white transition-colors">Select Data Package</span>
                    <span className="text-[10px] text-slate-600 mt-2 uppercase tracking-[0.3em] font-bold">PDF, MD, TXT, JSON, CSV</span>
                  </>
                )}
              </label>
              <div className="mt-8 p-6 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-white/5 text-slate-500">
                  <HardDrive size={16} />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed font-bold uppercase tracking-widest">
                  Automatic neural chunking and vector embedding will be applied upon transmission. Max payload: 50MB.
                </p>
              </div>
            </div>
          </div>

          {/* Search */}
          <div className="glass-panel p-10 md:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl bg-white/5 relative overflow-hidden">
            <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-[100px]" />
            
            <div className="flex items-center justify-between mb-10 relative">
              <h3 className="text-2xl font-bold text-white flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 shadow-glow-emerald">
                  <Search size={24} />
                </div>
                Semantic Retrieval
              </h3>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Neural Link Active</span>
              </div>
            </div>
            
            <div className="flex gap-4 relative">
              <div className="flex-1 relative group">
                <div className="absolute -inset-1 bg-nexus-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
                <input
                  className="relative w-full bg-surface-300/50 border border-white/10 rounded-2xl px-8 py-5 text-base focus:outline-none focus:border-nexus-500/50 transition-all placeholder:text-slate-600 text-white font-medium shadow-inner"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && search()}
                  placeholder="Query the collective knowledge base..."
                />
              </div>
              <button 
                onClick={search} 
                disabled={searching || !query.trim()} 
                className="px-10 bg-nexus-600 text-white rounded-2xl hover:bg-nexus-500 transition-all shadow-glow-indigo active:scale-[0.95] disabled:opacity-30 disabled:grayscale font-bold uppercase tracking-widest text-xs"
              >
                {searching ? <Loader2 size={24} className="animate-spin" /> : <Search size={24} />}
              </button>
            </div>

            {results.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {results.map((r, i) => (
                  <div key={i} className="glass-panel p-8 !rounded-[2.5rem] border-white/5 hover:border-nexus-500/30 transition-all group bg-white/5 shadow-xl hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-6">
                      <span className="text-[10px] font-bold text-nexus-400 uppercase tracking-[0.2em] bg-nexus-500/10 px-3 py-1.5 rounded-lg border border-nexus-500/10 shadow-glow-indigo">
                        SEQUENCE MATCH #{i + 1}
                      </span>
                      <div className="flex items-center gap-2 text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/10 font-mono text-[11px] font-bold">
                        {(r.score * 100).toFixed(1)}% RELEVANCY
                      </div>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed line-clamp-5 group-hover:line-clamp-none transition-all duration-500 cursor-pointer font-medium">
                      {r.text}
                    </p>
                    {r.metadata && Object.keys(r.metadata).length > 0 && (
                      <div className="mt-6 pt-6 border-t border-white/5 flex gap-3 flex-wrap">
                        {Object.entries(r.metadata)
                          .filter(([k]) => ['title', 'filename', 'source'].includes(k))
                          .map(([k, v]) => (
                            <span key={k} className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                              {k}: <span className="text-slate-300">{String(v)}</span>
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Document Management */}
          <div className="glass-panel p-10 md:p-12 rounded-[3.5rem] border border-white/5 shadow-2xl bg-white/5">
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-2xl font-bold text-white flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 shadow-glow-amber">
                  <FileText size={24} />
                </div>
                Knowledge Registry
              </h3>
              <button onClick={() => loadDocuments(docSourceFilter)} className="p-3 rounded-xl hover:bg-white/10 text-slate-500 hover:text-white transition-all active:rotate-180 duration-500">
                <RefreshCw size={22} />
              </button>
            </div>

            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-10">
              <div className="relative w-full md:w-auto">
                <select
                  className="w-full md:w-auto bg-surface-300/50 border border-white/10 rounded-2xl px-6 py-4 text-sm text-slate-200 focus:outline-none focus:border-nexus-500/40 min-w-[280px] appearance-none cursor-pointer font-bold uppercase tracking-widest shadow-inner"
                  value={docSourceFilter}
                  onChange={(e) => {
                    const next = e.target.value
                    setDocSourceFilter(next)
                    loadDocuments(next)
                  }}
                >
                  <option value="" className="bg-surface-100">ALL SYNC SOURCES</option>
                  {[...new Set(documents.map((d) => d.source).filter(Boolean))].map((source) => (
                    <option key={source} value={source} className="bg-surface-100">{String(source).toUpperCase()}</option>
                  ))}
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <RefreshCw size={16} />
                </div>
              </div>
              
              {docSourceFilter && (
                <button 
                  onClick={() => deleteBySource(docSourceFilter)} 
                  className="flex items-center gap-3 text-xs font-bold text-red-400 hover:text-red-300 transition-all uppercase tracking-[0.2em] bg-red-500/10 px-6 py-4 rounded-2xl border border-red-500/10 hover:bg-red-500/20 active:scale-95"
                >
                  <Trash2 size={18} /> Purge Source
                </button>
              )}
            </div>

            {loadingDocs ? (
              <div className="flex flex-col items-center justify-center py-24 gap-6">
                <div className="relative">
                  <div className="absolute inset-0 bg-nexus-500/20 blur-xl rounded-full animate-pulse" />
                  <Loader2 size={48} className="text-nexus-400 animate-spin relative z-10" />
                </div>
                <p className="text-xs font-mono text-slate-600 uppercase tracking-[0.4em] font-bold">Reading Neural Registry...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="py-24 text-center glass-panel rounded-[2.5rem] bg-white/5 border border-white/5">
                <FileText size={48} className="mx-auto text-slate-700 mb-6 opacity-50" />
                <p className="text-base text-slate-500 font-bold uppercase tracking-widest">No indexed sequences found in this sector.</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar">
                {documents.map((doc) => (
                  <div key={doc.doc_id} className="group flex items-center gap-6 p-6 rounded-[2rem] bg-white/5 border border-white/5 hover:border-nexus-500/20 transition-all hover:bg-white/[0.07] relative overflow-hidden">
                    <div className="absolute left-0 top-0 w-1 h-full bg-slate-800 group-hover:bg-nexus-500 transition-colors" />
                    
                    <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-500 group-hover:text-nexus-400 group-hover:scale-110 transition-all duration-500 border border-white/5 flex-shrink-0">
                      <FileText size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-slate-200 truncate group-hover:text-white transition-colors tracking-tight">
                        {doc.title || doc.filename || doc.doc_id}
                      </p>
                      <div className="flex items-center gap-4 mt-2">
                        <span className="text-[10px] font-mono text-slate-600 truncate max-w-[160px] bg-black/20 px-2 py-0.5 rounded border border-white/5">ID: {doc.doc_id}</span>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                        <span className="text-[11px] font-bold text-nexus-500 uppercase tracking-widest">{doc.chunks} Neural Chunks</span>
                        {doc.source && (
                          <>
                            <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                            <span className="text-[11px] font-bold text-slate-500 truncate italic uppercase tracking-widest">Source: {doc.source}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteDocument(doc.doc_id)} 
                      className="p-4 rounded-2xl text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20 active:scale-90"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, color, glow }: { icon: React.ReactNode, label: string, value: string, color: string, glow: string }) {
  return (
    <div className={clsx("glass-panel p-8 rounded-[3rem] border border-white/5 shadow-2xl flex items-center gap-6 group hover:border-white/10 transition-all bg-white/5 relative overflow-hidden", glow)}>
      <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
      <div className={clsx("p-4.5 rounded-2xl bg-white/5 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 z-10", color, glow)}>
        {icon}
      </div>
      <div className="z-10">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em] mb-1.5">{label}</p>
        <p className="text-2xl font-bold text-white tracking-tight truncate max-w-[200px]">{value}</p>
      </div>
    </div>
  )
}
