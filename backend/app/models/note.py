from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey, Boolean
from sqlalchemy.orm import relationship, backref
from datetime import datetime, timezone
from app.core.database import Base


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False, default="Untitled")
    content = Column(Text, default="")
    content_html = Column(Text, default="")
    tags = Column(JSON, default=list)
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    embedding_id = Column(String(100), nullable=True)  # ChromaDB doc id
    metadata_ = Column("metadata", JSON, default=dict)
    is_pinned = Column(Boolean, default=False)
    color = Column(String(20), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    folder = relationship("Folder", back_populates="notes")


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    color = Column(String(20), nullable=True)
    icon = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    notes = relationship("Note", back_populates="folder")
    children = relationship("Folder", backref=backref("parent", remote_side=[id]),
                            foreign_keys=[parent_id])
