import pytest
from fastapi.testclient import TestClient


@pytest.mark.asyncio
async def test_get_config_endpoint(monkeypatch):
    # Prevent heavy startup side-effects by patching init functions before client creation
    monkeypatch.setattr("app.core.database.init_db", lambda: None)
    monkeypatch.setattr("app.core.extension_manager.extension_manager.load_all", lambda: None)
    monkeypatch.setattr("app.core.routine_engine.routine_engine.start", lambda: None)

    from app.main import app

    with TestClient(app) as client:
        r = client.get("/api/v1/ai/config")
        assert r.status_code == 200
        data = r.json()
        assert "openai_configured" in data
        assert "ollama_base_url" in data


@pytest.mark.asyncio
async def test_test_provider_success(monkeypatch):
    # Patch ai_manager.chat to return a predictable response
    async def fake_chat(provider, messages, **kwargs):
        return "Hello from fake provider"

    monkeypatch.setattr("app.core.ai_manager.ai_manager.chat", fake_chat)
    monkeypatch.setattr("app.core.database.init_db", lambda: None)
    monkeypatch.setattr("app.core.extension_manager.extension_manager.load_all", lambda: None)
    monkeypatch.setattr("app.core.routine_engine.routine_engine.start", lambda: None)

    from app.main import app

    with TestClient(app) as client:
        r = client.post("/api/v1/ai/test/openai")
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is True
        assert "response" in body


@pytest.mark.asyncio
async def test_test_provider_failure(monkeypatch):
    async def raising_chat(provider, messages, **kwargs):
        raise RuntimeError("simulated failure")

    monkeypatch.setattr("app.core.ai_manager.ai_manager.chat", raising_chat)
    monkeypatch.setattr("app.core.database.init_db", lambda: None)
    monkeypatch.setattr("app.core.extension_manager.extension_manager.load_all", lambda: None)
    monkeypatch.setattr("app.core.routine_engine.routine_engine.start", lambda: None)

    from app.main import app

    with TestClient(app) as client:
        r = client.post("/api/v1/ai/test/openai")
        assert r.status_code == 200
        body = r.json()
        assert body.get("success") is False
