from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import asyncio
import logging

from app.core.database import get_db
from app.core.knowledge_base import delete_knowledge_item, upsert_knowledge_item
from app.core.graph_engine import graph_engine
from app.core.rag_engine import rag_engine
from app.core.extension_manager import hooks
from app.models.note import Note, Folder

router = APIRouter(prefix="/notes", tags=["notes"])
logger = logging.getLogger(__name__)


def _emit_hook(event: str, payload: dict) -> None:
    try:
        asyncio.run(hooks.emit(event, payload))
    except RuntimeError:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(hooks.emit(event, payload))
        else:
            loop.run_until_complete(hooks.emit(event, payload))


class NoteCreate(BaseModel):
    title: str = "Untitled"
    content: str = ""
    content_html: str = ""
    tags: list[str] = []
    folder_id: Optional[int] = None
    color: Optional[str] = None
    is_pinned: bool = False
    metadata: dict = {}


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    content_html: Optional[str] = None
    tags: Optional[list[str]] = None
    folder_id: Optional[int] = None
    color: Optional[str] = None
    is_pinned: Optional[bool] = None
    metadata: Optional[dict] = None


class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None


@router.get("/")
def list_notes(
    db: Session = Depends(get_db),
    folder_id: Optional[int] = None,
    tag: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0, description="Number of notes to skip"),
    limit: int = Query(50, ge=1, le=1000, description="Number of notes to return (max 1000)"),
):
    """List notes with pagination and filters."""
    query = db.query(Note)
    if folder_id is not None:
        query = query.filter(Note.folder_id == folder_id)
    if tag:
        query = query.filter(Note.tags.contains([tag]))
    if search:
        query = query.filter(
            (Note.title.ilike(f"%{search}%")) | (Note.content.ilike(f"%{search}%"))
        )
    
    # Apply pagination
    notes = query.order_by(Note.updated_at.desc()).offset(skip).limit(limit).all()
    return [_note_dict(n) for n in notes]


@router.post("/")
def create_note(data: NoteCreate, db: Session = Depends(get_db)):
    note = Note(
        title=data.title, content=data.content, content_html=data.content_html,
        tags=data.tags, folder_id=data.folder_id, color=data.color,
        is_pinned=data.is_pinned, metadata_=data.metadata,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    try:
        text = f"{note.title}\n{note.content}"
        # rag_engine.add_document will handle both ChromaDB and Graph sync via _safe_graph_sync_for_item
        rag_engine.add_document(
            text,
            doc_id=f"note_{note.id}",
            metadata={
                "type": "note",
                "note_id": note.id,
                "title": note.title,
                "source_key": f"note:{note.id}",
                "source": "note",
                "tags": note.tags or [],
                "folder_id": note.folder_id,
            },
        )
        note.embedding_id = f"note_{note.id}"
        db.commit()
    except Exception as e:
        logger.warning("RAG/Graph sync failed for note %s: %s", note.id, e)

    try:
        text = f"{note.title}\n{note.content}"
        # auto_link_notes ensures the note is in the graph and links it to others
        graph_engine.auto_link_notes(db, source_note_id=note.id, note_title=note.title, text=text)
    except Exception as e:
        logger.warning("Graph auto-linking failed for note %s: %s", note.id, e)

    _emit_hook("note.created", _note_dict(note))
    return _note_dict(note)


@router.get("/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    return _note_dict(note)


@router.put("/{note_id}")
def update_note(note_id: int, data: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")

    for field, value in data.model_dump(exclude_none=True).items():
        if field == "metadata":
            note.metadata_ = value
        else:
            setattr(note, field, value)

    note.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(note)

    try:
        text = f"{note.title}\n{note.content}"
        rag_engine.delete_document(f"note_{note.id}")
        # Re-ingest handles both RAG and Graph updates
        rag_engine.add_document(
            text,
            doc_id=f"note_{note.id}",
            metadata={
                "type": "note",
                "note_id": note.id,
                "title": note.title,
                "source_key": f"note:{note.id}",
                "source": "note",
                "tags": note.tags or [],
                "folder_id": note.folder_id,
            },
        )
    except Exception as e:
        logger.warning("RAG/Graph update failed for note %s: %s", note.id, e)

    try:
        text = f"{note.title}\n{note.content}"
        graph_engine.auto_link_notes(db, source_note_id=note.id, note_title=note.title, text=text)
    except Exception as e:
        logger.warning("Graph update failed for note %s: %s", note.id, e)

    _emit_hook("note.updated", _note_dict(note))
    return _note_dict(note)


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Not found")
    try:
        rag_engine.delete_document(f"note_{note.id}")
    except Exception as e:
        logger.warning("RAG delete failed for note %s: %s", note.id, e)
    try:
        delete_knowledge_item(db, f"note:{note.id}")
    except Exception as e:
        logger.warning("Knowledge delete failed for note %s: %s", note.id, e)
    try:
        # Remove graph nodes associated with this note (both the note node
        # and the knowledge node created for the note) so the graph stays
        # in sync with the database and RAG.
        graph_engine.delete_node(db, f"note_{note.id}")
        graph_engine.delete_node(db, f"knowledge_note_note:{note.id}")
    except Exception as e:
        logger.warning("Graph delete failed for note %s: %s", note.id, e)
    try:
        # As a safety-net, remove any GraphNode entries whose data references
        # this note_id (covers cases where nodes were created concurrently
        # or with slightly different node_id patterns).
        from app.models.graph import GraphNode, GraphEdge
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
    db.delete(note)
    db.commit()
    _emit_hook("note.deleted", {"id": note.id, "title": note.title, "folder_id": note.folder_id})
    return {"deleted": True}


# Folders
@router.get("/folders/all")
def list_folders(db: Session = Depends(get_db)):
    folders = db.query(Folder).all()
    return [{"id": f.id, "name": f.name, "parent_id": f.parent_id,
             "color": f.color, "icon": f.icon} for f in folders]


@router.post("/folders/")
def create_folder(data: FolderCreate, db: Session = Depends(get_db)):
    folder = Folder(**data.model_dump())
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "parent_id": folder.parent_id}


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if not folder:
        raise HTTPException(404, "Folder not found")
    # Move notes to root
    db.query(Note).filter(Note.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()
    return {"deleted": True}


def _note_dict(n: Note) -> dict:
    return {
        "id": n.id, "title": n.title, "content": n.content,
        "content_html": n.content_html, "tags": n.tags or [],
        "folder_id": n.folder_id, "color": n.color, "is_pinned": n.is_pinned,
        "metadata": n.metadata_ or {},
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }
