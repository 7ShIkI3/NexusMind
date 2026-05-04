import json
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

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
    stream: bool = False


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
    if req.use_rag:
        context_chunks = rag_engine.query(req.message, collection=req.rag_collection)
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
