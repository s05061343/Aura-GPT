from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from junyx_backend.app import app


client = TestClient(app)


def test_invalid_chat_request_is_rejected_without_details() -> None:
    response = client.post("/api/chat", json={"type": "message", "text": "missing ids"})
    assert response.status_code == 400
    payload = response.json()
    assert payload["code"] == "INVALID_REQUEST"
    assert "detail" not in payload


def test_clear_rejects_invalid_thread_id() -> None:
    response = client.delete("/api/chat?threadId=unsafe")
    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"
