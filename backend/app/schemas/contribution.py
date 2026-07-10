from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ContributionRequest(BaseModel):
    course: str
    danger_zone: str | None = None
    setup_tips: str | None = None
    career_value: str | None = None


class ContributionResponse(BaseModel):
    id: UUID
    course: str
    is_approved: bool
    created_at: datetime
