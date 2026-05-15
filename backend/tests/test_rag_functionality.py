import pytest
from app.core.rag_engine import rag_engine
from app.core.database import init_db

def test_rag_ingest_and_query():
    # Initialize database for test
    init_db()
    
    test_text = "NexusMind is an advanced AI orchestration platform."
    doc_id = "test_doc_1"
    
    # Ingest
    chunk_ids = rag_engine.add_document(test_text, doc_id=doc_id)
    assert len(chunk_ids) > 0
    
    # Query
    results = rag_engine.query("What is NexusMind?")
    assert len(results) > 0
    assert any("NexusMind" in r["text"] for r in results)
    
    # Cleanup
    rag_engine.delete_document(doc_id)
