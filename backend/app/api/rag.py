from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from app.core.rag_engine import rag_engine

router = APIRouter(prefix="/rag", tags=["rag"])

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB


class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    collection: str = "nexusmind"
    where: Optional[dict] = None


class IngestRequest(BaseModel):
    text: str
    doc_id: Optional[str] = None
    metadata: Optional[dict] = None
    collection: str = "nexusmind"


@router.get("/stats")
def get_stats(collection: str = "nexusmind"):
    return rag_engine.get_stats(collection)


@router.get("/collections")
def list_collections():
    return {"collections": rag_engine.list_collections()}


@router.post("/collections/{name}")
def create_collection(name: str):
    success = rag_engine.create_collection(name)
    if not success:
        raise HTTPException(500, "Failed to create collection")
    return {"created": name}


@router.delete("/collections/{name}")
def delete_collection(name: str):
    success = rag_engine.delete_collection(name)
    if not success:
        raise HTTPException(404, "Collection not found or error")
    return {"deleted": name}


@router.post("/query")
def query_rag(req: QueryRequest):
    try:
        results = rag_engine.query(req.query, req.top_k, req.collection, req.where)
        return {"results": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(500, f"RAG query failed: {e}")


@router.post("/ingest")
def ingest_text(req: IngestRequest):
    try:
        chunk_ids = rag_engine.add_document(
            req.text, doc_id=req.doc_id,
            metadata=req.metadata, collection=req.collection
        )
        return {"chunk_ids": chunk_ids, "chunks_count": len(chunk_ids)}
    except Exception as e:
        raise HTTPException(500, f"Ingestion failed: {e}")


@router.post("/ingest/file")
async def ingest_file(
    file: UploadFile = File(...),
    collection: str = Form("nexusmind"),
    doc_id: Optional[str] = Form(None),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large. Maximum allowed size is {MAX_UPLOAD_BYTES // (1024*1024)} MB.")
    filename = file.filename or "uploaded_file"

    # Try to extract text
    text = ""
    if filename.endswith(".txt") or filename.endswith(".md"):
        text = content.decode("utf-8", errors="ignore")
    elif filename.endswith(".pdf"):
        try:
            import io
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise HTTPException(400, "pypdf not installed for PDF support")
    else:
        text = content.decode("utf-8", errors="ignore")

    if not text.strip():
        raise HTTPException(400, "No text extracted from file")

    try:
        chunk_ids = rag_engine.add_document(
            text,
            doc_id=doc_id or filename,
            metadata={"filename": filename, "source": "file_upload"},
            collection=collection,
        )
        return {"filename": filename, "chunk_ids": chunk_ids,
                "chunks_count": len(chunk_ids)}
    except Exception as e:
        raise HTTPException(500, f"Ingestion failed: {e}")


@router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, collection: str = "nexusmind"):
    rag_engine.delete_document(doc_id, collection)
    return {"deleted": doc_id}
