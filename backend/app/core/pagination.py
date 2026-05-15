"""Pagination utilities for API endpoints."""

from pydantic import BaseModel, Field
from typing import TypeVar, Generic, List, Optional

T = TypeVar('T')


class PaginationParams(BaseModel):
    """Standard pagination parameters."""
    skip: int = Field(default=0, ge=0, description="Number of items to skip")
    limit: int = Field(default=50, ge=1, le=1000, description="Number of items to return (max 1000)")


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard paginated response format."""
    items: List[T]
    total: int = Field(description="Total number of items")
    skip: int = Field(description="Number of items skipped")
    limit: int = Field(description="Number of items in response")
    
    @property
    def has_more(self) -> bool:
        """Check if there are more items."""
        return (self.skip + self.limit) < self.total


def apply_pagination(query, skip: int = 0, limit: int = 50):
    """Apply pagination to a SQLAlchemy query."""
    if skip < 0:
        skip = 0
    if limit < 1:
        limit = 50
    if limit > 1000:
        limit = 1000
    
    return query.offset(skip).limit(limit)
