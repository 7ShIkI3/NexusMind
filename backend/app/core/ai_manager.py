"""
AI Manager - Unified interface to all AI providers:
Ollama, OpenAI (and OpenAI-compatible), Anthropic Claude, Google Gemini, Abacus.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import AsyncGenerator, Optional, Any
from app.core.config import settings


class AIMessage:
    def __init__(self, role: str, content: str):
        self.role = role
        self.content = content


class AIProvider:
    name: str = "base"

    async def chat(self, messages: list[dict], model: str,
                   stream: bool = False, tools: list[dict] = None, **kwargs) -> Any:
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

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> str:
        import httpx
        model = model or settings.OLLAMA_DEFAULT_MODEL
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.OLLAMA_BASE_URL}/api/chat",
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
                f"{settings.OLLAMA_BASE_URL}/api/chat",
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
                resp = await client.get(f"{settings.OLLAMA_BASE_URL}/api/tags")
                data = resp.json()
                return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    def available(self) -> bool:
        return True


class OpenAIProvider(AIProvider):
    name = "openai"

    def _client(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not set")
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY,
                           base_url=settings.OPENAI_BASE_URL)

    async def chat(self, messages: list[dict], model: str = None, 
                   tools: list[dict] = None, **kwargs) -> Any:
        model = model or settings.OPENAI_DEFAULT_MODEL
        client = self._client()
        call_kwargs = {"model": model, "messages": messages}
        if tools:
            call_kwargs["tools"] = tools
            call_kwargs["tool_choice"] = "auto"
        
        resp = await client.chat.completions.create(**call_kwargs, **kwargs)
        return resp.choices[0].message

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[Any, None]:
        model = model or settings.OPENAI_DEFAULT_MODEL
        client = self._client()
        call_kwargs = {"model": model, "messages": messages, "stream": True}
        if kwargs.get("tools"):
            call_kwargs["tools"] = kwargs["tools"]
        
        stream = await client.chat.completions.create(**call_kwargs)
        async for chunk in stream:
            if chunk.choices:
                yield chunk.choices[0].delta

    async def list_models(self) -> list[str]:
        try:
            client = self._client()
            models = await client.models.list()
            return [m.id for m in models.data]
        except Exception:
            return ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"]

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
            "claude-3-5-sonnet-20241022",
            "claude-3-5-haiku-20241022",
            "claude-3-opus-20240229",
            "claude-3-haiku-20240307",
        ]

    def available(self) -> bool:
        return bool(settings.ANTHROPIC_API_KEY)


class GeminiProvider(AIProvider):
    name = "gemini"

    async def chat(self, messages: list[dict], model: str = None, 
                   tools: list[dict] = None, **kwargs) -> Any:
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY not set")
        import google.generativeai as genai
        import logging
        
        logger = logging.getLogger(__name__)
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model_name = model or settings.GOOGLE_DEFAULT_MODEL
        
        # Prepare tools
        gtools = []
        if tools:
            def fix_types(schema):
                if not isinstance(schema, dict): return
                if "type" in schema and isinstance(schema["type"], str):
                    t = schema["type"].upper()
                    mapping = {"STRING": "STRING", "NUMBER": "NUMBER", "INTEGER": "INTEGER", 
                               "BOOLEAN": "BOOLEAN", "ARRAY": "ARRAY", "OBJECT": "OBJECT"}
                    if t in mapping: schema["type"] = mapping[t]
                if "properties" in schema and isinstance(schema["properties"], dict):
                    for prop in schema["properties"].values(): fix_types(prop)
                if "items" in schema: fix_types(schema["items"])

            declarations = []
            for t in tools:
                try:
                    if t.get("type") == "function":
                        func = json.loads(json.dumps(t["function"]))
                        if "parameters" in func: fix_types(func["parameters"])
                        declarations.append(func)
                except Exception: pass
            gtools = declarations

        # Extract system prompt
        system_instruction = next((m["content"] for m in messages if m.get("role") == "system"), None)
        
        # Clean and alternate history
        contents = []
        last_role = None
        for m in messages:
            role = m.get("role")
            if role == "system": continue
            
            # Gemini roles: user, model
            genai_role = "user" if role in ["user", "tool"] else "model"
            
            # Force alternating roles
            if genai_role == last_role:
                if contents:
                    # Append to last message if same role
                    contents[-1]["parts"].append(m.get("content") or "")
                continue
            
            contents.append({"role": genai_role, "parts": [m.get("content") or ""]})
            last_role = genai_role

        try:
            try:
                gmodel = genai.GenerativeModel(model_name, tools=gtools, system_instruction=system_instruction)
            except Exception:
                gmodel = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            
            resp = await asyncio.to_thread(gmodel.generate_content, contents)
            
            class SimpleNamespace:
                def __init__(self, **kwargs): self.__dict__.update(kwargs)
            
            tool_calls = []
            try:
                if resp.candidates[0].content.parts[0].function_call:
                    for part in resp.candidates[0].content.parts:
                        if part.function_call:
                            call = part.function_call
                            tool_calls.append(SimpleNamespace(
                                id=str(uuid.uuid4()),
                                function=SimpleNamespace(name=call.name, arguments=json.dumps(dict(call.args)))
                            ))
            except (AttributeError, IndexError): pass
            
            # Safe text access
            content = None
            if not tool_calls:
                try:
                    content = resp.text
                except Exception:
                    # Check for safety block or other termination reasons
                    if resp.candidates and resp.candidates[0].finish_reason:
                        reason = resp.candidates[0].finish_reason
                        if str(reason).lower().find("safety") != -1 or int(reason) == 3:
                            content = "[Response blocked by Gemini safety filters]"
                        else:
                            content = f"[Response terminated: {reason}]"
                    else:
                        content = "[No text content returned]"

            return SimpleNamespace(
                content=content,
                tool_calls=tool_calls if tool_calls else None,
                role="assistant"
            )
        except Exception as e:
            logger.exception("Gemini chat error: %s", e)
            raise

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        if not settings.GOOGLE_API_KEY:
            raise ValueError("GOOGLE_API_KEY not set")
        import google.generativeai as genai
        import logging
        
        logger = logging.getLogger(__name__)
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        model_name = model or settings.GOOGLE_DEFAULT_MODEL
        
        system_instruction = next((m["content"] for m in messages if (m.get("role") if isinstance(m, dict) else getattr(m, "role", "")) == "system"), None)
        
        contents = []
        last_role = None
        for m in messages:
            role = m.get("role") if isinstance(m, dict) else getattr(m, "role", "")
            if role == "system": continue
            genai_role = "user" if role in ["user", "tool"] else "model"
            content = (m.get("content") if isinstance(m, dict) else getattr(m, "content", "")) or ""
            if genai_role == last_role:
                if contents: contents[-1]["parts"].append(content)
                continue
            contents.append({"role": genai_role, "parts": [content]})
            last_role = genai_role

        if not contents: return

        try:
            gmodel = genai.GenerativeModel(model_name, system_instruction=system_instruction)
            response = await asyncio.to_thread(gmodel.generate_content, contents, stream=True)
            for chunk in response:
                try:
                    if chunk.text:
                        yield chunk.text
                except Exception:
                    # Safe check for blocked chunks
                    if chunk.candidates and chunk.candidates[0].finish_reason:
                        reason = chunk.candidates[0].finish_reason
                        if str(reason).lower().find("safety") != -1 or int(reason) == 3:
                            yield "\n[Chunk blocked by Gemini safety filters]\n"
                        else:
                            yield f"\n[Chunk error: {reason}]\n"
        except Exception as e:
            logger.exception("Gemini streaming error: %s", e)
            raise

    async def list_models(self) -> list[str]:
        return [
            "gemini-3.1-pro-preview",
            "gemini-3-flash-preview",
            "gemini-3.1-flash-lite-preview",
            "gemini-2.0-flash-exp",
            "gemini-2.0-flash",
            "gemini-1.5-pro",
            "gemini-1.5-flash",
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
        return ["claude-3-5", "gpt-4", "gemini-pro"]

    def available(self) -> bool:
        return bool(settings.ABACUS_API_KEY)


class NvidiaMIMProvider(AIProvider):
    """Basic NVIDIA MIM adapter using an OpenAI-like HTTP interface."""
    name = "nvidia_mim"

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {settings.NVIDIA_MIM_API_KEY}",
                "Content-Type": "application/json"}

    async def chat(self, messages: list[dict], model: str = None, **kwargs) -> Any:
        if not settings.NVIDIA_MIM_API_KEY:
            raise ValueError("NVIDIA_MIM_API_KEY not set")
        import httpx
        model = model or settings.NVIDIA_MIM_DEFAULT_MODEL
        payload = {"model": model, "messages": messages}
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{settings.NVIDIA_MIM_BASE_URL}/v1/chat/completions",
                headers=self._headers(),
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()
            # Try to be tolerant to slight API shape differences
            if isinstance(data, dict):
                choices = data.get("choices") or []
                if choices:
                    first = choices[0]
                    # OpenAI-like message
                    if isinstance(first.get("message"), dict):
                        return first["message"]
                    # fallback to text
                    return first.get("text") or first.get("content") or ""
            return data

    async def stream_chat(self, messages: list[dict], model: str = None,
                          **kwargs) -> AsyncGenerator[str, None]:
        # NVIDIA MIM may not support streaming in this adapter; return whole response once
        resp = await self.chat(messages, model, **kwargs)
        if isinstance(resp, dict):
            # message object
            content = resp.get("content") or resp.get("text") or ""
            yield content
        else:
            yield str(resp)

    async def list_models(self) -> list[str]:
        import httpx
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"{settings.NVIDIA_MIM_BASE_URL}/v1/models",
                                        headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                models = []
                if isinstance(data, dict):
                    for m in data.get("data", []) or data.get("models", []):
                        if isinstance(m, dict):
                            models.append(m.get("id") or m.get("name"))
                        else:
                            models.append(str(m))
                return models
        except Exception:
            return []

    def available(self) -> bool:
        return bool(settings.NVIDIA_MIM_API_KEY)


class AIManager:
    _providers: dict[str, AIProvider] = {}

    def __init__(self):
        self._providers = {
            "ollama": OllamaProvider(),
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
            "gemini": GeminiProvider(),
            "abacus": AbacusProvider(),
            "nvidia_mim": NvidiaMIMProvider(),
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

    def get_tools_definition(self) -> list[dict]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "create_note",
                    "description": "Create a new knowledge note in the system",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "Title of the note"},
                            "content": {"type": "string", "description": "Content of the note in Markdown"},
                            "tags": {"type": "array", "items": {"type": "string"}, "description": "Optional tags"},
                            "folder_id": {"type": "integer", "description": "Optional folder ID"}
                        },
                        "required": ["title", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_graph_node",
                    "description": "Add a new node to the knowledge graph",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string", "description": "Display label for the node"},
                            "node_type": {"type": "string", "description": "Type of node (entity, concept, person, etc.)"},
                            "color": {"type": "string", "description": "Hex color code"}
                        },
                        "required": ["label"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "add_graph_edge",
                    "description": "Create a relationship between two nodes in the graph",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "source_id": {"type": "string", "description": "ID of the source node"},
                            "target_id": {"type": "string", "description": "ID of the target node"},
                            "edge_type": {"type": "string", "description": "Type of relationship (references, part_of, depends_on, etc.)"},
                            "label": {"type": "string", "description": "Optional edge label"}
                        },
                        "required": ["source_id", "target_id", "edge_type"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "search_knowledge",
                    "description": "Search the existing knowledge base and notes",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {"type": "string", "description": "Search query"}
                        },
                        "required": ["query"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "create_file",
                    "description": "Create a new file in the data directory",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "filename": {"type": "string", "description": "Name of the file (e.g. data.csv, script.py)"},
                            "content": {"type": "string", "description": "Content of the file"}
                        },
                        "required": ["filename", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "read_note",
                    "description": "Read the full content of a specific note by ID",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "note_id": {"type": "integer", "description": "ID of the note to read"}
                        },
                        "required": ["note_id"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "update_note",
                    "description": "Update or append content to an existing note",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "note_id": {"type": "integer", "description": "ID of the note to update"},
                            "title": {"type": "string", "description": "New title (optional)"},
                            "content": {"type": "string", "description": "New content or additional text"},
                            "append": {"type": "boolean", "description": "If true, content is appended to existing text. If false, it replaces it."}
                        },
                        "required": ["note_id", "content"]
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "list_notes",
                    "description": "List existing notes with filters",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "search": {"type": "string", "description": "Search keyword"},
                            "folder_id": {"type": "integer", "description": "Filter by folder ID"},
                            "limit": {"type": "integer", "description": "Max number of notes to return", "default": 20}
                        }
                    }
                }
            },
            {
                "type": "function",
                "function": {
                    "name": "analyze_graph",
                    "description": "Get an overview of the knowledge graph structure and key connections",
                    "parameters": {
                        "type": "object",
                        "properties": {}
                    }
                }
            }
        ]

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
