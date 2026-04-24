from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Boolean
from datetime import datetime, timezone
from app.core.database import Base


class Extension(Base):
    __tablename__ = "extensions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    slug = Column(String(100), unique=True, nullable=False)
    version = Column(String(20), default="1.0.0")
    description = Column(Text, nullable=True)
    author = Column(String(200), nullable=True)
    entry_point = Column(String(500), nullable=True)  # path to main file
    config_schema = Column(JSON, default=dict)
    config = Column(JSON, default=dict)
    enabled = Column(Boolean, default=True)
    tags = Column(JSON, default=list)
    installed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))
