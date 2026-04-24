from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from app.core.database import get_db, SessionLocal
from app.core.routine_engine import (
    routine_engine, run_organize_notes, run_auto_tag, run_auto_link
)
from app.core.ai_manager import ai_manager
from app.core.graph_engine import graph_engine
from app.models.routine import Routine

router = APIRouter(prefix="/routines", tags=["routines"])

ROUTINE_TYPES = {
    "organize_notes": run_organize_notes,
    "auto_tag": run_auto_tag,
    "auto_link": run_auto_link,
}


class RoutineCreate(BaseModel):
    name: str
    description: Optional[str] = None
    routine_type: str
    schedule: Optional[str] = None
    provider: Optional[str] = "ollama"
    model: Optional[str] = None
    prompt_template: Optional[str] = None
    config: dict = {}
    enabled: bool = True


class RoutineUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    schedule: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    prompt_template: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None


@router.get("/")
def list_routines(db: Session = Depends(get_db)):
    routines = db.query(Routine).all()
    return [_routine_dict(r) for r in routines]


@router.post("/")
def create_routine(data: RoutineCreate, db: Session = Depends(get_db)):
    routine = Routine(**data.model_dump())
    db.add(routine)
    db.commit()
    db.refresh(routine)

    if routine.enabled and routine.schedule:
        _schedule_routine(routine)

    return _routine_dict(routine)


@router.put("/{routine_id}")
def update_routine(routine_id: int, data: RoutineUpdate, db: Session = Depends(get_db)):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        raise HTTPException(404, "Routine not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(routine, field, value)
    routine.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(routine)

    routine_engine.remove_routine(routine_id)
    if routine.enabled and routine.schedule:
        _schedule_routine(routine)

    return _routine_dict(routine)


@router.delete("/{routine_id}")
def delete_routine(routine_id: int, db: Session = Depends(get_db)):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        raise HTTPException(404, "Not found")
    routine_engine.remove_routine(routine_id)
    db.delete(routine)
    db.commit()
    return {"deleted": True}


@router.post("/{routine_id}/run")
async def run_routine_now(routine_id: int, db: Session = Depends(get_db)):
    routine = db.query(Routine).filter(Routine.id == routine_id).first()
    if not routine:
        raise HTTPException(404, "Routine not found")

    task_fn = ROUTINE_TYPES.get(routine.routine_type)
    if not task_fn:
        raise HTTPException(400, f"Unknown routine type: {routine.routine_type}")

    import asyncio
    if routine.routine_type == "auto_link":
        result = await task_fn(SessionLocal, ai_manager, graph_engine, routine)
    else:
        result = await task_fn(SessionLocal, ai_manager, routine)

    routine.last_run = datetime.now(timezone.utc)
    routine.last_result = str(result)
    routine.run_count = (routine.run_count or 0) + 1
    db.commit()

    return {"routine_id": routine_id, "result": result}


@router.get("/scheduler/jobs")
def list_scheduled_jobs():
    return {"jobs": routine_engine.list_jobs()}


@router.get("/types")
def list_routine_types():
    return {"types": list(ROUTINE_TYPES.keys())}


def _schedule_routine(routine: Routine):
    task_fn = ROUTINE_TYPES.get(routine.routine_type)
    if not task_fn:
        return

    import asyncio

    async def job():
        db = SessionLocal()
        try:
            if routine.routine_type == "auto_link":
                result = await task_fn(SessionLocal, ai_manager, graph_engine, routine)
            else:
                result = await task_fn(SessionLocal, ai_manager, routine)
            r = db.query(Routine).filter(Routine.id == routine.id).first()
            if r:
                r.last_run = datetime.now(timezone.utc)
                r.last_result = str(result)
                r.run_count = (r.run_count or 0) + 1
                db.commit()
        finally:
            db.close()

    routine_engine.schedule_routine(routine.id, routine.schedule, job)


def _routine_dict(r: Routine) -> dict:
    return {
        "id": r.id, "name": r.name, "description": r.description,
        "routine_type": r.routine_type, "schedule": r.schedule,
        "provider": r.provider, "model": r.model, "config": r.config or {},
        "enabled": r.enabled, "last_run": r.last_run,
        "last_result": r.last_result, "run_count": r.run_count,
        "created_at": r.created_at,
    }
