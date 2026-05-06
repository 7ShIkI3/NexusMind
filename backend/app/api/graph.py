from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import logging

from app.core.database import get_db
from app.core.graph_engine import graph_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/graph", tags=["graph"])


def _index_node(node_id: str, label: str, node_type: str, data: dict) -> None:
    """Index a graph node into the vector store (runs in background)."""
    try:
        from app.core.rag_engine import rag_engine
        text_parts = [label]
        if data:
            for k, v in data.items():
                if v:
                    text_parts.append(f"{k}: {v}")
        text = "\n".join(text_parts)
        rag_engine.add_document(
            text, doc_id=f"graph_node_{node_id}",
            metadata={"type": "graph_node", "node_id": node_id,
                      "label": label, "node_type": node_type},
        )
    except Exception:
        logger.exception("Failed to index graph node %s in vector store", node_id)


def _deindex_node(node_id: str) -> None:
    """Remove a graph node from the vector store (runs in background)."""
    try:
        from app.core.rag_engine import rag_engine
        rag_engine.delete_document(f"graph_node_{node_id}")
    except Exception:
        logger.exception("Failed to remove graph node %s from vector store", node_id)


class NodeCreate(BaseModel):
    label: str
    node_type: str = "default"
    data: dict = {}
    color: Optional[str] = None
    size: float = 30.0
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class NodeUpdate(BaseModel):
    label: Optional[str] = None
    node_type: Optional[str] = None
    data: Optional[dict] = None
    color: Optional[str] = None
    size: Optional[float] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class EdgeCreate(BaseModel):
    source_id: str
    target_id: str
    label: Optional[str] = None
    edge_type: str = "relates_to"
    weight: float = 1.0
    data: dict = {}


@router.get("/")
def get_full_graph(db: Session = Depends(get_db)):
    return graph_engine.get_full_graph(db)


@router.post("/nodes")
def add_node(data: NodeCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    node = graph_engine.add_node(db, **data.model_dump())
    from app.core.graph_engine import _node_to_dict
    background_tasks.add_task(_index_node, node.node_id, node.label, node.node_type, node.data or {})
    return _node_to_dict(node)


@router.put("/nodes/{node_id}")
def update_node(node_id: str, data: NodeUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    node = graph_engine.update_node(db, node_id, **data.model_dump(exclude_none=True))
    if not node:
        raise HTTPException(404, "Node not found")
    from app.core.graph_engine import _node_to_dict
    background_tasks.add_task(_index_node, node.node_id, node.label, node.node_type, node.data or {})
    return _node_to_dict(node)


@router.delete("/nodes/{node_id}")
def delete_node(node_id: str, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not graph_engine.delete_node(db, node_id):
        raise HTTPException(404, "Node not found")
    background_tasks.add_task(_deindex_node, node_id)
    return {"deleted": True}


@router.post("/edges")
def add_edge(data: EdgeCreate, db: Session = Depends(get_db)):
    edge = graph_engine.add_edge(db, **data.model_dump())
    from app.core.graph_engine import _edge_to_dict
    return _edge_to_dict(edge)


@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: str, db: Session = Depends(get_db)):
    if not graph_engine.delete_edge(db, edge_id):
        raise HTTPException(404, "Edge not found")
    return {"deleted": True}


@router.get("/neighbors/{node_id}")
def get_neighbors(node_id: str, depth: int = 1, db: Session = Depends(get_db)):
    return graph_engine.get_neighbors(db, node_id, depth)


@router.get("/search")
def search_nodes(q: str, db: Session = Depends(get_db)):
    return graph_engine.search_nodes(db, q)


@router.post("/extract-entities")
async def extract_entities(body: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    text = body.get("text", "")
    note_id = body.get("note_id")
    entities = graph_engine.extract_entities_from_text(text)
    created_nodes = []
    for ent in entities:
        node = graph_engine.add_node(db, label=ent["label"],
                                     node_type=ent.get("node_type", "entity"),
                                     data={"source_note_id": note_id} if note_id else {})
        from app.core.graph_engine import _node_to_dict
        background_tasks.add_task(_index_node, node.node_id, node.label, node.node_type, node.data or {})
        created_nodes.append(_node_to_dict(node))
    return {"entities": created_nodes}
