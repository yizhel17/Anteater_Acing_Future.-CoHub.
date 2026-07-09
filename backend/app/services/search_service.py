import asyncio
import logging

from tavily import TavilyClient

from app.core.config import settings

logger = logging.getLogger(__name__)


def _source_tag(url: str) -> str:
    url_lower = url.lower()
    if "reddit.com" in url_lower:
        return "📌 r/UCI Forum"
    elif "uci.edu" in url_lower:
        return "🎓 UCI Official"
    elif "ratemyprofessors.com" in url_lower:
        return "⭐ RateMyProfessors"
    elif "blind.com" in url_lower:
        return "💼 Blind SWE Intel"
    elif "linkedin.com" in url_lower:
        return "🔗 LinkedIn"
    else:
        return "🌐 Web"


def _tavily_search_sync(courses: list[str]) -> tuple[list[str], str]:
    if not courses:
        return [], ""

    course = courses[0]
    tavily = TavilyClient(api_key=settings.TAVILY_API_KEY)
    queries = [
        f"{course} UCI professor exam difficulty study tips reddit student experience",
        f"{course} UCI internship career relevance skills employers",
    ]

    raw_snippets: list[tuple[str, str]] = []  # (url, formatted_snippet)
    for query in queries:
        try:
            res = tavily.search(query=query, search_depth="basic", max_results=3)
            for r in res.get("results", []):
                url = r.get("url", "")
                tag = _source_tag(url)
                snippet = f"[{tag} | {r['title']}]: {r['content'][:200]}"
                raw_snippets.append((url, snippet))
        except Exception:
            pass  # Tavily failure does not affect the main flow

    if not raw_snippets:
        return [], ""

    seen: set[str] = set()
    sources_used: list[str] = []
    deduped_snippets: list[str] = []
    for url, snippet in raw_snippets:
        key = snippet[:60]
        if key not in seen:
            seen.add(key)
            sources_used.append(url)
            deduped_snippets.append(snippet)

    return sources_used, "\n".join(deduped_snippets)


async def tavily_search(courses: list[str]) -> tuple[list[str], str]:
    try:
        return await asyncio.to_thread(_tavily_search_sync, courses)
    except Exception as exc:
        logger.warning("tavily_search failed: %s", exc)
        return [], ""
