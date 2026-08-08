from uuid import uuid4

import pytest
from pydantic import TypeAdapter, ValidationError

from junyx_backend.contracts import ApprovalCommand, ChatCommand, MessageCommand


adapter = TypeAdapter(ChatCommand)


def test_message_command_is_strict() -> None:
    command = adapter.validate_python({
        "type": "message", "threadId": str(uuid4()), "requestId": str(uuid4()),
        "messageId": str(uuid4()), "text": "你好",
    })
    assert isinstance(command, MessageCommand)


def test_unknown_client_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        adapter.validate_python({
            "type": "approval", "threadId": str(uuid4()), "requestId": str(uuid4()),
            "approvalId": "approval-1", "decision": "approve", "system": "unsafe",
        })


def test_approval_decision_is_allowlisted() -> None:
    with pytest.raises(ValidationError):
        ApprovalCommand(
            type="approval", threadId=uuid4(), requestId=uuid4(),
            approvalId="approval-1", decision="edit",  # type: ignore[arg-type]
        )
