from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import logging

from app.core.database import get_db
from app.core.rag_engine import rag_engine
from app.core.knowledge_base import delete_knowledge_item, list_knowledge_items
from app.core.graph_engine import graph_engine
from app.models.note import Note
from app.models.graph import GraphNode, GraphEdge

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


@router.post('/cleanup_note/{note_id}')
def cleanup_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    try:
        rag_engine.delete_document(f"note_{note.id}")
    except Exception as e:
        logger.warning("RAG delete failed for note %s: %s", note.id, e)
    try:
        delete_knowledge_item(db, f"note:{note.id}")
    except Exception as e:
        logger.warning("Knowledge delete failed for note %s: %s", note.id, e)
    try:
        graph_engine.delete_node(db, f"note_{note.id}")
        graph_engine.delete_node(db, f"knowledge_note_note:{note.id}")
    except Exception as e:
        logger.warning("Graph delete failed for note %s: %s", note.id, e)

    # safety-net: remove any GraphNode entries referencing this note_id
    try:
        nodes = db.query(GraphNode).all()
        for n in nodes:
            try:
                data = n.data or {}
                if (n.node_id == f"note_{note.id}") or (n.node_id == f"knowledge_note_note:{note.id}") or (isinstance(data, dict) and data.get("note_id") == note.id):
                    db.query(GraphEdge).filter((GraphEdge.source_id == n.node_id) | (GraphEdge.target_id == n.node_id)).delete(synchronize_session=False)
                    db.delete(n)
            except Exception:
                continue
        db.commit()
    except Exception as e:
        logger.warning("Graph cleanup failed for note %s: %s", note.id, e)

    # Do not delete the Note row here; this endpoint is for cleanup only
    return {"cleaned": True}


@router.post('/sweep_stale_knowledge')
def sweep_stale_knowledge(db: Session = Depends(get_db)):
    """Find KnowledgeItems whose source_key starts with 'note:' but where the Note no longer exists, and remove them."""
    items = list_knowledge_items(db, collection='nexusmind', limit=10000)
    removed: List[str] = []
    for item in items:
        try:
            if item.source_key and item.source_key.startswith("note:"):
                note_id = int(item.source_key.split(":", 1)[1])
                exists = db.query(Note).filter(Note.id == note_id).first()
                if not exists:
                    # remove from rag and knowledge db
                    if item.external_id:
                        try:
                            rag_engine.delete_document(item.external_id)
                        except Exception:
                            pass
                    delete_knowledge_item(db, item.source_key)
                    removed.append(item.source_key)
        except Exception:
            continue
    return {"removed": removed}
