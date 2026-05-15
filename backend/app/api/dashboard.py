from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db, SessionLocal
from app.core.knowledge_base import list_knowledge_items, summarize_knowledge_items
from app.core.extension_manager import extension_manager
from app.core.graph_engine import graph_engine
from app.core.rag_engine import rag_engine
from app.core.ai_manager import ai_manager
from app.models.knowledge import KnowledgeItem
from app.models.note import Note, Folder
from app.models.routine import Routine
from app.models.extension import Extension
from app.models.chat import Conversation, Message


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/overview")
def get_overview(db: Session = Depends(get_db)):
    graph_stats = graph_engine.get_full_graph(db)
    rag_stats = rag_engine.get_stats()
    knowledge_items = list_knowledge_items(db, collection="nexusmind", limit=1000)

    notes_count = db.query(Note).count()
    folders_count = db.query(Folder).count()
    routines_count = db.query(Routine).count()
    enabled_routines = db.query(Routine).filter(Routine.enabled.is_(True)).count()
    extensions_count = db.query(Extension).count()
    enabled_extensions = db.query(Extension).filter(Extension.enabled.is_(True)).count()
    conversations_count = db.query(Conversation).count()
    messages_count = db.query(Message).count()

    providers = ai_manager.available_providers()
    provider_status = []
    for provider in providers:
        provider_status.append({
            "name": provider["name"],
            "available": provider["available"],
        })

    graph_node_count = len(graph_stats.get("nodes", []))
    graph_edge_count = len(graph_stats.get("edges", []))
    graph_nodes = graph_stats.get("nodes", [])
    graph_edges = graph_stats.get("edges", [])
    central_nodes = []
    degrees: dict[str, int] = {}
    for edge in graph_edges:
        degrees[edge["source"]] = degrees.get(edge["source"], 0) + 1
        degrees[edge["target"]] = degrees.get(edge["target"], 0) + 1
    for node_id, degree in sorted(degrees.items(), key=lambda item: item[1], reverse=True)[:5]:
        node = next((node for node in graph_nodes if node["id"] == node_id), None)
        if node:
            central_nodes.append({
                "id": node_id,
                "label": node["label"],
                "connections": degree,
                "node_type": node.get("node_type"),
            })

    orphan_notes = []
    note_nodes = {node["id"] for node in graph_nodes if node.get("node_type") == "note"}
    for note in db.query(Note).order_by(Note.updated_at.desc()).all():
        note_node_id = f"note_{note.id}"
        if note_node_id not in note_nodes:
            orphan_notes.append({
                "id": note.id,
                "title": note.title,
                "updated_at": note.updated_at.isoformat() if note.updated_at else None,
            })

    knowledge_summary = summarize_knowledge_items(knowledge_items)
    shared_activity = {
        "items": len(knowledge_items),
        "notes": db.query(KnowledgeItem).filter(KnowledgeItem.source_type == "note").count(),
        "documents": db.query(KnowledgeItem).filter(KnowledgeItem.source_type == "rag").count(),
        "shared_sources": len({item.source_key for item in knowledge_items if item.source_key}),
    }

    recent_items = [
        {
            "id": item.id,
            "source_type": item.source_type,
            "title": item.title,
            "source_key": item.source_key,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "tags": item.tags or [],
        }
        for item in knowledge_items[:8]
    ]

    link_density = 0.0
    if graph_node_count > 0:
        link_density = round((graph_edge_count / max(graph_node_count, 1)), 2)

    sample_edges = [
        {
            "source": edge["source"],
            "target": edge["target"],
            "label": edge.get("label"),
            "edge_type": edge.get("edge_type"),
        }
        for edge in graph_edges[:24]
    ]

    recent_notes = [
        {
            "id": note.id,
            "title": note.title,
            "updated_at": note.updated_at.isoformat() if note.updated_at else None,
        }
        for note in db.query(Note).order_by(Note.updated_at.desc()).limit(5).all()
    ]

    latest_extensions = extension_manager.list_loaded()

    return {
        "app": {
            "name": "NexusMind",
            "version": "1.0.0",
        },
        "health": {
            "backend": True,
            "rag_available": rag_stats.get("available", False),
            "knowledge_shared": True,
        },
        "counts": {
            "notes": notes_count,
            "folders": folders_count,
            "graph_nodes": graph_node_count,
            "graph_edges": graph_edge_count,
            "rag_chunks": rag_stats.get("document_chunks", 0),
            "knowledge_items": shared_activity["items"],
            "routines": routines_count,
            "enabled_routines": enabled_routines,
            "extensions": extensions_count,
            "enabled_extensions": enabled_extensions,
            "conversations": conversations_count,
            "messages": messages_count,
        },
        "analysis": {
            "link_density": link_density,
            "orphan_notes": len(orphan_notes),
            "knowledge_summary": knowledge_summary,
        },
        "shared_activity": shared_activity,
        "sample_edges": sample_edges,
        "providers": provider_status,
        "central_nodes": central_nodes,
        "orphan_notes": orphan_notes,
        "recent_items": recent_items,
        "recent_notes": recent_notes,
        "extensions_loaded": latest_extensions,
    }