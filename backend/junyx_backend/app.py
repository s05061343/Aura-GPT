import asyncio
import json
import logging
from typing import Annotated
from uuid import UUID, uuid4

import httpx
from fastapi import Body, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse

from .agent import sessions, stream_agent
from .config import get_settings
from .contracts import ApprovalCommand, MessageCommand, public_error

logger = logging.getLogger("junyx")
app = FastAPI(title="JUNYX Local Agent API", docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
    correlation_id = uuid4()
    return JSONResponse(public_error("INVALID_REQUEST", "聊天請求格式不正確。", False, correlation_id), status_code=400)


@app.get("/api/status")
async def status() -> dict[str, str]:
    settings = get_settings()
    model = "unavailable"
    try:
        async with httpx.AsyncClient(timeout=2) as client:
            response = await client.get(f"{settings.llama_server_url}/models")
            if response.is_success:
                model = "ready"
    except httpx.HTTPError:
        pass
    return {
        "application": "ready", "model": model, "modelAlias": settings.llm_model_alias,
        "modelDisplayName": settings.llm_model_display_name,
        "langSmith": "enabled" if settings.langsmith_enabled else "local-fallback",
    }


@app.post("/api/chat")
async def chat(request: Request, command: Annotated[MessageCommand | ApprovalCommand, Body(discriminator="type")]):
    correlation_id = uuid4()

    async def generate():
        try:
            async for event in stream_agent(command):
                if await request.is_disconnected():
                    break
                yield json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
        except asyncio.CancelledError:
            raise
        except Exception as error:
            logger.exception("chat.error", extra={"correlationId": str(correlation_id)})
            text = str(error)
            if "connect" in text.lower() or "model" in text.lower():
                payload = public_error("MODEL_UNAVAILABLE", "本機模型服務目前無法連線。", True, correlation_id)
            else:
                payload = public_error("INTERNAL_ERROR", "處理請求時發生錯誤。", False, correlation_id)
            yield json.dumps({"type": "error", "error": payload}, ensure_ascii=False, separators=(",", ":")) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson", headers={
        "Cache-Control": "no-cache, no-transform", "X-Correlation-Id": str(correlation_id),
    })


@app.delete("/api/chat", status_code=204)
async def clear_chat(threadId: UUID) -> Response:
    sessions.clear(threadId)
    return Response(status_code=204)
