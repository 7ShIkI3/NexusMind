from pydantic_settings import BaseSettings
from typing import Optional
import os
import logging

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    # App
    APP_NAME: str = "NexusMind"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    SECRET_KEY: str = "nexusmind-secret-change-in-production"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    CORS_ORIGINS: list[str] = ["*"]

    # Database
    DATABASE_URL: str = "sqlite:///./data/nexusmind.db"

    # ChromaDB (RAG vector store)
    CHROMA_DB_PATH: str = "./data/chroma_db"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Extensions
    EXTENSIONS_PATH: str = "./extensions"

    # AI Providers
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_DEFAULT_MODEL: str = "gpt-4o"

    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-5-sonnet-20241022"

    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_DEFAULT_MODEL: str = "gemini-1.5-pro"

    ABACUS_API_KEY: Optional[str] = None
    ABACUS_BASE_URL: str = "https://api.abacus.ai/v0"

    # RAG
    RAG_CHUNK_SIZE: int = 512
    RAG_CHUNK_OVERLAP: int = 64
    RAG_TOP_K: int = 5

    # Routines
    ROUTINE_CHECK_INTERVAL: int = 60  # seconds

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

if settings.SECRET_KEY == "nexusmind-secret-change-in-production":
    logger.warning(
        "Using the default SECRET_KEY. "
        "Set the SECRET_KEY environment variable before deploying to production."
    )
