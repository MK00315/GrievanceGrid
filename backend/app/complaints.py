import hashlib
import json
import secrets
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.models import Complaint, ComplaintStatus, Evidence, Role, StatusEvent, now_utc
from app.schemas import ComplaintCreate, ComplaintDetail, ComplaintPage, StatusUpdate
from app.security import CurrentUser, Database, can_review, get_visible_complaint

router = APIRouter(prefix="/complaints", tags=["Complaints"])

TRANSITIONS = {
    "submitted": {"under_review"},
    "under_review": {"in_progress", "resolved", "rejected"},
    "in_progress": {"under_review", "resolved"},
    "resolved": {"under_review"},
    "rejected": {"under_review"},
}


def complaint_detail(db, complaint):
    from app.schemas import ComplaintOut

    return ComplaintDetail(
        **ComplaintOut.model_validate(complaint).model_dump(),
        events=list(
            db.scalars(
                select(StatusEvent)
                .where(StatusEvent.complaint_id == complaint.id)
                .order_by(StatusEvent.created_at, StatusEvent.id)
            )
        ),
        evidence=list(
            db.scalars(
                select(Evidence)
                .where(Evidence.complaint_id == complaint.id)
                .order_by(Evidence.uploaded_at, Evidence.id)
            )
        ),
    )


@router.post("", response_model=ComplaintDetail, status_code=201)
def submit(data: ComplaintCreate, user: CurrentUser, db: Database):
    if user.role != Role.CITIZEN:
        raise HTTPException(403, "Only citizen accounts can submit complaints")
    payload = data.model_dump(mode="json")
    request_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    request_id = str(data.client_request_id)

    def existing_retry():
        existing = db.scalar(
            select(Complaint).where(
                Complaint.citizen_id == user.id, Complaint.client_request_id == request_id
            )
        )
        if existing and existing.request_hash != request_hash:
            raise HTTPException(409, "Retry ID already used with different complaint details")
        return existing

    existing = existing_retry()
    if existing:
        return complaint_detail(db, existing)
    complaint = Complaint(
        **{k: v for k, v in payload.items() if k != "client_request_id"},
        client_request_id=request_id,
        request_hash=request_hash,
        citizen_id=user.id,
        jurisdiction_id=get_settings().jurisdiction_id,
        tracking_id=f"GG-{now_utc():%Y}-{secrets.token_hex(6).upper()}",
    )
    db.add(complaint)
    try:
        db.flush()
        db.add(
            StatusEvent(
                complaint_id=complaint.id,
                actor_id=user.id,
                status="submitted",
                note="Complaint received. Awaiting officer review.",
            )
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = existing_retry()
        if existing:
            return complaint_detail(db, existing)
        raise HTTPException(409, "Registration conflict; retry the same request") from None
    return complaint_detail(db, complaint)


@router.get("", response_model=ComplaintPage)
def list_complaints(
    user: CurrentUser,
    db: Database,
    status: ComplaintStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(Complaint)
    if user.role == Role.CITIZEN:
        query = query.where(Complaint.citizen_id == user.id)
    elif can_review(user):
        query = query.where(Complaint.jurisdiction_id == user.jurisdiction_id)
    else:
        raise HTTPException(403, "This role has no queue access in this milestone")
    if status is not None:
        query = query.where(Complaint.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = list(
        db.scalars(
            query.order_by(Complaint.received_at.desc(), Complaint.id).offset(offset).limit(limit)
        )
    )
    return ComplaintPage(items=items, total=total, offset=offset, limit=limit)


@router.get("/{tracking_id}", response_model=ComplaintDetail)
def get_complaint(tracking_id: str, user: CurrentUser, db: Database):
    return complaint_detail(db, get_visible_complaint(db, tracking_id, user))


@router.post("/{tracking_id}/status", response_model=ComplaintDetail)
def set_status(tracking_id: str, data: StatusUpdate, user: CurrentUser, db: Database):
    if not can_review(user):
        raise HTTPException(403, "Only the jurisdiction's GRO can change complaint status")
    complaint = get_visible_complaint(db, tracking_id, user)
    if complaint.version != data.expected_version:
        raise HTTPException(409, "Complaint changed. Refresh before updating")
    if data.status not in TRANSITIONS[complaint.status]:
        raise HTTPException(422, "Status transition is not allowed")
    result = db.execute(
        update(Complaint)
        .where(
            Complaint.id == complaint.id,
            Complaint.version == data.expected_version,
        )
        .values(status=data.status, version=data.expected_version + 1, updated_at=now_utc())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Complaint changed. Refresh before updating")
    db.add(
        StatusEvent(complaint_id=complaint.id, actor_id=user.id, status=data.status, note=data.note)
    )
    db.commit()
    db.refresh(complaint)
    return complaint_detail(db, complaint)
