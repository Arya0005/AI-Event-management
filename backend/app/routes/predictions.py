import math
from typing import Callable, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_manager
from app.database import get_db
from app.ml.predict import ModelsNotTrained, registry
from app.models import Attendee, Prediction
from app.routes.deps import ensure_can_manage, get_event_or_404
from app.schemas import (AttendancePrediction, ForecastOut, PredictionInput, PredictionOut,
                         RevenuePrediction, SuccessPrediction)

router = APIRouter(prefix="/api/predictions", tags=["Predictions"])


def run_model(fn: Callable[[dict], dict], payload: dict) -> dict:
    try:
        return fn(payload)
    except ModelsNotTrained as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc


def _validate_event_link(db: Session, user: CurrentUser, data: PredictionInput) -> None:
    if data.event_id is not None:
        ensure_can_manage(user, get_event_or_404(db, data.event_id))


def _save(db: Session, user: CurrentUser, data: PredictionInput, kind: str, value: float, result: dict):
    db.add(Prediction(
        event_id=data.event_id,
        prediction_type=kind,
        predicted_value=value,
        model_version=result["model_version"],
        input_snapshot=data.model_dump(mode="json"),
        output=result,
        created_by=UUID(user.id),
    ))


@router.post("/attendance", response_model=AttendancePrediction)
def predict_attendance(data: PredictionInput, user: CurrentUser = Depends(require_manager),
                       db: Session = Depends(get_db)):
    _validate_event_link(db, user, data)
    result = run_model(registry.predict_attendance, data.model_dump())
    _save(db, user, data, "attendance", result["predicted_attendance"], result)
    db.commit()
    return result


@router.post("/revenue", response_model=RevenuePrediction)
def predict_revenue(data: PredictionInput, user: CurrentUser = Depends(require_manager),
                    db: Session = Depends(get_db)):
    _validate_event_link(db, user, data)
    result = run_model(registry.predict_revenue, data.model_dump())
    _save(db, user, data, "revenue", result["predicted_revenue"], result)
    db.commit()
    return result


@router.post("/success", response_model=SuccessPrediction)
def predict_success(data: PredictionInput, user: CurrentUser = Depends(require_manager),
                    db: Session = Depends(get_db)):
    _validate_event_link(db, user, data)
    result = run_model(registry.predict_success, data.model_dump())
    _save(db, user, data, "success", result["success_probability"], result)
    db.commit()
    return result


@router.post("/forecast", response_model=ForecastOut)
def forecast(data: PredictionInput, user: CurrentUser = Depends(require_manager),
             db: Session = Depends(get_db)):
    """Attendance, revenue and success in one call (each is stored separately)."""
    _validate_event_link(db, user, data)
    payload = data.model_dump()
    attendance = run_model(registry.predict_attendance, payload)
    revenue = run_model(registry.predict_revenue, payload)
    success = run_model(registry.predict_success, payload)
    _save(db, user, data, "attendance", attendance["predicted_attendance"], attendance)
    _save(db, user, data, "revenue", revenue["predicted_revenue"], revenue)
    _save(db, user, data, "success", success["success_probability"], success)
    db.commit()
    return {"attendance": attendance, "revenue": revenue, "success": success}


@router.get("/events/{event_id}/inputs", response_model=PredictionInput)
def inputs_for_event(event_id: UUID, user: CurrentUser = Depends(require_manager),
                     db: Session = Depends(get_db)):
    """Model inputs derived from an existing event. registration_count is the
    current number of active registrations (override it with an expected
    final count for a more useful forecast while registration is open)."""
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    regs = db.scalar(select(func.count()).where(Attendee.event_id == event_id,
                                                Attendee.attendance_status != "cancelled")) or 0
    duration = max(1, math.ceil((event.end_date - event.start_date).total_seconds() / 86400))
    return PredictionInput(
        event_type=event.event_type,
        capacity=event.capacity,
        ticket_price=float(event.ticket_price),
        registration_count=min(regs, event.capacity),
        month=event.start_date.month,
        day_of_week=event.start_date.weekday(),
        duration_days=duration,
        marketing_budget=float(event.marketing_budget),
        budget=float(event.budget),
        event_id=event.id,
    )


@router.get("", response_model=list[PredictionOut])
def prediction_history(event_id: Optional[UUID] = None, prediction_type: Optional[str] = None,
                       limit: int = Query(default=50, ge=1, le=500),
                       _: CurrentUser = Depends(require_manager), db: Session = Depends(get_db)):
    query = select(Prediction)
    if event_id:
        query = query.where(Prediction.event_id == event_id)
    if prediction_type:
        query = query.where(Prediction.prediction_type == prediction_type)
    return db.scalars(query.order_by(Prediction.created_at.desc()).limit(limit)).all()
