from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.services import ai_service


def test_build_user_context_assembles_all_fields():
    context = ai_service.build_user_context(
        role="student",
        courses=["ICS 32", "MATH 2B"],
        confidence=6.5,
        goals=["ace_grade", "internship"],
        user_query="I'm scared of pointers",
        senior_tips_str="=== SENIOR TIPS DATABASE ===\n[ICS 32 VERIFIED FEEDBACK]:\n...",
        search_results="some web snippet",
    )
    assert "Role: student" in context
    assert "Courses selected: ICS 32, MATH 2B" in context
    assert "Confidence level: 6.5/10" in context
    assert "Goals: ace_grade, internship" in context
    assert "Student's own words: I'm scared of pointers" in context
    assert "SENIOR TIPS DATABASE" in context
    assert "=== WEB CONTEXT ===\nsome web snippet\n=== END ===" in context


def test_build_user_context_defaults_for_empty_optional_fields():
    context = ai_service.build_user_context(
        role="senior",
        courses=[],
        confidence=0,
        goals=[],
        user_query=None,
        senior_tips_str="",
        search_results="",
    )
    assert "Courses selected: none" in context
    assert "Goals: not specified" in context
    assert "Student's own words: (none provided)" in context
    assert "SENIOR TIPS DATABASE" not in context
    assert "WEB CONTEXT" not in context


@pytest.mark.asyncio
async def test_generate_guide_strips_thinking_block_and_counts_tokens():
    fake_message = SimpleNamespace(
        content=[
            SimpleNamespace(
                text="<thinking>internal reasoning here</thinking>\n\n# Actual Guide\nDo X."
            )
        ],
        usage=SimpleNamespace(input_tokens=120, output_tokens=380),
    )
    with patch.object(
        ai_service._client.messages, "create", AsyncMock(return_value=fake_message)
    ) as mock_create:
        guide_markdown, tokens_used = await ai_service.generate_guide("some user context")

    mock_create.assert_awaited_once()
    assert "<thinking>" not in guide_markdown
    assert guide_markdown == "# Actual Guide\nDo X."
    assert tokens_used == 500
