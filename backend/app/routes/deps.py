from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.auth import CurrentUser
from app.models import Event


def get_event_or_404(db: Session, event_id: UUID) -> Event:
    """RLS-scoped lookup: events the caller cannot see are indistinguishable from missing ones."""
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return event


def ensure_can_manage(user: CurrentUser, event: Event) -> None:
    if user.is_admin:
        return
    if user.role == "organizer" and str(event.organizer_id) == user.id:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "You cannot modify this event")
