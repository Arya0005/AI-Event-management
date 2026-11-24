"""Per-event outcome metrics derived from transactional data.

Shared by analytics (run under RLS, so it only sees the caller's events) and by
ML training (run with the service session over all completed events)."""

# Ticket revenue comes from paid attendees; the revenue table holds the rest.
EVENT_METRICS_CTE = """
event_metrics as (
  select
    e.id, e.name, e.event_type, e.venue, e.status, e.organizer_id,
    e.start_date, e.end_date, e.capacity,
    e.ticket_price::float      as ticket_price,
    e.budget::float            as budget,
    e.marketing_budget::float  as marketing_budget,
    coalesce(a.registrations, 0)   as registrations,
    coalesce(a.attended, 0)        as attended,
    coalesce(a.ticket_revenue, 0)::float as ticket_revenue,
    coalesce(r.other_revenue, 0)::float  as other_revenue,
    (coalesce(a.ticket_revenue, 0) + coalesce(r.other_revenue, 0))::float as total_revenue,
    coalesce(x.total_expenses, 0)::float as total_expenses
  from events e
  left join (
    select event_id,
           count(*) filter (where attendance_status <> 'cancelled') as registrations,
           count(*) filter (where attendance_status = 'attended')   as attended,
           sum(ticket_price) filter (where payment_status = 'paid') as ticket_revenue
    from attendees group by event_id
  ) a on a.event_id = e.id
  left join (select event_id, sum(amount) as other_revenue from revenue group by event_id) r
         on r.event_id = e.id
  left join (select event_id, sum(amount) as total_expenses from expenses group by event_id) x
         on x.event_id = e.id
)
"""

EXPENSE_BY_CATEGORY_SQL = """
select e.id as event_id, e.event_type, x.category, sum(x.amount)::float as amount
from expenses x join events e on e.id = x.event_id
where e.status = 'completed'
group by e.id, e.event_type, x.category
"""
