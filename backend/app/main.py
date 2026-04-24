from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from app.core.config import settings
from app.core.database import init_db
from app.core.extension_manager import extension_manager
from app.core.routine_engine import routine_engine

from app.api import chat, notes, graph, rag, extensions, routines, ai_providers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    extension_manager.load_all()
    routine_engine.start()

    # Re-schedule existing enabled routines
    from app.core.database import SessionLocal
    from app.models.routine import Routine
    db = SessionLocal()
    try:
        active_routines = db.query(Routine).filter(Routine.enabled == True,  # noqa: E712
                                                    Routine.schedule.isnot(None)).all()
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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(chat.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(graph.router, prefix="/api/v1")
app.include_router(rag.router, prefix="/api/v1")
app.include_router(extensions.router, prefix="/api/v1")
app.include_router(routines.router, prefix="/api/v1")
app.include_router(ai_providers.router, prefix="/api/v1")


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
