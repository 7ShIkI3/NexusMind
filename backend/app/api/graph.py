from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.core.database import get_db
from app.core.graph_engine import graph_engine

router = APIRouter(prefix="/graph", tags=["graph"])


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
def add_node(data: NodeCreate, db: Session = Depends(get_db)):
    node = graph_engine.add_node(db, **data.model_dump())
    from app.core.graph_engine import _node_to_dict
    return _node_to_dict(node)


@router.put("/nodes/{node_id}")
def update_node(node_id: str, data: NodeUpdate, db: Session = Depends(get_db)):
    node = graph_engine.update_node(db, node_id, **data.model_dump(exclude_none=True))
    if not node:
        raise HTTPException(404, "Node not found")
    from app.core.graph_engine import _node_to_dict
    return _node_to_dict(node)


@router.delete("/nodes/{node_id}")
def delete_node(node_id: str, db: Session = Depends(get_db)):
    if not graph_engine.delete_node(db, node_id):
        raise HTTPException(404, "Node not found")
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
async def extract_entities(body: dict, db: Session = Depends(get_db)):
    text = body.get("text", "")
    note_id = body.get("note_id")
    entities = graph_engine.extract_entities_from_text(text)
    created_nodes = []
    for ent in entities:
        node = graph_engine.add_node(db, label=ent["label"],
                                     node_type=ent.get("node_type", "entity"),
                                     data={"source_note_id": note_id} if note_id else {})
        from app.core.graph_engine import _node_to_dict
        created_nodes.append(_node_to_dict(node))
    return {"entities": created_nodes}
