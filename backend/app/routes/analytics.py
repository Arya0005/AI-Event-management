from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_manager
from app.database import get_db
from app.ml import anomaly
from app.ml.predict import registry
from app.routes.deps import get_event_or_404
from app.services import analytics_service

router = APIRouter(tags=["Analytics"])


@router.get("/api/analytics/dashboard")
def dashboard(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    return analytics_service.dashboard(db, include_financials=user.can_manage)


@router.get("/api/analytics/forecast-vs-actual")
def forecast_vs_actual(_: CurrentUser = Depends(require_manager), db: Session = Depends(get_db)):
    return analytics_service.forecast_vs_actual(db)


@router.get("/api/analytics/events/{event_id}")
def event_analytics(event_id: UUID, user: CurrentUser = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    can_see_money = user.is_admin or (user.role == "organizer" and str(event.organizer_id) == user.id)
    result = analytics_service.event_analytics(db, event_id, include_financials=can_see_money)
    if not result:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return result


@router.get("/api/anomalies")
def anomalies(event_id: UUID | None = None, _: CurrentUser = Depends(require_manager),
              db: Session = Depends(get_db)):
    events = analytics_service.event_metrics(db)
    if event_id:
        events = [e for e in events if e["id"] == event_id]
    meta = registry.metadata
    return {
        "baseline": "historical per-type statistics from model training" if meta
                    else "rules only (no trained model baseline yet)",
        "anomalies": anomaly.detect(events, meta["type_stats"] if meta else None),
    }
