import { useEffect, useState } from 'react'
import { dashboardApi } from '@/utils/api'
import {
  BrainCircuit, BookOpen, FileText, Network, Database,
  Workflow, Puzzle, Activity, Sparkles, ArrowRight,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'

const metricCards = [
  { key: 'notes', label: 'Notes', icon: FileText, href: '/notes' },
  { key: 'graph_nodes', label: 'Graph nodes', icon: Network, href: '/graph' },
  { key: 'rag_chunks', label: 'RAG chunks', icon: Database, href: '/rag' },
  { key: 'routines', label: 'Routines', icon: Workflow, href: '/routines' },
  { key: 'extensions', label: 'Extensions', icon: Puzzle, href: '/extensions' },
  { key: 'messages', label: 'Messages', icon: Activity, href: '/chat' },
]

export default function DashboardPage() {
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadOverview() }, [])

  async function loadOverview() {
    setLoading(true)
    try {
      const { data } = await dashboardApi.getOverview()
      setOverview(data)
    } finally {
      setLoading(false)
    }
  }

  const counts = overview?.counts || {}
  const providers = overview?.providers || []
  const centralNodes = overview?.central_nodes || []
  const recentNotes = overview?.recent_notes || []
  const loadedExtensions = overview?.extensions_loaded || []
  const backendOk = overview?.health?.backend
  const ragOk = overview?.health?.rag_available

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#101628] via-[#0f1526] to-[#121a2f] p-6 md:p-8 shadow-2xl">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,197,94,0.12),transparent_26%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                <BrainCircuit size={14} /> Cognitive Dashboard
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
                  NexusMind overview for notes, graph, RAG, and agents
                </h1>
                <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-300 leading-6">
                  A single control surface for the cognitive layer of the app: content, relationships,
                  retrieval, routines, and extensions. It is designed to show where the system is healthy,
                  where it is sparse, and what needs attention next.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/chat" className="btn-primary">
                  Open chat <ArrowRight size={16} />
                </Link>
                <Link to="/notes" className="btn-ghost">
                  Explore notes <BookOpen size={16} />
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0 lg:w-[360px]">
              <StatusPill ok={backendOk} label="Backend" detail="API online" />
              <StatusPill ok={ragOk} label="RAG" detail="Index available" />
              <StatusPill ok={(counts.enabled_routines || 0) > 0} label="Routines" detail={`${counts.enabled_routines || 0} enabled`} />
              <StatusPill ok={(counts.enabled_extensions || 0) > 0} label="Extensions" detail={`${counts.enabled_extensions || 0} enabled`} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {metricCards.map((metric) => {
            const Icon = metric.icon
            return (
              <Link
                key={metric.key}
                to={metric.href}
                className={clsx(
                  'card group p-5 border border-white/8 bg-white/[0.03] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/20 hover:bg-white/[0.05]',
                  loading && 'opacity-70',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
                    <div className="mt-2 text-3xl font-black text-white">
                      {formatCount(counts[metric.key])}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                    <Icon size={20} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-400 group-hover:text-slate-200 transition-colors">
                  Open section <ArrowRight size={14} />
                </div>
              </Link>
            )
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Provider readiness</h2>
                <p className="text-sm text-slate-400">Which AI backends are available right now.</p>
              </div>
              <Sparkles size={18} className="text-cyan-300" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {providers.map((provider: any) => (
                <div key={provider.name} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white capitalize">{provider.name}</div>
                      <div className="text-xs text-slate-500">{provider.available ? 'Ready for chat and tools' : 'Check configuration'}</div>
                    </div>
                    {provider.available ? (
                      <CheckCircle2 size={18} className="text-emerald-400" />
                    ) : (
                      <AlertTriangle size={18} className="text-amber-400" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Cognitive hotspots</h2>
                <p className="text-sm text-slate-400">Most connected nodes in the graph.</p>
              </div>
              <Network size={18} className="text-cyan-300" />
            </div>
            <div className="space-y-3">
              {centralNodes.length > 0 ? centralNodes.map((node: any) => (
                <div key={node.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{node.label}</div>
                      <div className="text-xs text-slate-500">{node.connections} connections</div>
                    </div>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-emerald-400" style={{ width: `${Math.min(100, node.connections * 12)}%` }} />
                    </div>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-slate-500">
                  No graph hotspots yet. Create notes to populate the network.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Recent notes</h2>
                <p className="text-sm text-slate-400">Recently updated content entering the cognitive layer.</p>
              </div>
              <FileText size={18} className="text-cyan-300" />
            </div>
            <div className="space-y-3">
              {recentNotes.length > 0 ? recentNotes.map((note: any) => (
                <Link key={note.id} to="/notes" className="block rounded-2xl border border-white/10 bg-black/20 p-4 hover:border-cyan-400/20 transition-colors">
                  <div className="font-semibold text-white">{note.title}</div>
                  <div className="text-xs text-slate-500 mt-1">Updated {note.updated_at ? new Date(note.updated_at).toLocaleString() : 'unknown'}</div>
                </Link>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-slate-500">
                  No notes yet. Add one to start syncing RAG and graph links.
                </div>
              )}
            </div>
          </div>

          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Loaded extensions</h2>
                <p className="text-sm text-slate-400">Active plugins in the current runtime.</p>
              </div>
              <Puzzle size={18} className="text-cyan-300" />
            </div>
            <div className="space-y-3">
              {loadedExtensions.length > 0 ? loadedExtensions.map((ext: any) => (
                <div key={ext.slug} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{ext.name}</div>
                      <div className="text-xs text-slate-500">{ext.slug}</div>
                    </div>
                    <span className="badge bg-emerald-500/10 text-emerald-300">{ext.enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                </div>
              )) : (
                <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-6 text-sm text-slate-500">
                  No loaded extensions detected.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function StatusPill({ ok, label, detail }: { ok?: boolean; label: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</div>
          <div className="mt-1 text-sm text-slate-300">{detail}</div>
        </div>
        <div className={clsx('h-3 w-3 rounded-full', ok ? 'bg-emerald-400 shadow-[0_0_0_6px_rgba(16,185,129,0.15)]' : 'bg-amber-400 shadow-[0_0_0_6px_rgba(245,158,11,0.15)]')} />
      </div>
    </div>
  )
}

function formatCount(value: any) {
  if (typeof value === 'number') return value.toLocaleString()
  return '0'
}