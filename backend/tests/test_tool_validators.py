import pytest

from app.core.tool_validators import ToolArgValidator


def test_create_file_validator_accepts_safe_filename():
    args = {"filename": "safe_file.txt", "content": "hello"}
    validated = ToolArgValidator.validate("create_file", args)
    assert validated["filename"] == "safe_file.txt"


def test_create_file_validator_rejects_path_traversal():
    args = {"filename": "../secret.txt", "content": "hello"}
    with pytest.raises(ValueError):
        ToolArgValidator.validate("create_file", args)


def test_query_rag_validator_limits_top_k():
    args = {"query": "test", "top_k": 999}
    with pytest.raises(ValueError):
        ToolArgValidator.validate("query_rag", args)


def test_unknown_tool_passes_through():
    args = {"any": "value"}
    validated = ToolArgValidator.validate("unknown_tool", args)
    assert validated == args
