"""
Routine Engine - Advanced scheduled AI tasks for database organization and automation.
Uses APScheduler for cron/interval scheduling.
"""
from __future__ import annotations

import asyncio
from typing import Optional
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.config import settings


class RoutineEngine:
    def __init__(self):
        self._scheduler = AsyncIOScheduler()
        self._started = False

    def start(self):
        if not self._started:
            self._scheduler.start()
            self._started = True

    def stop(self):
        if self._started:
            self._scheduler.shutdown(wait=False)
            self._started = False

    def schedule_routine(self, routine_id: int, schedule: str,
                         task_fn, job_id: str = None):
        """
        Schedule a routine. Schedule format:
        - "interval:60" -> every 60 seconds
        - "cron:0 * * * *" -> cron expression
        """
        jid = job_id or f"routine_{routine_id}"
        if jid in [j.id for j in self._scheduler.get_jobs()]:
            self._scheduler.remove_job(jid)

        if schedule.startswith("interval:"):
            seconds = int(schedule.split(":")[1])
            trigger = IntervalTrigger(seconds=seconds)
        elif schedule.startswith("cron:"):
            expr = schedule[5:].strip()
            parts = expr.split()
            if len(parts) == 5:
                trigger = CronTrigger(minute=parts[0], hour=parts[1],
                                      day=parts[2], month=parts[3],
                                      day_of_week=parts[4])
            else:
                trigger = IntervalTrigger(seconds=settings.ROUTINE_CHECK_INTERVAL)
        else:
            trigger = IntervalTrigger(seconds=settings.ROUTINE_CHECK_INTERVAL)

        self._scheduler.add_job(task_fn, trigger=trigger, id=jid, replace_existing=True)

    def remove_routine(self, routine_id: int):
        jid = f"routine_{routine_id}"
        try:
            self._scheduler.remove_job(jid)
        except Exception:
            pass

    def list_jobs(self) -> list[dict]:
        jobs = []
        for job in self._scheduler.get_jobs():
            next_run = job.next_run_time.isoformat() if job.next_run_time else None
            jobs.append({"id": job.id, "next_run": next_run, "name": job.name})
        return jobs


async def run_organize_notes(db_session_factory, ai_manager, routine):
    """AI-powered note organization routine."""
    from app.models.note import Note
    db = db_session_factory()
    try:
        notes = db.query(Note).limit(50).all()
        if not notes:
            return {"status": "no notes to organize"}

        notes_summary = "\n".join(
            f"- ID:{n.id} Title:{n.title} Tags:{n.tags}"
            for n in notes[:20]
        )
        messages = [
            {"role": "system", "content":
             "You are a knowledge organization assistant. Analyze the notes and suggest "
             "tags, groupings, and organizational improvements. Return JSON."},
            {"role": "user", "content":
             f"Organize these notes:\n{notes_summary}\n\n"
             "Return JSON: {\"suggestions\": [{\"note_id\": int, \"tags\": [str], "
             "\"folder\": str}]}"},
        ]
        provider = routine.provider or "ollama"
        model = routine.model or None
        response = await ai_manager.chat(provider, messages, model)
        return {"status": "completed", "suggestions": response,
                "notes_processed": len(notes)}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


async def run_auto_tag(db_session_factory, ai_manager, routine):
    """Auto-tag notes without tags using AI."""
    from app.models.note import Note
    db = db_session_factory()
    try:
        untagged = db.query(Note).filter(Note.tags == []).limit(20).all()
        results = []
        for note in untagged:
            if not note.content:
                continue
            messages = [
                {"role": "system", "content":
                 "Generate 3-5 relevant tags for this note. Return only comma-separated tags."},
                {"role": "user", "content": f"Title: {note.title}\n\n{note.content[:500]}"},
            ]
            provider = routine.provider or "ollama"
            model = routine.model or None
            response = await ai_manager.chat(provider, messages, model)
            tags = [t.strip() for t in response.split(",") if t.strip()]
            note.tags = tags
            results.append({"note_id": note.id, "tags": tags})
        db.commit()
        return {"status": "completed", "tagged_notes": len(results), "results": results}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


async def run_auto_link(db_session_factory, ai_manager, graph_engine, routine):
    """Auto-link related notes in the knowledge graph."""
    from app.models.note import Note
    db = db_session_factory()
    try:
        notes = db.query(Note).limit(30).all()
        pairs = []
        for i, n1 in enumerate(notes):
            for n2 in notes[i+1:]:
                if n1.content and n2.content:
                    pairs.append((n1, n2))
                if len(pairs) >= 10:
                    break
            if len(pairs) >= 10:
                break

        created_edges = 0
        for n1, n2 in pairs:
            messages = [
                {"role": "system", "content":
                 "Determine if two notes are strongly related. Reply only YES or NO."},
                {"role": "user", "content":
                 f"Note 1: {n1.title}\n{n1.content[:200]}\n\n"
                 f"Note 2: {n2.title}\n{n2.content[:200]}"},
            ]
            provider = routine.provider or "ollama"
            model = routine.model or None
            response = await ai_manager.chat(provider, messages, model)
            if "yes" in response.lower():
                node1 = graph_engine.add_node(db, label=n1.title,
                                              node_type="note", data={"note_id": n1.id})
                node2 = graph_engine.add_node(db, label=n2.title,
                                              node_type="note", data={"note_id": n2.id})
                graph_engine.add_edge(db, node1.node_id, node2.node_id,
                                      edge_type="related_to")
                created_edges += 1
        return {"status": "completed", "edges_created": created_edges}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        db.close()


routine_engine = RoutineEngine()
