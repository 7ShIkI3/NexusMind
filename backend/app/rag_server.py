"""
Standalone RAG microservice.

Wraps the RAG engine as an independent FastAPI service that can be deployed
separately from the main NexusMind backend (see docker-compose.yml).
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.core.rag_engine import rag_engine

app = FastAPI(
    title="NexusMind RAG Server",
    version="1.0.0",
    description="Standalone ChromaDB-backed semantic search and ingestion service",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    collection: str = "nexusmind"
    where: Optional[dict] = None


class IngestRequest(BaseModel):
    text: str
    doc_id: Optional[str] = None
    metadata: dict = {}
    collection: str = "nexusmind"


@app.get("/health")
def health():
    return {"status": "ok", "service": "nexusmind-rag-server"}


@app.get("/stats")
def get_stats(collection: str = "nexusmind"):
    return rag_engine.get_stats(collection)


@app.get("/collections")
def list_collections():
    return {"collections": rag_engine.list_collections()}


@app.post("/collections/{name}")
def create_collection(name: str):
    success = rag_engine.create_collection(name)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to create collection")
    return {"created": name}


@app.delete("/collections/{name}")
def delete_collection(name: str):
    success = rag_engine.delete_collection(name)
    if not success:
        raise HTTPException(status_code=404, detail="Collection not found or error")
    return {"deleted": name}


@app.post("/query")
def query_rag(req: QueryRequest):
    try:
        results = rag_engine.query(req.query, req.top_k, req.collection, req.where)
        return {"results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {e}")


@app.post("/ingest")
def ingest_text(req: IngestRequest):
    try:
        chunk_ids = rag_engine.add_document(
            req.text,
            doc_id=req.doc_id,
            metadata=req.metadata,
            collection=req.collection,
        )
        return {"chunk_ids": chunk_ids, "chunks_count": len(chunk_ids)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {e}")


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str, collection: str = "nexusmind"):
    rag_engine.delete_document(doc_id, collection)
    return {"deleted": doc_id}
