"""Reseed ChromaDB from Supabase's approved contributions.

Supabase is the single source of truth for tip content; ChromaDB is a derived
index. This is called on every FastAPI startup (see app/main.py's lifespan) so
that ChromaDB — which lives on Render's ephemeral filesystem and is wiped on
every redeploy / free-tier sleep-wake cycle — is rebuilt from scratch each
boot instead of requiring a paid persistent disk.

Also runnable standalone: python -m scripts.load_rag_data
"""
import asyncio
import logging

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.contribution import Contribution
from app.models.user import User  # noqa: F401 - registers users table for Contribution's FK
from app.services import rag_service

logger = logging.getLogger(__name__)


async def reseed_from_supabase() -> int:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Contribution).where(Contribution.is_approved.is_(True))
        )
        contributions = result.scalars().all()

    await rag_service.reset_collection_async()
    for c in contributions:
        text = rag_service.build_tip_text(c.course, c.danger_zone, c.setup_tips, c.career_value)
        await rag_service.add_tip_async(str(c.id), c.course, text)

    logger.info("Reseeded ChromaDB with %d approved contributions from Supabase", len(contributions))
    return len(contributions)


if __name__ == "__main__":
    count = asyncio.run(reseed_from_supabase())
    print(f"重灌完成：ChromaDB 现有 {count} 条 tips（源自 Supabase is_approved=true）。")
