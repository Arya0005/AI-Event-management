from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, require_manager
from app.database import get_db
from app.models import Attendee, Expense, Revenue
from app.routes.deps import ensure_can_manage, get_event_or_404
from app.schemas import (ExpenseCreate, ExpenseOut, FinancialSummary, RevenueCreate, RevenueOut)

router = APIRouter(tags=["Finance"])


def _managed_event(db: Session, user: CurrentUser, event_id: UUID):
    event = get_event_or_404(db, event_id)
    ensure_can_manage(user, event)
    return event


@router.get("/api/events/{event_id}/finance", response_model=FinancialSummary)
def financial_summary(event_id: UUID, user: CurrentUser = Depends(require_manager),
                      db: Session = Depends(get_db)):
    event = _managed_event(db, user, event_id)
    ticket = float(db.scalar(select(func.coalesce(func.sum(Attendee.ticket_price), 0))
                             .where(Attendee.event_id == event_id, Attendee.payment_status == "paid")))
    other = {src: float(amt) for src, amt in db.execute(
        select(Revenue.source, func.sum(Revenue.amount)).where(Revenue.event_id == event_id)
        .group_by(Revenue.source))}
    costs = {cat: float(amt) for cat, amt in db.execute(
        select(Expense.category, func.sum(Expense.amount)).where(Expense.event_id == event_id)
        .group_by(Expense.category))}

    total_revenue = ticket + sum(other.values())
    total_expenses = sum(costs.values())
    budget = float(event.budget)
    return FinancialSummary(
        event_id=event_id,
        ticket_revenue=round(ticket, 2),
        other_revenue_by_source=other,
        total_revenue=round(total_revenue, 2),
        expenses_by_category=costs,
        total_expenses=round(total_expenses, 2),
        budget=budget,
        budget_remaining=round(budget - total_expenses, 2),
        profit=round(total_revenue - total_expenses, 2),
    )


# --- Revenue ----------------------------------------------------------------

@router.get("/api/events/{event_id}/revenue", response_model=list[RevenueOut])
def list_revenue(event_id: UUID, user: CurrentUser = Depends(require_manager),
                 db: Session = Depends(get_db)):
    _managed_event(db, user, event_id)
    return db.scalars(select(Revenue).where(Revenue.event_id == event_id)
                      .order_by(Revenue.created_at.desc())).all()


@router.post("/api/events/{event_id}/revenue", response_model=RevenueOut,
             status_code=status.HTTP_201_CREATED)
def add_revenue(event_id: UUID, payload: RevenueCreate, user: CurrentUser = Depends(require_manager),
                db: Session = Depends(get_db)):
    _managed_event(db, user, event_id)
    row = Revenue(event_id=event_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/revenue/{revenue_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_revenue(revenue_id: UUID, user: CurrentUser = Depends(require_manager),
                   db: Session = Depends(get_db)):
    row = db.get(Revenue, revenue_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Revenue entry not found")
    _managed_event(db, user, row.event_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Expenses ---------------------------------------------------------------

@router.get("/api/events/{event_id}/expenses", response_model=list[ExpenseOut])
def list_expenses(event_id: UUID, user: CurrentUser = Depends(require_manager),
                  db: Session = Depends(get_db)):
    _managed_event(db, user, event_id)
    return db.scalars(select(Expense).where(Expense.event_id == event_id)
                      .order_by(Expense.created_at.desc())).all()


@router.post("/api/events/{event_id}/expenses", response_model=ExpenseOut,
             status_code=status.HTTP_201_CREATED)
def add_expense(event_id: UUID, payload: ExpenseCreate, user: CurrentUser = Depends(require_manager),
                db: Session = Depends(get_db)):
    _managed_event(db, user, event_id)
    row = Expense(event_id=event_id, **payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/api/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(expense_id: UUID, user: CurrentUser = Depends(require_manager),
                   db: Session = Depends(get_db)):
    row = db.get(Expense, expense_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    _managed_event(db, user, row.event_id)
    db.delete(row)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
