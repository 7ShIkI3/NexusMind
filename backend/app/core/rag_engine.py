"""
RAG Engine - Shared knowledge retrieval backed by SQLite and optional ChromaDB.
Handles document ingestion, chunking, and hybrid retrieval.
"""
from __future__ import annotations

import os
import hashlib
from typing import Optional
from datetime import datetime

from app.core.config import settings

try:
    from app.core.database import SessionLocal
    from app.core.knowledge_base import (
        delete_knowledge_item,
        list_knowledge_items,
        score_knowledge_item,
        upsert_knowledge_item,
    )
except Exception:
    SessionLocal = None

    def upsert_knowledge_item(*args, **kwargs):
        return None

    def delete_knowledge_item(*args, **kwargs):
        return False

    def list_knowledge_items(*args, **kwargs):
        return []

    def score_knowledge_item(query, item):
        return 0.0


def _safe_graph_sync_for_item(*, source_type: str, source_key: str, title: str, text: str, metadata: dict | None = None):
    """Best-effort graph synchronization for a knowledge item."""
    try:
        from app.core.graph_engine import graph_engine
        if SessionLocal is None:
            return
        db = SessionLocal()
        try:
            graph_engine.sync_knowledge_item(
                db,
                source_type=source_type,
                source_key=source_key,
                title=title,
                text=text,
                data={"external_metadata": metadata or {}},
            )
        finally:
            db.close()
    except Exception:
        # Graph sync is best-effort and should never break RAG ingestion.
        return


def _safe_graph_delete_for_source_keys(source_keys: list[str], source_type: str):
    """Best-effort graph cleanup for deleted knowledge items."""
    if not source_keys:
        return
    try:
        from app.core.graph_engine import graph_engine
        if SessionLocal is None:
            return
        db = SessionLocal()
        try:
            for source_key in source_keys:
                graph_engine.delete_node(db, f"knowledge_{source_type}_{source_key}")
        finally:
            db.close()
    except Exception:
        # Graph cleanup is best-effort and should never break deletion.
        return


def _get_chroma():
    """Lazy-load chromadb to avoid import errors if not installed."""
    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)
        client = chromadb.PersistentClient(
            path=settings.CHROMA_DB_PATH,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        return client
    except ImportError:
        return None


def _get_embedding_fn():
    """Lazy-load sentence-transformers embedding function."""
    try:
        from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction
        return SentenceTransformerEmbeddingFunction(model_name=settings.EMBEDDING_MODEL)
    except Exception:
        return None


class RAGEngine:
    def __init__(self):
        self._client = None
        self._embedding_fn = None

    @property
    def client(self):
        if self._client is None:
            self._client = _get_chroma()
        return self._client

    @property
    def embedding_fn(self):
        if self._embedding_fn is None:
            self._embedding_fn = _get_embedding_fn()
        return self._embedding_fn

    def _collection(self, name: str = "nexusmind"):
        if self.client is None:
            raise RuntimeError("ChromaDB not available")
        return self.client.get_or_create_collection(
            name=name,
            embedding_function=self.embedding_fn,
            metadata={"hnsw:space": "cosine"},
        )

    def _chunk_text(self, text: str) -> list[str]:
        """Split text into overlapping chunks."""
        size = settings.RAG_CHUNK_SIZE
        overlap = settings.RAG_CHUNK_OVERLAP
        if len(text) <= size:
            return [text]
        chunks = []
        start = 0
        while start < len(text):
            end = start + size
            chunks.append(text[start:end])
            start += size - overlap
        return chunks

    def add_document(
        self,
        text: str,
        doc_id: Optional[str] = None,
        metadata: Optional[dict] = None,
        collection: str = "nexusmind",
    ) -> list[str]:
        """Ingest a document into the vector store. Returns list of chunk IDs."""
        col = self._collection(collection)
        chunks = self._chunk_text(text)
        if doc_id is None:
            doc_id = hashlib.md5(text.encode()).hexdigest()

        source_type = ((metadata or {}).get("type") if metadata else "rag") or "rag"
        source_title = (metadata or {}).get("title") or (metadata or {}).get("filename") or doc_id
        provided_source_key = (metadata or {}).get("source_key")
        source_key = provided_source_key or f"{collection}:{doc_id}"

        tags = (metadata or {}).get("tags") or []
        if isinstance(tags, list):
            tags_str = ", ".join(str(t) for t in tags)
        else:
            tags_str = str(tags)

        if SessionLocal is not None:
            db = SessionLocal()
            try:
                upsert_knowledge_item(
                    db,
                    source_type=source_type,
                    source_key=source_key,
                    title=source_title,
                    content=text,
                    tags=tags,
                    source=(metadata or {}).get("source") or "rag",
                    external_id=doc_id,
                    metadata={**(metadata or {}), "collection": collection, "doc_id": doc_id},
                    collection=collection,
                )
            finally:
                db.close()

        _safe_graph_sync_for_item(
            source_type=source_type,
            source_key=source_key,
            title=source_title,
            text=text,
            metadata=metadata,
        )

        chunk_ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            cid = f"{doc_id}_chunk_{i}"
            chunk_ids.append(cid)
            documents.append(chunk)
            meta = dict(metadata or {})
            from datetime import timezone
            meta.update({
                "doc_id": doc_id,
                "chunk_index": i,
                "ingested_at": datetime.now(timezone.utc).isoformat(),
                "tags": tags_str  # ChromaDB metadata must be str/int/float/bool
            })
            # Filter out any other list/dict values from meta
            meta = {k: v for k, v in meta.items() if isinstance(v, (str, int, float, bool))}
            metadatas.append(meta)

        col.upsert(ids=chunk_ids, documents=documents, metadatas=metadatas)
        return chunk_ids

    def query(
        self,
        query_text: str,
        top_k: int = None,
        collection: str = "nexusmind",
        where: Optional[dict] = None,
    ) -> list[dict]:
        """Semantic search. Returns list of results with text, score, metadata."""
        col = self._collection(collection)
        k = top_k or settings.RAG_TOP_K
        kwargs = {"query_texts": [query_text], "n_results": k, "include": ["documents", "metadatas", "distances"]}
        if where:
            kwargs["where"] = where
        results = None
        try:
            results = col.query(**kwargs)
        except Exception:
            results = None

        output = []
        if results:
            docs = results.get("documents", [[]])[0]
            metas = results.get("metadatas", [[]])[0]
            dists = results.get("distances", [[]])[0]
            for doc, meta, dist in zip(docs, metas, dists):
                output.append({"text": doc, "metadata": meta, "score": 1.0 - dist})
            if output:
                return output

        if SessionLocal is not None:
            db = SessionLocal()
            try:
                items = list_knowledge_items(db, collection=collection, query=query_text, limit=k)
                return [
                    {
                        "text": item.searchable_text or item.content or item.title,
                        "metadata": {
                            "source_type": item.source_type,
                            "source_key": item.source_key,
                            "title": item.title,
                            "tags": item.tags or [],
                            "source": item.source,
                            "collection": item.collection,
                        },
                        "score": score_knowledge_item(query_text, item) / 10.0,
                    }
                    for item in items
                ]
            finally:
                db.close()
        return []

    def delete_document(self, doc_id: str, collection: str = "nexusmind"):
        """Remove all chunks of a document."""
        col = self._collection(collection)
        results = col.get(where={"doc_id": doc_id})
        if results and results.get("ids"):
            col.delete(ids=results["ids"])

        deleted_source_keys: list[str] = []
        deleted_source_types: list[str] = []

        if SessionLocal is not None:
            db = SessionLocal()
            try:
                # Delete by the canonical collection:doc_id key
                canonical_source_key = f"{collection}:{doc_id}"
                if delete_knowledge_item(db, canonical_source_key):
                    deleted_source_keys.append(canonical_source_key)
                    deleted_source_types.append("rag")

                # Also delete any knowledge items whose external_id equals this doc_id
                from app.models.knowledge import KnowledgeItem
                items = db.query(KnowledgeItem).filter(KnowledgeItem.external_id == doc_id).all()
                for item in items:
                    if item and item.source_key:
                        if delete_knowledge_item(db, item.source_key):
                            deleted_source_keys.append(item.source_key)
                            deleted_source_types.append(item.source_type or "rag")
            finally:
                db.close()

        # Cleanup graph nodes for every deleted knowledge item.
        for source_key, source_type in zip(deleted_source_keys, deleted_source_types):
            _safe_graph_delete_for_source_keys([source_key], source_type or "rag")

    def list_documents(self, collection: str = "nexusmind", where: Optional[dict] = None) -> list[dict]:
        if SessionLocal is not None:
            db = SessionLocal()
            try:
                items = list_knowledge_items(db, collection=collection, limit=500)
                if where:
                    filtered_items = []
                    for item in items:
                        meta = item.metadata_ or {}
                        if all(meta.get(key) == value for key, value in where.items()):
                            filtered_items.append(item)
                    items = filtered_items
                grouped: dict[str, dict] = {}
                for item in items:
                    doc_key = item.external_id or item.source_key
                    entry = grouped.setdefault(
                        doc_key,
                        {
                            "doc_id": item.external_id or item.source_key,
                            "chunks": 0,
                            "type": item.source_type,
                            "title": item.title,
                            "filename": item.metadata_.get("filename") if item.metadata_ else None,
                            "source": item.source,
                            "latest_ingested_at": None,
                        },
                    )
                    entry["chunks"] += max(1, len((item.content or "").splitlines()) // 20 + 1)
                    if item.updated_at:
                        updated_at = item.updated_at.isoformat()
                        if entry["latest_ingested_at"] is None or updated_at > entry["latest_ingested_at"]:
                            entry["latest_ingested_at"] = updated_at
                return sorted(grouped.values(), key=lambda x: (x["latest_ingested_at"] or ""), reverse=True)
            finally:
                db.close()
        return []

    def delete_by_filter(self, collection: str = "nexusmind", where: Optional[dict] = None) -> int:
        if not where:
            return 0

        # Use Chroma first to discover matching document ids and then reuse delete_document
        # so all storages (Chroma, knowledge DB, graph) are cleaned consistently.
        col = self._collection(collection)
        try:
            results = col.get(where=where, include=["metadatas"])
        except Exception:
            results = None

        if results and results.get("metadatas"):
            doc_ids = {
                meta.get("doc_id")
                for meta in results.get("metadatas", [])
                if isinstance(meta, dict) and meta.get("doc_id")
            }
            for doc_id in doc_ids:
                self.delete_document(doc_id, collection)
            return len(doc_ids)

        if SessionLocal is not None:
            db = SessionLocal()
            try:
                items = list_knowledge_items(db, collection=collection, limit=1000)
                deleted_doc_ids: set[str] = set()
                for item in items:
                    meta = item.metadata_ or {}
                    if all(meta.get(key) == value for key, value in where.items()):
                        if item.external_id:
                            deleted_doc_ids.add(item.external_id)
                        else:
                            delete_knowledge_item(db, item.source_key)
                            _safe_graph_delete_for_source_keys([item.source_key], item.source_type or "rag")

                for doc_id in deleted_doc_ids:
                    self.delete_document(doc_id, collection)
                return len(deleted_doc_ids)
            finally:
                db.close()
        return 0

    def list_collections(self) -> list[str]:
        if self.client is None:
            return []
        return [c.name for c in self.client.list_collections()]

    def create_collection(self, name: str) -> bool:
        if self.client is None:
            return False
        self.client.get_or_create_collection(name=name, embedding_function=self.embedding_fn)
        return True

    def delete_collection(self, name: str) -> bool:
        if self.client is None:
            return False
        try:
            self.client.delete_collection(name)
            return True
        except Exception:
            return False

    def get_stats(self, collection: str = "nexusmind") -> dict:
        if SessionLocal is not None:
            db = SessionLocal()
            try:
                items = list_knowledge_items(db, collection=collection, limit=10000)
                return {
                    "collection": collection,
                    "document_chunks": sum(max(1, len((item.content or "").splitlines()) // 20 + 1) for item in items),
                    "documents": len(items),
                    "available": True,
                }
            finally:
                db.close()
        return {
            "collection": collection,
            "document_chunks": 0,
            "documents": 0,
            "available": False,
        }


rag_engine = RAGEngine()
