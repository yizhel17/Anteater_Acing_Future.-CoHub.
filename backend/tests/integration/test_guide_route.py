import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.deps import get_db, get_optional_user
from app.core.rate_limit import guide_generate_limiter
from app.main import app
from app.models.user import User


class FakeAsyncSession:
    """Minimal stand-in for AsyncSession — generate_guide_endpoint only calls add()/flush()."""

    def __init__(self):
        self.added: list = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        for obj in self.added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid.uuid4()
            if getattr(obj, "created_at", None) is None:
                obj.created_at = datetime.now(timezone.utc)


@contextmanager
def _override_deps(session: FakeAsyncSession, user: User | None):
    async def _fake_get_db():
        yield session

    async def _fake_get_optional_user():
        return user

    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[get_optional_user] = _fake_get_optional_user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_optional_user, None)


def _client(fake_ip: str) -> AsyncClient:
    transport = ASGITransport(app=app, client=(fake_ip, 123))
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    guide_generate_limiter._hits.clear()
    yield
    guide_generate_limiter._hits.clear()


GENERATE_PAYLOAD = {
    "role": "student",
    "courses": ["ICS 32"],
    "confidence": 6.0,
    "goals": ["ace_grade"],
}


@pytest.mark.asyncio
async def test_anonymous_generate_creates_guide_with_null_user_id():
    session = FakeAsyncSession()
    with _override_deps(session, user=None), patch(
        "app.services.rag_service.retrieve_tips_async", AsyncMock(return_value=[])
    ), patch(
        "app.services.search_service.tavily_search", AsyncMock(return_value=([], ""))
    ), patch(
        "app.services.ai_service.generate_guide", AsyncMock(return_value=("# Guide", 42))
    ):
        async with app.router.lifespan_context(app):
            async with _client("10.0.0.1") as client:
                resp = await client.post("/api/v1/guide/generate", json=GENERATE_PAYLOAD)

    assert resp.status_code == 200
    body = resp.json()
    assert body["guide_markdown"] == "# Guide"
    assert body["tokens_used"] == 42
    assert len(session.added) == 1
    assert session.added[0].user_id is None


@pytest.mark.asyncio
async def test_logged_in_generate_assigns_current_user_id():
    session = FakeAsyncSession()
    current_user = User(
        id=uuid.uuid4(),
        email="senior@uci.edu",
        hashed_pw="unused-hash",
        role="student",
    )
    with _override_deps(session, user=current_user), patch(
        "app.services.rag_service.retrieve_tips_async", AsyncMock(return_value=[])
    ), patch(
        "app.services.search_service.tavily_search", AsyncMock(return_value=([], ""))
    ), patch(
        "app.services.ai_service.generate_guide", AsyncMock(return_value=("# Guide", 42))
    ):
        async with app.router.lifespan_context(app):
            async with _client("10.0.0.2") as client:
                resp = await client.post("/api/v1/guide/generate", json=GENERATE_PAYLOAD)

    assert resp.status_code == 200
    assert len(session.added) == 1
    assert session.added[0].user_id == current_user.id


@pytest.mark.asyncio
async def test_generate_degrades_gracefully_when_one_rag_task_fails():
    session = FakeAsyncSession()

    async def _retrieve_side_effect(query, course, n):
        if course == "ICS 32":
            raise RuntimeError("ChromaDB timeout")
        return ["Set up pylint before week 1"]

    payload = {
        "role": "student",
        "courses": ["ICS 32", "MATH 2B"],
        "confidence": 6.0,
        "goals": ["ace_grade"],
    }

    with _override_deps(session, user=None), patch(
        "app.services.rag_service.retrieve_tips_async", AsyncMock(side_effect=_retrieve_side_effect)
    ), patch(
        "app.services.search_service.tavily_search",
        AsyncMock(return_value=(["https://reddit.com/x"], "some web snippet")),
    ), patch(
        "app.services.ai_service.generate_guide", AsyncMock(return_value=("# Guide", 42))
    ):
        async with app.router.lifespan_context(app):
            async with _client("10.0.0.3") as client:
                resp = await client.post("/api/v1/guide/generate", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["tips_count"] == 1
    assert body["sources_used"] == ["https://reddit.com/x"]


@pytest.mark.asyncio
async def test_generate_rate_limited_after_five_requests_per_minute():
    with patch(
        "app.services.rag_service.retrieve_tips_async", AsyncMock(return_value=[])
    ), patch(
        "app.services.search_service.tavily_search", AsyncMock(return_value=([], ""))
    ), patch(
        "app.services.ai_service.generate_guide", AsyncMock(return_value=("# Guide", 42))
    ):
        async with app.router.lifespan_context(app):
            async with _client("10.0.0.4") as client:
                statuses = []
                for _ in range(6):
                    session = FakeAsyncSession()
                    with _override_deps(session, user=None):
                        resp = await client.post("/api/v1/guide/generate", json=GENERATE_PAYLOAD)
                    statuses.append(resp.status_code)

    assert statuses == [200, 200, 200, 200, 200, 429]
