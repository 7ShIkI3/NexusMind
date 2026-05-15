from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import re
from typing import Optional

from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeItem


def normalize_knowledge_text(title: str = "", content: str = "", content_html: str = "", tags: Optional[list[str]] = None) -> str:
    parts = [title or "", content or "", content_html or ""]
    if tags:
        parts.append(" ".join(tags))
    return "\n".join(part for part in parts if part).strip()


def upsert_knowledge_item(
    db: Session,
    *,
    source_type: str,
    source_key: str,
    title: str,
    content: str = "",
    content_html: str = "",
    tags: Optional[list[str]] = None,
    folder_id: Optional[int] = None,
    source: Optional[str] = None,
    external_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    collection: str = "nexusmind",
) -> KnowledgeItem:
    item = db.query(KnowledgeItem).filter(KnowledgeItem.source_key == source_key).first()
    searchable_text = normalize_knowledge_text(title, content, content_html, tags)
    payload = {
        "source_type": source_type,
        "source_key": source_key,
        "collection": collection,
        "title": title or "Untitled",
        "content": content or "",
        "content_html": content_html or "",
        "tags": tags or [],
        "folder_id": folder_id,
        "source": source,
        "external_id": external_id,
        "metadata_": metadata or {},
        "searchable_text": searchable_text,
        "updated_at": datetime.now(timezone.utc),
    }

    if item is None:
        item = KnowledgeItem(**payload)
        db.add(item)
    else:
        for field, value in payload.items():
            setattr(item, field, value)

    db.commit()
    db.refresh(item)
    return item


def delete_knowledge_item(db: Session, source_key: str) -> bool:
    item = db.query(KnowledgeItem).filter(KnowledgeItem.source_key == source_key).first()
    if not item:
        return False
    db.delete(item)
    db.commit()
    return True


def list_knowledge_items(
    db: Session,
    *,
    collection: str = "nexusmind",
    source_type: Optional[str] = None,
    query: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 50,
) -> list[KnowledgeItem]:
    q = db.query(KnowledgeItem).filter(KnowledgeItem.collection == collection)
    if source_type:
        q = q.filter(KnowledgeItem.source_type == source_type)
    if source:
        q = q.filter(KnowledgeItem.source == source)
    items = q.order_by(KnowledgeItem.updated_at.desc()).all()
    if not query:
        return items[:limit]

    scored = [
        (score_knowledge_item(query, item), item)
        for item in items
    ]
    scored = [entry for entry in scored if entry[0] > 0]
    scored.sort(key=lambda entry: (entry[0], entry[1].updated_at or datetime.min), reverse=True)
    return [item for _, item in scored[:limit]]


def score_knowledge_item(query: str, item: KnowledgeItem) -> float:
    tokens = [token for token in re.split(r"\W+", query.lower()) if len(token) > 1]
    if not tokens:
        return 0.0

    haystack = " ".join([
        item.title or "",
        item.content or "",
        item.content_html or "",
        " ".join(item.tags or []),
        item.source or "",
        item.searchable_text or "",
    ]).lower()

    score = 0.0
    for token in tokens:
        if token in haystack:
            score += 2.0
        if token in (item.title or "").lower():
            score += 1.5
    return score


def summarize_knowledge_items(items: list[KnowledgeItem]) -> dict:
    tag_counter: Counter[str] = Counter()
    source_counter: Counter[str] = Counter()
    type_counter: Counter[str] = Counter()

    for item in items:
        type_counter[item.source_type] += 1
        if item.source:
            source_counter[item.source] += 1
        for tag in item.tags or []:
            tag_counter[str(tag)] += 1

    return {
        "top_tags": [{"name": tag, "count": count} for tag, count in tag_counter.most_common(8)],
        "top_sources": [{"name": source, "count": count} for source, count in source_counter.most_common(8)],
        "by_type": [{"name": source_type, "count": count} for source_type, count in type_counter.most_common()],
    }