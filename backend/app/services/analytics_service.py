"""Dashboard aggregations. All queries run on the caller's RLS-scoped session,
so admins see everything, organizers their own events, staff assigned ones."""
from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.ml.preprocessing import SUCCESS_MIN_ATTENDANCE_RATE
from app.services.metrics import EVENT_METRICS_CTE


def _rows(db: Session, sql: str, **params) -> list[dict]:
    return [dict(r._mapping) for r in db.execute(text(sql), params)]


def event_metrics(db: Session) -> list[dict]:
    return _rows(db, f"with {EVENT_METRICS_CTE} select * from event_metrics")


def dashboard(db: Session, include_financials: bool) -> dict:
    kpis = _rows(db, f"""
        with {EVENT_METRICS_CTE}
        select
          count(*)                                                        as total_events,
          count(*) filter (where start_date > now()
                           and status not in ('completed', 'cancelled'))  as upcoming_events,
          count(*) filter (where status = 'completed')                    as completed_events,
          count(*) filter (where status = 'cancelled')                    as cancelled_events,
          coalesce(sum(registrations), 0)                                 as total_registrations,
          coalesce(sum(attended) filter (where status = 'completed'), 0)  as total_attended,
          (sum(attended) filter (where status = 'completed'))::float
            / nullif(sum(registrations) filter (where status = 'completed'), 0) as attendance_rate,
          coalesce(sum(total_revenue), 0)                                 as total_revenue,
          coalesce(sum(total_expenses), 0)                                as total_expenses,
          avg(total_revenue) filter (where status = 'completed')          as avg_revenue_per_event,
          avg(attended) filter (where status = 'completed')               as avg_attendance,
          avg(case when attended::float / nullif(registrations, 0) >= :min_rate
                    and total_revenue > total_expenses then 1.0 else 0.0 end)
            filter (where status = 'completed' and registrations > 0)     as success_rate
        from event_metrics
    """, min_rate=SUCCESS_MIN_ATTENDANCE_RATE)[0]

    monthly = _rows(db, f"""
        with {EVENT_METRICS_CTE}
        select to_char(date_trunc('month', start_date), 'YYYY-MM') as month,
               count(*)            as events,
               sum(registrations)  as registrations,
               sum(attended)       as attended,
               sum(total_revenue)  as revenue,
               sum(total_expenses) as expenses
        from event_metrics
        where status = 'completed' and start_date >= now() - interval '24 months'
        group by 1 order by 1
    """)

    by_type = _rows(db, f"""
        with {EVENT_METRICS_CTE}
        select event_type,
               count(*) as events,
               avg(attended::float / nullif(registrations, 0)) as attendance_rate,
               avg(registrations::float / capacity)             as fill_rate,
               avg(total_revenue)                               as avg_revenue,
               avg(total_revenue - total_expenses)              as avg_profit
        from event_metrics
        where status = 'completed'
        group by event_type order by events desc
    """)

    by_status = _rows(db, "select status, count(*) as events from events group by status order by 2 desc")

    upcoming = _rows(db, f"""
        with {EVENT_METRICS_CTE}
        select id, name, event_type, venue, status, start_date, capacity, registrations
        from event_metrics
        where start_date > now() and status not in ('completed', 'cancelled')
        order by start_date limit 6
    """)

    if not include_financials:
        for key in ("total_revenue", "total_expenses", "avg_revenue_per_event", "success_rate"):
            kpis[key] = None
        for row in monthly:
            row["revenue"] = row["expenses"] = None
        for row in by_type:
            row["avg_revenue"] = row["avg_profit"] = None

    return {"kpis": kpis, "monthly": monthly, "by_type": by_type,
            "by_status": by_status, "upcoming": upcoming,
            "financials_visible": include_financials}


def forecast_vs_actual(db: Session) -> list[dict]:
    """Latest pre-event attendance/revenue prediction for each completed event vs. actuals."""
    return _rows(db, f"""
        with {EVENT_METRICS_CTE},
        latest as (
          select distinct on (p.event_id, p.prediction_type)
                 p.event_id, p.prediction_type, p.predicted_value::float as predicted, p.model_version
          from predictions p join events e on e.id = p.event_id
          where p.created_at <= e.start_date
          order by p.event_id, p.prediction_type, p.created_at desc
        )
        select m.id as event_id, m.name, m.event_type, m.start_date,
               att.predicted as predicted_attendance, m.attended as actual_attendance,
               rev.predicted as predicted_revenue,    m.total_revenue as actual_revenue,
               coalesce(att.model_version, rev.model_version) as model_version
        from event_metrics m
        left join latest att on att.event_id = m.id and att.prediction_type = 'attendance'
        left join latest rev on rev.event_id = m.id and rev.prediction_type = 'revenue'
        where m.status = 'completed' and (att.predicted is not null or rev.predicted is not null)
        order by m.start_date desc
        limit 100
    """)


def event_analytics(db: Session, event_id: UUID, include_financials: bool) -> dict:
    metrics = _rows(db, f"with {EVENT_METRICS_CTE} select * from event_metrics where id = :id",
                    id=event_id)
    if not metrics:
        return {}
    m = metrics[0]

    timeline = _rows(db, """
        select to_char(date_trunc('day', registered_at), 'YYYY-MM-DD') as day,
               count(*) as registrations,
               sum(count(*)) over (order by date_trunc('day', registered_at)) as cumulative
        from attendees where event_id = :id and attendance_status <> 'cancelled'
        group by date_trunc('day', registered_at) order by 1
    """, id=event_id)

    def breakdown(column: str) -> list[dict]:
        return _rows(db, f"select {column} as label, count(*) as count from attendees "
                         f"where event_id = :id group by 1 order by 2 desc", id=event_id)

    result = {
        "event_id": str(event_id),
        "registrations": m["registrations"],
        "attended": m["attended"],
        "capacity": m["capacity"],
        "fill_rate": m["registrations"] / m["capacity"] if m["capacity"] else None,
        "attendance_rate": (m["attended"] / m["registrations"]
                            if m["registrations"] and m["status"] == "completed" else None),
        "registration_timeline": timeline,
        "attendance_breakdown": breakdown("attendance_status"),
        "payment_breakdown": breakdown("payment_status"),
        "ticket_type_breakdown": breakdown("ticket_type"),
    }
    if include_financials:
        result.update(total_revenue=m["total_revenue"], ticket_revenue=m["ticket_revenue"],
                      other_revenue=m["other_revenue"], total_expenses=m["total_expenses"],
                      profit=m["total_revenue"] - m["total_expenses"], budget=m["budget"])
    return result
