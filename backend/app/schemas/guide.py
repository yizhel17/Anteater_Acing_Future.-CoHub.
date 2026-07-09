from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class GuideRequest(BaseModel):
    role: Literal["student", "senior"]
    courses: list[str] = Field(min_length=1)
    confidence: float = Field(ge=0, le=10)
    goals: list[str]
    user_query: str | None = None


class GuideResponse(BaseModel):
    guide_id: UUID
    guide_markdown: str
    sources_used: list[str]
    tips_count: int
    tokens_used: int
