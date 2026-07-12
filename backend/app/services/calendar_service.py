import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def parse_markdown_tasks(markdown: str) -> list[dict]:
    """Extracts {name, time_hint, details} from markdown pipe-tables, mirroring the old frontend DOM scraper."""
    tasks: list[dict] = []
    rows: list[list[str]] = []

    def flush() -> None:
        for cells in rows[2:]:  # skip header row + |---|---| separator row
            if not cells:
                continue
            tasks.append(
                {
                    "name": cells[0] or "Study Task",
                    "time_hint": cells[1] if len(cells) > 2 else "",
                    "details": cells[-1],
                }
            )

    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("|") and stripped.endswith("|") and len(stripped) > 1:
            rows.append([cell.strip() for cell in stripped.strip("|").split("|")])
        else:
            flush()
            rows = []
    flush()
    return tasks


def _fold(line: str) -> str:
    """RFC 5545 line-folding: each transmitted line (incl. the 1-octet continuation marker) stays <=75 octets."""
    if len(line.encode("utf-8")) <= 75:
        return line

    chunks: list[str] = []
    current = ""
    current_len = 0
    limit = 75
    for ch in line:
        ch_len = len(ch.encode("utf-8"))
        if current_len + ch_len > limit:
            chunks.append(current)
            current, current_len, limit = ch, ch_len, 74  # continuations reserve 1 octet for the fold marker
        else:
            current += ch
            current_len += ch_len
    chunks.append(current)
    return "\r\n ".join(chunks)


def _escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return text.replace("\r\n", "\\n").replace("\n", "\\n")


def _format_dt(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_ics_feed(guide_id: UUID, tasks: list[dict], calendar_name: str = "AAF Study Plan") -> str:
    now = datetime.now(timezone.utc)
    base = (now + timedelta(days=1)).replace(hour=9, minute=0, second=0, microsecond=0)

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "PRODID:-//AAF//Anteater Acing the Future//EN",
        _fold(f"X-WR-CALNAME:{_escape(calendar_name)}"),
    ]

    for i, task in enumerate(tasks):
        start = base + timedelta(hours=2 * i)
        end = start + timedelta(minutes=45)
        desc = (f"Time: {task['time_hint']}\\n\\n" if task["time_hint"] else "") + task["details"][:500]

        lines.append("BEGIN:VEVENT")
        # Stable across refetches: a Date.now()-based UID (like the old frontend export used)
        # would make every poll of this subscribed feed look like all-new events.
        lines.append(_fold(f"UID:aaf-{guide_id}-{i}@aaf.uci"))
        lines.append(f"DTSTAMP:{_format_dt(now)}")
        lines.append(f"DTSTART:{_format_dt(start)}")
        lines.append(f"DTEND:{_format_dt(end)}")
        lines.append(_fold(f"SUMMARY:{_escape('AAF: ' + task['name'][:80])}"))
        lines.append(_fold(f"DESCRIPTION:{_escape(desc)}"))
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines)


async def get_or_create_calendar_token(user: User, db: AsyncSession) -> str:
    if user.calendar_token:
        return user.calendar_token
    user.calendar_token = secrets.token_urlsafe(32)
    await db.flush()
    return user.calendar_token
