import logging
from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"
_env = Environment(
    loader=FileSystemLoader(_TEMPLATES_DIR),
    autoescape=select_autoescape(["html"]),
)


async def send_welcome_email(to_email: str, display_name: str | None) -> None:
    resend.api_key = settings.RESEND_API_KEY
    html = _env.get_template("welcome_email.html").render(
        display_name=display_name or "there",
        app_url=settings.ALLOWED_ORIGINS[0] if settings.ALLOWED_ORIGINS else "#",
    )
    try:
        await resend.Emails.send_async(
            {
                "from": settings.EMAIL_FROM_ADDRESS,
                "to": to_email,
                "subject": "Welcome to AAF — Anteater Acing the Future",
                "html": html,
            }
        )
    except Exception as exc:
        logger.error("send_welcome_email failed for %s: %s", to_email, exc, exc_info=True)
