from pydantic_settings import BaseSettings
from pydantic import Field, field_validator
from typing import Optional
import os
import secrets


class Settings(BaseSettings):
    # App
    APP_NAME: str = "NexusMind"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = Field(default=False)  # Default to False for security
    SECRET_KEY: str = Field(default="")  # Required - fail if not set
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    # Comma-separated list of origins. MUST include protocol (http:// or https://)
    CORS_ORIGINS: str = Field(default="http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173")

    # Database
    DATABASE_URL: str = "sqlite:///./data/nexusmind.db"

    # ChromaDB (RAG vector store)
    CHROMA_DB_PATH: str = "./data/chroma_db"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"

    # Extensions
    EXTENSIONS_PATH: str = "./extensions"

    # AI Providers
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"
    OLLAMA_DEFAULT_MODEL: str = "llama3"

    OPENAI_API_KEY: Optional[str] = None
    OPENAI_BASE_URL: str = "https://api.openai.com/v1"
    OPENAI_DEFAULT_MODEL: str = "gpt-4o"

    ANTHROPIC_API_KEY: Optional[str] = None
    ANTHROPIC_DEFAULT_MODEL: str = "claude-3-5-sonnet-20241022"

    GOOGLE_API_KEY: Optional[str] = None
    GOOGLE_DEFAULT_MODEL: str = "gemini-2.0-flash"

    ABACUS_API_KEY: Optional[str] = None
    ABACUS_BASE_URL: str = "https://api.abacus.ai/v0"

    # NVIDIA MIM (optional)
    NVIDIA_MIM_API_KEY: Optional[str] = None
    NVIDIA_MIM_BASE_URL: str = "https://api.nvidia.com/mim"
    NVIDIA_MIM_DEFAULT_MODEL: str = "mim-large"

    # RAG
    RAG_CHUNK_SIZE: int = 512
    RAG_CHUNK_OVERLAP: int = 64
    RAG_TOP_K: int = 5

    # Routines
    ROUTINE_CHECK_INTERVAL: int = 60  # seconds
    
    # Rate Limiting & Security
    RATE_LIMIT_PER_MINUTE: int = Field(default=100, ge=1, le=10000)
    MAX_FILE_SIZE: int = Field(default=10*1024*1024, ge=1024*1024)  # Min 1MB, default 10MB
    MAX_REQUEST_SIZE: int = Field(default=10*1024*1024, ge=1024*1024)
    MAX_TOOL_RESULT_SIZE: int = Field(default=5*1024*1024, ge=1024*1024)
    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    @field_validator("SECRET_KEY", mode="before")
    @classmethod
    def validate_secret_key(cls, v):
        """Ensure SECRET_KEY is set and sufficiently long"""
        if not v:
            raise ValueError("SECRET_KEY must be set in .env file")
        if len(str(v)) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v
    
    @field_validator("DEBUG", mode="before")
    @classmethod
    def validate_debug(cls, v):
        """Ensure DEBUG defaults to False for security"""
        if isinstance(v, str):
            return v.lower() in ("true", "1", "yes")
        return bool(v)
    
    def get_cors_origins(self) -> list[str]:
        """Parse CORS_ORIGINS from comma-separated string"""
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        origins = [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
        # If any origin is "*", we must return ["*"] (but note credentials conflict elsewhere)
        if "*" in origins:
            return ["*"]
        return origins


settings = Settings()
