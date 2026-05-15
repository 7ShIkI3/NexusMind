from app.api.rag import _extract_text_from_upload


def test_extract_text_from_csv_upload_structures_rows():
    text, metadata = _extract_text_from_upload(
        "people.csv",
        b"name,city\nAlice,Paris\nBob,Lyon\n",
    )

    assert "row 1: name=Alice; city=Paris" in text
    assert "row 2: name=Bob; city=Lyon" in text
    assert metadata["type"] == "csv"
    assert metadata["rows"] == 2


def test_extract_text_from_jsonl_upload_flattens_objects():
    text, metadata = _extract_text_from_upload(
        "items.jsonl",
        b'{"name": "Alpha", "score": 10}\n{"name": "Beta", "score": 5}\n',
    )

    assert "item 1" in text
    assert "name: Alpha" in text
    assert "item 2" in text
    assert "name: Beta" in text
    assert metadata["type"] == "json"
    assert metadata["items"] == 2
