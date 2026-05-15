import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum!!!!")

from app.core.rag_engine import RAGEngine


class DummyCollection:
    def __init__(self, get_result=None):
        self._get_result = get_result or {"ids": [], "metadatas": []}
        self.upsert_calls = []
        self.delete_calls = []

    def upsert(self, ids=None, documents=None, metadatas=None):
        self.upsert_calls.append({"ids": ids, "documents": documents, "metadatas": metadatas})

    def get(self, where=None, include=None):
        return self._get_result

    def delete(self, ids=None):
        self.delete_calls.append(ids)


def test_add_document_triggers_graph_sync(monkeypatch):
    engine = RAGEngine()
    dummy = DummyCollection()

    monkeypatch.setattr("app.core.rag_engine.SessionLocal", None)
    monkeypatch.setattr(engine, "_collection", lambda name: dummy)

    calls = []

    def fake_graph_sync(**kwargs):
        calls.append(kwargs)

    monkeypatch.setattr("app.core.rag_engine._safe_graph_sync_for_item", fake_graph_sync)

    engine.add_document(
        "Hello world",
        doc_id="note_42",
        metadata={
            "type": "note",
            "source_key": "note:42",
            "title": "My Note",
            "source": "note",
        },
    )

    assert len(dummy.upsert_calls) == 1
    assert len(calls) == 1
    assert calls[0]["source_type"] == "note"
    assert calls[0]["source_key"] == "note:42"
    assert calls[0]["title"] == "My Note"


def test_delete_by_filter_routes_via_delete_document(monkeypatch):
    engine = RAGEngine()
    dummy = DummyCollection(
        get_result={
            "ids": ["a_chunk_0", "a_chunk_1", "b_chunk_0"],
            "metadatas": [
                {"doc_id": "doc_a", "source": "file_upload"},
                {"doc_id": "doc_a", "source": "file_upload"},
                {"doc_id": "doc_b", "source": "file_upload"},
            ],
        }
    )

    monkeypatch.setattr("app.core.rag_engine.SessionLocal", None)
    monkeypatch.setattr(engine, "_collection", lambda name: dummy)

    deleted = []

    def fake_delete_document(doc_id, collection="nexusmind"):
        deleted.append((doc_id, collection))

    monkeypatch.setattr(engine, "delete_document", fake_delete_document)

    count = engine.delete_by_filter(collection="nexusmind", where={"source": "file_upload"})

    assert count == 2
    assert sorted(deleted) == [("doc_a", "nexusmind"), ("doc_b", "nexusmind")]
