from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.auth import CurrentUser, get_current_user, require_admin, require_manager
from app.database import get_db
from app.models import AuditLog, Profile
from app.schemas import MeOut, ProfileOut, RoleUpdate

router = APIRouter(tags=["Users"])


@router.get("/api/auth/me", response_model=MeOut)
def me(user: CurrentUser = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.get(Profile, UUID(user.id))
    return MeOut(id=user.id, email=user.email, role=user.role,
                 full_name=profile.full_name if profile else None)


@router.get("/api/users", response_model=list[ProfileOut])
def list_users(role: str | None = None, _: CurrentUser = Depends(require_manager),
               db: Session = Depends(get_db)):
    query = select(Profile).order_by(Profile.email)
    if role:
        query = query.where(Profile.role == role)
    return db.scalars(query).all()


@router.patch("/api/users/{user_id}/role", response_model=ProfileOut)
def set_role(user_id: UUID, payload: RoleUpdate, admin: CurrentUser = Depends(require_admin),
             db: Session = Depends(get_db)):
    if str(user_id) == admin.id and payload.role != "admin":
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own admin role")
    # set_user_role re-checks admin rights inside the database and writes the audit log.
    db.execute(text("select public.set_user_role(:uid, :role)"), {"uid": user_id, "role": payload.role})
    db.commit()
    profile = db.get(Profile, user_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    db.refresh(profile)
    return profile


@router.get("/api/audit-logs")
def audit_logs(limit: int = Query(default=100, ge=1, le=500), _: CurrentUser = Depends(require_admin),
               db: Session = Depends(get_db)):
    rows = db.execute(
        select(AuditLog, Profile.email).outerjoin(Profile, Profile.id == AuditLog.user_id)
        .order_by(AuditLog.created_at.desc()).limit(limit)
    ).all()
    return [{"id": log.id, "user_email": email, "action": log.action, "table_name": log.table_name,
             "record_id": log.record_id, "created_at": log.created_at} for log, email in rows]
