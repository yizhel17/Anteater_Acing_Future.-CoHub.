"""One-time migration: seed AAF_responses.csv rows into Supabase's contributions table.

Run once from backend/: python -m scripts.migrate_csv_to_supabase
"""
import asyncio
import csv
import uuid
from pathlib import Path

from app.db.session import AsyncSessionLocal
from app.models.contribution import Contribution
from app.models.user import User  # noqa: F401 - registers users table for Contribution's FK

_CSV_PATH = Path(__file__).parent.parent / "data" / "AAF_responses.csv"

# Fixed namespace so re-running this script derives the same ids for the same
# CSV rows every time — makes the migration idempotent regardless of whatever
# unrelated rows (e.g. real form submissions) already exist in the table.
_ID_NAMESPACE = uuid.UUID("a4f1b3a0-5c2e-4b8a-9e1d-2f6c8d7a0b3e")

_COURSE_COL = "Which course are you dropping knowledge on today?"
_DANGER_COL = (
    "The Danger Zone \U0001f4a3: What is the specific week, project, or concept "
    "where most people fail or drop this class? What methods or strategies did "
    "you use to ace it?"
)
_SETUP_COL = (
    "The Actionable Setup \U0001f6e0️: Give us 1-2 concrete, step-by-step "
    "actions you wish you had known before Day 1."
)
_CAREER_COL = (
    "Beyond the Grade \U0001f680: How can students use this class to make "
    "real-world impacts outside the classroom?"
)

# Row 0 (Lillian) left "Which course" blank on the Google Form; she embedded
# the course code in her Danger Zone text instead ("PSCI11C:...").
_COURSE_OVERRIDES = {0: "PSCI11C"}


def _load_rows() -> list[dict]:
    with open(_CSV_PATH, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    contributions = []
    for i, row in enumerate(rows):
        course = _COURSE_OVERRIDES.get(i) or row[_COURSE_COL].strip()
        if not course:
            continue
        contributions.append(
            {
                "id": uuid.uuid5(_ID_NAMESPACE, f"csv-row-{i}"),
                "course": course,
                "danger_zone": row[_DANGER_COL].strip() or None,
                "setup_tips": row[_SETUP_COL].strip() or None,
                "career_value": row[_CAREER_COL].strip() or None,
            }
        )
    return contributions


async def main() -> None:
    async with AsyncSessionLocal() as session:
        rows = _load_rows()
        inserted = 0
        for row in rows:
            if await session.get(Contribution, row["id"]) is not None:
                continue
            session.add(Contribution(is_approved=True, **row))
            inserted += 1
        await session.commit()
        skipped = len(rows) - inserted
        print(f"迁移完成，插入 {inserted} 条 contributions（is_approved=True），跳过 {skipped} 条已存在的记录。")


if __name__ == "__main__":
    asyncio.run(main())
