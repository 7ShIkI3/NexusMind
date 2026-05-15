import { useEffect, useState, useRef } from 'react'
import { graphApi } from '@/utils/api'
import CytoscapeComponent from 'react-cytoscapejs'
import type { Core, EventObject } from 'cytoscape'
import {
  Plus, Search, Trash2, Link, Loader2,
  ZoomIn, ZoomOut, Maximize, RefreshCw, Filter, Info, Share2, MousePointer2,
  Database, Zap, Target, Layout, Layers, X, Eye
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import type { GraphNodeData, GraphEdgeData, GraphElement, GraphNode, GraphEdge } from '@/types/graph'

const NODE_COLORS: Record<string, string> = {
  default:  '#6366f1', // nexus-500
  note:     '#8b5cf6', // violet-500
  concept:  '#06b6d4', // cyan-500
  entity:   '#10b981', // emerald-500
  url:      '#f59e0b', // amber-500
  file:     '#ef4444', // red-500
  document: '#ef4444', 
  rag:      '#f43f5e', // rose-500
  folder:   '#3b82f6', // blue-500
}

const CYTOSCAPE_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(label)',
      'color': '#f8fafc',
      'font-size': '12px',
      'font-family': 'Inter, sans-serif',
      'font-weight': 600,
      'text-valign': 'bottom',
      'text-margin-y': '8px',
      'text-outline-width': 2,
      'text-outline-color': '#0f172a',
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 3,
      'border-color': '#1e293b',
      'overlay-opacity': 0,
      'transition-property': 'background-color, border-color, width, height, border-width, opacity',
      'transition-duration': '0.3s',
      'transition-timing-function': 'cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#818cf8',
      'border-width': 5,
      'background-opacity': 1,
      'width': 45,
      'height': 45,
    },
  },
  {
    selector: '.search-match',
    style: {
      'border-color': '#facc15',
      'border-width': 6,
      'width': 50,
      'height': 50,
      'text-outline-color': '#facc15',
      'z-index': 100,
    },
  },
  {
    selector: '.search-dimmed',
    style: {
      'opacity': 0.1,
      'events': 'no',
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 2,
      'line-color': '#334155',
      'target-arrow-color': '#334155',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'color': '#94a3b8',
      'font-size': '10px',
      'text-outline-width': 2,
      'text-outline-color': '#0f172a',
      'opacity': 0.6,
      'arrow-scale': 1.2,
      'transition-property': 'opacity, line-color, width',
      'transition-duration': '0.3s',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#6366f1',
      'target-arrow-color': '#6366f1',
      'width': 3,
      'opacity': 1,
    },
  },
]

export default function GraphPage() {
  const [elements, setElements] = useState<GraphElement[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<GraphNodeData | null>(null)
  const [relatedNodes, setRelatedNodes] = useState<{in: GraphNodeData[], out: GraphNodeData[]}>({in: [], out: []})
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddEdge, setShowAddEdge] = useState(false)
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState('cose')
  const cyRef = useRef<Core | null>(null)

  const [newNode, setNewNode] = useState({ label: '', node_type: 'default' as any, color: '' })
  const [newEdge, setNewEdge] = useState({ source_id: '', target_id: '', label: '', edge_type: 'relates_to' })

  useEffect(() => { loadGraph() }, [])

  async function loadGraph() {
    setLoading(true)
    try {
      const { data } = await graphApi.getAll()
      setElements(buildElements(data.nodes, data.edges))
    } catch {
      toast.error('Failed to load neural map')
    } finally {
      setLoading(false)
    }
  }

  function buildElements(nodes: any[], edges: any[]): GraphElement[] {
    const nodeEls: GraphNode[] = nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label,
        node_type: n.node_type,
        color: n.color || NODE_COLORS[n.node_type] || NODE_COLORS.default,
        size: n.size || 32,
        ...n.data,
      },
      position: n.position?.x ? { x: n.position.x, y: n.position.y } : undefined,
    }))
    const edgeEls: GraphEdge[] = edges.map((e) => ({
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        label: e.label || '',
        edge_type: e.edge_type,
        weight: e.weight,
      },
    }))
    return [...nodeEls, ...edgeEls]
  }

  async function addNode() {
    if (!newNode.label) return
    try {
      const { data } = await graphApi.addNode({
        label: newNode.label,
        node_type: newNode.node_type,
        color: newNode.color || NODE_COLORS[newNode.node_type],
      })
      const newEl: GraphNode = {
        data: {
          id: data.id,
          label: data.label,
          node_type: data.node_type,
          color: data.color || NODE_COLORS[data.node_type],
          size: data.size || 32,
          ...data.data,
        },
      }
      setElements((prev) => [...prev, newEl])
      setNewNode({ label: '', node_type: 'default', color: '' })
      setShowAddNode(false)
      toast.success('Neural node initialized')
    } catch {
      toast.error('Failed to initialize node')
    }
  }

  async function addEdge() {
    if (!newEdge.source_id || !newEdge.target_id) return
    try {
      const { data } = await graphApi.addEdge(newEdge)
      const newEl: GraphEdge = {
        data: {
          id: data.id,
          source: data.source,
          target: data.target,
          label: data.label || '',
          edge_type: data.edge_type,
        },
      }
      setElements((prev) => [...prev, newEl])
      setNewEdge({ source_id: '', target_id: '', label: '', edge_type: 'relates_to' })
      setShowAddEdge(false)
      toast.success('Neural link established')
    } catch {
      toast.error('Failed to establish link')
    }
  }

  async function deleteNode(nodeId: string) {
    try {
      await graphApi.deleteNode(nodeId)
      setElements((prev) => prev.filter((e) => e.data.id !== nodeId &&
        (e.data as any).source !== nodeId && (e.data as any).target !== nodeId))
      setSelectedNode(null)
      toast.success('Node purged')
    } catch {}
  }

  async function searchNodes() {
    if (!cyRef.current) return
    if (!search) {
      cyRef.current.elements().removeClass('search-match search-dimmed')
      return
    }

    try {
      const { data } = await graphApi.search(search)
      const nodeIds = new Set(data.map((n: any) => n.id))
      
      cyRef.current.batch(() => {
        cyRef.current!.elements().removeClass('search-match search-dimmed')
        cyRef.current!.nodes().forEach(node => {
          if (nodeIds.has(node.id())) {
            node.addClass('search-match')
          } else {
            node.addClass('search-dimmed')
          }
        })
        cyRef.current!.edges().addClass('search-dimmed')
      })
    } catch {}
  }

  function focusNode(nodeId: string) {
    if (!cyRef.current) return
    const node = cyRef.current.getElementById(nodeId)
    if (node.length) {
      cyRef.current.animate({
        center: { eles: node },
        zoom: 1.5,
      }, { duration: 600 })
      setSelectedNode(node.data())
      updateRelated(nodeId)
    }
  }

  function updateRelated(nodeId: string) {
    if (!cyRef.current) return
    const node = cyRef.current.getElementById(nodeId)
    const incoming = node.incomers('node').map(n => n.data())
    const outgoing = node.outgoers('node').map(n => n.data())
    setRelatedNodes({ in: incoming, out: outgoing })
  }

  return (
    <div className="flex h-full w-full bg-surface-300 rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl page-enter relative">
      {/* Graph container */}
      <div className="flex-1 relative bg-surface-200/50 cyber-mesh overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 backdrop-blur-md bg-surface-300/40">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-nexus-500/20 blur-2xl rounded-full animate-pulse" />
                <Loader2 size={64} className="text-nexus-400 animate-spin relative z-10" />
              </div>
              <p className="text-nexus-400 font-mono text-xs tracking-[0.4em] animate-pulse">SYNCHRONIZING NEURAL MAP...</p>
            </div>
          </div>
        )}

        {!loading && elements.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-12">
            <div className="w-32 h-32 rounded-[2.5rem] bg-nexus-500/10 border border-nexus-500/20 flex items-center justify-center mb-8 animate-float shadow-glow-indigo">
              <Share2 size={56} className="text-nexus-400" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-4 tracking-tight">Neural Map Empty</h2>
            <p className="text-slate-500 max-w-sm mx-auto text-base leading-relaxed mb-10">
              No cognitive nodes detected in this sector. Initialize a new node to begin mapping your knowledge architecture.
            </p>
            <button onClick={() => setShowAddNode(true)} className="btn-primary py-4 px-8 rounded-2xl shadow-glow-indigo scale-110">
              <Plus size={20} /> Initialize Node
            </button>
          </div>
        )}

        {elements.length > 0 && (
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            stylesheet={CYTOSCAPE_STYLE}
            layout={{ name: layout, animate: true, animationDuration: 500 } as any}
            cy={(cy: Core) => {
              cyRef.current = cy
              cy.off('tap')
              cy.off('tap', 'node')
              cy.off('dragfree', 'node')
              cy.on('tap', 'node', (e: EventObject) => {
                const node = e.target
                setSelectedNode(node.data())
                updateRelated(node.id())
              })
              cy.on('tap', (e: EventObject) => {
                if (e.target === cy) {
                  setSelectedNode(null)
                  setRelatedNodes({ in: [], out: [] })
                }
              })
              cy.on('dragfree', 'node', async (e: EventObject) => {
                const node = e.target
                const position = node.position()
                try {
                  await graphApi.updateNode(String(node.id()), {
                    position_x: position.x,
                    position_y: position.y,
                  })
                } catch {
                  toast.error('Failed to sync node coordinates')
                }
              })
            }}
          />
        )}

        {/* Toolbar Overlay */}
        <div className="absolute top-8 left-8 flex flex-col gap-4">
          <div className="glass-panel p-2 rounded-[1.5rem] flex flex-col gap-2 border border-white/5 shadow-2xl backdrop-blur-xl bg-white/5">
            <button onClick={() => setShowAddNode(true)} className="btn-primary !p-3.5 rounded-xl shadow-glow-indigo" title="Initialize node">
              <Plus size={20} />
            </button>
            <button onClick={() => setShowAddEdge(true)} className="btn-ghost !p-3.5 rounded-xl bg-white/5 text-slate-300 hover:text-white" title="Establish link">
              <Link size={20} />
            </button>
          </div>
          
          <div className="glass-panel p-2 rounded-[1.5rem] flex flex-col gap-2 border border-white/5 shadow-2xl backdrop-blur-xl bg-white/5">
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} className="btn-ghost !p-3.5 rounded-xl bg-white/5 text-slate-400 hover:text-white">
              <ZoomIn size={18} />
            </button>
            <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)} className="btn-ghost !p-3.5 rounded-xl bg-white/5 text-slate-400 hover:text-white">
              <ZoomOut size={18} />
            </button>
            <button onClick={() => cyRef.current?.fit()} className="btn-ghost !p-3.5 rounded-xl bg-white/5 text-slate-400 hover:text-white">
              <Maximize size={18} />
            </button>
            <button onClick={loadGraph} className="btn-ghost !p-3.5 rounded-xl bg-white/5 text-slate-400 hover:text-white">
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Layout Selector Overlay */}
        <div className="absolute top-8 right-8">
          <div className="glass-panel p-2.5 px-4 rounded-[1.5rem] border border-white/5 shadow-2xl backdrop-blur-xl bg-white/5 flex items-center gap-3">
            <Layout size={16} className="text-nexus-400" />
            <select
              value={layout}
              onChange={(e) => setLayout(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-200 focus:outline-none pr-4 cursor-pointer hover:text-white transition-colors uppercase tracking-[0.15em]"
            >
              <option value="cose" className="bg-surface-100">Dynamic Force</option>
              <option value="circle" className="bg-surface-100">Circular Core</option>
              <option value="grid" className="bg-surface-100">Grid Lattice</option>
              <option value="breadthfirst" className="bg-surface-100">Hierarchical</option>
              <option value="concentric" className="bg-surface-100">Concentric</option>
            </select>
          </div>
        </div>
      </div>

      {/* Right sidepanel: Neural Details */}
      <div className="w-96 flex-shrink-0 border-l border-white/5 flex flex-col bg-surface-100/40 backdrop-blur-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-nexus-500/40 to-transparent" />
        
        {/* Search Header */}
        <div className="p-8 border-b border-white/5">
          <div className="relative group">
            <div className="absolute -inset-1 bg-nexus-500/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-500" />
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchNodes()}
                placeholder="Neural Query..."
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all placeholder:text-slate-600 font-medium text-white shadow-inner"
              />
              {search && (
                <button 
                  onClick={() => { setSearch(''); cyRef.current?.elements().removeClass('search-match search-dimmed'); }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {selectedNode ? (
            <div className="space-y-10 animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full animate-pulse shadow-[0_0_12px_rgba(var(--color),0.6)]" 
                         style={{ backgroundColor: selectedNode.color || (NODE_COLORS[selectedNode.node_type] || NODE_COLORS.default) }} />
                    <span className="text-[11px] font-bold text-nexus-400 uppercase tracking-[0.3em]">{selectedNode.node_type}</span>
                  </div>
                  <button onClick={() => focusNode(selectedNode.id)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Focus Node">
                    <Eye size={16} />
                  </button>
                </div>
                <h3 className="text-3xl font-bold text-white tracking-tight leading-tight">{selectedNode.label}</h3>
              </div>

              {/* Relations Section */}
              <div className="space-y-6">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2.5">
                  <Zap size={14} className="text-amber-500" /> Neural Proximities
                </h4>
                
                <div className="space-y-4">
                  {relatedNodes.in.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter ml-1">Incoming Links</span>
                      <div className="flex flex-wrap gap-2">
                        {relatedNodes.in.map(n => (
                          <button key={n.id} onClick={() => focusNode(n.id)} className="px-3 py-1.5 rounded-full bg-white/5 border border-white/5 text-[11px] text-slate-300 hover:bg-white/10 hover:border-white/10 transition-all">
                            {n.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {relatedNodes.out.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter ml-1">Outgoing Links</span>
                      <div className="flex flex-wrap gap-2">
                        {relatedNodes.out.map(n => (
                          <button key={n.id} onClick={() => focusNode(n.id)} className="px-3 py-1.5 rounded-full bg-nexus-500/10 border border-nexus-500/10 text-[11px] text-nexus-400 hover:bg-nexus-500/20 transition-all">
                            {n.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {relatedNodes.in.length === 0 && relatedNodes.out.length === 0 && (
                    <div className="p-4 rounded-2xl bg-white/5 border border-dashed border-white/10 text-center">
                      <p className="text-[11px] text-slate-600 font-medium">No established neural connections</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2.5">
                  <Target size={14} className="text-nexus-500" /> Synchronization Data
                </h4>
                <div className="glass-panel p-6 space-y-5 rounded-[2rem] bg-white/5 border border-white/5 shadow-xl">
                  <InfoRow label="Node ID" value={selectedNode.id} isMono />
                  <InfoRow label="Intensity" value={String(selectedNode.size || '32')} />
                  {selectedNode.duplicate_count && selectedNode.duplicate_count > 1 && (
                    <InfoRow label="Overlaps" value={String(selectedNode.duplicate_count)} />
                  )}
                  {Object.entries(selectedNode).filter(([k]) =>
                    !['id', 'label', 'node_type', 'color', 'size', 'filtered', 'duplicate_count', 'searchMatch', 'searchDimmed'].includes(k)
                  ).map(([k, v]) => (
                    <InfoRow key={k} label={k} value={String(v)} />
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-all font-bold text-xs uppercase tracking-[0.2em] shadow-lg active:scale-[0.98]"
                >
                  <Trash2 size={16} /> Purge Node
                </button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
                <div className="w-20 h-20 rounded-[2rem] bg-white/5 flex items-center justify-center mb-6 border border-white/5 shadow-inner">
                  <MousePointer2 size={32} className="text-slate-600 animate-pulse" />
                </div>
                <h3 className="text-base font-bold text-slate-400 mb-3 uppercase tracking-[0.2em]">Awaiting Input</h3>
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  Select a cognitive node from the neural map to inspect its properties and established relationships.
                </p>
              </div>

              <div className="space-y-6 pt-10 mt-auto border-t border-white/5">
                <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Layers size={14} /> Neural Taxonomy
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(NODE_COLORS).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all cursor-default group">
                      <div className="w-2.5 h-2.5 rounded-full shadow-lg group-hover:scale-125 transition-transform" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-bold text-slate-400 capitalize group-hover:text-slate-200">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAddNode && (
        <Modal title="Initialize Neural Node" onClose={() => setShowAddNode(false)}>
          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Node Designation</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium"
                value={newNode.label}
                onChange={(e) => setNewNode({ ...newNode, label: e.target.value })}
                placeholder="Enter designation..."
                autoFocus
              />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Node Classification</label>
              <div className="relative">
                <select
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium appearance-none cursor-pointer"
                  value={newNode.node_type}
                  onChange={(e) => setNewNode({ ...newNode, node_type: e.target.value })}
                >
                  {Object.keys(NODE_COLORS).map((t) => <option key={t} value={t} className="bg-surface-100 capitalize">{t}</option>)}
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <Filter size={16} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={addNode} className="btn-primary flex-1 py-4 rounded-2xl shadow-glow-indigo font-bold tracking-widest text-xs uppercase">INITIALIZE</button>
              <button onClick={() => setShowAddNode(false)} className="btn-ghost flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white font-bold tracking-widest text-xs uppercase">CANCEL</button>
            </div>
          </div>
        </Modal>
      )}

      {showAddEdge && (
        <Modal title="Establish Neural Link" onClose={() => setShowAddEdge(false)}>
          <div className="space-y-8">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Source ID</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-[11px] focus:outline-none focus:border-nexus-500/50 transition-all text-white font-mono" value={newEdge.source_id}
                  onChange={(e) => setNewEdge({ ...newEdge, source_id: e.target.value })}
                  placeholder="ID..." />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Target ID</label>
                <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-[11px] focus:outline-none focus:border-nexus-500/50 transition-all text-white font-mono" value={newEdge.target_id}
                  onChange={(e) => setNewEdge({ ...newEdge, target_id: e.target.value })}
                  placeholder="ID..." />
              </div>
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Link Label</label>
              <input className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium" value={newEdge.label}
                onChange={(e) => setNewEdge({ ...newEdge, label: e.target.value })}
                placeholder="Designate relationship..." />
            </div>
            <div className="space-y-3">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] ml-1">Link Class</label>
              <div className="relative">
                <select className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm focus:outline-none focus:border-nexus-500/50 transition-all text-white font-medium appearance-none cursor-pointer" value={newEdge.edge_type}
                  onChange={(e) => setNewEdge({ ...newEdge, edge_type: e.target.value })}>
                  <option value="relates_to" className="bg-surface-100">relates_to</option>
                  <option value="depends_on" className="bg-surface-100">depends_on</option>
                  <option value="contains" className="bg-surface-100">contains</option>
                  <option value="references" className="bg-surface-100">references</option>
                </select>
                <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                  <Link size={16} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 pt-4">
              <button onClick={addEdge} className="btn-primary flex-1 py-4 rounded-2xl shadow-glow-indigo font-bold tracking-widest text-xs uppercase">CONNECT</button>
              <button onClick={() => setShowAddEdge(false)} className="btn-ghost flex-1 py-4 rounded-2xl bg-white/5 text-slate-400 hover:text-white font-bold tracking-widest text-xs uppercase">DISCARD</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InfoRow({ label, value, isMono }: { label: string; value: string; isMono?: boolean }) {
  return (
    <div className="flex flex-col gap-2 group">
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] group-hover:text-nexus-400 transition-colors">{label}</span>
      <span className={clsx("text-sm text-slate-200 break-all font-medium leading-relaxed", isMono && "font-mono text-xs text-slate-400")}>{value}</span>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center z-[100] px-6">
      <div className="absolute inset-0 bg-surface-300/60 backdrop-blur-xl" onClick={onClose} />
      <div className="glass-panel w-full max-w-xl p-10 rounded-[2.5rem] shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 relative animate-in zoom-in-95 duration-300 bg-surface-100/80 backdrop-blur-2xl">
        <h2 className="text-2xl font-bold text-white mb-10 tracking-tight flex items-center gap-4">
          <div className="w-2 h-8 bg-nexus-500 rounded-full shadow-glow-indigo" /> {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
