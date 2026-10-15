import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(UTC)


class Role(StrEnum):
    CITIZEN = "citizen"
    GRO = "gro"
    SUPERVISOR = "supervisor"
    FIELD_OFFICER = "field_officer"
    APPELLATE_OFFICER = "appellate_officer"
    ADMIN = "admin"


class Category(StrEnum):
    ROAD_DAMAGE = "road_damage"
    GARBAGE = "garbage"
    WATERLOGGING = "waterlogging"
    MANHOLE = "manhole"


CATEGORY_LABELS = {
    Category.ROAD_DAMAGE: "Potholes / visible road damage",
    Category.GARBAGE: "Garbage dumping / accumulation",
    Category.WATERLOGGING: "Road waterlogging",
    Category.MANHOLE: "Missing / broken manhole cover",
}


class ComplaintStatus(StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=Role.CITIZEN)
    jurisdiction_id: Mapped[str] = mapped_column(String(80))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        UniqueConstraint("citizen_id", "client_request_id", name="uq_complaint_retry"),
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_longitude"),
        Index("ix_complaint_queue", "jurisdiction_id", "status", "received_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tracking_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    client_request_id: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str] = mapped_column(String(64))
    jurisdiction_id: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location_text: Mapped[str] = mapped_column(String(240))
    location_source: Mapped[str] = mapped_column(String(20), default="manual")
    image_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=ComplaintStatus.SUBMITTED)
    version: Mapped[int] = mapped_column(Integer, default=1)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class StatusEvent(Base):
    __tablename__ = "status_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (UniqueConstraint("complaint_id", "sha256", name="uq_evidence_hash"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    object_key: Mapped[str] = mapped_column(String(200), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
