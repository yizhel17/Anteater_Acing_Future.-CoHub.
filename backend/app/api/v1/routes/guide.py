import asyncio
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, get_optional_user
from app.models.user import User
from app.schemas.guide import GuideRequest, GuideResponse
from app.services import ai_service, rag_service, search_service

logger = logging.getLogger(__name__)

router = APIRouter()


async def _skip_search() -> tuple[list[str], str]:
    return [], ""


@router.post("/generate", response_model=GuideResponse)
async def generate_guide_endpoint(
    body: GuideRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
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

        # Phase 1: no DB write — guide_id is ephemeral
        return GuideResponse(
            guide_id=uuid.uuid4(),
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
