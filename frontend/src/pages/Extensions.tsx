import { useEffect, useState } from 'react'
import { extensionsApi } from '@/utils/api'
import { 
  Puzzle, ToggleLeft, ToggleRight, Trash2, Loader2, Package, 
  Globe, Shield, Terminal, Zap, Layers, Cpu, Code
} from 'lucide-react'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'

export default function ExtensionsPage() {
  const [extensions, setExtensions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadExtensions() }, [])

  async function loadExtensions() {
    setLoading(true)
    try {
      const { data } = await extensionsApi.list()
      setExtensions(data)
    } catch {} finally { setLoading(false) }
  }

  async function toggleExtension(slug: string) {
    try {
      const { data } = await extensionsApi.toggle(slug)
      setExtensions(extensions.map((e) =>
        e.slug === slug ? { ...e, enabled: data.enabled } : e))
      toast.success(`Extension ${data.enabled ? 'activated' : 'deactivated'}`)
    } catch { toast.error('Toggle failed') }
  }

  async function uninstall(slug: string) {
    if (!confirm(`Uninstall extension "${slug}"?`)) return
    try {
      await extensionsApi.uninstall(slug)
      setExtensions(extensions.filter((e) => e.slug !== slug))
      toast.success('Extension purged')
    } catch { toast.error('Uninstall failed') }
  }

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl page-enter relative overflow-y-auto custom-scrollbar p-8 md:p-12">
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-nexus-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-7xl mx-auto w-full space-y-12 relative z-10">
        
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold text-white tracking-tight flex items-center gap-4">
              <div className="p-3 rounded-[1.25rem] bg-nexus-500/10 text-nexus-400 shadow-glow-indigo">
                <Puzzle size={32} />
              </div>
              Plugin Architecture
            </h1>
            <p className="text-slate-500 text-base font-medium ml-1 max-w-2xl leading-relaxed">
              Extend the core Nexus intelligence with modular neural extensions and specialized cognitive toolsets.
            </p>
          </div>
          
          <div className="flex items-center gap-4 glass-panel p-2 rounded-[1.5rem] border border-white/5 bg-white/5 shadow-xl backdrop-blur-xl">
            <div className="px-6 py-3 flex items-center gap-3 border-r border-white/10 group">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <Shield size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Environment</p>
                <p className="text-xs font-bold text-slate-200">Sandboxed</p>
              </div>
            </div>
            <div className="px-6 py-3 flex items-center gap-3 group">
              <div className="w-8 h-8 rounded-lg bg-nexus-500/10 flex items-center justify-center text-nexus-400 border border-nexus-500/20 group-hover:scale-110 transition-transform shadow-glow-indigo">
                <Globe size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Neural Links</p>
                <p className="text-xs font-bold text-slate-200">{extensions.filter(e => e.enabled).length} Active</p>
              </div>
            </div>
          </div>
        </div>

        {/* Installation Protocol */}
        <div className="glass-panel p-10 rounded-[3rem] border border-nexus-500/20 bg-nexus-500/5 relative overflow-hidden group shadow-2xl">
          <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity duration-1000 rotate-12">
            <Terminal size={180} />
          </div>
          
          <div className="relative space-y-6">
            <div className="flex items-center gap-3 text-nexus-400">
              <div className="p-2 rounded-lg bg-nexus-500/10 shadow-glow-indigo">
                <Zap size={18} />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-[0.3em]">Deployment Protocol v1.4</h3>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed max-w-3xl font-medium">
              Initialize new plugins by placing the extension bundle in <code className="bg-white/10 px-2.5 py-1 rounded-lg text-nexus-300 font-mono text-[11px] border border-white/10">extensions/installed/&lt;slug&gt;/</code>. 
              The system will automatically register and validate the <code className="text-white font-bold">manifest.json</code> upon next synchronization.
            </p>
            
            <div className="pt-4">
              <div className="bg-black/40 rounded-[2rem] p-8 border border-white/5 relative group/code shadow-inner">
                <div className="absolute top-6 right-8 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em]">manifest.v1.schema</span>
                </div>
                <pre className="text-xs text-slate-500 font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-w-full">
{`{
  "name": "Neural Pattern Recognition",
  "slug": "neural-vision-ext",
  "version": "2.1.4",
  "description": "Advanced ocular pattern recognition and cognitive mapping",
  "author": "Nexus Labs Alpha",
  "entry_point": "main.py",
  "tags": ["vision", "cognitive", "mapping"]
}`}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="relative">
              <div className="absolute inset-0 bg-nexus-500/20 blur-2xl rounded-full animate-pulse" />
              <Loader2 size={64} className="text-nexus-400 animate-spin relative z-10" />
            </div>
            <p className="text-xs font-mono text-slate-600 uppercase tracking-[0.4em] animate-pulse font-bold">Syncing Plugin Registry...</p>
          </div>
        ) : extensions.length === 0 ? (
          <div className="glass-panel p-24 text-center rounded-[4rem] border-white/5 space-y-10 bg-white/5 relative overflow-hidden group shadow-2xl">
            <div className="w-24 h-24 rounded-[2.5rem] bg-white/5 flex items-center justify-center mx-auto border border-white/5 animate-float relative z-10 shadow-inner">
              <Package size={48} className="text-slate-700 group-hover:text-nexus-400 transition-colors duration-500" />
            </div>
            <div className="space-y-4 relative z-10">
              <h2 className="text-2xl font-bold text-white tracking-tight">No extensions detected</h2>
              <p className="text-base text-slate-500 max-w-md mx-auto leading-relaxed font-medium">
                Connect modular toolsets to unlock specialized AI capabilities and expand the Nexus cognitive horizon.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {extensions.map((ext) => (
              <div 
                key={ext.slug} 
                className={clsx(
                  'glass-panel p-10 rounded-[3rem] border border-white/5 hover:border-nexus-500/30 transition-all duration-500 group relative bg-white/5 shadow-2xl hover:-translate-y-1.5 overflow-hidden',
                  !ext.enabled && 'opacity-60 grayscale-[0.5]'
                )}
              >
                <div className="absolute -top-24 -right-24 w-64 h-64 bg-nexus-500/5 rounded-full blur-3xl group-hover:bg-nexus-500/10 transition-colors duration-1000" />
                
                <div className="flex items-start justify-between gap-6 mb-8 relative z-10">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-nexus-400 group-hover:scale-110 group-hover:rotate-6 transition-all duration-700 border border-white/10 shadow-inner">
                      <Puzzle size={36} className={clsx("transition-transform duration-700", ext.enabled && "shadow-glow-indigo")} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white tracking-tight group-hover:text-nexus-400 transition-colors">{ext.name}</h3>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1 rounded-lg border border-white/5">
                          <Layers size={12} className="text-slate-500" />
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">v{ext.version}</span>
                        </div>
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                        <span className="text-[11px] font-bold text-slate-500 italic uppercase tracking-widest">By {ext.author || 'Anonymous'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-2">
                    {ext.loaded && (
                      <span className="flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 uppercase tracking-widest">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                      </span>
                    )}
                    <span className={clsx(
                      'text-[10px] font-bold px-3 py-1.5 rounded-xl uppercase tracking-widest border transition-all duration-500',
                      ext.enabled ? 'bg-nexus-500/10 text-nexus-400 border-nexus-500/20 shadow-glow-indigo' : 'bg-white/5 text-slate-600 border-white/10'
                    )}>
                      {ext.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                {ext.description && (
                  <p className="text-base text-slate-400 leading-relaxed line-clamp-2 mb-8 min-h-[56px] font-medium relative z-10">
                    {ext.description}
                  </p>
                )}

                {ext.tags?.length > 0 && (
                  <div className="flex gap-3 mb-10 flex-wrap relative z-10">
                    {ext.tags.map((t: string) => (
                      <span key={t} className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] bg-white/5 px-4 py-2 rounded-xl border border-white/5 hover:border-nexus-500/20 hover:text-nexus-300 transition-all cursor-default">{t}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-4 mt-auto relative z-10">
                  <button
                    onClick={() => toggleExtension(ext.slug)}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-3 py-5 rounded-2xl text-xs font-bold uppercase tracking-[0.2em] transition-all duration-500 active:scale-95 shadow-lg',
                      ext.enabled 
                        ? 'bg-nexus-600/10 text-nexus-400 border border-nexus-600/20 hover:bg-nexus-600/20 shadow-glow-indigo' 
                        : 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10 hover:text-slate-300'
                    )}
                  >
                    {ext.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    {ext.enabled ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => uninstall(ext.slug)}
                    className="p-5 rounded-2xl bg-red-500/5 text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20 shadow-lg active:scale-90"
                    title="Purge Extension"
                  >
                    <Trash2 size={22} />
                  </button>
                </div>

                {/* Bottom stats deco */}
                <div className="mt-8 pt-8 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-slate-600 uppercase tracking-widest opacity-60">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} />
                    <span>Memory usage: low</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Code size={14} />
                    <span>Runtime: python 3.10</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
