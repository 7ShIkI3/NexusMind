import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BrainCircuit, BookOpen, FileText, Network, Database, Workflow, Puzzle, Activity, Sparkles, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { dashboardApi } from '@/utils/api'
import Brain3D from '@/components/Dashboard/Brain3D'

export default function CognitiveDashboardPage() {
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
  const analysis = overview?.analysis || {}
  const sharedActivity = overview?.shared_activity || {}
  const centralNodes = overview?.central_nodes || []
  const recentItems = overview?.recent_items || []
  const recentNotes = overview?.recent_notes || []
  const orphanNotes = overview?.orphan_notes || []
  const knowledgeSummary = analysis.knowledge_summary || { top_tags: [], top_sources: [], by_type: [] }
  const sampleEdges = overview?.sample_edges || []
  const providers = overview?.providers || []

  const brainNodes = useMemo(() => {
    const nodes: any[] = []

    centralNodes.forEach((node: any) => {
      nodes.push({
        id: `central:${node.id}`,
        label: node.label,
        node_type: node.node_type || 'system',
        weight: Math.max(1, node.connections || 1),
      })
    })

    knowledgeSummary.top_tags?.slice(0, 8).forEach((tag: any, index: number) => {
      nodes.push({
        id: `tag:${tag.name}`,
        label: tag.name,
        node_type: 'entity',
        weight: Math.max(1, tag.count || (8 - index)),
      })
    })

    knowledgeSummary.top_sources?.slice(0, 6).forEach((source: any, index: number) => {
      nodes.push({
        id: `source:${source.name}`,
        label: source.name,
        node_type: source.name === 'note' ? 'note' : 'rag',
        weight: Math.max(1, source.count || (6 - index)),
      })
    })

    recentNotes.slice(0, 6).forEach((note: any, index: number) => {
      nodes.push({
        id: `note:${note.id}`,
        label: note.title,
        node_type: 'note',
        weight: Math.max(1, 6 - Math.min(index, 5)),
      })
    })

    recentItems.slice(0, 10).forEach((item: any, index: number) => {
      nodes.push({
        id: `item:${item.source_key}`,
        label: item.title,
        node_type: item.source_type === 'note' ? 'note' : 'rag',
        weight: Math.max(1, 5 - Math.min(index, 4)),
      })
    })

    providers.slice(0, 8).forEach((provider: any) => {
      nodes.push({
        id: `provider:${provider.name}`,
        label: provider.name,
        node_type: 'provider',
        weight: provider.available ? 4 : 2,
      })
    })

    const deduped = Array.from(new Map(nodes.map((node) => [node.id, node])).values())
    if (deduped.length === 0) {
      deduped.push({ id: 'seed:dashboard', label: 'No data yet', node_type: 'system', weight: 1 })
    }

    return deduped
  }, [centralNodes, knowledgeSummary.top_tags, knowledgeSummary.top_sources, recentNotes, recentItems, providers])

  const brainEdges = useMemo(() => {
    const edges: any[] = []
    const nodeIds = new Set(brainNodes.map((node) => node.id))

    sampleEdges.forEach((edge: any) => {
      const source = edge.source?.startsWith('knowledge_') ? edge.source : `central:${edge.source}`
      const target = edge.target?.startsWith('knowledge_') ? edge.target : `central:${edge.target}`
      if (nodeIds.has(source) && nodeIds.has(target)) {
        edges.push({ source, target, label: edge.label, edge_type: edge.edge_type })
      }
    })

    const sourceNodes = brainNodes.filter((node) => node.id.startsWith('source:'))
    const tagNodes = brainNodes.filter((node) => node.id.startsWith('tag:'))
    const noteNodes = brainNodes.filter((node) => node.id.startsWith('note:') || node.id.startsWith('item:'))
    const providerNodes = brainNodes.filter((node) => node.id.startsWith('provider:'))

    noteNodes.slice(0, 6).forEach((node, index) => {
      const target = tagNodes[index % Math.max(tagNodes.length, 1)] || sourceNodes[index % Math.max(sourceNodes.length, 1)] || providerNodes[index % Math.max(providerNodes.length, 1)]
      if (target && node.id !== target.id) {
        edges.push({ source: node.id, target: target.id, label: 'associated_with', edge_type: 'associated_with' })
      }
    })

    providerNodes.slice(0, 6).forEach((node, index) => {
      const sourceTarget = sourceNodes[index % Math.max(sourceNodes.length, 1)]?.id
      const centralTarget = centralNodes[0] ? `central:${centralNodes[0].id}` : undefined
      const target = sourceTarget || centralTarget
      if (target && node.id !== target) {
        edges.push({ source: node.id, target, label: 'serves', edge_type: 'serves' })
      }
    })

    if (edges.length === 0 && brainNodes.length > 1) {
      for (let i = 0; i < brainNodes.length - 1; i += 1) {
        edges.push({ source: brainNodes[i].id, target: brainNodes[i + 1].id, label: 'relates_to', edge_type: 'relates_to' })
      }
    }

    return edges
  }, [brainNodes, sampleEdges, centralNodes])

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-[#0d1324] via-[#10192d] to-[#0a0f1c] p-6 md:p-8 shadow-2xl">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.16),transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                <BrainCircuit size={14} /> Cognitive Dashboard
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white">
                  Shared memory, graph intelligence, and retrieval in one cockpit
                </h1>
                <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-300 leading-6">
                  Notes, graph links, and RAG documents now live in the same SQLite knowledge base.
                  This dashboard shows how dense the network is, what content is unlinked, and where the brain should focus next.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to="/chat" className="btn-primary"><ArrowRight size={16} /> Open chat</Link>
                <Link to="/notes" className="btn-ghost"><BookOpen size={16} /> Explore notes</Link>
                <button onClick={loadOverview} className="btn-ghost"><RefreshCw size={16} /> Refresh</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-4 min-w-0 lg:w-[380px]">
              <StatusPill ok={overview?.health?.backend} label="Backend" detail="API online" />
              <StatusPill ok={overview?.health?.rag_available} label="RAG" detail="Hybrid search active" />
              <StatusPill ok={overview?.health?.knowledge_shared} label="Shared base" detail={`${sharedActivity.items || 0} items`}/>
              <StatusPill ok={(counts.graph_edges || 0) > 0} label="Graph" detail={`${counts.graph_edges || 0} links`} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {[
            { key: 'knowledge_items', label: 'Knowledge items', icon: Database },
            { key: 'notes', label: 'Notes', icon: FileText },
            { key: 'graph_nodes', label: 'Graph nodes', icon: Network },
            { key: 'rag_chunks', label: 'RAG chunks', icon: Activity },
            { key: 'routines', label: 'Routines', icon: Workflow },
            { key: 'extensions', label: 'Extensions', icon: Puzzle },
          ].map((metric) => {
            const Icon = metric.icon
            return (
              <div key={metric.key} className="card p-5 border border-white/10 bg-white/[0.03]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
                    <div className="mt-2 text-3xl font-black text-white">{formatCount(counts[metric.key])}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-cyan-300">
                    <Icon size={20} />
                  </div>
                </div>
              </div>
            )
          })}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="card p-4 md:p-5 border border-white/10 bg-white/[0.03] min-h-[560px]">
            <div className="flex items-center justify-between gap-4 mb-3">
              <div>
                <h2 className="text-lg font-bold text-white">3D cognitive brain</h2>
                <p className="text-sm text-slate-400">Hotspots and links from the shared base.</p>
              </div>
              <Sparkles size={18} className="text-cyan-300" />
            </div>
            <div className="h-[500px] rounded-3xl border border-white/10 bg-black/20 overflow-hidden">
              <Brain3D nodes={brainNodes} edges={brainEdges} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="card p-5 border border-white/10 bg-white/[0.03]">
              <h2 className="text-lg font-bold text-white mb-4">Health check</h2>
              <div className="space-y-3">
                <CheckRow ok detail={`Link density ${analysis.link_density ?? 0}`} label="Graph density" />
                <CheckRow ok={(analysis.orphan_notes || 0) === 0} detail={`${analysis.orphan_notes || 0} unlinked notes`} label="Coverage" />
                <CheckRow ok={(sharedActivity.documents || 0) > 0} detail={`${sharedActivity.documents || 0} documents mirrored`} label="Documents" />
              </div>
            </div>

            <div className="card p-5 border border-white/10 bg-white/[0.03]">
              <h2 className="text-lg font-bold text-white mb-4">Top tags</h2>
              <div className="space-y-2">
                {(knowledgeSummary.top_tags || []).length > 0 ? knowledgeSummary.top_tags.slice(0, 8).map((tag: any) => (
                  <BarRow key={tag.name} label={tag.name} value={tag.count} max={Math.max(...knowledgeSummary.top_tags.map((t: any) => t.count), 1)} />
                )) : <EmptyState text="No tags yet. Add notes to populate semantic links." />}
              </div>
            </div>

            <div className="card p-5 border border-white/10 bg-white/[0.03]">
              <h2 className="text-lg font-bold text-white mb-4">Top sources</h2>
              <div className="space-y-2">
                {(knowledgeSummary.top_sources || []).length > 0 ? knowledgeSummary.top_sources.slice(0, 8).map((src: any) => (
                  <BarRow key={src.name} label={src.name} value={src.count} max={Math.max(...knowledgeSummary.top_sources.map((t: any) => t.count), 1)} color="from-cyan-400 to-emerald-400" />
                )) : <EmptyState text="No sources yet." />}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Recent shared items</h2>
                <p className="text-sm text-slate-400">New documents and notes in the shared SQLite base.</p>
              </div>
              <FileText size={18} className="text-cyan-300" />
            </div>
            <div className="space-y-3">
              {recentItems.length > 0 ? recentItems.map((item: any) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-white">{item.title}</div>
                      <div className="text-xs text-slate-500">{item.source_type} · {item.source_key}</div>
                    </div>
                    <span className="badge bg-white/5 text-slate-300">{formatDate(item.updated_at)}</span>
                  </div>
                </div>
              )) : <EmptyState text="Nothing indexed yet." />}
            </div>
          </div>

          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Orphans and gaps</h2>
                <p className="text-sm text-slate-400">Items that still need links or indexing hygiene.</p>
              </div>
              <AlertTriangle size={18} className="text-amber-300" />
            </div>
            <div className="space-y-3">
              {orphanNotes.length > 0 ? orphanNotes.map((note: any) => (
                <div key={note.id} className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4">
                  <div className="font-semibold text-white">{note.title}</div>
                  <div className="text-xs text-amber-200/70 mt-1">Unlinked note · {formatDate(note.updated_at)}</div>
                </div>
              )) : <EmptyState text="No orphan notes detected. The graph is keeping up." />}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Recent notes</h2>
                <p className="text-sm text-slate-400">Most recently updated content source.</p>
              </div>
              <BookOpen size={18} className="text-cyan-300" />
            </div>
            <div className="space-y-3">
              {recentNotes.length > 0 ? recentNotes.map((note: any) => (
                <Link key={note.id} to="/notes" className="block rounded-2xl border border-white/10 bg-black/20 p-4 hover:border-cyan-400/20 transition-colors">
                  <div className="font-semibold text-white">{note.title}</div>
                  <div className="text-xs text-slate-500 mt-1">Updated {formatDate(note.updated_at)}</div>
                </Link>
              )) : <EmptyState text="No notes yet. Create one to start the flywheel." />}
            </div>
          </div>

          <div className="card p-5 md:p-6 border border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Provider readiness</h2>
                <p className="text-sm text-slate-400">AI backends available for chat and tool execution.</p>
              </div>
              <Sparkles size={18} className="text-cyan-300" />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {providers.map((provider: any) => (
                <div key={provider.name} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white capitalize">{provider.name}</div>
                      <div className="text-xs text-slate-500">{provider.available ? 'Ready' : 'Check config'}</div>
                    </div>
                    {provider.available ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertTriangle size={18} className="text-amber-400" />}
                  </div>
                </div>
              ))}
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

function CheckRow({ ok, label, detail }: { ok?: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className="text-xs text-slate-500 mt-1">{detail}</div>
      </div>
      <div className={clsx('h-2.5 w-2.5 rounded-full', ok ? 'bg-emerald-400' : 'bg-amber-400')} />
    </div>
  )
}

function BarRow({ label, value, max, color = 'from-violet-400 to-cyan-400' }: { label: string; value: number; max: number; color?: string }) {
  const width = Math.max(8, Math.round((value / Math.max(max, 1)) * 100))
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-200">{label}</span>
        <span className="text-slate-500">{value}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-slate-500">{text}</div>
}

function formatCount(value: any) {
  if (typeof value === 'number') return value.toLocaleString()
  return '0'
}

function formatDate(value?: string) {
  if (!value) return 'unknown'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}