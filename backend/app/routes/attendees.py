from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user
from app.database import get_db
from app.models import Attendee
from app.routes.deps import ensure_can_manage, get_event_or_404
from app.schemas import AttendeeCreate, AttendeeList, AttendeeOut, AttendeeUpdate

router = APIRouter(tags=["Attendees"])

REGISTRATION_STATUSES = {"published", "registration_open"}
LATE_REGISTRATION_STATUSES = {"registration_closed"}  # organizers/admins only


def _active_registrations(db: Session, event_id: UUID) -> int:
    return db.scalar(select(func.count()).where(Attendee.event_id == event_id,
                                                Attendee.attendance_status != "cancelled")) or 0


def _get_attendee_or_404(db: Session, attendee_id: UUID) -> Attendee:
    attendee = db.get(Attendee, attendee_id)
    if attendee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendee not found")
    return attendee


@router.get("/api/events/{event_id}/attendees", response_model=AttendeeList)
def list_attendees(
    event_id: UUID,
    search: Optional[str] = Query(default=None, max_length=100),
    attendance_status: Optional[str] = None,
    payment_status: Optional[str] = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    get_event_or_404(db, event_id)
    query = select(Attendee).where(Attendee.event_id == event_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(or_(Attendee.name.ilike(like), Attendee.email.ilike(like),
                                Attendee.phone.ilike(like)))
    if attendance_status:
        query = query.where(Attendee.attendance_status == attendance_status)
    if payment_status:
        query = query.where(Attendee.payment_status == payment_status)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(Attendee.registered_at.desc(), Attendee.id)
                       .offset((page - 1) * page_size).limit(page_size)).all()
    return AttendeeList(items=items, total=total, page=page, page_size=page_size)


@router.post("/api/events/{event_id}/attendees", response_model=AttendeeOut,
             status_code=status.HTTP_201_CREATED)
def register_attendee(event_id: UUID, payload: AttendeeCreate,
                      user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    allowed = REGISTRATION_STATUSES | (LATE_REGISTRATION_STATUSES if user.can_manage else set())
    if event.status not in allowed:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            f"Registrations are not accepted while the event is {event.status}")

    # Serialise registrations per event so concurrent requests can't overbook.
    db.execute(text("select pg_advisory_xact_lock(hashtext(:id))"), {"id": str(event_id)})
    if _active_registrations(db, event_id) >= event.capacity:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is at full capacity")

    data = payload.model_dump()
    data["email"] = data["email"].lower()
    if data["ticket_price"] is None:
        data["ticket_price"] = float(event.ticket_price)
    attendee = Attendee(event_id=event_id, **data)
    db.add(attendee)
    db.commit()
    db.refresh(attendee)
    return attendee


@router.get("/api/attendees/{attendee_id}", response_model=AttendeeOut)
def get_attendee(attendee_id: UUID, db: Session = Depends(get_db)):
    return _get_attendee_or_404(db, attendee_id)


@router.put("/api/attendees/{attendee_id}", response_model=AttendeeOut)
def update_attendee(attendee_id: UUID, payload: AttendeeUpdate,
                    user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    attendee = _get_attendee_or_404(db, attendee_id)
    event = get_event_or_404(db, attendee.event_id)
    changes = payload.model_dump(exclude_unset=True)

    # Staff may check people in; pricing and payment are for event managers.
    if not user.can_manage and {"ticket_price", "payment_status"} & changes.keys():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only organizers can change pricing or payment")
    if event.status == "completed" and not user.can_manage:
        raise HTTPException(status.HTTP_409_CONFLICT, "Event is completed")
    if changes.get("attendance_status") == "registered" and attendee.attendance_status == "cancelled":
        db.execute(text("select pg_advisory_xact_lock(hashtext(:id))"), {"id": str(event.id)})
        if _active_registrations(db, event.id) >= event.capacity:
            raise HTTPException(status.HTTP_409_CONFLICT, "Event is at full capacity")

    if "email" in changes and changes["email"]:
        changes["email"] = changes["email"].lower()
    for key, value in changes.items():
        setattr(attendee, key, value)
    db.commit()
    db.refresh(attendee)
    return attendee


@router.delete("/api/attendees/{attendee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendee(attendee_id: UUID, user: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    attendee = _get_attendee_or_404(db, attendee_id)
    ensure_can_manage(user, get_event_or_404(db, attendee.event_id))
    db.delete(attendee)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
