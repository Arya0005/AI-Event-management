import json
from typing import Iterator

from fastapi import Depends
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.auth import CurrentUser, get_current_user
from app.config import get_settings

engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def _apply_rls_context(session: Session, user: CurrentUser) -> None:
    """Run every transaction of this session as the Supabase `authenticated`
    role with the caller's JWT claims, so PostgreSQL RLS policies apply to
    backend queries exactly as they would to a direct Supabase client."""
    claims = json.dumps(user.claims)

    @event.listens_for(session, "after_begin")
    def _set_claims(_session, _transaction, connection):
        connection.execute(text("set local role authenticated"))
        connection.execute(
            text("select set_config('request.jwt.claims', :claims, true), "
                 "set_config('request.jwt.claim.sub', :sub, true)"),
            {"claims": claims, "sub": user.id},
        )


def get_db(user: CurrentUser = Depends(get_current_user)) -> Iterator[Session]:
    """Request-scoped session bound to the authenticated user (RLS enforced)."""
    db = SessionLocal()
    _apply_rls_context(db, user)
    try:
        yield db
    finally:
        db.close()


def get_service_db() -> Iterator[Session]:
    """Privileged session that bypasses RLS. Only for offline jobs (training,
    seeding) — never hand this to a user-facing request handler."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
