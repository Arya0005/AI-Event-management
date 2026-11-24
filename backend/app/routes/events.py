from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_manager
from app.database import get_db
from app.models import Attendee, Event, EventStaff, Profile
from app.routes.deps import ensure_can_manage, get_event_or_404
from app.schemas import (EventCreate, EventList, EventOut, EventUpdate, ProfileOut, StaffAssign,
                         StatusUpdate)

router = APIRouter(prefix="/api/events", tags=["Events"])

# Allowed lifecycle transitions (CLAUDE.md §22).
TRANSITIONS: dict[str, set[str]] = {
    "draft": {"published", "cancelled"},
    "published": {"draft", "registration_open", "cancelled"},
    "registration_open": {"registration_closed", "cancelled"},
    "registration_closed": {"registration_open", "completed", "cancelled"},
    "completed": set(),
    "cancelled": {"draft"},
}

SORTABLE = {
    "start_date": Event.start_date,
    "name": Event.name,
    "capacity": Event.capacity,
    "ticket_price": Event.ticket_price,
    "created_at": Event.created_at,
    "status": Event.status,
}


def _counts_subquery():
    return (
        select(
            Attendee.event_id,
            func.count().filter(Attendee.attendance_status != "cancelled").label("registration_count"),
            func.count().filter(Attendee.attendance_status == "attended").label("attended_count"),
        )
        .group_by(Attendee.event_id)
        .subquery()
    )


def _to_out(event: Event, regs: int = 0, attended: int = 0) -> EventOut:
    out = EventOut.model_validate(event)
    out.registration_count = regs or 0
    out.attended_count = attended or 0
    return out


def load_event_out(db: Session, event_id: UUID) -> EventOut:
    counts = _counts_subquery()
    row = db.execute(
        select(Event, counts.c.registration_count, counts.c.attended_count)
        .outerjoin(counts, counts.c.event_id == Event.id)
        .where(Event.id == event_id)
    ).first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return _to_out(*row)


@router.get("", response_model=EventList)
def list_events(
    search: Optional[str] = Query(default=None, max_length=100),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    event_type: Optional[str] = None,
    start_from: Optional[datetime] = None,
    start_to: Optional[datetime] = None,
    sort: str = Query(default="-start_date"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    counts = _counts_subquery()
    query = select(Event, counts.c.registration_count, counts.c.attended_count).outerjoin(
        counts, counts.c.event_id == Event.id)

    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(Event.name.ilike(like), Event.venue.ilike(like),
                                Event.description.ilike(like)))
    if status_filter:
        query = query.where(Event.status.in_(status_filter.split(",")))
    if event_type:
        query = query.where(Event.event_type == event_type.strip().lower())
    if start_from:
        query = query.where(Event.start_date >= start_from)
    if start_to:
        query = query.where(Event.start_date <= start_to)

    total = db.scalar(select(func.count()).select_from(query.subquery()))

    sort_key = sort.lstrip("-")
    if sort_key not in SORTABLE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            f"sort must be one of {sorted(SORTABLE)} (prefix '-' for descending)")
    column = SORTABLE[sort_key]
    query = query.order_by(column.desc() if sort.startswith("-") else column.asc(), Event.id)
    rows = db.execute(query.offset((page - 1) * page_size).limit(page_size)).all()

    return EventList(items=[_to_out(*r) for r in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/types", response_model=list[str])
def list_event_types(db: Session = Depends(get_db)):
    from app.ml.predict import registry

    seen = set(db.scalars(select(Event.event_type).distinct()).all())
    meta = registry.metadata
    if meta:
        seen |= set(meta["type_stats"].keys())
    return sorted(seen)


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, user: CurrentUser = Depends(require_manager),
                 db: Session = Depends(get_db)):
    data = payload.model_dump()
    if not user.is_admin or data["organizer_id"] is None:
        data["organizer_id"] = UUID(user.id)
    if data["status"] not in ("draft", "published", "registration_open"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT,
                            "New events must start as draft, published or registration_open")
    event = Event(**data)
    db.add(event)
    db.commit()
    return load_event_out(db, event.id)


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: UUID, db: Session = Depends(get_db)):
    return load_event_out(db, event_id)


@router.put("/{event_id}", response_model=EventOut)
def update_event(event_id: UUID, payload: EventUpdate, user: CurrentUser = Depends(require_manager),
                 db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    if event.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot edit a {event.status} event")

    changes = payload.model_dump(exclude_unset=True)
    if "organizer_id" in changes and not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can reassign organizers")
    for key, value in changes.items():
        setattr(event, key, value)

    if event.end_date < event.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "end_date must be on or after start_date")
    regs = db.scalar(select(func.count()).where(Attendee.event_id == event_id,
                                                Attendee.attendance_status != "cancelled"))
    if event.capacity < (regs or 0):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Capacity cannot be below current registrations ({regs})")
    db.commit()
    return load_event_out(db, event_id)


@router.patch("/{event_id}/status", response_model=EventOut)
def change_status(event_id: UUID, payload: StatusUpdate, user: CurrentUser = Depends(require_manager),
                  db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    target = payload.status
    if target not in TRANSITIONS[event.status]:
        allowed = ", ".join(sorted(TRANSITIONS[event.status])) or "none"
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Cannot move from {event.status} to {target}. Allowed: {allowed}")

    if target == "completed":
        if event.start_date > datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_409_CONFLICT, "An event cannot be completed before it starts")
        # Record actual results: anyone still merely 'registered' did not show up.
        db.execute(update(Attendee)
                   .where(Attendee.event_id == event_id, Attendee.attendance_status == "registered")
                   .values(attendance_status="no_show"))

    event.status = target
    db.commit()
    return load_event_out(db, event_id)


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: UUID, user: CurrentUser = Depends(require_manager),
                 db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    db.delete(event)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Staff assignment ---------------------------------------------------------

@router.get("/{event_id}/staff", response_model=list[ProfileOut])
def list_staff(event_id: UUID, db: Session = Depends(get_db)):
    get_event_or_404(db, event_id)
    return db.scalars(
        select(Profile).join(EventStaff, EventStaff.user_id == Profile.id)
        .where(EventStaff.event_id == event_id).order_by(Profile.email)
    ).all()


@router.post("/{event_id}/staff", response_model=list[ProfileOut], status_code=status.HTTP_201_CREATED)
def assign_staff(event_id: UUID, payload: StaffAssign, user: CurrentUser = Depends(require_manager),
                 db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    if db.get(Profile, payload.user_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if db.get(EventStaff, (event_id, payload.user_id)) is None:
        db.add(EventStaff(event_id=event_id, user_id=payload.user_id))
        db.commit()
    return list_staff(event_id, db)


@router.delete("/{event_id}/staff/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def unassign_staff(event_id: UUID, user_id: UUID, user: CurrentUser = Depends(require_manager),
                   db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    link = db.get(EventStaff, (event_id, user_id))
    if link is not None:
        db.delete(link)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
