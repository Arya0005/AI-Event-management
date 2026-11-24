"""Anomaly detection: compares each event's metrics against the historical
baseline for its event type (z-scores) plus explicit business rules."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

Z_THRESHOLD = 2.0
OVER_BUDGET_TOLERANCE = 1.10


def _z(value: float, mean: float | None, std: float | None) -> float | None:
    if mean is None or not std:
        return None
    return (value - mean) / std


def _anomaly(ev: dict, kind: str, severity: str, metric: str, value, expected, z, message: str) -> dict:
    return {
        "event_id": str(ev["id"]),
        "event_name": ev["name"],
        "event_type": ev["event_type"],
        "status": ev["status"],
        "type": kind,
        "severity": severity,
        "metric": metric,
        "value": round(float(value), 4) if value is not None else None,
        "expected": round(float(expected), 4) if expected is not None else None,
        "z_score": round(float(z), 2) if z is not None else None,
        "message": message,
    }


def detect(events: list[dict], type_stats: dict | None, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    type_stats = type_stats or {}
    found: list[dict] = []

    for ev in events:
        if ev["status"] in ("draft", "cancelled"):
            continue
        stats = type_stats.get(ev["event_type"], {})
        capacity = ev["capacity"] or 1
        regs, attended = ev["registrations"], ev["attended"]
        fill = regs / capacity

        # 1. Unexpectedly low registrations
        if ev["status"] in ("registration_closed", "completed"):
            z = _z(fill, stats.get("mean_fill_rate"), stats.get("std_fill_rate"))
            if (z is not None and z < -Z_THRESHOLD) or fill < 0.25:
                found.append(_anomaly(ev, "low_registrations", "high" if fill < 0.25 else "medium",
                                      "fill_rate", fill, stats.get("mean_fill_rate"), z,
                                      f"Only {regs} of {capacity} seats registered ({fill:.0%})."))
        elif ev["status"] in ("published", "registration_open"):
            start = ev["start_date"]
            mean_fill = stats.get("mean_fill_rate")
            if mean_fill and start - now < timedelta(days=7) and fill < 0.5 * mean_fill:
                found.append(_anomaly(ev, "low_registrations", "medium", "fill_rate", fill, mean_fill, None,
                                      f"Event starts within a week but is only {fill:.0%} full "
                                      f"(type average {mean_fill:.0%})."))

        if ev["status"] == "completed" and regs > 0:
            # 2. Attendance significantly below registrations
            rate = attended / regs
            z = _z(rate, stats.get("mean_attendance_rate"), stats.get("std_attendance_rate"))
            if (z is not None and z < -Z_THRESHOLD) or rate < 0.5:
                found.append(_anomaly(ev, "low_attendance", "high" if rate < 0.5 else "medium",
                                      "attendance_rate", rate, stats.get("mean_attendance_rate"), z,
                                      f"{attended} of {regs} registrants attended ({rate:.0%})."))

            # 4. Revenue significantly different from historical pattern
            rpa = ev["total_revenue"] / max(attended, 1)
            z = _z(rpa, stats.get("mean_revenue_per_attendee"), stats.get("std_revenue_per_attendee"))
            if z is not None and abs(z) > 2.5:
                direction = "above" if z > 0 else "below"
                found.append(_anomaly(ev, "revenue_deviation", "medium", "revenue_per_attendee", rpa,
                                      stats.get("mean_revenue_per_attendee"), z,
                                      f"Revenue per attendee is far {direction} the historical "
                                      f"{ev['event_type']} average."))

        # 3. Unusually high expenses
        budget = ev["budget"] or 0
        if budget > 0 and ev["total_expenses"] > 0:
            ratio = ev["total_expenses"] / budget
            z = _z(ratio, stats.get("mean_expense_budget_ratio"), stats.get("std_expense_budget_ratio"))
            if ratio > OVER_BUDGET_TOLERANCE or (z is not None and z > Z_THRESHOLD):
                found.append(_anomaly(ev, "high_expenses", "high" if ratio > 1.25 else "medium",
                                      "expense_budget_ratio", ratio, stats.get("mean_expense_budget_ratio"), z,
                                      f"Expenses are {ratio:.0%} of the budget."))

    severity_rank = {"high": 0, "medium": 1, "low": 2}
    return sorted(found, key=lambda a: (severity_rank[a["severity"]], a["event_name"]))
