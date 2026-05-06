"""
RAG Engine - Advanced Retrieval Augmented Generation with ChromaDB.
Handles document ingestion, chunking, embedding, and semantic retrieval.
"""
from __future__ import annotations

import os
import uuid
import hashlib
from typing import Optional
from datetime import datetime, timezone

from app.core.config import settings


def _get_chroma():
    """Lazy-load chromadb to avoid import errors if not installed."""
    try:
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        os.makedirs(settings.CHROMA_DB_PATH, exist_ok=True)
        client = chromadb.PersistentClient(
            path=settings.CHROMA_DB_PATH,
            settings=ChromaSettings(anonymized_telemetry=False, allow_reset=True),
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
        try:
            return self.client.get_or_create_collection(
                name=name,
                embedding_function=self.embedding_fn,
                metadata={"hnsw:space": "cosine"},
            )
        except Exception as e:
            # Handle UniqueConstraintError that can occur under concurrent access.
            # ChromaDB raises chromadb.db.base.UniqueConstraintError in this case.
            try:
                from chromadb.db.base import UniqueConstraintError
                if isinstance(e, UniqueConstraintError):
                    return self.client.get_collection(
                        name=name,
                        embedding_function=self.embedding_fn,
                    )
            except ImportError:
                # Fall back to string matching if the specific class is unavailable
                err_msg = str(e).lower()
                if "already exists" in err_msg or "unique" in err_msg:
                    try:
                        return self.client.get_collection(
                            name=name,
                            embedding_function=self.embedding_fn,
                        )
                    except Exception:
                        pass
            raise

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

        chunk_ids = []
        documents = []
        metadatas = []

        for i, chunk in enumerate(chunks):
            cid = f"{doc_id}_chunk_{i}"
            chunk_ids.append(cid)
            documents.append(chunk)
            meta = dict(metadata or {})
            meta.update({"doc_id": doc_id, "chunk_index": i,
                         "ingested_at": datetime.now(timezone.utc).isoformat()})
            metadatas.append(meta)

        col.upsert(ids=chunk_ids, documents=documents, metadatas=metadatas)
        return chunk_ids

    def query(
        self,
        query_text: str,
        top_k: Optional[int] = None,
        collection: str = "nexusmind",
        where: Optional[dict] = None,
    ) -> list[dict]:
        """Semantic search. Returns list of results with text, score, metadata."""
        col = self._collection(collection)
        k = top_k or settings.RAG_TOP_K
        # Clamp n_results to actual collection size to avoid ChromaDB warning
        count = col.count()
        if count == 0:
            return []
        k = min(k, count)
        kwargs = {"query_texts": [query_text], "n_results": k, "include": ["documents", "metadatas", "distances"]}
        if where:
            kwargs["where"] = where
        try:
            results = col.query(**kwargs)
        except Exception:
            return []

        output = []
        docs = results.get("documents", [[]])[0]
        metas = results.get("metadatas", [[]])[0]
        dists = results.get("distances", [[]])[0]
        for doc, meta, dist in zip(docs, metas, dists):
            output.append({"text": doc, "metadata": meta, "score": 1.0 - dist})
        return output

    def delete_document(self, doc_id: str, collection: str = "nexusmind"):
        """Remove all chunks of a document."""
        col = self._collection(collection)
        results = col.get(where={"doc_id": doc_id})
        if results and results.get("ids"):
            col.delete(ids=results["ids"])

    def list_doc_ids(self, collection: str = "nexusmind") -> list[str]:
        """Return unique document IDs stored in the collection."""
        try:
            col = self._collection(collection)
            results = col.get(include=["metadatas"])
            seen = set()
            doc_ids = []
            for meta in (results.get("metadatas") or []):
                doc_id = meta.get("doc_id")
                if doc_id and doc_id not in seen:
                    seen.add(doc_id)
                    doc_ids.append(doc_id)
            return sorted(doc_ids)
        except Exception:
            return []

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
        try:
            col = self._collection(collection)
            count = col.count()
            return {"collection": collection, "document_chunks": count, "available": True}
        except Exception:
            return {"collection": collection, "document_chunks": 0, "available": False}


rag_engine = RAGEngine()
