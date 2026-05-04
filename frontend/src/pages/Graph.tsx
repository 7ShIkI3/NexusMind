import { useEffect, useState, useRef } from 'react'
import { graphApi } from '@/utils/api'
import cytoscape from 'cytoscape'
import CytoscapeComponent from 'react-cytoscapejs'
import {
  Plus, Search, Trash2, Link, Loader2,
  ZoomIn, ZoomOut, Maximize, RefreshCw, Filter,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const NODE_COLORS: Record<string, string> = {
  default:  '#4361ee',
  note:     '#7c3aed',
  concept:  '#0891b2',
  entity:   '#059669',
  url:      '#d97706',
  file:     '#dc2626',
}

const CYTOSCAPE_STYLE: any[] = [
  {
    selector: 'node',
    style: {
      'background-color': 'data(color)',
      'label': 'data(label)',
      'color': '#e2e8f0',
      'font-size': '11px',
      'font-family': 'Inter, sans-serif',
      'text-valign': 'bottom',
      'text-margin-y': '6px',
      'text-outline-width': 2,
      'text-outline-color': '#0f1117',
      'width': 'data(size)',
      'height': 'data(size)',
      'border-width': 2,
      'border-color': '#2a2d3e',
      'transition-property': 'background-color, border-color, width, height',
      'transition-duration': '0.2s',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': '#4361ee',
      'border-width': 3,
      'background-opacity': 0.9,
    },
  },
  {
    selector: 'edge',
    style: {
      'width': 1.5,
      'line-color': '#2a2d3e',
      'target-arrow-color': '#2a2d3e',
      'target-arrow-shape': 'triangle',
      'curve-style': 'bezier',
      'label': 'data(label)',
      'color': '#6b7280',
      'font-size': '9px',
      'text-outline-width': 1,
      'text-outline-color': '#0f1117',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': '#4361ee',
      'target-arrow-color': '#4361ee',
      'width': 2,
    },
  },
]

export default function GraphPage() {
  const [elements, setElements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [showAddNode, setShowAddNode] = useState(false)
  const [showAddEdge, setShowAddEdge] = useState(false)
  const [search, setSearch] = useState('')
  const [layout, setLayout] = useState('cose')
  const cyRef = useRef<any>(null)

  const [newNode, setNewNode] = useState({ label: '', node_type: 'default', color: '' })
  const [newEdge, setNewEdge] = useState({ source_id: '', target_id: '', label: '', edge_type: 'relates_to' })

  useEffect(() => { loadGraph() }, [])

  async function loadGraph() {
    setLoading(true)
    try {
      const { data } = await graphApi.getAll()
      setElements(buildElements(data.nodes, data.edges))
    } catch {
      toast.error('Failed to load graph')
    } finally {
      setLoading(false)
    }
  }

  function buildElements(nodes: any[], edges: any[]) {
    const nodeEls = nodes.map((n) => ({
      data: {
        id: n.id,
        label: n.label,
        node_type: n.node_type,
        color: n.color || NODE_COLORS[n.node_type] || NODE_COLORS.default,
        size: n.size || 30,
        ...n.data,
      },
      position: n.position?.x ? { x: n.position.x, y: n.position.y } : undefined,
    }))
    const edgeEls = edges.map((e) => ({
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
      setElements((prev) => [
        ...prev,
        {
          data: {
            id: data.id,
            label: data.label,
            node_type: data.node_type,
            color: data.color || NODE_COLORS[data.node_type],
            size: data.size || 30,
          },
        },
      ])
      setNewNode({ label: '', node_type: 'default', color: '' })
      setShowAddNode(false)
      toast.success('Node added')
    } catch {
      toast.error('Failed to add node')
    }
  }

  async function addEdge() {
    if (!newEdge.source_id || !newEdge.target_id) return
    try {
      const { data } = await graphApi.addEdge(newEdge)
      setElements((prev) => [
        ...prev,
        {
          data: {
            id: data.id,
            source: data.source,
            target: data.target,
            label: data.label || '',
          },
        },
      ])
      setNewEdge({ source_id: '', target_id: '', label: '', edge_type: 'relates_to' })
      setShowAddEdge(false)
      toast.success('Edge added')
    } catch {
      toast.error('Failed to add edge')
    }
  }

  async function deleteNode(nodeId: string) {
    try {
      await graphApi.deleteNode(nodeId)
      setElements((prev) => prev.filter((e) => e.data.id !== nodeId &&
        e.data.source !== nodeId && e.data.target !== nodeId))
      setSelectedNode(null)
      toast.success('Node deleted')
    } catch {}
  }

  async function searchNodes() {
    if (!search) return loadGraph()
    try {
      const { data } = await graphApi.search(search)
      const nodeIds = new Set(data.map((n: any) => n.id))
      setElements((prev) => prev.map((el) => {
        if (!el.data.source) { // is node
          return { ...el, data: { ...el.data, filtered: !nodeIds.has(el.data.id) } }
        }
        return el
      }))
    } catch {}
  }

  const nodeTypes = Object.keys(NODE_COLORS)

  return (
    <div className="flex h-full overflow-hidden">
      {/* Graph container */}
      <div className="flex-1 relative bg-[#0a0c14]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={32} className="text-nexus-400 animate-spin" />
          </div>
        )}

        {!loading && elements.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-2xl bg-nexus-500/10 flex items-center justify-center mb-4">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="8" cy="20" r="5" fill="#4361ee" opacity="0.6" />
                <circle cx="32" cy="8" r="5" fill="#7c3aed" opacity="0.6" />
                <circle cx="32" cy="32" r="5" fill="#0891b2" opacity="0.6" />
                <line x1="8" y1="20" x2="32" y2="8" stroke="#4361ee" strokeWidth="1.5" opacity="0.4" />
                <line x1="8" y1="20" x2="32" y2="32" stroke="#4361ee" strokeWidth="1.5" opacity="0.4" />
                <line x1="32" y1="8" x2="32" y2="32" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-400">Your knowledge graph is empty</h2>
            <p className="text-sm text-gray-600 mt-1">Add nodes to start building connections</p>
            <button onClick={() => setShowAddNode(true)} className="btn-primary mt-4">
              <Plus size={16} /> Add Node
            </button>
          </div>
        )}

        {elements.length > 0 && (
          <CytoscapeComponent
            elements={elements}
            style={{ width: '100%', height: '100%' }}
            stylesheet={CYTOSCAPE_STYLE}
            layout={{ name: layout, animate: true, animationDuration: 500 } as any}
            cy={(cy: cytoscape.Core) => {
              cyRef.current = cy
              cy.on('tap', 'node', (e: cytoscape.EventObject) => {
                setSelectedNode(e.target.data())
              })
              cy.on('tap', (e: cytoscape.EventObject) => {
                if (e.target === cy) setSelectedNode(null)
              })
            }}
          />
        )}

        {/* Toolbar */}
        <div className="absolute top-4 left-4 flex flex-col gap-2">
          <button onClick={() => setShowAddNode(true)} className="btn-primary text-sm" title="Add node">
            <Plus size={16} /> Add Node
          </button>
          <button onClick={() => setShowAddEdge(true)} className="btn-ghost text-sm border border-white/10 bg-[#13162a]" title="Add edge">
            <Link size={16} /> Add Edge
          </button>
        </div>

        {/* Controls */}
        <div className="absolute bottom-4 right-4 flex flex-col gap-2">
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 1.2)} className="btn-ghost p-2 border border-white/10 bg-[#13162a]">
            <ZoomIn size={16} />
          </button>
          <button onClick={() => cyRef.current?.zoom(cyRef.current.zoom() * 0.8)} className="btn-ghost p-2 border border-white/10 bg-[#13162a]">
            <ZoomOut size={16} />
          </button>
          <button onClick={() => cyRef.current?.fit()} className="btn-ghost p-2 border border-white/10 bg-[#13162a]">
            <Maximize size={16} />
          </button>
          <button onClick={loadGraph} className="btn-ghost p-2 border border-white/10 bg-[#13162a]">
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Layout selector */}
        <div className="absolute top-4 right-4">
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className="input text-xs py-1 w-32"
          >
            <option value="cose">Force (CoSE)</option>
            <option value="circle">Circle</option>
            <option value="grid">Grid</option>
            <option value="breadthfirst">Tree</option>
            <option value="concentric">Concentric</option>
          </select>
        </div>
      </div>

      {/* Right panel: node details + search */}
      <div className="w-72 flex-shrink-0 border-l border-white/5 flex flex-col bg-[#111425]">
        {/* Search */}
        <div className="p-3 border-b border-white/5">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchNodes()}
              placeholder="Search nodes…"
              className="input text-sm pl-8 py-1.5"
            />
          </div>
        </div>

        {/* Node info */}
        {selectedNode ? (
          <div className="p-4 flex-1 overflow-y-auto">
            <h3 className="font-semibold text-white mb-3">{selectedNode.label}</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Type" value={selectedNode.node_type} />
              <InfoRow label="ID" value={selectedNode.id?.slice(0, 16) + '...'} />
              {Object.entries(selectedNode).filter(([k]) =>
                !['id', 'label', 'node_type', 'color', 'size', 'filtered'].includes(k)
              ).map(([k, v]) => (
                <InfoRow key={k} label={k} value={String(v)} />
              ))}
            </div>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => deleteNode(selectedNode.id)}
                className="btn-danger w-full text-sm"
              >
                <Trash2 size={14} /> Delete Node
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 flex-1">
            <h3 className="text-sm font-medium text-gray-400 mb-3">Node Types</h3>
            <div className="space-y-2">
              {Object.entries(NODE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-2 text-sm text-gray-400">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  {type}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-4">Click a node to see its details</p>
          </div>
        )}
      </div>

      {/* Add Node Modal */}
      {showAddNode && (
        <Modal title="Add Node" onClose={() => setShowAddNode(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Label *</label>
              <input
                className="input"
                value={newNode.label}
                onChange={(e) => setNewNode({ ...newNode, label: e.target.value })}
                placeholder="Node label"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Type</label>
              <select
                className="input"
                value={newNode.node_type}
                onChange={(e) => setNewNode({ ...newNode, node_type: e.target.value })}
              >
                {nodeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={addNode} className="btn-primary flex-1">Add Node</button>
              <button onClick={() => setShowAddNode(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Edge Modal */}
      {showAddEdge && (
        <Modal title="Add Edge" onClose={() => setShowAddEdge(false)}>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Source Node *</label>
              <select className="input" value={newEdge.source_id}
                onChange={(e) => setNewEdge({ ...newEdge, source_id: e.target.value })}>
                <option value="">Select source node…</option>
                {elements.filter((el) => !el.data.source).map((el) => (
                  <option key={el.data.id} value={el.data.id}>{el.data.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Target Node *</label>
              <select className="input" value={newEdge.target_id}
                onChange={(e) => setNewEdge({ ...newEdge, target_id: e.target.value })}>
                <option value="">Select target node…</option>
                {elements.filter((el) => !el.data.source && el.data.id !== newEdge.source_id).map((el) => (
                  <option key={el.data.id} value={el.data.id}>{el.data.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Label</label>
              <input className="input" value={newEdge.label}
                onChange={(e) => setNewEdge({ ...newEdge, label: e.target.value })}
                placeholder="Edge label (optional)" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Type</label>
              <select className="input" value={newEdge.edge_type}
                onChange={(e) => setNewEdge({ ...newEdge, edge_type: e.target.value })}>
                <option value="relates_to">relates_to</option>
                <option value="depends_on">depends_on</option>
                <option value="contains">contains</option>
                <option value="references">references</option>
              </select>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={addEdge} disabled={!newEdge.source_id || !newEdge.target_id} className="btn-primary flex-1">Add Edge</button>
              <button onClick={() => setShowAddEdge(false)} className="btn-ghost flex-1">Cancel</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-300 truncate max-w-[160px]">{value}</span>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="card w-96 p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}
