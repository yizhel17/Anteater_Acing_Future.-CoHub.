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
