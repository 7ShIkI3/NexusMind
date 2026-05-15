from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
import time
from collections import defaultdict, deque
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import init_db
from app.core.extension_manager import extension_manager
from app.core.routine_engine import routine_engine

from app.api import chat, notes, graph, rag, extensions, routines, ai_providers, dashboard, admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    extension_manager.load_all()
    routine_engine.start()

    # Re-schedule existing enabled routines
    # Re-schedule existing enabled routines (skip during tests)
    if not os.getenv("TESTING"):
        from app.core.database import SessionLocal
        from app.models.routine import Routine
        db = SessionLocal()
        try:
            active_routines = db.query(Routine).filter(
                Routine.enabled.is_(True),
                Routine.schedule.isnot(None),
            ).all()
            for r in active_routines:
                try:
                    from app.api.routines import _schedule_routine
                    _schedule_routine(r)
                except Exception as e:
                    print(f"[Startup] Could not schedule routine {r.id}: {e}")
        finally:
            db.close()

    yield

    # Shutdown
    routine_engine.stop()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="NexusMind - Advanced AI Knowledge Management Platform",
    lifespan=lifespan,
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs" if not settings.DEBUG else "/api/v1/docs",
    redoc_url="/api/v1/redoc" if not settings.DEBUG else None,
)

# Simple in-memory rate limiting
_request_windows: dict[str, deque] = defaultdict(deque)

# Security: CORS with specific origins
cors_origins = settings.get_cors_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Security: Add security headers middleware
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # Only add HSTS if not in DEBUG and not on localhost
    host = request.headers.get("host", "").split(":")[0]
    is_localhost = host in ("localhost", "127.0.0.1", "0.0.0.0")
    
    if not settings.DEBUG and not is_localhost:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Security: Check request size limits
@app.middleware("http")
async def check_request_size(request, call_next):
    """Enforce request size limits to prevent DoS."""
    content_length = request.headers.get('content-length')
    if content_length and int(content_length) > settings.MAX_REQUEST_SIZE:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=413,
            content={"detail": f"Request too large (max {settings.MAX_REQUEST_SIZE} bytes)"}
        )
    return await call_next(request)


@app.middleware("http")
async def rate_limit_requests(request, call_next):
    """Basic per-IP rate limiting (in-memory)."""
    client_ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = _request_windows[client_ip]

    # Keep only requests in the last 60 seconds.
    while window and (now - window[0]) > 60:
        window.popleft()

    if len(window) >= settings.RATE_LIMIT_PER_MINUTE:
        return JSONResponse(
            status_code=429,
            content={
                "detail": f"Rate limit exceeded. Max {settings.RATE_LIMIT_PER_MINUTE} requests per minute."
            },
        )

    window.append(now)
    return await call_next(request)

# Mount API routes
app.include_router(chat.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(rag.router, prefix="/api/v1")
app.include_router(extensions.router, prefix="/api/v1")
app.include_router(routines.router, prefix="/api/v1")
app.include_router(ai_providers.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")


@app.get("/api/v1/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@app.get("/api/v1/info")
async def info():
    from app.core.rag_engine import rag_engine
    rag_stats = rag_engine.get_stats()
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "rag": rag_stats,
        "extensions_loaded": len(extension_manager.list_loaded()),
    }


# Serve frontend static files in production
if os.path.exists("../frontend/dist"):
    app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")
