export type NodeType = 'default' | 'note' | 'concept' | 'entity' | 'url' | 'file' | 'document' | 'rag' | 'folder'

export interface GraphNodeData {
  id: string
  label: string
  node_type: NodeType
  color?: string
  size?: number
  duplicate_count?: number
  is_duplicate?: boolean
  filtered?: boolean
  searchMatch?: boolean
  searchDimmed?: boolean
  [key: string]: any
}

export interface GraphNode {
  data: GraphNodeData
  position?: { x: number; y: number }
}

export interface GraphEdgeData {
  id: string
  source: string
  target: string
  label?: string
  edge_type?: string
  weight?: number
  [key: string]: any
}

export interface GraphEdge {
  data: GraphEdgeData
}

export type GraphElement = GraphNode | GraphEdge

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}
