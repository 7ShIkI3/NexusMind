from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, validator
from typing import Optional
import logging
import re
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_500_INTERNAL_SERVER_ERROR

from app.core.ai_manager import ai_manager
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai-providers"])


def _mask_secret(v: Optional[str]) -> bool:
    return bool(v)


def _mask_value(v: Optional[str]) -> str:
    if not v:
        return ""
    if len(v) <= 8:
        return "*" * len(v)
    return v[:4] + "..." + v[-4:]


def _http_error(status_code: int, message: str, **extra):
    payload = {"success": False, "error": message}
    payload.update(extra)
    raise HTTPException(status_code=status_code, detail=payload)


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
    nvidia_mim_api_key: Optional[str] = None
    nvidia_mim_base_url: Optional[str] = None
    nvidia_mim_default_model: Optional[str] = None

    @validator("ollama_base_url", "openai_base_url", "abacus_base_url", "nvidia_mim_base_url")
    def _validate_urls(cls, v):
        if v is None:
            return v
        if not re.match(r"^https?://", v):
            raise ValueError("URL must start with http:// or https://")
        return v


@router.get("/providers")
async def list_providers():
    providers = []
    for name in ["ollama", "openai", "anthropic", "gemini", "abacus", "nvidia_mim"]:
        try:
            p = ai_manager.get_provider(name)
            available = p.available()
        except Exception:
            logger.exception("Error checking provider %s", name)
            available = False
        providers.append({"name": name, "available": available})
    return providers


@router.get("/providers/{provider}/models")
async def get_models(provider: str):
    try:
        models = await ai_manager.list_models(provider)
        return {"provider": provider, "models": models}
    except ValueError as e:
        logger.warning("Model listing error for %s: %s", provider, e)
        _http_error(HTTP_400_BAD_REQUEST, str(e))
    except Exception as e:
        logger.exception("Unexpected error listing models for %s", provider)
        _http_error(HTTP_500_INTERNAL_SERVER_ERROR, "Internal error listing models")


@router.get("/config")
def get_config():
    return {
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "ollama_default_model": settings.OLLAMA_DEFAULT_MODEL,
        "openai_configured": _mask_secret(settings.OPENAI_API_KEY),
        "openai_api_key_masked": _mask_value(settings.OPENAI_API_KEY),
        "openai_base_url": settings.OPENAI_BASE_URL,
        "openai_default_model": settings.OPENAI_DEFAULT_MODEL,
        "anthropic_configured": _mask_secret(settings.ANTHROPIC_API_KEY),
        "anthropic_api_key_masked": _mask_value(settings.ANTHROPIC_API_KEY),
        "anthropic_default_model": settings.ANTHROPIC_DEFAULT_MODEL,
        "google_configured": _mask_secret(settings.GOOGLE_API_KEY),
        "google_api_key_masked": _mask_value(settings.GOOGLE_API_KEY),
        "google_default_model": settings.GOOGLE_DEFAULT_MODEL,
        "abacus_configured": _mask_secret(settings.ABACUS_API_KEY),
        "abacus_api_key_masked": _mask_value(settings.ABACUS_API_KEY),
        "abacus_base_url": settings.ABACUS_BASE_URL,
        "nvidia_mim_configured": _mask_secret(settings.NVIDIA_MIM_API_KEY),
        "nvidia_mim_api_key_masked": _mask_value(settings.NVIDIA_MIM_API_KEY),
        "nvidia_mim_base_url": settings.NVIDIA_MIM_BASE_URL,
        "nvidia_mim_default_model": settings.NVIDIA_MIM_DEFAULT_MODEL,
    }


@router.put("/config")
def update_config(data: ProviderConfig):
    """Update AI provider settings at runtime with basic validation and safe logging."""
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
        "nvidia_mim_api_key": "NVIDIA_MIM_API_KEY",
        "nvidia_mim_base_url": "NVIDIA_MIM_BASE_URL",
        "nvidia_mim_default_model": "NVIDIA_MIM_DEFAULT_MODEL",
    }
    updated = []
    errors = []
    for field, setting_key in update_map.items():
        value = getattr(data, field, None)
        if value is not None:
            # basic validation for API keys
            if field.endswith("api_key"):
                if not isinstance(value, str) or len(value.strip()) < 8:
                    errors.append(f"{field} is invalid or too short")
                    continue
                # avoid logging raw keys
            try:
                setattr(settings, setting_key, value)
                masked = _mask_value(value) if isinstance(value, str) else str(value)
                logger.info("Updated setting %s => %s", setting_key, masked)
                updated.append(field)
            except Exception:
                logger.exception("Failed to update setting %s", setting_key)
                errors.append(f"failed to update {field}")

    if errors:
        logger.warning("Config update had validation errors: %s", errors)
        _http_error(HTTP_400_BAD_REQUEST, "Validation errors", updated=updated, errors=errors)
    return {"updated": updated}


@router.post("/test/{provider}")
async def test_provider(provider: str):
    """Send a simple test message to a provider."""
    try:
        response = await ai_manager.chat(
            provider,
            [{"role": "user", "content": "Say hello in one sentence."}],
        )
        logger.info("Provider test success for %s", provider)
        return {"provider": provider, "response": response, "success": True}
    except Exception as e:
        logger.exception("Provider test error for %s: %s", provider, e)
        # Return a safe, structured error to the caller
        return {"provider": provider, "error": "Provider test failed. Check configuration.", "success": False}
