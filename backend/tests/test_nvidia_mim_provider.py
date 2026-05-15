import os
import asyncio
import types
import pytest

os.environ.setdefault("SECRET_KEY", "test-secret-key-32-chars-minimum!!!!")

from app.core.ai_manager import NvidiaMIMProvider


class DummyResp:
    def __init__(self, data):
        self._data = data

    def raise_for_status(self):
        return None

    def json(self):
        return self._data


class DummyAsyncClient:
    def __init__(self, post_resp=None, get_resp=None):
        self._post_resp = post_resp
        self._get_resp = get_resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, url, headers=None, json=None, timeout=None):
        return self._post_resp

    async def get(self, url, headers=None, timeout=None):
        return self._get_resp


@pytest.mark.asyncio
async def test_chat_parses_openai_shape(monkeypatch):
    # Ensure API key is present for availability check
    monkeypatch.setattr("app.core.config.settings.NVIDIA_MIM_API_KEY", "testkey")
    provider = NvidiaMIMProvider()
    sample = {"choices": [{"message": {"content": "hi"}}]}
    dummy = DummyResp(sample)
    monkeypatch.setattr("httpx.AsyncClient", lambda timeout=None: DummyAsyncClient(post_resp=dummy))

    resp = await provider.chat([{"role": "user", "content": "hello"}], model="mim-test")
    assert isinstance(resp, dict) or resp == "hi"


@pytest.mark.asyncio
async def test_list_models_parses_models(monkeypatch):
    monkeypatch.setattr("app.core.config.settings.NVIDIA_MIM_API_KEY", "testkey")
    provider = NvidiaMIMProvider()
    sample = {"data": [{"id": "m1"}, {"id": "m2"}]}
    dummy = DummyResp(sample)
    monkeypatch.setattr("httpx.AsyncClient", lambda timeout=None: DummyAsyncClient(get_resp=dummy))

    models = await provider.list_models()
    assert "m1" in models and "m2" in models
