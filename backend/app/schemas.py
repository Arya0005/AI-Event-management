from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

EventStatus = Literal["draft", "published", "registration_open", "registration_closed",
                      "completed", "cancelled"]
Role = Literal["admin", "organizer", "staff"]
PaymentStatus = Literal["pending", "paid", "refunded"]
AttendanceStatus = Literal["registered", "attended", "no_show", "cancelled"]
RevenueSource = Literal["sponsorship", "merchandise", "food_beverage", "other"]
ExpenseCategory = Literal["venue", "equipment", "staff", "marketing", "catering", "logistics", "other"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Users ------------------------------------------------------------------

class ProfileOut(ORMModel):
    id: UUID
    email: str
    full_name: Optional[str] = None
    role: Role
    created_at: Optional[datetime] = None


class MeOut(BaseModel):
    id: UUID
    email: Optional[str]
    role: Role
    full_name: Optional[str] = None


class RoleUpdate(BaseModel):
    role: Role


# --- Events -----------------------------------------------------------------

class EventBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    event_type: str = Field(min_length=1, max_length=50)
    venue: Optional[str] = Field(default=None, max_length=200)
    start_date: datetime
    end_date: datetime
    capacity: int = Field(gt=0, le=1_000_000)
    ticket_price: float = Field(ge=0)
    budget: float = Field(default=0, ge=0)
    marketing_budget: float = Field(default=0, ge=0)

    @field_validator("event_type")
    @classmethod
    def normalise_type(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def check_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class EventCreate(EventBase):
    status: EventStatus = "draft"
    organizer_id: Optional[UUID] = None  # admins may assign; organizers always own


class EventUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    event_type: Optional[str] = Field(default=None, min_length=1, max_length=50)
    venue: Optional[str] = Field(default=None, max_length=200)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    capacity: Optional[int] = Field(default=None, gt=0, le=1_000_000)
    ticket_price: Optional[float] = Field(default=None, ge=0)
    budget: Optional[float] = Field(default=None, ge=0)
    marketing_budget: Optional[float] = Field(default=None, ge=0)
    organizer_id: Optional[UUID] = None

    @field_validator("event_type")
    @classmethod
    def normalise_type(cls, v: Optional[str]) -> Optional[str]:
        return v.strip().lower() if v else v


class StatusUpdate(BaseModel):
    status: EventStatus


class EventOut(ORMModel):
    id: UUID
    name: str
    description: Optional[str]
    event_type: str
    venue: Optional[str]
    start_date: datetime
    end_date: datetime
    capacity: int
    ticket_price: float
    budget: float
    marketing_budget: float
    status: EventStatus
    organizer_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    registration_count: int = 0
    attended_count: int = 0


class EventList(BaseModel):
    items: list[EventOut]
    total: int
    page: int
    page_size: int


class StaffAssign(BaseModel):
    user_id: UUID


# --- Attendees --------------------------------------------------------------

class AttendeeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: Optional[str] = Field(default=None, max_length=30)
    ticket_type: str = Field(default="general", max_length=50)
    ticket_price: Optional[float] = Field(default=None, ge=0)  # defaults to event price
    payment_status: PaymentStatus = "pending"


class AttendeeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=30)
    ticket_type: Optional[str] = Field(default=None, max_length=50)
    ticket_price: Optional[float] = Field(default=None, ge=0)
    payment_status: Optional[PaymentStatus] = None
    attendance_status: Optional[AttendanceStatus] = None


class AttendeeOut(ORMModel):
    id: UUID
    event_id: UUID
    name: str
    email: str
    phone: Optional[str]
    ticket_type: str
    ticket_price: float
    payment_status: PaymentStatus
    attendance_status: AttendanceStatus
    registered_at: datetime


class AttendeeList(BaseModel):
    items: list[AttendeeOut]
    total: int
    page: int
    page_size: int


# --- Finance ----------------------------------------------------------------

class RevenueCreate(BaseModel):
    source: RevenueSource
    amount: float = Field(ge=0)
    description: Optional[str] = Field(default=None, max_length=500)


class RevenueOut(ORMModel):
    id: UUID
    event_id: UUID
    source: str
    amount: float
    description: Optional[str]
    created_at: datetime


class ExpenseCreate(BaseModel):
    category: ExpenseCategory
    amount: float = Field(ge=0)
    description: Optional[str] = Field(default=None, max_length=500)


class ExpenseOut(ORMModel):
    id: UUID
    event_id: UUID
    category: str
    amount: float
    description: Optional[str]
    created_at: datetime


class FinancialSummary(BaseModel):
    event_id: UUID
    ticket_revenue: float
    other_revenue_by_source: dict[str, float]
    total_revenue: float
    expenses_by_category: dict[str, float]
    total_expenses: float
    budget: float
    budget_remaining: float
    profit: float


# --- Predictions ------------------------------------------------------------

class PredictionInput(BaseModel):
    event_type: str = Field(min_length=1, max_length=50)
    capacity: int = Field(gt=0, le=1_000_000)
    ticket_price: float = Field(ge=0)
    registration_count: int = Field(ge=0)
    month: int = Field(ge=1, le=12)
    day_of_week: int = Field(ge=0, le=6, description="0 = Monday … 6 = Sunday")
    duration_days: int = Field(default=1, ge=1, le=60)
    marketing_budget: float = Field(default=0, ge=0)
    budget: float = Field(default=0, ge=0)
    event_id: Optional[UUID] = Field(default=None, description="Link the prediction to an event")

    @field_validator("event_type")
    @classmethod
    def normalise_type(cls, v: str) -> str:
        return v.strip().lower()

    @model_validator(mode="after")
    def check_registrations(self):
        if self.registration_count > self.capacity:
            raise ValueError("registration_count cannot exceed capacity")
        return self


class AttendancePrediction(BaseModel):
    predicted_attendance: int
    attendance_rate: float
    registration_count: int
    model_version: str
    features: dict[str, Any]


class RevenuePrediction(BaseModel):
    predicted_revenue: float
    model_version: str
    features: dict[str, Any]


class SuccessPrediction(BaseModel):
    success_probability: float
    is_likely_successful: bool
    success_definition: str
    model_version: str
    features: dict[str, Any]


class ForecastOut(BaseModel):
    attendance: AttendancePrediction
    revenue: RevenuePrediction
    success: SuccessPrediction


class PredictionOut(ORMModel):
    id: UUID
    event_id: Optional[UUID]
    prediction_type: str
    predicted_value: float
    model_version: str
    input_snapshot: dict[str, Any]
    output: Optional[dict[str, Any]]
    created_at: datetime
