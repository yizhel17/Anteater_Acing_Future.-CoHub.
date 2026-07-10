import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_user
from app.models.contribution import Contribution
from app.models.user import User
from app.schemas.contribution import ContributionRequest, ContributionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=ContributionResponse, status_code=status.HTTP_201_CREATED)
async def submit_contribution(
    body: ContributionRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    contribution = Contribution(
        user_id=user.id if user else None,
        course=body.course,
        danger_zone=body.danger_zone,
        setup_tips=body.setup_tips,
        career_value=body.career_value,
        is_approved=False,
    )
    db.add(contribution)
    await db.flush()

    return ContributionResponse(
        id=contribution.id,
        course=contribution.course,
        is_approved=contribution.is_approved,
        created_at=contribution.created_at,
    )
