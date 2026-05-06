import json
import asyncio
import logging
import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List

logger = logging.getLogger(__name__)

from app.core.database import get_db
from app.core.ai_manager import ai_manager
from app.core.rag_engine import rag_engine
from app.models.chat import Conversation, Message

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    provider: str = "ollama"
    model: Optional[str] = None
    conversation_id: Optional[int] = None
    system_prompt: Optional[str] = None
    use_rag: bool = False
    rag_collection: str = "nexusmind"
    use_notes_context: bool = False
    use_graph_context: bool = False
    stream: bool = False


class AgentRequest(BaseModel):
    """Request for the AI agent that can read and write notes and graph nodes."""
    message: str
    provider: str = "ollama"
    model: Optional[str] = None
    conversation_id: Optional[int] = None
    system_prompt: Optional[str] = None
    tools: List[str] = []   # e.g. ["notes", "graph"]


class ConversationCreate(BaseModel):
    title: str = "New Conversation"
    provider: str = "ollama"
    model: str = "llama3"
    system_prompt: Optional[str] = None


@router.post("/")
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    # Get or create conversation
    if req.conversation_id:
        conv = db.query(Conversation).filter(Conversation.id == req.conversation_id).first()
        if not conv:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(title=req.message[:50], provider=req.provider,
                            model=req.model or "default",
                            system_prompt=req.system_prompt)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # Save user message
    user_msg = Message(conversation_id=conv.id, role="user", content=req.message,
                       provider=req.provider, model=req.model)
    db.add(user_msg)
    db.commit()

    # Build messages list
    messages = []
    if conv.system_prompt:
        messages.append({"role": "system", "content": conv.system_prompt})

    # Load history (last 20 messages)
    history = db.query(Message).filter(
        Message.conversation_id == conv.id,
        Message.id != user_msg.id
    ).order_by(Message.created_at.desc()).limit(20).all()
    for m in reversed(history):
        messages.append({"role": m.role, "content": m.content})

    # RAG augmentation
    if req.use_rag or req.use_notes_context or req.use_graph_context:
        context_chunks = []
        if req.use_rag:
            context_chunks.extend(
                rag_engine.query(req.message, collection=req.rag_collection)
            )
        if req.use_notes_context:
            notes_chunks = rag_engine.query(
                req.message, top_k=3, collection=req.rag_collection,
                where={"type": "note"},
            )
            context_chunks.extend(notes_chunks)
        if req.use_graph_context:
            graph_chunks = rag_engine.query(
                req.message, top_k=3, collection=req.rag_collection,
                where={"type": "graph_node"},
            )
            context_chunks.extend(graph_chunks)
        if context_chunks:
            messages = ai_manager.build_rag_prompt(req.message, context_chunks,
                                                    conv.system_prompt)
        else:
            messages.append({"role": "user", "content": req.message})
    else:
        messages.append({"role": "user", "content": req.message})

    if req.stream:
        async def generate():
            full_response = []
            yield f"data: {json.dumps({'conversation_id': conv.id, 'type': 'start'})}\n\n"
            try:
                async for chunk in ai_manager.stream_chat(
                        req.provider, messages, req.model):
                    full_response.append(chunk)
                    yield f"data: {json.dumps({'type': 'chunk', 'content': chunk})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
                return

            response_text = "".join(full_response)
            ai_msg = Message(conversation_id=conv.id, role="assistant",
                             content=response_text, provider=req.provider, model=req.model)
            db.add(ai_msg)
            db.commit()
            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id})}\n\n"

        return StreamingResponse(generate(), media_type="text/event-stream")

    # Non-streaming
    try:
        response = await ai_manager.chat(req.provider, messages, req.model)
    except Exception as e:
        logger.error("AI chat error: %s", e, exc_info=True)
        raise HTTPException(500, "AI provider error. Check server logs for details.")

    ai_msg = Message(conversation_id=conv.id, role="assistant",
                     content=response, provider=req.provider, model=req.model)
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return {
        "conversation_id": conv.id,
        "message_id": ai_msg.id,
        "response": response,
        "provider": req.provider,
        "model": req.model,
    }


@router.get("/conversations")
def list_conversations(db: Session = Depends(get_db),
                       skip: int = 0, limit: int = 50):
    convs = db.query(Conversation).order_by(
        Conversation.updated_at.desc()).offset(skip).limit(limit).all()
    return [{"id": c.id, "title": c.title, "provider": c.provider,
             "model": c.model, "updated_at": c.updated_at} for c in convs]


@router.post("/conversations")
def create_conversation(data: ConversationCreate, db: Session = Depends(get_db)):
    conv = Conversation(**data.model_dump())
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.get("/conversations/{conv_id}")
def get_conversation(conv_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    msgs = [{"id": m.id, "role": m.role, "content": m.content,
             "created_at": m.created_at} for m in conv.messages]
    return {"id": conv.id, "title": conv.title, "provider": conv.provider,
            "model": conv.model, "system_prompt": conv.system_prompt,
            "messages": msgs}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Not found")
    db.delete(conv)
    db.commit()
    return {"deleted": True}


@router.get("/providers")
async def list_providers():
    providers = ai_manager.available_providers()
    return providers


@router.get("/models/{provider}")
async def list_models(provider: str):
    try:
        models = await ai_manager.list_models(provider)
        return {"provider": provider, "models": models}
    except Exception as e:
        raise HTTPException(400, str(e))


# ---------------------------------------------------------------------------
# AI Agent endpoint — the AI can read notes/graph and create new content
# ---------------------------------------------------------------------------

_AGENT_SYSTEM = """You are an AI assistant integrated with NexusMind, a knowledge management system.
You have access to the following tools that you can invoke by including structured blocks in your response.

To create a note, include:
[CREATE_NOTE]
title: <note title>
content: <note content in markdown>
tags: <comma-separated tags, optional>
[/CREATE_NOTE]

To add a graph node, include:
[ADD_GRAPH_NODE]
label: <node label>
node_type: <type, e.g. concept/person/place/entity>
description: <short description, optional>
[/ADD_GRAPH_NODE]

To add a graph edge between two existing nodes (by label), include:
[ADD_GRAPH_EDGE]
source: <source node label>
target: <target node label>
label: <relationship label>
[/ADD_GRAPH_EDGE]

You may include multiple tool blocks. Always explain what you are doing in plain text outside the blocks.
"""


def _parse_agent_actions(text: str) -> list[dict]:
    """Parse structured action blocks from AI response text."""
    actions = []

    # CREATE_NOTE
    for match in re.finditer(
        r'\[CREATE_NOTE\]\s*(.*?)\s*\[/CREATE_NOTE\]', text, re.DOTALL
    ):
        block = match.group(1)
        note_data: dict = {"type": "create_note"}
        for key in ("title", "content", "tags"):
            m = re.search(rf'^{key}:\s*(.+?)(?=\n\w+:|$)', block, re.MULTILINE | re.DOTALL)
            if m:
                note_data[key] = m.group(1).strip()
        if "title" in note_data or "content" in note_data:
            actions.append(note_data)

    # ADD_GRAPH_NODE
    for match in re.finditer(
        r'\[ADD_GRAPH_NODE\]\s*(.*?)\s*\[/ADD_GRAPH_NODE\]', text, re.DOTALL
    ):
        block = match.group(1)
        node_data: dict = {"type": "add_graph_node"}
        for key in ("label", "node_type", "description"):
            m = re.search(rf'^{key}:\s*(.+)', block, re.MULTILINE)
            if m:
                node_data[key] = m.group(1).strip()
        if "label" in node_data:
            actions.append(node_data)

    # ADD_GRAPH_EDGE
    for match in re.finditer(
        r'\[ADD_GRAPH_EDGE\]\s*(.*?)\s*\[/ADD_GRAPH_EDGE\]', text, re.DOTALL
    ):
        block = match.group(1)
        edge_data: dict = {"type": "add_graph_edge"}
        for key in ("source", "target", "label"):
            m = re.search(rf'^{key}:\s*(.+)', block, re.MULTILINE)
            if m:
                edge_data[key] = m.group(1).strip()
        if "source" in edge_data and "target" in edge_data:
            actions.append(edge_data)

    return actions


async def _execute_agent_actions(actions: list[dict], db: Session) -> list[dict]:
    """Execute parsed agent actions and return results."""
    from app.models.note import Note
    from app.models.graph import GraphNode, GraphEdge
    from app.core.graph_engine import graph_engine
    import uuid

    results = []
    for action in actions:
        try:
            if action["type"] == "create_note":
                tags_raw = action.get("tags", "")
                tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []
                note = Note(
                    title=action.get("title", "Untitled"),
                    content=action.get("content", ""),
                    content_html="",
                    tags=tags,
                )
                db.add(note)
                db.commit()
                db.refresh(note)
                # Index in RAG background
                from app.api.notes import _index_note
                _index_note(note.id, note.title, note.content)
                results.append({"type": "create_note", "id": note.id,
                                 "title": note.title, "success": True})

            elif action["type"] == "add_graph_node":
                node = graph_engine.add_node(
                    db,
                    label=action["label"],
                    node_type=action.get("node_type", "concept"),
                    data={"description": action.get("description", "")},
                )
                from app.api.graph import _index_node
                _index_node(node.node_id, node.label, node.node_type, node.data or {})
                results.append({"type": "add_graph_node", "id": node.node_id,
                                 "label": node.label, "success": True})

            elif action["type"] == "add_graph_edge":
                src = db.query(GraphNode).filter(
                    GraphNode.label.ilike(action["source"])
                ).first()
                tgt = db.query(GraphNode).filter(
                    GraphNode.label.ilike(action["target"])
                ).first()
                if src and tgt:
                    edge = graph_engine.add_edge(
                        db, source_id=src.node_id, target_id=tgt.node_id,
                        label=action.get("label", "relates_to"),
                    )
                    results.append({"type": "add_graph_edge", "id": edge.edge_id,
                                     "source": src.label, "target": tgt.label,
                                     "success": True})
                else:
                    results.append({"type": "add_graph_edge", "success": False,
                                     "error": f"Node not found: {action['source']} or {action['target']}"})
        except Exception as exc:
            logger.exception("Agent action failed: %s", action)
            results.append({"type": action.get("type"), "success": False, "error": str(exc)})
    return results


@router.post("/agent")
async def agent_chat(req: AgentRequest, db: Session = Depends(get_db)):
    """AI agent that can read notes/graph context and create new content."""
    # Get or create conversation
    if req.conversation_id:
        conv = db.query(Conversation).filter(Conversation.id == req.conversation_id).first()
        if not conv:
            raise HTTPException(404, "Conversation not found")
    else:
        conv = Conversation(
            title=req.message[:50],
            provider=req.provider,
            model=req.model or "default",
            system_prompt=req.system_prompt,
        )
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # Save user message
    user_msg = Message(conversation_id=conv.id, role="user", content=req.message,
                       provider=req.provider, model=req.model)
    db.add(user_msg)
    db.commit()

    # Build context from notes and graph via RAG
    context_chunks = rag_engine.query(req.message, top_k=5, collection="nexusmind")

    # Build system prompt with tool descriptions when tools requested
    tools_enabled = bool(req.tools)
    base_system = req.system_prompt or ""
    if tools_enabled:
        system_content = (_AGENT_SYSTEM + "\n\n" + base_system).strip()
    else:
        system_content = base_system

    if context_chunks:
        messages = ai_manager.build_rag_prompt(req.message, context_chunks, system_content or None)
    else:
        messages = []
        if system_content:
            messages.append({"role": "system", "content": system_content})
        messages.append({"role": "user", "content": req.message})

    try:
        response = await ai_manager.chat(req.provider, messages, req.model)
    except Exception as e:
        logger.error("Agent AI chat error: %s", e, exc_info=True)
        raise HTTPException(500, "AI provider error. Check server logs for details.")

    # Execute any tool actions found in the response
    executed_actions: list[dict] = []
    if tools_enabled:
        actions = _parse_agent_actions(response)
        if actions:
            executed_actions = await _execute_agent_actions(actions, db)

    # Save assistant message
    ai_msg = Message(conversation_id=conv.id, role="assistant",
                     content=response, provider=req.provider, model=req.model)
    db.add(ai_msg)
    db.commit()
    db.refresh(ai_msg)

    return {
        "conversation_id": conv.id,
        "message_id": ai_msg.id,
        "response": response,
        "provider": req.provider,
        "model": req.model,
        "context_used": len(context_chunks),
        "actions_executed": executed_actions,
    }
