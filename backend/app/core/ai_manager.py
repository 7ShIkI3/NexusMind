"""
AI Manager - Unified interface to all AI providers:
Ollama, OpenAI (and OpenAI-compatible), Anthropic Claude, Google Gemini, Abacus.
"""
from __future__ import annotations

import asyncio
from typing import AsyncGenerator, Optional
from app.core.config import settings


def _normalize_url(url: str) -> str:
    """Ensure a URL has an http/https scheme and no trailing slash."""
    if not url:
        return url
    url = url.strip().rstrip("/")
    if not url.startswith(("http://", "https://")):
        url = "http://" + url
    return url


class AIMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


class AIProvider:
    name: str = "base"

    async def chat(self, messages: list[dict], model: str,
                   stream: bool = False, **kwargs) -> str:
        raise NotImplementedError

    async def stream_chat(self, messages: list[dict], model: str,
                          **kwargs) -> AsyncGenerator[str, None]:
        raise NotImplementedError

    async def list_models(self) -> list[str]:
        return []

    def available(self) -> bool:
        return True


class OllamaProvider(AIProvider):
    name = "ollama"

    def _base_url(self) -> str:
        return _normalize_url(settings.OLLAMA_BASE_URL)

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        import httpx
        model = model or settings.OLLAMA_DEFAULT_MODEL
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{self._base_url()}/api/chat",
                json={"model": model, "messages": messages, "stream": False},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        import httpx
        import json as _json
        model = model or settings.OLLAMA_DEFAULT_MODEL
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                f"{self._base_url()}/api/chat",
                json={"model": model, "messages": messages, "stream": True},
            ) as resp:
                async for line in resp.aiter_lines():
                    if line:
                        try:
                            data = _json.loads(line)
                            chunk = data.get("message", {}).get("content", "")
                            if chunk:
                                yield chunk
                        except Exception:
                            continue

    async def list_models(self) -> list[str]:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{self._base_url()}/api/tags")
                data = resp.json()
                return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    def available(self) -> bool:
        import httpx
        url = self._base_url()
        if not url:
            return False
        try:
            resp = httpx.get(f"{url}/api/tags", timeout=2.0)
            return resp.status_code == 200
        except Exception:
            return False


class OpenAIProvider(AIProvider):
    name = "openai"

    def _client(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set")
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY,
                           base_url=settings.OPENAI_BASE_URL)

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        model = model or settings.OPENAI_DEFAULT_MODEL
        client = self._client()
        resp = await client.chat.completions.create(
            model=model, messages=messages, **kwargs)
        return resp.choices[0].message.content or ""

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        model = model or settings.OPENAI_DEFAULT_MODEL
        client = self._client()
        stream = await client.chat.completions.create(
            model=model, messages=messages, stream=True, **kwargs)
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    async def list_models(self) -> list[str]:
        try:
            client = self._client()
            models = await client.models.list()
            return [m.id for m in models.data]
        except Exception:
            return [
                "gpt-4.1",
                "gpt-4.1-mini",
                "gpt-4o",
                "gpt-4o-mini",
                "o4-mini",
                "o3",
                "o3-mini",
            ]

    def available(self) -> bool:
        return bool(settings.OPENAI_API_KEY)


class AnthropicProvider(AIProvider):
    name = "anthropic"

    def _client(self):
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not set")
        import anthropic
        return anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        model = model or settings.ANTHROPIC_DEFAULT_MODEL
        client = self._client()
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [m for m in messages if m["role"] != "system"]
        kwargs_send = {"model": model, "max_tokens": kwargs.get("max_tokens", 4096),
                       "messages": user_msgs}
        if system_msg:
            kwargs_send["system"] = system_msg
        resp = await client.messages.create(**kwargs_send)
        return resp.content[0].text if resp.content else ""

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        model = model or settings.ANTHROPIC_DEFAULT_MODEL
        client = self._client()
        system_msg = next((m["content"] for m in messages if m["role"] == "system"), None)
        user_msgs = [m for m in messages if m["role"] != "system"]
        kwargs_send = {"model": model, "max_tokens": kwargs.get("max_tokens", 4096),
                       "messages": user_msgs}
        if system_msg:
            kwargs_send["system"] = system_msg
        async with client.messages.stream(**kwargs_send) as stream:
            async for text in stream.text_stream:
                yield text

    async def list_models(self) -> list[str]:
        return [
            "claude-opus-4-5",
            "claude-sonnet-4-5",
            "claude-3-7-sonnet-20250219",
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-haiku-20240307",
        ]

    def available(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)


class GeminiProvider(AIProvider):
    name = "gemini"

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY not set")
        import google.generativeai as genai
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model = model or settings.GOOGLE_DEFAULT_MODEL
        gmodel = genai.GenerativeModel(model)
        history = []
        prompt = ""
        for m in messages:
            if m["role"] == "user":
                prompt = m["content"]
            elif m["role"] == "assistant":
                history.append({"role": "model", "parts": [m["content"]]})
        chat = gmodel.start_chat(history=history)
        resp = await asyncio.to_thread(chat.send_message, prompt)
        return resp.text

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY not set")
        import google.generativeai as genai
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model_name = model or settings.GOOGLE_DEFAULT_MODEL
        gmodel = genai.GenerativeModel(model_name)
        prompt = messages[-1]["content"] if messages else ""
        response = await asyncio.to_thread(
            gmodel.generate_content, prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield chunk.text

    async def list_models(self) -> list[str]:
        return [
            "gemini-2.5-pro",
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
            "gemini-1.0-pro",
        ]

    def available(self) -> bool:
        return bool(settings.GOOGLE_API_KEY)


class AbacusProvider(AIProvider):
    """Abacus.AI provider via their OpenAI-compatible API."""
    name = "abacus"

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        if not settings.ABACUS_API_KEY:
            raise ValueError("ABACUS_API_KEY not set")
        import httpx
        headers = {"Authorization": f"Bearer {settings.ABACUS_API_KEY}",
                   "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ABACUS_BASE_URL}/chat",
                headers=headers,
                json={"messages": messages, "model": model},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("response", {}).get("content", "")

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        response = await self.chat(messages, model, **kwargs)
        yield response

    async def list_models(self) -> list[str]:
        return ["claude-3-5", "gpt-4.1", "gpt-4o", "gemini-2.0-flash"]

    def available(self) -> bool:
        return bool(settings.ABACUS_API_KEY)


class AIManager:
    _providers: dict[str, AIProvider] = {}

    def __init__(self):
        self._providers = {
            "ollama": OllamaProvider(),
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "gemini": GeminiProvider(),
            "abacus": AbacusProvider(),
        }

    def get_provider(self, name: str) -> AIProvider:
        p = self._providers.get(name)
        if p is None:
            raise ValueError(f"Unknown provider: {name}")
        return p

    def available_providers(self) -> list[dict]:
        result = []
        for name, p in self._providers.items():
            result.append({"name": name, "available": p.available()})
        return result

    async def chat(self, provider: str, messages: list[dict],
                   model: str = None, **kwargs) -> str:
        return await self.get_provider(provider).chat(messages, model, **kwargs)

    async def stream_chat(self, provider: str, messages: list[dict],
                          model: str = None, **kwargs) -> AsyncGenerator[str, None]:
        async for chunk in self.get_provider(provider).stream_chat(messages, model, **kwargs):
            yield chunk

    async def list_models(self, provider: str) -> list[str]:
        return await self.get_provider(provider).list_models()

    def build_rag_prompt(self, query: str, context_chunks: list[dict],
                         system_prompt: str = None) -> list[dict]:
        """Build a RAG-augmented message list."""
        context = "\n\n".join(
            f"[Source {i+1}]: {c['text']}" for i, c in enumerate(context_chunks)
        )
        system = system_prompt or (
            "You are a helpful AI assistant with access to a knowledge base. "
            "Use the provided context to answer questions accurately. "
            "If the context doesn't contain relevant information, say so."
        )
        return [
            {"role": "system", "content": system},
            {"role": "user",
             "content": f"Context from knowledge base:\n{context}\n\nQuestion: {query}"},
        ]


ai_manager = AIManager()
