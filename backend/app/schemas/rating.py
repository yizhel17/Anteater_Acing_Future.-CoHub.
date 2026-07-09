from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class RatingRequest(BaseModel):
    guide_id: UUID
    score: Literal[-1, 0, 1]


class RatingResponse(BaseModel):
    id: UUID
    guide_id: UUID
    score: int
    created_at: datetime
