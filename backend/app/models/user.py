import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("role IN ('student', 'senior', 'admin')", name="users_role_check"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True)
    hashed_pw: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str | None] = mapped_column(String(10))
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
