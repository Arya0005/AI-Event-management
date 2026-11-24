"""Venue and resource recommendations derived from historical relationships
captured at training time (see train._venue_stats / _resource_stats)."""
from __future__ import annotations

import math

from app.ml.predict import ModelRegistry

CAPACITY_BUFFER = 1.10


def recommend_venue(registry: ModelRegistry, payload: dict) -> dict:
    attendance = registry.predict_attendance(payload)
    meta = registry.metadata
    predicted = attendance["predicted_attendance"]
    needed = max(1, math.ceil(predicted * CAPACITY_BUFFER))

    candidates = [v for v in meta.get("venue_stats", [])
                  if v["event_type"] == payload["event_type"] and v["capacity"] >= needed]
    # Best historical outcomes first, then the tightest fit (least empty space).
    candidates.sort(key=lambda v: (-v["success_rate"], -v["mean_attendance_rate"], v["capacity"]))

    return {
        "predicted_attendance": predicted,
        "recommended_capacity": needed,
        "current_capacity": payload["capacity"],
        "capacity_utilisation": round(predicted / payload["capacity"], 4),
        "assessment": (
            "Venue is oversized — consider a smaller venue to cut cost."
            if predicted < payload["capacity"] * 0.6 else
            "Venue may be too small for the expected turnout."
            if needed > payload["capacity"] else
            "Current capacity fits the forecast."
        ),
        "rationale": f"Predicted attendance × {CAPACITY_BUFFER:.2f} safety buffer; venues ranked by "
                     "historical success rate and attendance rate for this event type.",
        "venues": candidates[:5],
        "model_version": attendance["model_version"],
    }


def recommend_resources(registry: ModelRegistry, payload: dict) -> dict:
    attendance = registry.predict_attendance(payload)
    meta = registry.metadata
    predicted = attendance["predicted_attendance"]
    per_type = meta.get("resource_stats", {}).get(payload["event_type"], {})

    items = []
    for category, s in sorted(per_type.items()):
        items.append({
            "category": category,
            "median_spend_per_attendee": s["median_per_attendee"],
            "recommended_budget": round(s["median_per_attendee"] * predicted, 2),
            "based_on_events": s["events"],
        })

    return {
        "predicted_attendance": predicted,
        "items": items,
        "recommended_total_budget": round(sum(i["recommended_budget"] for i in items), 2),
        "rationale": "Median historical spend per attendee for each expense category of completed "
                     f"'{payload['event_type']}' events, scaled to the predicted attendance."
                     if items else "No historical expense data for this event type.",
        "model_version": attendance["model_version"],
    }
