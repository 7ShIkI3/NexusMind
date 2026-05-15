def _is_edge_element(element: dict) -> bool:
    return element.get("source") is not None and element.get("target") is not None


def test_graph_filtering_ignores_node_metadata_source_fields():
    node_like_element = {
        "data": {
            "id": "knowledge_rag_demo",
            "label": "Demo",
            "source": "file_upload",
            "source_key": "nexusmind:demo.txt",
        }
    }

    edge_like_element = {
        "data": {
            "id": "edge_1",
            "source": "node_a",
            "target": "node_b",
        }
    }

    assert _is_edge_element(node_like_element["data"]) is False
    assert _is_edge_element(edge_like_element["data"]) is True
