import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_user
from app.models.guide import Guide
from app.models.rating import Rating
from app.models.user import User
from app.schemas.rating import RatingRequest, RatingResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=RatingResponse, status_code=status.HTTP_201_CREATED)
async def submit_rating(
    body: RatingRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    guide = await db.get(Guide, body.guide_id)
    if not guide:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Guide not found"
        )

    rating = Rating(
        guide_id=body.guide_id,
        user_id=user.id if user else None,
        score=body.score,
    )
    db.add(rating)
    await db.flush()

    return RatingResponse(
        id=rating.id,
        guide_id=rating.guide_id,
        score=rating.score,
        created_at=rating.created_at,
    )
