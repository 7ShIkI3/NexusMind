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
            # Handle potential object response from OpenAI
            response_text = response.content if hasattr(response, 'content') else str(response)
            
            if "yes" in response_text.lower():
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


async def run_detect_orphans(db_session_factory, ai_manager, graph_engine, routine):
    """Detect isolated notes and suggest links via AI."""
    from app.models.note import Note
    from app.models.graph import GraphNode
    db = db_session_factory()
    try:
        # Find notes that don't have edges in the graph
        all_notes = db.query(Note).all()
        orphans = []
        for note in all_notes:
            node_id = f"note_{note.id}"
            exists = db.query(GraphNode).filter(GraphNode.node_id == node_id).first()
            if not exists:
                orphans.append(note)
        
        if not orphans:
            return {"status": "no orphans found"}
            
        results = []
        for orphan in orphans[:5]: # Process 5 at a time
            # Find potential candidates for linking (random 10 other notes)
            candidates = db.query(Note).filter(Note.id != orphan.id).limit(10).all()
            cand_titles = [f"{c.id}: {c.title}" for c in candidates]
            
            messages = [
                {"role": "system", "content": "You are a knowledge architect. Suggest links between an isolated note and other notes."},
                {"role": "user", "content": f"Isolated Note: {orphan.title}\nContent: {orphan.content[:300]}\n\nPossible candidates:\n" + "\n".join(cand_titles) + "\n\nReturn JSON: {'links': [{'note_id': int, 'reason': str}]}"}
            ]
            provider = routine.provider or "ollama"
            response = await ai_manager.chat(provider, messages, routine.model)
            response_text = response.content if hasattr(response, 'content') else str(response)
            
            # Simple parsing or creation
            try:
                import json
                data = json.loads(response_text)
                for link in data.get("links", []):
                    target_id = link["note_id"]
                    graph_engine.add_or_get_edge(db, f"note_{orphan.id}", f"note_{target_id}", edge_type="suggested", label="suggested")
                    results.append(f"Linked {orphan.id} to {target_id}")
            except json.JSONDecodeError as e:
                logger = __import__('logging').getLogger(__name__)
                logger.warning(f"Failed to parse link suggestions for orphan {orphan.id}: {e}")
            except Exception as e:
                logger = __import__('logging').getLogger(__name__)
                logger.exception(f"Error linking orphan notes {orphan.id}: {e}")
            
        return {"status": "completed", "actions": results}
    finally:
        db.close()

async def run_daily_summary(db_session_factory, ai_manager, routine):
    """Create a summary note of the day's activity."""
    from app.models.note import Note
    from datetime import datetime, timedelta, timezone
    db = db_session_factory()
    try:
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        recent_notes = db.query(Note).filter(Note.updated_at >= yesterday).all()
        if not recent_notes:
            return {"status": "no activity to summarize"}
            
        summary_input = "\n".join([f"- {n.title}: {n.content[:100]}" for n in recent_notes])
        messages = [
            {"role": "system", "content": "Create a brief summary of today's knowledge activity."},
            {"role": "user", "content": f"Recent activity:\n{summary_input}\n\nWrite a concise summary note."}
        ]
        provider = routine.provider or "ollama"
        response = await ai_manager.chat(provider, messages, routine.model)
        response_text = response.content if hasattr(response, 'content') else str(response)
        
        # Create summary note
        summary_note = Note(
            title=f"Daily Summary - {datetime.now().strftime('%Y-%m-%d')}",
            content=response_text,
            tags=["summary", "automated"]
        )
        db.add(summary_note)
        db.commit()
        return {"status": "summary created", "note_id": summary_note.id}
    finally:
        db.close()


routine_engine = RoutineEngine()
