from fastapi.testclient import TestClient
from app.main import app
from app.core.database import init_db

client = TestClient(app)

def test_rag_ingest_and_query_api():
    init_db()
    
    # Ingest via API
    response = client.post(
        "/api/v1/rag/ingest",
        json={
            "text": "The NexusMind RAG system is fully operational.",
            "doc_id": "api_test_doc",
            "collection": "test_collection"
        }
    )
    assert response.status_code == 200
    assert "chunk_ids" in response.json()
    
    # Query via API
    response = client.post(
        "/api/v1/rag/query",
        json={
            "query": "Is the RAG system operational?",
            "collection": "test_collection"
        }
    )
    assert response.status_code == 200
    results = response.json()["results"]
    assert len(results) > 0
    assert any("fully operational" in r["text"] for r in results)
