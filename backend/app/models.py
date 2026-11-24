"""SQLAlchemy mappings for the tables defined in supabase/migrations/001_init.sql.
The SQL migration is the source of truth for the schema; these classes only map it."""
import uuid

from sqlalchemy import (BigInteger, Column, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, func)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


def _uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    email = Column(Text, nullable=False)
    full_name = Column(Text)
    role = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Event(Base):
    __tablename__ = "events"

    id = _uuid_pk()
    name = Column(Text, nullable=False)
    description = Column(Text)
    event_type = Column(Text, nullable=False)
    venue = Column(Text)
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    capacity = Column(Integer, nullable=False)
    ticket_price = Column(Numeric(12, 2), nullable=False, default=0)
    budget = Column(Numeric(14, 2), nullable=False, default=0)
    marketing_budget = Column(Numeric(14, 2), nullable=False, default=0)
    status = Column(Text, nullable=False, default="draft")
    organizer_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now())


class EventStaff(Base):
    __tablename__ = "event_staff"

    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), primary_key=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Attendee(Base):
    __tablename__ = "attendees"

    id = _uuid_pk()
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    name = Column(Text, nullable=False)
    email = Column(Text, nullable=False)
    phone = Column(Text)
    ticket_type = Column(Text, nullable=False, default="general")
    ticket_price = Column(Numeric(12, 2), nullable=False, default=0)
    payment_status = Column(Text, nullable=False, default="pending")
    attendance_status = Column(Text, nullable=False, default="registered")
    registered_at = Column(DateTime(timezone=True), server_default=func.now())


class Revenue(Base):
    __tablename__ = "revenue"

    id = _uuid_pk()
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    source = Column(Text, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Expense(Base):
    __tablename__ = "expenses"

    id = _uuid_pk()
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False)
    category = Column(Text, nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Prediction(Base):
    __tablename__ = "predictions"

    id = _uuid_pk()
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"))
    prediction_type = Column(Text, nullable=False)
    predicted_value = Column(Numeric(16, 4), nullable=False)
    model_version = Column(Text, nullable=False)
    input_snapshot = Column(JSONB, nullable=False)
    output = Column(JSONB)
    created_by = Column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(BigInteger, primary_key=True)
    user_id = Column(UUID(as_uuid=True))
    action = Column(String, nullable=False)
    table_name = Column(String, nullable=False)
    record_id = Column(String)
    details = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
