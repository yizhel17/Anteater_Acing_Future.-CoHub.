import asyncio
import logging
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings

logger = logging.getLogger(__name__)

# backend/chroma_db/ — resolved relative to this file, not CWD
_DB_PATH = str(Path(__file__).parent.parent.parent / "chroma_db")
_COLLECTION_NAME = "aaf_data"

# Created once per process and reused — chromadb.PersistentClient() re-opens
# the on-disk store and (re)binds the embedding model on every construction,
# so building a fresh one per RAG call (once per selected course, every
# request) was the actual source of the ~1-minute guide-generation latency.
_client = chromadb.PersistentClient(
    path=_DB_PATH,
    settings=ChromaSettings(anonymized_telemetry=False),
)
_collection = _client.get_or_create_collection(name=_COLLECTION_NAME)


def _get_collection():
    return _collection


def _retrieve_tips_sync(query: str, course: str | None, n: int) -> list[str]:
    collection = _get_collection()

    if collection.count() == 0:
        return []

    if course:
        try:
            results = collection.query(
                query_texts=[query],
                n_results=min(n, collection.count()),
                where={"course": course},
            )
            docs = results.get("documents", [[]])[0]
            if docs:
                return docs
        except Exception:
            pass  # No data for this course — fall through to full search

    results = collection.query(
        query_texts=[query],
        n_results=min(n, collection.count()),
    )
    return results.get("documents", [[]])[0]


async def retrieve_tips_async(query: str, course: str | None = None, n: int = 3) -> list[str]:
    return await asyncio.to_thread(_retrieve_tips_sync, query, course, n)


def _add_tip_sync(tip_id: str, course: str, text: str) -> None:
    collection = _get_collection()
    collection.add(documents=[text], metadatas=[{"course": course}], ids=[tip_id])


async def add_tip_async(tip_id: str, course: str, text: str) -> None:
    await asyncio.to_thread(_add_tip_sync, tip_id, course, text)


def build_tip_text(
    course: str,
    danger_zone: str | None,
    setup_tips: str | None,
    career_value: str | None,
) -> str:
    # Shared by contributions.py::approve_contribution (real-time single-tip
    # write) and scripts/load_rag_data.py (bulk reseed) so both paths produce
    # byte-identical tip text for the same contribution.
    text_parts = [f"Course: {course}"]
    if danger_zone:
        text_parts.append(f"Danger Zone: {danger_zone}")
    if setup_tips:
        text_parts.append(f"Setup Tips: {setup_tips}")
    if career_value:
        text_parts.append(f"Career Value: {career_value}")
    return "\n".join(text_parts)


def _reset_collection_sync() -> None:
    global _collection
    try:
        _client.delete_collection(name=_COLLECTION_NAME)
    except Exception:
        pass  # First-ever boot: collection doesn't exist yet, nothing to clear
    _collection = _client.get_or_create_collection(name=_COLLECTION_NAME)


async def reset_collection_async() -> None:
    await asyncio.to_thread(_reset_collection_sync)
