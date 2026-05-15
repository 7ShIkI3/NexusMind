"""
Graph Engine - Knowledge graph management using NetworkX with persistence.
"""
from __future__ import annotations

import uuid
import re
import time
from typing import Optional
import networkx as nx
from sqlalchemy import func

from sqlalchemy.orm import Session
from app.models.graph import GraphNode, GraphEdge


class GraphEngine:
    def __init__(self):
        self._graph: Optional[nx.DiGraph] = None
        self._graph_cache_time: float = 0
        self._cache_ttl_seconds: int = 60  # Cache for 60 seconds

    def invalidate_cache(self):
        """Invalidate the graph cache."""
        self._graph = None
        self._graph_cache_time = 0

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

    def get_graph(self, db: Session, max_age_seconds: int = None) -> nx.DiGraph:
        """Get graph with caching to reduce N+1 queries."""
        if max_age_seconds is None:
            max_age_seconds = self._cache_ttl_seconds
        
        now = time.time()
        if self._graph and (now - self._graph_cache_time) < max_age_seconds:
            return self._graph
        
        self._graph = self._build_graph(db)
        self._graph_cache_time = now
        return self._graph

    def add_node(self, db: Session, label: str, node_type: str = "default",
                 data: dict = None, color: str = None, size: float = 30.0,
                 position_x: float = None, position_y: float = None,
                 node_id: str = None) -> GraphNode:
        node_id = node_id or str(uuid.uuid4())
        node = GraphNode(node_id=node_id, label=label, node_type=node_type,
                         data=data or {}, color=color, size=size,
                         position_x=position_x, position_y=position_y)
        db.add(node)
        db.commit()
        db.refresh(node)
        self.invalidate_cache()  # Invalidate cache after modification
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
        self.invalidate_cache()  # Invalidate cache after modification
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
        self.invalidate_cache()  # Invalidate cache after modification
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
        self.invalidate_cache()  # Invalidate cache after modification
        return edge

    def get_node(self, db: Session, node_id: str) -> Optional[GraphNode]:
        return db.query(GraphNode).filter(GraphNode.node_id == node_id).first()

    def find_node_by_label_type(self, db: Session, label: str, node_type: str) -> Optional[GraphNode]:
        return db.query(GraphNode).filter(
            func.lower(GraphNode.label) == label.lower(),
            GraphNode.node_type == node_type,
        ).first()

    def _normalize_node_type(self, node_type: str | None) -> str:
        mapping = {
            "rag": "file",
            "file_upload": "file",
            "document": "file",
            "knowledge": "file",
            "note": "note",
            "entity": "entity",
            "url": "url",
            "folder": "folder",
            "concept": "concept",
        }
        normalized = (node_type or "default").strip().lower()
        return mapping.get(normalized, normalized or "default")

    def add_or_get_entity_node(self, db: Session, label: str,
                               data: dict = None, color: str = None) -> GraphNode:
        existing = self.find_node_by_label_type(db, label=label, node_type="entity")
        if existing:
            merged = dict(existing.data or {})
            duplicate_count = int(merged.get("duplicate_count") or 1) + 1
            merged["duplicate_count"] = duplicate_count
            merged["is_duplicate"] = duplicate_count > 1
            merged["duplicate_marker"] = f"duplicate:{existing.node_id}"
            labels = merged.get("duplicate_labels") or []
            if label not in labels:
                labels.append(label)
            merged["duplicate_labels"] = labels
            if data:
                sources = merged.get("duplicate_sources") or []
                source_label = data.get("source_key") or data.get("source_note_id") or data.get("source")
                if source_label and source_label not in sources:
                    sources.append(source_label)
                merged["duplicate_sources"] = sources
            existing.data = merged
            db.commit()
            db.refresh(existing)
            return existing
        node = self.add_node(
            db,
            label=label,
            node_type="entity",
            data=data or {},
            color=color,
        )
        node.data = {
            **(node.data or {}),
            "duplicate_count": 1,
            "is_duplicate": False,
            "duplicate_marker": None,
            "duplicate_labels": [label],
        }
        db.commit()
        db.refresh(node)
        return node

    def add_or_get_edge(self, db: Session, source_id: str, target_id: str,
                        edge_type: str = "relates_to", label: str = None,
                        weight: float = 1.0, data: dict = None) -> GraphEdge:
        existing = db.query(GraphEdge).filter(
            GraphEdge.source_id == source_id,
            GraphEdge.target_id == target_id,
            GraphEdge.edge_type == edge_type,
        ).first()
        if existing:
            return existing
        return self.add_edge(
            db,
            source_id=source_id,
            target_id=target_id,
            edge_type=edge_type,
            label=label,
            weight=weight,
            data=data,
        )

    def upsert_note_node(self, db: Session, note_id: int, note_title: str) -> GraphNode:
        node_id = f"note_{note_id}"
        node = self.get_node(db, node_id)
        if node:
            if note_title:
                node.label = note_title
            node.node_type = "note"
            merged = dict(node.data or {})
            merged["note_id"] = note_id
            node.data = merged
            db.commit()
            db.refresh(node)
            return node
        return self.add_node(
            db,
            label=note_title or f"Note {note_id}",
            node_type="note",
            data={"note_id": note_id},
            node_id=node_id,
        )

    def upsert_knowledge_node(
        self,
        db: Session,
        *,
        source_type: str,
        source_key: str,
        title: str,
        data: dict = None,
        color: str = None,
    ) -> GraphNode:
        # Use a consistent node_id for notes to avoid duplicates
        if source_type == "note":
            try:
                # source_key for notes is typically "note:ID"
                if ":" in source_key:
                    note_id = source_key.split(":", 1)[1]
                    node_id = f"note_{note_id}"
                else:
                    node_id = f"note_{source_key}"
            except Exception:
                node_id = f"knowledge_{source_type}_{source_key}"
        else:
            node_id = f"knowledge_{source_type}_{source_key}"

        node = self.get_node(db, node_id)
        payload = dict(data or {})
        resolved_type = self._normalize_node_type(source_type)
        payload.update({"source_type": source_type, "source_key": source_key, "title": title, "node_type": resolved_type})
        if node:
            node.label = title or node.label
            node.node_type = resolved_type or node.node_type
            node.data = payload
            if color:
                node.color = color
            db.commit()
            db.refresh(node)
            return node
        return self.add_node(
            db,
            label=title or source_key,
            node_type=resolved_type or "file",
            data=payload,
            color=color,
            node_id=node_id,
        )

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
        from sqlalchemy import or_
        nodes = db.query(GraphNode).filter(
            or_(
                GraphNode.label.ilike(f"%{query}%"),
                GraphNode.node_type.ilike(f"%{query}%")
            )
        ).limit(100).all()
        return [_node_to_dict(n) for n in nodes]

    def get_full_graph(self, db: Session) -> dict:
        nodes = db.query(GraphNode).all()
        edges = db.query(GraphEdge).all()
        return {
            "nodes": [_node_to_dict(n) for n in nodes],
            "edges": [_edge_to_dict(e) for e in edges],
        }

    def extract_entities_from_text(self, text: str) -> list[dict]:
        """Enhanced heuristic entity extraction with broader detection."""
        patterns = [
            r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b', # Proper nouns (Multiple capitalized)
            r'\b[A-Z]{2,}\b',                     # Acronyms (NASA, AI, etc.)
            r'\b[A-Z][a-z]{3,}\b',                 # Single capitalized words (min 4 chars)
            r'#(\w+)',                             # Hashtags as entities/concepts
            r'\[\[(.*?)\]\]',                      # Wiki-style links
        ]
        entities = []
        seen = set()

        # Common stopwords or words to ignore in entity extraction
        ignore_list = {"the", "and", "this", "that", "with", "from", "your", "their", "there", "where"}

        for pattern in patterns:
            found = re.findall(pattern, text)
            for w in found:
                # Handle wiki-style or hashtags
                clean_w = w.strip()
                if clean_w.lower() not in seen and len(clean_w) > 2:
                    if clean_w.lower() in ignore_list:
                        continue
                    seen.add(clean_w.lower())
                    
                    # Heuristic type detection
                    node_type = "entity"
                    if pattern == r'#(\w+)': node_type = "concept"
                    if pattern == r'\[\[(.*?)\]\]': node_type = "note"
                    
                    entities.append({"label": clean_w, "node_type": node_type})

        return entities[:30]

    def auto_link_notes(self, db: Session, source_note_id: int, note_title: str, text: str):
        """Link current note to other notes mentioned by title in the text."""
        from app.models.note import Note
        # Find other notes whose titles are mentioned in this text
        other_notes = db.query(Note).filter(
            Note.id != source_note_id,
            Note.title != ""
        ).all()

        source_node = self.upsert_note_node(db, source_note_id, note_title)
        links_created = 0

        for other in other_notes:
            if len(other.title) < 3:
                continue
            # Use regex for whole word match
            pattern = r'\b' + re.escape(other.title) + r'\b'
            if re.search(pattern, text, re.IGNORECASE):
                target_node = self.upsert_note_node(db, other.id, other.title)
                self.add_or_get_edge(
                    db,
                    source_id=source_node.node_id,
                    target_id=target_node.node_id,
                    edge_type="references",
                    label="references"
                )
                links_created += 1
        
        # Also link by tags
        source_note = db.query(Note).filter(Note.id == source_note_id).first()
        if source_note and source_note.tags:
            for tag in source_note.tags:
                tag_node = self.add_or_get_entity_node(db, label=tag, color="#facc15")
                self.add_or_get_edge(
                    db,
                    source_id=source_node.node_id,
                    target_id=tag_node.node_id,
                    edge_type="has_tag",
                    label="has_tag"
                )
        
        # Link by folder
        if source_note and source_note.folder_id:
            from app.models.note import Folder
            folder = db.query(Folder).filter(Folder.id == source_note.folder_id).first()
            if folder:
                folder_node = self.add_node(db, label=folder.name, node_type="folder", 
                                            node_id=f"folder_{folder.id}", color="#3b82f6")
                self.add_or_get_edge(
                    db,
                    source_id=source_node.node_id,
                    target_id=folder_node.node_id,
                    edge_type="part_of",
                    label="part_of"
                )

        return links_created

    def sync_knowledge_item(
        self,
        db: Session,
        *,
        source_type: str,
        source_key: str,
        title: str,
        text: str,
        data: dict = None,
        color: str = None,
    ) -> GraphNode:
        node = self.upsert_knowledge_node(
            db,
            source_type=source_type,
            source_key=source_key,
            title=title,
            data=data,
            color=color,
        )
        entities = self.extract_entities_from_text(text)
        for ent in entities:
            entity_node = self.add_or_get_entity_node(db, label=ent["label"], data={"source_key": source_key})
            self.add_or_get_edge(
                db,
                source_id=node.node_id,
                target_id=entity_node.node_id,
                edge_type="mentions",
                label="mentions",
            )
        return node


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
