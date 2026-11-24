"""Dataset construction and feature engineering.

Leakage rule: every model input must be known *before* the event starts.
Attended counts, revenue and expenses are targets/labels only. The
"prior performance" features are computed only from events that ended before
the event in question started.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.metrics import EVENT_METRICS_CTE

CATEGORICAL_FEATURES = ["event_type"]
NUMERIC_FEATURES = [
    "capacity",
    "ticket_price",
    "registration_count",
    "fill_rate",
    "month",
    "day_of_week",
    "is_weekend",
    "duration_days",
    "marketing_budget",
    "budget",
    "prior_type_attendance_rate",
    "prior_type_event_count",
]
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES

# Explicit, measurable definition of a successful event (CLAUDE.md §12).
SUCCESS_MIN_ATTENDANCE_RATE = 0.75
SUCCESS_DEFINITION = (
    f"attendance rate ≥ {SUCCESS_MIN_ATTENDANCE_RATE:.0%} of registrations "
    "and total revenue > total expenses (profit > 0)"
)


def load_completed_events(db: Session) -> pd.DataFrame:
    sql = f"with {EVENT_METRICS_CTE} select * from event_metrics where status = 'completed'"
    df = pd.read_sql(text(sql), db.connection())
    for col in ("start_date", "end_date"):
        df[col] = pd.to_datetime(df[col], utc=True)
    return df


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Drop invalid rows and report data-quality findings."""
    report: dict = {"rows_in": int(len(df))}

    report["duplicate_ids"] = int(df["id"].duplicated().sum())
    df = df.drop_duplicates(subset="id")

    dup_cols = ["event_type", "capacity", "ticket_price", "start_date", "registrations", "attended"]
    report["duplicate_records"] = int(df.duplicated(subset=dup_cols).sum())
    df = df.drop_duplicates(subset=dup_cols)

    report["missing_values"] = {k: int(v) for k, v in df.isna().sum().items() if v}

    invalid = (df["registrations"] > df["capacity"]) | (df["attended"] > df["registrations"])
    report["invalid_rows_dropped"] = int(invalid.sum())
    df = df[~invalid]

    no_regs = df["registrations"] == 0
    report["zero_registration_rows_dropped"] = int(no_regs.sum())
    df = df[~no_regs]

    # Outlier analysis (reported, not removed — extreme events are real events).
    rev_per_seat = df["total_revenue"] / df["capacity"]
    q1, q3 = rev_per_seat.quantile([0.25, 0.75])
    iqr = q3 - q1
    report["revenue_outliers_iqr"] = int(((rev_per_seat < q1 - 1.5 * iqr) |
                                          (rev_per_seat > q3 + 1.5 * iqr)).sum())

    report["rows_out"] = int(len(df))
    return df.reset_index(drop=True), report


def add_targets(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["attendance_rate"] = df["attended"] / df["registrations"]
    df["profit"] = df["total_revenue"] - df["total_expenses"]
    df["is_success"] = ((df["attendance_rate"] >= SUCCESS_MIN_ATTENDANCE_RATE) &
                        (df["profit"] > 0)).astype(int)
    return df


def _calendar_features(start: pd.Series, end: pd.Series) -> pd.DataFrame:
    duration = ((end - start).dt.total_seconds() / 86400).apply(np.ceil).clip(lower=1)
    return pd.DataFrame({
        "month": start.dt.month,
        "day_of_week": start.dt.dayofweek,
        "is_weekend": (start.dt.dayofweek >= 5).astype(int),
        "duration_days": duration.astype(int),
    })


def add_prior_performance(df: pd.DataFrame) -> pd.DataFrame:
    """For each event, the mean attendance rate of same-type events that had
    already *ended* before it started (point-in-time, no look-ahead)."""
    df = df.sort_values("start_date").reset_index(drop=True)
    rates, counts = [], []
    for _, row in df.iterrows():
        past = df[(df["event_type"] == row["event_type"]) & (df["end_date"] < row["start_date"])]
        counts.append(len(past))
        rates.append(past["attendance_rate"].mean() if len(past) else np.nan)
    df["prior_type_attendance_rate"] = rates
    df["prior_type_event_count"] = counts
    return df


def build_training_frame(df: pd.DataFrame) -> pd.DataFrame:
    df = add_prior_performance(add_targets(df))
    cal = _calendar_features(df["start_date"], df["end_date"])
    df = pd.concat([df, cal], axis=1)
    df["registration_count"] = df["registrations"]
    df["fill_rate"] = df["registrations"] / df["capacity"]
    return df


def build_inference_frame(payload: dict, type_stats: dict) -> pd.DataFrame:
    """Feature row for a live prediction. `type_stats` comes from the trained
    model's metadata: historical attendance rate per event type."""
    stats = type_stats.get(payload["event_type"], {})
    row = {
        "event_type": payload["event_type"],
        "capacity": payload["capacity"],
        "ticket_price": payload["ticket_price"],
        "registration_count": payload["registration_count"],
        "fill_rate": payload["registration_count"] / payload["capacity"],
        "month": payload["month"],
        "day_of_week": payload["day_of_week"],
        "is_weekend": int(payload["day_of_week"] >= 5),
        "duration_days": payload.get("duration_days", 1),
        "marketing_budget": payload.get("marketing_budget", 0.0),
        "budget": payload.get("budget", 0.0),
        "prior_type_attendance_rate": stats.get("mean_attendance_rate", np.nan),
        "prior_type_event_count": stats.get("count", 0),
    }
    return pd.DataFrame([row], columns=FEATURES)


def make_preprocessor() -> ColumnTransformer:
    return ColumnTransformer([
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
        ("num", SimpleImputer(strategy="median"), NUMERIC_FEATURES),
    ])


def make_pipeline(estimator) -> Pipeline:
    return Pipeline([("prep", make_preprocessor()), ("model", estimator)])


def grouped_importances(pipeline: Pipeline) -> dict[str, float]:
    """Feature importances with one-hot columns folded back into their source feature."""
    names = pipeline.named_steps["prep"].get_feature_names_out()
    importances = pipeline.named_steps["model"].feature_importances_
    grouped: dict[str, float] = {}
    for name, imp in zip(names, importances):
        base = name.split("__", 1)[1]
        if name.startswith("cat__"):
            base = CATEGORICAL_FEATURES[0]
        grouped[base] = grouped.get(base, 0.0) + float(imp)
    return dict(sorted(grouped.items(), key=lambda kv: kv[1], reverse=True))
