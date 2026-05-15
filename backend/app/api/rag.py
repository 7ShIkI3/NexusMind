import csv
import io
import json

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from app.core.rag_engine import rag_engine

router = APIRouter(prefix="/rag", tags=["rag"])


def _flatten_json(value, prefix: str = "") -> list[str]:
    lines: list[str] = []
    if isinstance(value, dict):
        for key, item in value.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            lines.extend(_flatten_json(item, next_prefix))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            next_prefix = f"{prefix}[{index}]" if prefix else f"[{index}]"
            lines.extend(_flatten_json(item, next_prefix))
    else:
        text = "" if value is None else str(value).strip()
        if text:
            lines.append(f"{prefix}: {text}" if prefix else text)
    return lines


def _extract_text_from_upload(filename: str, content: bytes) -> tuple[str, dict]:
    lower_name = filename.lower()
    metadata: dict = {"filename": filename}

    if lower_name.endswith((".txt", ".md")):
        metadata["type"] = "text"
        return content.decode("utf-8", errors="ignore"), metadata

    if lower_name.endswith(".pdf"):
        metadata["type"] = "pdf"
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
            metadata["pages"] = len(reader.pages)
            return text, metadata
        except ImportError:
            raise HTTPException(400, "pypdf not installed for PDF support")

    if lower_name.endswith(".csv"):
        metadata["type"] = "csv"
        decoded = content.decode("utf-8", errors="ignore")
        reader = csv.DictReader(io.StringIO(decoded))
        rows: list[str] = []
        for index, row in enumerate(reader, start=1):
            row_text = "; ".join(f"{key}={value}" for key, value in row.items() if str(value).strip())
            if row_text:
                rows.append(f"row {index}: {row_text}")
        metadata["rows"] = len(rows)
        return "\n".join(rows) or decoded, metadata

    if lower_name.endswith((".json", ".jsonl")):
        metadata["type"] = "json"
        decoded = content.decode("utf-8", errors="ignore").strip()
        if not decoded:
            return "", metadata
        try:
            if lower_name.endswith(".jsonl"):
                items = [json.loads(line) for line in decoded.splitlines() if line.strip()]
                flattened = []
                for index, item in enumerate(items, start=1):
                    flattened.extend([f"item {index}"] + _flatten_json(item))
                metadata["items"] = len(items)
                return "\n".join(flattened), metadata

            parsed = json.loads(decoded)
            flattened = _flatten_json(parsed)
            metadata["items"] = len(parsed) if isinstance(parsed, list) else 1
            return "\n".join(flattened) or decoded, metadata
        except json.JSONDecodeError:
            return decoded, metadata

    metadata["type"] = "text"
    return content.decode("utf-8", errors="ignore"), metadata


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
    filename = file.filename or "uploaded_file"

    text, extracted_metadata = _extract_text_from_upload(filename, content)

    if not text.strip():
        raise HTTPException(400, "No text extracted from file")

    try:
        resolved_doc_id = doc_id or filename
        chunk_ids = rag_engine.add_document(
            text,
            doc_id=resolved_doc_id,
            metadata={
                "filename": filename,
                "title": filename,
                "source": "file_upload",
                "type": extracted_metadata.get("type", "file"),
                "source_key": f"{collection}:{resolved_doc_id}",
                **{k: v for k, v in extracted_metadata.items() if k != "filename"},
            },
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


@router.get("/documents")
def list_documents(
    collection: str = "nexusmind",
    source: Optional[str] = None,
    filename: Optional[str] = None,
    doc_type: Optional[str] = None,
):
    where = {}
    if source:
        where["source"] = source
    if filename:
        where["filename"] = filename
    if doc_type:
        where["type"] = doc_type
    docs = rag_engine.list_documents(collection=collection, where=(where or None))
    return {"documents": docs, "count": len(docs)}


@router.delete("/documents")
def delete_documents(
    collection: str = "nexusmind",
    doc_id: Optional[str] = None,
    source: Optional[str] = None,
    filename: Optional[str] = None,
    doc_type: Optional[str] = None,
):
    if doc_id:
        rag_engine.delete_document(doc_id, collection)
        return {"deleted_chunks": None, "deleted_doc_id": doc_id}

    where = {}
    if source:
        where["source"] = source
    if filename:
        where["filename"] = filename
    if doc_type:
        where["type"] = doc_type
    if not where:
        raise HTTPException(400, "At least one filter (doc_id/source/filename/doc_type) is required")

    deleted = rag_engine.delete_by_filter(collection=collection, where=where)
    return {"deleted_chunks": deleted, "filter": where}
