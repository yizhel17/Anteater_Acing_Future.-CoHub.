import asyncio
import logging
from pathlib import Path

import chromadb

logger = logging.getLogger(__name__)

# backend/chroma_db/ — resolved relative to this file, not CWD
_DB_PATH = str(Path(__file__).parent.parent.parent / "chroma_db")
_COLLECTION_NAME = "aaf_data"


def _get_collection():
    client = chromadb.PersistentClient(path=_DB_PATH)
    return client.get_or_create_collection(name=_COLLECTION_NAME)


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
