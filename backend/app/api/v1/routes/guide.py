import asyncio
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, get_optional_user
from app.core.rate_limit import guide_generate_limiter
from app.models.guide import Guide
from app.models.user import User
from app.schemas.guide import (
    GuideHistoryItem,
    GuideHistoryResponse,
    GuideRequest,
    GuideResponse,
)
from app.services import ai_service, rag_service, search_service

logger = logging.getLogger(__name__)

router = APIRouter()


async def _skip_search() -> tuple[list[str], str]:
    return [], ""


async def check_rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    if not await guide_generate_limiter.allow(key):
        raise HTTPException(status_code=429, detail="Too many requests, please slow down")


@router.post("/generate", response_model=GuideResponse)
async def generate_guide_endpoint(
    body: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
    _rl: None = Depends(check_rate_limit),
):
    try:
        courses = body.courses
        role = body.role

        # Build RAG coroutines — one per course
        rag_tasks = [
            rag_service.retrieve_tips_async(
                query=f"{course} danger zone actionable setup tips",
                course=course,
                n=3,
            )
            for course in courses
        ]

        # Tavily is skipped for senior role
        tavily_coro = (
            search_service.tavily_search(courses)
            if role != "senior"
            else _skip_search()
        )

        # Concurrent execution: ChromaDB (N tasks) + Tavily (1 task)
        results = await asyncio.gather(*rag_tasks, tavily_coro, return_exceptions=True)

        # Parse RAG results (all but the last)
        rag_results: list[list[str]] = []
        for res in results[:-1]:
            if isinstance(res, Exception):
                logger.warning("RAG task failed: %s", res)
                rag_results.append([])
            else:
                rag_results.append(res)  # type: ignore[arg-type]

        # Parse Tavily result (last item)
        tavily_result = results[-1]
        if isinstance(tavily_result, Exception):
            logger.warning("Tavily task failed: %s", tavily_result)
            sources_used: list[str] = []
            search_results_str = ""
        else:
            sources_used, search_results_str = tavily_result  # type: ignore[misc]

        # Assemble senior_tips_str — mirrors original app.py lines[] logic exactly
        senior_tips_str = ""
        lines = ["=== SENIOR TIPS DATABASE ==="]
        tips_found = False
        for course, tips in zip(courses, rag_results):
            if tips:
                tips_found = True
                lines.append(f"\n[{course} VERIFIED FEEDBACK]:")
                for tip in tips:
                    lines.append(f"{tip}\n---")
        lines.append("=== END ===")
        if tips_found:
            senior_tips_str = "\n".join(lines)

        tips_count = sum(len(t) for t in rag_results)

        # Build prompt and call Claude
        user_context = ai_service.build_user_context(
            role=role,
            courses=courses,
            confidence=body.confidence,
            goals=body.goals,
            user_query=body.user_query,
            senior_tips_str=senior_tips_str,
            search_results=search_results_str,
        )

        guide_markdown, tokens_used = await ai_service.generate_guide(user_context)

        # Phase 2: 写入 guides 表（匿名用户 user_id=None）
        guide = Guide(
            user_id=user.id if user else None,
            role=role,
            courses=courses,
            confidence=body.confidence,
            goals=body.goals,
            user_query=body.user_query,
            response_md=guide_markdown,
            tokens_used=tokens_used,
        )
        db.add(guide)
        await db.flush()  # 获取 DB 生成的 guide.id；commit 在 get_db() 生命周期末统一提交

        return GuideResponse(
            guide_id=guide.id,
            guide_markdown=guide_markdown,
            sources_used=sources_used,
            tips_count=tips_count,
            tokens_used=tokens_used,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("generate_guide failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Guide generation failed") from exc


@router.get("/history", response_model=GuideHistoryResponse)
async def guide_history(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count_result = await db.execute(
        select(func.count()).select_from(Guide).where(Guide.user_id == user.id)
    )
    total = count_result.scalar_one()

    result = await db.execute(
        select(Guide)
        .where(Guide.user_id == user.id)
        .order_by(Guide.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    guides = result.scalars().all()

    items = [
        GuideHistoryItem(
            guide_id=g.id,
            role=g.role,
            courses=g.courses,
            created_at=g.created_at,
        )
        for g in guides
    ]
    return GuideHistoryResponse(items=items, total=total)


@router.get("/{guide_id}", response_model=GuideResponse)
async def get_guide(
    guide_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    guide = await db.get(Guide, guide_id)
    if guide is None:
        raise HTTPException(status_code=404, detail="Guide not found")
    return GuideResponse(
        guide_id=guide.id,
        guide_markdown=guide.response_md,
        sources_used=[],
        tips_count=0,
        tokens_used=guide.tokens_used or 0,
    )
