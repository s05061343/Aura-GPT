from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class MessageCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["message"]
    threadId: UUID
    requestId: UUID
    messageId: UUID
    text: str = Field(min_length=1, max_length=16_000)


class ApprovalCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["approval"]
    threadId: UUID
    requestId: UUID
    approvalId: str = Field(min_length=1, max_length=256)
    decision: Literal["approve", "reject"]


ChatCommand = MessageCommand | ApprovalCommand


def public_error(code: str, message: str, retryable: bool, correlation_id: UUID) -> dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "retryable": retryable,
        "correlationId": str(correlation_id),
    }
