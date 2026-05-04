from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import os

from app.core.ai_manager import ai_manager
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["ai-providers"])


class ProviderConfig(BaseModel):
    ollama_base_url: Optional[str] = None
    ollama_default_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_default_model: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    anthropic_default_model: Optional[str] = None
    google_api_key: Optional[str] = None
    google_default_model: Optional[str] = None
    abacus_api_key: Optional[str] = None
    abacus_base_url: Optional[str] = None


@router.get("/providers")
async def list_providers():
    providers = []
    for name in ["ollama", "openai", "anthropic", "gemini", "abacus"]:
        p = ai_manager.get_provider(name)
        providers.append({
            "name": name,
            "available": p.available(),
        })
    return providers


@router.get("/providers/{provider}/models")
async def get_models(provider: str):
    try:
        models = await ai_manager.list_models(provider)
        return {"provider": provider, "models": models}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/config")
def get_config():
    return {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_default_model": settings.OLLAMA_DEFAULT_MODEL,
        # Return configured flags (not actual keys for security)
        "openai_configured": bool(settings.OPENAI_API_KEY),
        "openai_base_url": settings.OPENAI_BASE_URL,
        "openai_default_model": settings.OPENAI_DEFAULT_MODEL,
        "anthropic_configured": bool(settings.ANTHROPIC_API_KEY),
        "anthropic_default_model": settings.ANTHROPIC_DEFAULT_MODEL,
        "google_configured": bool(settings.GOOGLE_API_KEY),
        "google_default_model": settings.GOOGLE_DEFAULT_MODEL,
        "abacus_configured": bool(settings.ABACUS_API_KEY),
        "abacus_base_url": settings.ABACUS_BASE_URL,
    }


@router.put("/config")
def update_config(data: ProviderConfig):
    """Update AI provider settings at runtime and persist to .env file."""
    update_map = {
        "ollama_base_url": "OLLAMA_BASE_URL",
        "ollama_default_model": "OLLAMA_DEFAULT_MODEL",
        "openai_api_key": "OPENAI_API_KEY",
        "openai_base_url": "OPENAI_BASE_URL",
        "openai_default_model": "OPENAI_DEFAULT_MODEL",
        "anthropic_api_key": "ANTHROPIC_API_KEY",
        "anthropic_default_model": "ANTHROPIC_DEFAULT_MODEL",
        "google_api_key": "GOOGLE_API_KEY",
        "google_default_model": "GOOGLE_DEFAULT_MODEL",
        "abacus_api_key": "ABACUS_API_KEY",
        "abacus_base_url": "ABACUS_BASE_URL",
    }
    updated = []
    for field, setting_key in update_map.items():
        value = getattr(data, field, None)
        if value is not None:
            setattr(settings, setting_key, value)
            updated.append(field)

    # Persist non-empty values to .env file
    if updated:
        _persist_to_env(data, update_map)

    return {"updated": updated}


def _persist_to_env(data: ProviderConfig, update_map: dict):
    """Write updated settings back to the .env file."""
    env_path = ".env"

    # Read existing lines
    existing: dict[str, str] = {}
    lines: list[str] = []
    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                stripped = line.strip()
                if stripped and not stripped.startswith("#") and "=" in stripped:
                    k, _, v = stripped.partition("=")
                    existing[k.strip()] = v.strip()
                lines.append(line.rstrip("\n"))

    # Update or append values
    for field, env_key in update_map.items():
        value = getattr(data, field, None)
        if value is None:
            continue
        existing[env_key] = value
        # Replace in-place if key exists in lines
        found = False
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(f"{env_key}=") or stripped.startswith(f"{env_key} ="):
                lines[i] = f"{env_key}={value}"
                found = True
                break
        if not found:
            lines.append(f"{env_key}={value}")

    try:
        with open(env_path, "w") as f:
            f.write("\n".join(lines) + "\n")
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("Could not persist .env: %s", e)


@router.post("/test/{provider}")
async def test_provider(provider: str):
    """Send a simple test message to a provider."""
    try:
        response = await ai_manager.chat(
            provider,
            [{"role": "user", "content": "Say hello in one sentence."}],
        )
        return {"provider": provider, "response": response, "success": True}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("Provider test error (%s): %s", provider, e, exc_info=True)
        return {"provider": provider, "error": "Provider test failed. Check configuration.", "success": False}
