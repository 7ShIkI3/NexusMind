"""Tool argument validators using Pydantic for security and type safety."""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
import re
import os


class CreateFileArgs(BaseModel):
    """Validated arguments for create_file tool."""
    filename: str = Field(..., min_length=1, max_length=255, description="Filename (no path separators)")
    content: str = Field(..., description="File content")
    
    @field_validator('filename')
    @classmethod
    def validate_filename(cls, v: str) -> str:
        """Ensure safe filename - no path traversal, valid characters."""
        # Reject path separators
        if '/' in v or '\\' in v or v.startswith('.'):
            raise ValueError('Filename cannot contain path separators or start with dot')
        
        # Allow only safe characters: alphanumeric, dash, underscore, dot
        if not re.match(r'^[a-zA-Z0-9_\-\.]+$', v):
            raise ValueError('Filename contains invalid characters')
        
        return v


class CreateNoteArgs(BaseModel):
    """Validated arguments for create_note tool."""
    title: str = Field(..., min_length=1, max_length=500, description="Note title")
    content: str = Field(..., description="Note content")
    folder_id: Optional[int] = Field(default=None, description="Optional folder ID")
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """Validate note title."""
        v = v.strip()
        if not v:
            raise ValueError('Title cannot be empty')
        if len(v) > 500:
            raise ValueError('Title cannot exceed 500 characters')
        return v


class UpdateNoteArgs(BaseModel):
    """Validated arguments for update_note tool."""
    note_id: int = Field(..., gt=0, description="Note ID")
    title: Optional[str] = Field(default=None, min_length=1, max_length=500, description="Updated title")
    content: Optional[str] = Field(default=None, description="Updated content")
    
    @field_validator('title')
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError('Title cannot be empty')
        return v


class DeleteNoteArgs(BaseModel):
    """Validated arguments for delete_note tool."""
    note_id: int = Field(..., gt=0, description="Note ID to delete")


class CreateNodeArgs(BaseModel):
    """Validated arguments for create_graph_node tool."""
    label: str = Field(..., min_length=1, max_length=500, description="Node label")
    node_type: str = Field(default="concept", description="Node type")
    properties: Optional[dict] = Field(default=None, description="Node properties")
    
    @field_validator('label')
    @classmethod
    def validate_label(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Label cannot be empty')
        return v
    
    @field_validator('node_type')
    @classmethod
    def validate_node_type(cls, v: str) -> str:
        allowed_types = ['concept', 'entity', 'topic', 'keyword', 'custom']
        if v not in allowed_types:
            raise ValueError(f'Invalid node_type. Must be one of: {allowed_types}')
        return v


class CreateEdgeArgs(BaseModel):
    """Validated arguments for create_graph_edge tool."""
    source_id: int = Field(..., gt=0, description="Source node ID")
    target_id: int = Field(..., gt=0, description="Target node ID")
    relationship: str = Field(..., min_length=1, max_length=100, description="Relationship type")
    
    @field_validator('relationship')
    @classmethod
    def validate_relationship(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Relationship cannot be empty')
        # Only alphanumeric and underscores
        if not re.match(r'^[a-zA-Z0-9_\-\s]+$', v):
            raise ValueError('Relationship contains invalid characters')
        return v


class QueryRAGArgs(BaseModel):
    """Validated arguments for query_rag tool."""
    query: str = Field(..., min_length=1, max_length=1000, description="Search query")
    top_k: int = Field(default=5, ge=1, le=50, description="Number of results")
    
    @field_validator('query')
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Query cannot be empty')
        return v


class ToolArgValidator:
    """Validates tool arguments against defined schemas."""
    
    VALIDATORS = {
        'create_file': CreateFileArgs,
        'create_note': CreateNoteArgs,
        'update_note': UpdateNoteArgs,
        'delete_note': DeleteNoteArgs,
        'create_node': CreateNodeArgs,
        'create_edge': CreateEdgeArgs,
        'query_rag': QueryRAGArgs,
    }
    
    @classmethod
    def validate(cls, tool_name: str, args: dict) -> dict:
        """Validate tool arguments and return validated data."""
        if tool_name not in cls.VALIDATORS:
            # Unknown tool - pass through but log warning
            return args
        
        try:
            validator_class = cls.VALIDATORS[tool_name]
            validated = validator_class(**args)
            return validated.model_dump()
        except ValueError as e:
            raise ValueError(f"Invalid arguments for {tool_name}: {str(e)}")
    
    @classmethod
    def has_validator(cls, tool_name: str) -> bool:
        """Check if validator exists for tool."""
        return tool_name in cls.VALIDATORS
