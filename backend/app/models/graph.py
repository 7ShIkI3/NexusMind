from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float
from datetime import datetime, timezone
from app.core.database import Base


class GraphNode(Base):
    __tablename__ = "graph_nodes"

    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(String(100), unique=True, index=True, nullable=False)
    label = Column(String(500), nullable=False)
    node_type = Column(String(50), default="default")  # note, concept, entity, url, file
    data = Column(JSON, default=dict)
    color = Column(String(20), nullable=True)
    size = Column(Float, default=30.0)
    position_x = Column(Float, nullable=True)
    position_y = Column(Float, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class GraphEdge(Base):
    __tablename__ = "graph_edges"

    id = Column(Integer, primary_key=True, index=True)
    edge_id = Column(String(100), unique=True, index=True, nullable=False)
    source_id = Column(String(100), nullable=False)
    target_id = Column(String(100), nullable=False)
    label = Column(String(200), nullable=True)
    edge_type = Column(String(50), default="relates_to")
    weight = Column(Float, default=1.0)
    data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
