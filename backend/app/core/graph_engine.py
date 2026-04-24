"""
Graph Engine - Knowledge graph management using NetworkX with persistence.
"""
from __future__ import annotations

import uuid
from typing import Optional
import networkx as nx

from sqlalchemy.orm import Session
from app.models.graph import GraphNode, GraphEdge


class GraphEngine:
    def __init__(self):
        self._graph: Optional[nx.DiGraph] = None

    def _build_graph(self, db: Session) -> nx.DiGraph:
        G = nx.DiGraph()
        nodes = db.query(GraphNode).all()
        edges = db.query(GraphEdge).all()
        for n in nodes:
            G.add_node(n.node_id, label=n.label, node_type=n.node_type,
                       color=n.color, size=n.size, data=n.data or {})
        for e in edges:
            G.add_edge(e.source_id, e.target_id, edge_id=e.edge_id,
                       label=e.label, edge_type=e.edge_type, weight=e.weight)
        return G

    def get_graph(self, db: Session) -> nx.DiGraph:
        return self._build_graph(db)

    def add_node(self, db: Session, label: str, node_type: str = "default",
                 data: dict = None, color: str = None, size: float = 30.0,
                 position_x: float = None, position_y: float = None) -> GraphNode:
        node_id = str(uuid.uuid4())
        node = GraphNode(node_id=node_id, label=label, node_type=node_type,
                         data=data or {}, color=color, size=size,
                         position_x=position_x, position_y=position_y)
        db.add(node)
        db.commit()
        db.refresh(node)
        return node

    def update_node(self, db: Session, node_id: str, **kwargs) -> Optional[GraphNode]:
        node = db.query(GraphNode).filter(GraphNode.node_id == node_id).first()
        if not node:
            return None
        for k, v in kwargs.items():
            if hasattr(node, k):
                setattr(node, k, v)
        db.commit()
        db.refresh(node)
        return node

    def delete_node(self, db: Session, node_id: str) -> bool:
        node = db.query(GraphNode).filter(GraphNode.node_id == node_id).first()
        if not node:
            return False
        db.query(GraphEdge).filter(
            (GraphEdge.source_id == node_id) | (GraphEdge.target_id == node_id)
        ).delete()
        db.delete(node)
        db.commit()
        return True

    def add_edge(self, db: Session, source_id: str, target_id: str,
                 label: str = None, edge_type: str = "relates_to",
                 weight: float = 1.0, data: dict = None) -> GraphEdge:
        edge_id = str(uuid.uuid4())
        edge = GraphEdge(edge_id=edge_id, source_id=source_id, target_id=target_id,
                         label=label, edge_type=edge_type, weight=weight, data=data or {})
        db.add(edge)
        db.commit()
        db.refresh(edge)
        return edge

    def delete_edge(self, db: Session, edge_id: str) -> bool:
        edge = db.query(GraphEdge).filter(GraphEdge.edge_id == edge_id).first()
        if not edge:
            return False
        db.delete(edge)
        db.commit()
        return True

    def get_neighbors(self, db: Session, node_id: str, depth: int = 1) -> dict:
        G = self._build_graph(db)
        if node_id not in G:
            return {"nodes": [], "edges": []}

        visited_nodes = {node_id}
        visited_edges = set()
        frontier = {node_id}

        for _ in range(depth):
            next_frontier = set()
            for nid in frontier:
                for neighbor in list(G.successors(nid)) + list(G.predecessors(nid)):
                    if neighbor not in visited_nodes:
                        next_frontier.add(neighbor)
                        visited_nodes.add(neighbor)
                for u, v, d in list(G.out_edges(nid, data=True)) + list(G.in_edges(nid, data=True)):
                    eid = d.get("edge_id")
                    if eid:
                        visited_edges.add(eid)
            frontier = next_frontier

        nodes = db.query(GraphNode).filter(GraphNode.node_id.in_(visited_nodes)).all()
        edges = db.query(GraphEdge).filter(GraphEdge.edge_id.in_(visited_edges)).all()
        return {
            "nodes": [_node_to_dict(n) for n in nodes],
            "edges": [_edge_to_dict(e) for e in edges],
        }

    def search_nodes(self, db: Session, query: str) -> list:
        nodes = db.query(GraphNode).filter(
            GraphNode.label.ilike(f"%{query}%")
        ).limit(50).all()
        return [_node_to_dict(n) for n in nodes]

    def get_full_graph(self, db: Session) -> dict:
        nodes = db.query(GraphNode).all()
        edges = db.query(GraphEdge).all()
        return {
            "nodes": [_node_to_dict(n) for n in nodes],
            "edges": [_edge_to_dict(e) for e in edges],
        }

    def extract_entities_from_text(self, text: str) -> list[dict]:
        """Simple heuristic entity extraction (proper nouns, capitalized phrases)."""
        import re
        words = re.findall(r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b', text)
        seen = set()
        entities = []
        for w in words:
            if w not in seen and len(w) > 2:
                seen.add(w)
                entities.append({"label": w, "node_type": "entity"})
        return entities[:20]  # limit


def _node_to_dict(n: GraphNode) -> dict:
    return {
        "id": n.node_id, "label": n.label, "node_type": n.node_type,
        "color": n.color, "size": n.size, "data": n.data or {},
        "position": {"x": n.position_x, "y": n.position_y},
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


def _edge_to_dict(e: GraphEdge) -> dict:
    return {
        "id": e.edge_id, "source": e.source_id, "target": e.target_id,
        "label": e.label, "edge_type": e.edge_type, "weight": e.weight,
        "data": e.data or {},
    }


graph_engine = GraphEngine()
