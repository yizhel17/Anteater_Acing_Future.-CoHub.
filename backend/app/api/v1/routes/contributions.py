import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_user, require_admin
from app.models.contribution import Contribution
from app.models.user import User
from app.schemas.contribution import ContributionRequest, ContributionResponse
from app.services import rag_service

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


@router.get("", response_model=list[ContributionResponse])
async def list_pending_contributions(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(Contribution)
        .where(Contribution.is_approved.is_(False))
        .order_by(Contribution.created_at.asc())
    )
    items = result.scalars().all()
    return [
        ContributionResponse(
            id=c.id,
            course=c.course,
            is_approved=c.is_approved,
            created_at=c.created_at,
        )
        for c in items
    ]


@router.post("/{contribution_id}/approve", response_model=ContributionResponse)
async def approve_contribution(
    contribution_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    contribution = await db.get(Contribution, contribution_id)
    if contribution is None:
        raise HTTPException(status_code=404, detail="Contribution not found")

    contribution.is_approved = True
    await db.flush()

    text_parts = [f"Course: {contribution.course}"]
    if contribution.danger_zone:
        text_parts.append(f"Danger Zone: {contribution.danger_zone}")
    if contribution.setup_tips:
        text_parts.append(f"Setup Tips: {contribution.setup_tips}")
    if contribution.career_value:
        text_parts.append(f"Career Value: {contribution.career_value}")
    text = "\n".join(text_parts)
    await rag_service.add_tip_async(str(contribution.id), contribution.course, text)

    return ContributionResponse(
        id=contribution.id,
        course=contribution.course,
        is_approved=contribution.is_approved,
        created_at=contribution.created_at,
    )


@router.delete("/{contribution_id}", status_code=status.HTTP_204_NO_CONTENT)
async def reject_contribution(
    contribution_id: UUID,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    contribution = await db.get(Contribution, contribution_id)
    if contribution is None:
        raise HTTPException(status_code=404, detail="Contribution not found")
    await db.delete(contribution)
    await db.flush()
