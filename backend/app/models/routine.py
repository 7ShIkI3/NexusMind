from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from datetime import datetime, timezone
from app.core.database import Base


class Routine(Base):
    __tablename__ = "routines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    routine_type = Column(String(50), nullable=False)
    # Types: organize_notes, auto_tag, auto_link, summarize, cleanup, custom
    schedule = Column(String(100), nullable=True)  # cron expression or interval
    provider = Column(String(50), nullable=True)   # AI provider to use
    model = Column(String(100), nullable=True)
    prompt_template = Column(Text, nullable=True)
    config = Column(JSON, default=dict)
    enabled = Column(Boolean, default=True)
    last_run = Column(DateTime, nullable=True)
    last_result = Column(Text, nullable=True)
    run_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
