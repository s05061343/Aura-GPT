from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    llama_server_url: str = Field("http://127.0.0.1:8080/v1", alias="LLAMA_SERVER_URL")
    llm_model_alias: str = Field("junyx-local", alias="LLM_MODEL_ALIAS")
    llm_model_display_name: str = Field("Qwen3 8B", alias="LLM_MODEL_DISPLAY_NAME")
    agent_max_steps: int = Field(5, ge=1, le=8, alias="AGENT_MAX_STEPS")
    agent_max_tool_calls: int = Field(4, ge=1, le=8, alias="AGENT_MAX_TOOL_CALLS")
    tool_timeout_ms: int = Field(15_000, ge=1_000, le=60_000, alias="TOOL_TIMEOUT_MS")
    session_ttl_ms: int = Field(1_800_000, ge=60_000, le=86_400_000, alias="SESSION_TTL_MS")
    langsmith_tracing: bool = Field(True, alias="LANGSMITH_TRACING")
    langsmith_api_key: str | None = Field(None, alias="LANGSMITH_API_KEY")
    langsmith_project: str = Field("junyx-local", alias="LANGSMITH_PROJECT")

    @property
    def langsmith_enabled(self) -> bool:
        return self.langsmith_tracing and bool(self.langsmith_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
