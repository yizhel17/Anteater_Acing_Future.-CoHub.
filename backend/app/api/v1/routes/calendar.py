from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.models.guide import Guide
from app.models.user import User
from app.schemas.calendar import CalendarUrlResponse
from app.services.calendar_service import (
    build_ics_feed,
    get_or_create_calendar_token,
    parse_markdown_tasks,
)

router = APIRouter()


@router.get("/me/url", response_model=CalendarUrlResponse)
async def get_calendar_url(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    token = await get_or_create_calendar_token(user, db)
    ics_url = str(request.base_url).rstrip("/") + f"/api/v1/calendar/{token}.ics"
    webcal_url = ics_url.replace("https://", "webcal://").replace("http://", "webcal://")
    return CalendarUrlResponse(ics_url=ics_url, webcal_url=webcal_url)


@router.get("/{token}.ics")
async def get_calendar_feed(token: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.calendar_token == token))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Calendar feed not found")

    guide_result = await db.execute(
        select(Guide).where(Guide.user_id == user.id).order_by(Guide.created_at.desc()).limit(1)
    )
    guide = guide_result.scalar_one_or_none()
    tasks = parse_markdown_tasks(guide.response_md) if guide and guide.response_md else []

    return Response(
        content=build_ics_feed(guide.id if guide else user.id, tasks),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": "inline; filename=aaf-study-plan.ics"},
    )
