from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Index

from app.core.database import Base


class KnowledgeItem(Base):
    __tablename__ = "knowledge_items"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(String(50), nullable=False, index=True)
    source_key = Column(String(255), nullable=False, unique=True, index=True)
    collection = Column(String(100), nullable=False, default="nexusmind", index=True)
    title = Column(String(500), nullable=False, default="Untitled")
    content = Column(Text, default="")
    content_html = Column(Text, default="")
    tags = Column(JSON, default=list)
    folder_id = Column(Integer, nullable=True)
    source = Column(String(200), nullable=True)
    external_id = Column(String(255), nullable=True)
    metadata_ = Column("metadata", JSON, default=dict)
    searchable_text = Column(Text, default="")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


Index("ix_knowledge_items_source_type_collection", KnowledgeItem.source_type, KnowledgeItem.collection)