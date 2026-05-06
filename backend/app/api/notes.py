from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import logging

from app.core.database import get_db
from app.models.note import Note, Folder

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])


def _index_note(note_id: int, title: str, content: str) -> None:
    """Add or replace a note's chunks in the vector store (runs in background)."""
    try:
        from app.core.rag_engine import rag_engine
        from app.core.database import SessionLocal
        text = f"{title}\n{content}"
        rag_engine.add_document(
            text, doc_id=f"note_{note_id}",
            metadata={"type": "note", "note_id": note_id, "title": title},
        )
        db = SessionLocal()
        try:
            note = db.query(Note).filter(Note.id == note_id).first()
            if note:
                note.embedding_id = f"note_{note_id}"
                db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to index note %s in vector store", note_id)


def _reindex_note(note_id: int, title: str, content: str) -> None:
    """Delete then re-add a note's chunks in the vector store (runs in background)."""
    try:
        from app.core.rag_engine import rag_engine
        rag_engine.delete_document(f"note_{note_id}")
        text = f"{title}\n{content}"
        rag_engine.add_document(
            text, doc_id=f"note_{note_id}",
            metadata={"type": "note", "note_id": note_id, "title": title},
        )
    except Exception:
        logger.exception("Failed to re-index note %s in vector store", note_id)


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
    skip: int = 0,
    limit: int = 100,
):
    query = db.query(Note)
    if folder_id is not None:
        query = query.filter(Note.folder_id == folder_id)
    if tag:
        query = query.filter(Note.tags.contains([tag]))
    if search:
        query = query.filter(
            (Note.title.ilike(f"%{search}%")) | (Note.content.ilike(f"%{search}%"))
        )
    notes = query.order_by(Note.updated_at.desc()).offset(skip).limit(limit).all()
    return [_note_dict(n) for n in notes]


@router.post("/")
def create_note(data: NoteCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    note = Note(
        title=data.title, content=data.content, content_html=data.content_html,
        tags=data.tags, folder_id=data.folder_id, color=data.color,
        is_pinned=data.is_pinned, metadata_=data.metadata,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    background_tasks.add_task(_index_note, note.id, note.title, note.content)

    return _note_dict(note)


@router.get("/{note_id}")
def get_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    return _note_dict(note)


@router.put("/{note_id}")
def update_note(note_id: int, data: NoteUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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

    background_tasks.add_task(_reindex_note, note.id, note.title, note.content)

    return _note_dict(note)


@router.delete("/{note_id}")
def delete_note(note_id: int, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Not found")
    try:
        from app.core.rag_engine import rag_engine
        rag_engine.delete_document(f"note_{note.id}")
    except Exception:
        pass
    db.delete(note)
    db.commit()
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
