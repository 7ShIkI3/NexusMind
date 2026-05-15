from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
import re
from datetime import datetime, timezone

from app.core.database import get_db
from app.core.ai_manager import ai_manager
from app.core.rag_engine import rag_engine
from app.core.extension_manager import hooks
from app.core.knowledge_base import upsert_knowledge_item
from app.core.graph_engine import graph_engine
from app.models.chat import Conversation, Message

router = APIRouter(prefix="/chat", tags=["chat"])
NATIVE_TOOL_PROVIDERS = {"openai", "gemini"}
TOOL_GROUPS = {
    "create": {"create_note", "add_graph_node", "add_graph_edge", "create_file", "search_knowledge"},
    "edit": {"read_note", "update_note", "list_notes", "search_knowledge"},
    "graph": {"add_graph_node", "add_graph_edge", "analyze_graph", "search_knowledge"},
    "search": {"search_knowledge", "list_notes", "analyze_graph"},
    "general": {"create_note", "add_graph_node", "add_graph_edge", "search_knowledge", "create_file", "read_note", "update_note", "list_notes", "analyze_graph"},
}


class ChatRequest(BaseModel):
    message: str
    provider: str = "ollama"
    model: Optional[str] = None
    conversation_id: Optional[int] = None
    system_prompt: Optional[str] = None
    use_rag: bool = False
    rag_collection: str = "nexusmind"
    stream: bool = False


class ConversationCreate(BaseModel):
    title: str = "New Conversation"
    provider: str = "ollama"
    model: str = "llama3"
    system_prompt: Optional[str] = None


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None


def _coerce_message_content(response) -> str:
    if response is None:
        return ""
    if isinstance(response, str):
        return response
    return getattr(response, "content", None) or getattr(response, "text", None) or ""


def _tool_instruction_message(tools: list[dict]) -> str:
    tool_specs = []
    for tool in tools:
        function = tool.get("function", {})
        tool_specs.append({
            "name": function.get("name"),
            "description": function.get("description"),
            "parameters": function.get("parameters", {}),
        })
    return (
        "You are a tool router, not a creative writer. "
        "Use only the tools listed below if they help satisfy the user's request. "
        "Pick the smallest possible set of tools, one step at a time. "
        "Do not invent tool names. Do not mix unrelated goals in the same reply. "
        "If you need a tool, reply with valid JSON only in this format: "
        '{"tool_calls":[{"name":"tool_name","arguments":{...}}]}. '
        " After tools run, produce a short user-facing summary. "
        " Available tools: " + json.dumps(tool_specs, ensure_ascii=False)
    )


def _select_tool_definitions(message: str) -> list[dict]:
    text = (message or "").lower()
    if any(word in text for word in ["create note", "crée une note", "cree une note", "new note", "add note", "note"]):
        allowed = TOOL_GROUPS["create"]
    elif any(word in text for word in ["graph", "node", "edge", "link", "relation", "relation", "connect"]):
        allowed = TOOL_GROUPS["graph"]
    elif any(word in text for word in ["update note", "edit note", "modify note", "read note", "show note", "list notes"]):
        allowed = TOOL_GROUPS["edit"]
    elif any(word in text for word in ["search", "find", "retrieve", "rag", "knowledge"]):
        allowed = TOOL_GROUPS["search"]
    else:
        allowed = TOOL_GROUPS["general"]

    tools = ai_manager.get_tools_definition()
    return [tool for tool in tools if tool["function"]["name"] in allowed]


def _agent_policy_message(tools: list[dict], provider: str, mode: str) -> str:
    tool_names = ", ".join(sorted(tool["function"]["name"] for tool in tools))
    return (
        f"Provider: {provider}. Mode: {mode}. "
        "You must stay focused on a single user goal. "
        "If the user asks to create content, prefer creating the note first, then only add graph nodes or edges if explicitly useful. "
        "If the user asks to search, do not create anything. "
        "If the user asks to modify an existing note, read it first when needed, then update it. "
        "Do not alternate between unrelated tools. Use at most one tool call batch per turn unless the user explicitly requests more. "
        f"Allowed tool names: {tool_names}."
    )


def _extract_tool_calls(text: str) -> list[dict]:
    if not text:
        return []

    candidates = [text.strip()]
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL | re.IGNORECASE)
    if fenced:
        candidates.insert(0, fenced.group(1).strip())

    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except Exception:
            continue

        if isinstance(payload, dict):
            if isinstance(payload.get("tool_calls"), list):
                normalized = []
                for call in payload["tool_calls"]:
                    if not isinstance(call, dict) or not call.get("name"):
                        continue
                    normalized.append({
                        "name": call["name"],
                        "arguments": call.get("arguments") or {},
                    })
                if normalized:
                    return normalized

            if payload.get("name"):
                return [{
                    "name": payload["name"],
                    "arguments": payload.get("arguments") or {},
                }]

    return []


async def _execute_tool_calls(tool_calls: list[dict], db: Session, stream_callback=None) -> tuple[list[dict], list[dict]]:
    history_messages = []
    results = []

    for call in tool_calls:
        name = call["name"]
        args = call.get("arguments") or {}
        if stream_callback:
            await stream_callback("tool_start", {"name": name})

        result = await execute_tool(name, args, db)
        results.append({"name": name, "result": result})
        history_messages.append({
            "role": "tool",
            "name": name,
            "content": json.dumps(result),
        })

        if stream_callback:
            await stream_callback("tool_result", {"name": name, "result": result})

    return results, history_messages


def _merge_agent_messages(base_messages: list[dict], tools: list[dict], provider: str, mode: str, system_prompt: str = None) -> list[dict]:
    agent_messages = list(base_messages)
    system_parts = [_agent_policy_message(tools, provider, mode)]
    if system_prompt:
        system_parts.append(system_prompt)
    agent_messages.insert(0, {"role": "system", "content": "\n\n".join(system_parts)})
    return agent_messages


@router.post("/")
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    """Send a chat message and get a response."""

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
    conv.updated_at = datetime.now(timezone.utc)
    if req.system_prompt is not None and req.system_prompt != conv.system_prompt:
        conv.system_prompt = req.system_prompt
    db.commit()
    await hooks.emit("chat.message", {
        "role": "user",
        "content": req.message,
        "provider": req.provider,
        "model": req.model,
        "conversation_id": conv.id,
    })

    # Build messages list
    messages = []
    if conv.system_prompt:
        messages.append({"role": "system", "content": conv.system_prompt})

    # Load history
    history = db.query(Message).filter(
        Message.conversation_id == conv.id,
        Message.id != user_msg.id
    ).order_by(Message.created_at.desc()).limit(20).all()
    for m in reversed(history):
        messages.append({"role": m.role, "content": m.content})

    # RAG augmentation
    if req.use_rag:
        context_chunks = rag_engine.query(req.message, collection=req.rag_collection)
        if context_chunks:
            messages = ai_manager.build_rag_prompt(req.message, context_chunks,
                                                    conv.system_prompt)
        else:
            messages.append({"role": "user", "content": req.message})
    else:
        messages.append({"role": "user", "content": req.message})

    tool_defs = _select_tool_definitions(req.message)

    async def _save_assistant_message(session: Session, content: str):
        ai_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=content,
            provider=req.provider,
            model=req.model,
        )
        session.add(ai_msg)
        db_conv = session.query(Conversation).filter(Conversation.id == conv.id).first()
        if db_conv:
            db_conv.updated_at = datetime.now(timezone.utc)
        session.commit()
        session.refresh(ai_msg)
        await hooks.emit("chat.message", {
            "role": "assistant",
            "content": content,
            "provider": req.provider,
            "model": req.model,
            "conversation_id": conv.id,
        })
        return ai_msg

    def _openai_tool_calls_from_response(response) -> list[dict]:
        normalized = []
        for call in getattr(response, "tool_calls", []) or []:
            arguments = getattr(getattr(call, "function", None), "arguments", "") or ""
            normalized.append({
                "id": getattr(call, "id", None),
                "name": getattr(getattr(call, "function", None), "name", None),
                "arguments": arguments,
            })
        return [call for call in normalized if call.get("name")]

    async def _answer_without_native_tools(session: Session, current_messages: list[dict]) -> tuple[str, list[dict]]:
        agent_messages = _merge_agent_messages(current_messages, tool_defs, req.provider, "fallback-json", conv.system_prompt)
        response = await ai_manager.chat(req.provider, agent_messages, req.model)
        assistant_text = _coerce_message_content(response)
        tool_calls = _extract_tool_calls(assistant_text)
        if not tool_calls:
            return assistant_text, []

        results, tool_history = await _execute_tool_calls(tool_calls, session)
        continuation_messages = list(current_messages)
        continuation_messages.append({"role": "assistant", "content": assistant_text})
        continuation_messages.extend(tool_history)
        continuation_messages = _merge_agent_messages(
            continuation_messages,
            tool_defs,
            req.provider,
            "fallback-json-followup",
            conv.system_prompt,
        )
        continuation = await ai_manager.chat(req.provider, continuation_messages, req.model)
        return _coerce_message_content(continuation), results

    async def _answer_with_tools(session: Session, current_messages: list[dict]) -> tuple[str, list[dict]]:
        agent_messages = _merge_agent_messages(current_messages, tool_defs, req.provider, "native-tools", conv.system_prompt)
        response = await ai_manager.chat(req.provider, agent_messages, req.model, tools=tool_defs)
        assistant_text = _coerce_message_content(response)

        if req.provider == "openai":
            tool_calls = _openai_tool_calls_from_response(response)
        else:
            tool_calls = getattr(response, "tool_calls", None) or _extract_tool_calls(assistant_text)

        if not tool_calls:
            return assistant_text, []

        results, tool_history = await _execute_tool_calls(tool_calls, session)
        continuation_messages = list(current_messages)
        continuation_messages.append({"role": "assistant", "content": assistant_text})
        continuation_messages.extend(tool_history)
        continuation_messages = _merge_agent_messages(
            continuation_messages,
            tool_defs,
            req.provider,
            "native-tools-followup",
            conv.system_prompt,
        )
        continuation = await ai_manager.chat(req.provider, continuation_messages, req.model, tools=tool_defs)
        return _coerce_message_content(continuation), results

    # Streaming Logic
    if req.stream:
        async def generate():
            from app.core.database import SessionLocal

            stream_db = SessionLocal()
            current_messages = list(messages)
            yield f"data: {json.dumps({'conversation_id': conv.id, 'type': 'start'})}\n\n"

            try:
                if req.provider == "openai":
                    while True:
                        full_response_content = ""
                        tool_calls_buffer = {}

                        async for delta in ai_manager.stream_chat(
                            req.provider,
                            current_messages,
                            req.model,
                            tools=tool_defs,
                        ):
                            if hasattr(delta, "content") and delta.content:
                                full_response_content += delta.content
                                yield f"data: {json.dumps({'type': 'chunk', 'content': delta.content})}\n\n"

                            if hasattr(delta, "tool_calls") and delta.tool_calls:
                                for tc in delta.tool_calls:
                                    idx = getattr(tc, "index", 0)
                                    if idx not in tool_calls_buffer:
                                        tool_calls_buffer[idx] = {"id": tc.id, "name": "", "arguments": ""}
                                    if tc.id:
                                        tool_calls_buffer[idx]["id"] = tc.id
                                    if tc.function.name:
                                        tool_calls_buffer[idx]["name"] = tc.function.name
                                    if tc.function.arguments:
                                        tool_calls_buffer[idx]["arguments"] += tc.function.arguments

                        if tool_calls_buffer:
                            formatted_tool_calls = []
                            for idx in sorted(tool_calls_buffer.keys()):
                                tc = tool_calls_buffer[idx]
                                formatted_tool_calls.append({
                                    "id": tc["id"],
                                    "type": "function",
                                    "function": {"name": tc["name"], "arguments": tc["arguments"]},
                                })
                                yield f"data: {json.dumps({'type': 'tool_start', 'name': tc['name'], 'id': tc['id']})}\n\n"

                            current_messages.append({"role": "assistant", "content": None, "tool_calls": formatted_tool_calls})

                            for tc_data in formatted_tool_calls:
                                func_name = tc_data["function"]["name"]
                                args = json.loads(tc_data["function"]["arguments"] or "{}")
                                result = await execute_tool(func_name, args, stream_db)
                                current_messages.append({
                                    "tool_call_id": tc_data["id"],
                                    "role": "tool",
                                    "name": func_name,
                                    "content": json.dumps(result),
                                })
                                yield f"data: {json.dumps({'type': 'tool_result', 'name': func_name, 'result': result})}\n\n"
                            continue

                        if full_response_content:
                            ai_msg = await _save_assistant_message(stream_db, full_response_content)
                            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id})}\n\n"
                        break

                elif req.provider in NATIVE_TOOL_PROVIDERS:
                    try:
                        final_text, tool_results = await _answer_with_tools(stream_db, current_messages)
                        for result in tool_results:
                            yield f"data: {json.dumps({'type': 'tool_start', 'name': result['name'], 'id': None})}\n\n"
                            yield f"data: {json.dumps({'type': 'tool_result', 'name': result['name'], 'result': result['result']})}\n\n"
                        if final_text:
                            yield f"data: {json.dumps({'type': 'chunk', 'content': final_text})}\n\n"
                            ai_msg = await _save_assistant_message(stream_db, final_text)
                            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id})}\n\n"
                    except Exception as e:
                        error_msg = str(e) if isinstance(e, Exception) else str(e)
                        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"

                else:
                    try:
                        final_text, tool_results = await _answer_without_native_tools(stream_db, current_messages)
                        for result in tool_results:
                            yield f"data: {json.dumps({'type': 'tool_start', 'name': result['name'], 'id': None})}\n\n"
                            yield f"data: {json.dumps({'type': 'tool_result', 'name': result['name'], 'result': result['result']})}\n\n"
                        if final_text:
                            yield f"data: {json.dumps({'type': 'chunk', 'content': final_text})}\n\n"
                            ai_msg = await _save_assistant_message(stream_db, final_text)
                            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id})}\n\n"
                    except Exception as e:
                        error_msg = str(e) if isinstance(e, Exception) else str(e)
                        yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"

            except Exception as e:
                import traceback
                traceback.print_exc()
                yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
            finally:
                stream_db.close()

        return StreamingResponse(generate(), media_type="text/event-stream")

    # Non-streaming logic
    response_text = ""
    if req.provider == "openai" or req.provider in NATIVE_TOOL_PROVIDERS:
        response_text, _tool_results = await _answer_with_tools(db, list(messages))
    else:
        response_text, _tool_results = await _answer_without_native_tools(db, list(messages))

    ai_msg = await _save_assistant_message(db, response_text)

    return {
        "conversation_id": conv.id,
        "message_id": ai_msg.id,
        "response": response_text,
        "provider": req.provider,
        "model": req.model,
    }

async def execute_tool(name: str, args: dict, db: Session) -> dict:
    """Execute AI tools with validation."""
    try:
        import logging
        from app.core.tool_validators import ToolArgValidator
        from app.core.config import settings
        
        logger = logging.getLogger(__name__)

        # Validate tool arguments
        try:
            validated_args = ToolArgValidator.validate(name, args)
        except ValueError as e:
            return {"status": "error", "message": str(e)}

        if name == "create_note":
            from app.models.note import Note
            note = Note(
                title=validated_args.get("title", args.get("title")),
                content=validated_args.get("content", args.get("content")),
                tags=validated_args.get("tags", args.get("tags", [])),
                folder_id=validated_args.get("folder_id", args.get("folder_id")),
            )
            db.add(note)
            db.commit()
            db.refresh(note)
            
            # Sync to RAG and Graph
            try:
                from app.core.rag_engine import rag_engine
                from app.core.graph_engine import graph_engine
                text = f"{note.title}\n{note.content}"
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
                graph_engine.auto_link_notes(db, note.id, note.title, note.content)
            except Exception as e:
                logger.warning("Chat note sync failed for note %s: %s", note.id, e)

            await hooks.emit("note.created", {"id": note.id, "title": note.title, "folder_id": note.folder_id})
            
            return {"status": "success", "note_id": note.id, "message": "Note created and indexed"}

        elif name == "add_graph_node":
            from app.core.graph_engine import graph_engine
            node = graph_engine.add_node(db, label=args["label"], node_type=args.get("node_type", "entity"), color=args.get("color"))
            return {"status": "success", "node_id": node.node_id}

        elif name == "add_graph_edge":
            from app.core.graph_engine import graph_engine
            edge = graph_engine.add_edge(db, source_id=args["source_id"], target_id=args["target_id"], edge_type=args["edge_type"], label=args.get("label"))
            return {"status": "success", "edge_id": edge.edge_id}

        elif name == "search_knowledge":
            from app.core.rag_engine import rag_engine
            results = rag_engine.query(args["query"])
            return {"status": "success", "results": results}

        elif name == "create_file":
            import os
            
            # Check file size limit
            if len(validated_args["content"]) > settings.MAX_FILE_SIZE:
                return {
                    "status": "error",
                    "message": f"File size exceeds limit ({settings.MAX_FILE_SIZE} bytes)"
                }
            
            data_dir = "./data/files"
            os.makedirs(data_dir, exist_ok=True)
            
            # Safe path - only filename, no traversal possible
            file_path = os.path.join(data_dir, validated_args["filename"])
            
            # Double-check that file_path doesn't escape data_dir
            real_path = os.path.realpath(file_path)
            real_data_dir = os.path.realpath(data_dir)
            if not real_path.startswith(real_data_dir):
                return {"status": "error", "message": "Path traversal detected"}
            
            with open(file_path, "w") as f:
                f.write(validated_args["content"])
            
            # Index file in RAG
            try:
                from app.core.rag_engine import rag_engine
                rag_engine.add_document(
                    validated_args["content"],
                    doc_id=f"file_{validated_args['filename']}",
                    metadata={"type": "file", "filename": validated_args["filename"]}
                )
            except Exception as e:
                logger.warning("Chat file RAG indexing failed for %s: %s", validated_args.get("filename"), e)
            
            return {"status": "success", "path": file_path}

        elif name == "read_note":
            from app.models.note import Note
            note = db.query(Note).filter(Note.id == args["note_id"]).first()
            if not note: return {"status": "error", "message": "Note not found"}
            return {"status": "success", "note": {"id": note.id, "title": note.title, "content": note.content, "tags": note.tags}}

        elif name == "update_note":
            from app.models.note import Note
            note = db.query(Note).filter(Note.id == args["note_id"]).first()
            if not note: return {"status": "error", "message": "Note not found"}
            if args.get("title"): note.title = args["title"]
            if args.get("append"):
                note.content += "\n" + args["content"]
            else:
                note.content = args["content"]
            note.updated_at = datetime.now(timezone.utc)
            db.commit()

            try:
                text = f"{note.title}\n{note.content}"
                rag_engine.delete_document(f"note_{note.id}")
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
                upsert_knowledge_item(
                    db,
                    source_type="note",
                    source_key=f"note:{note.id}",
                    title=note.title,
                    content=note.content,
                    content_html=note.content_html,
                    tags=note.tags or [],
                    folder_id=note.folder_id,
                    source="note",
                    external_id=f"note_{note.id}",
                    metadata={"type": "note", "note_id": note.id, "title": note.title, "folder_id": note.folder_id},
                )
                graph_engine.sync_knowledge_item(
                    db,
                    source_type="note",
                    source_key=f"note:{note.id}",
                    title=note.title,
                    text=text,
                    data={"note_id": note.id, "folder_id": note.folder_id},
                    color=note.color or "#7c3aed",
                )
                graph_engine.auto_link_notes(db, source_note_id=note.id, note_title=note.title, text=text)
            except Exception as e:
                logger.warning("Chat agent note resync failed for note %s: %s", note.id, e)

            await hooks.emit("note.updated", {"id": note.id, "title": note.title, "folder_id": note.folder_id})
            return {"status": "success", "message": "Note updated"}

        elif name == "list_notes":
            from app.models.note import Note
            query = db.query(Note)
            if args.get("search"):
                query = query.filter(Note.title.ilike(f"%{args['search']}%") | Note.content.ilike(f"%{args['search']}%"))
            if args.get("folder_id"):
                query = query.filter(Note.folder_id == args["folder_id"])
            notes = query.limit(args.get("limit", 20)).all()
            return {"status": "success", "notes": [{"id": n.id, "title": n.title} for n in notes]}

        elif name == "analyze_graph":
            from app.core.graph_engine import graph_engine
            full_graph = graph_engine.get_full_graph(db)
            # Basic analysis
            node_count = len(full_graph["nodes"])
            edge_count = len(full_graph["edges"])
            # Find central nodes (simple degree)
            degrees = {}
            for e in full_graph["edges"]:
                degrees[e["source"]] = degrees.get(e["source"], 0) + 1
                degrees[e["target"]] = degrees.get(e["target"], 0) + 1
            top_nodes = sorted(degrees.items(), key=lambda x: x[1], reverse=True)[:5]
            central_nodes = []
            for nid, deg in top_nodes:
                node = next((n for n in full_graph["nodes"] if n["id"] == nid), None)
                if node: central_nodes.append({"label": node["label"], "id": nid, "connections": deg})
            
            return {
                "status": "success", 
                "stats": {"nodes": node_count, "edges": edge_count},
                "central_knowledge": central_nodes
            }

    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    return {"status": "error", "message": "Unknown tool"}


@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0, description="Number of conversations to skip"),
    limit: int = Query(50, ge=1, le=1000, description="Number of conversations to return (max 1000)"),
):
    """List conversations with pagination."""
    convs = db.query(Conversation).order_by(Conversation.updated_at.desc()).offset(skip).limit(limit).all()
    return [{
        "id": c.id,
        "title": c.title,
        "provider": c.provider,
        "model": c.model,
        "updated_at": c.updated_at,
    } for c in convs]


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


@router.put("/conversations/{conv_id}")
def update_conversation(conv_id: int, data: ConversationUpdate, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    updates = data.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(conv, field, value)
    conv.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conv)
    return {
        "id": conv.id,
        "title": conv.title,
        "provider": conv.provider,
        "model": conv.model,
        "system_prompt": conv.system_prompt,
        "updated_at": conv.updated_at,
    }


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
