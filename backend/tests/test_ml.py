from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

from app.ml import anomaly, preprocessing as prep


def _events(n=40, seed=0):
    rng = np.random.default_rng(seed)
    start = pd.Timestamp("2024-01-01", tz="UTC")
    rows = []
    for i in range(n):
        s = start + pd.Timedelta(days=7 * i)
        cap = int(rng.integers(50, 500))
        regs = int(cap * rng.uniform(0.3, 1.0))
        rows.append(dict(id=f"e{i}", event_type="conference" if i % 2 else "meetup", venue="Hall",
                         status="completed", start_date=s, end_date=s + pd.Timedelta(hours=8),
                         capacity=cap, ticket_price=float(rng.integers(0, 1000)), budget=10000.0,
                         marketing_budget=500.0, registrations=regs,
                         attended=int(regs * rng.uniform(0.5, 1.0)),
                         total_revenue=float(rng.integers(1000, 50000)), total_expenses=5000.0))
    return pd.DataFrame(rows)


def test_prior_performance_has_no_lookahead():
    df = prep.build_training_frame(prep.clean(_events())[0])
    first_of_each_type = df.groupby("event_type").head(1)
    assert first_of_each_type["prior_type_attendance_rate"].isna().all()
    assert (first_of_each_type["prior_type_event_count"] == 0).all()

    # Changing a *later* event's outcome must not change an earlier event's features.
    raw = _events()
    raw.loc[raw.index[-1], "attended"] = 0
    altered = prep.build_training_frame(prep.clean(raw)[0])
    cols = ["prior_type_attendance_rate", "prior_type_event_count"]
    pd.testing.assert_frame_equal(df[cols].iloc[:-1], altered[cols].iloc[:-1])


def test_features_exclude_outcomes():
    for leaked in ("attended", "attendance_rate", "total_revenue", "total_expenses", "profit", "is_success"):
        assert leaked not in prep.FEATURES


def test_clean_drops_invalid_rows():
    raw = _events()
    raw.loc[0, "registrations"] = raw.loc[0, "capacity"] + 1
    raw.loc[1, ["registrations", "attended"]] = 0
    cleaned, report = prep.clean(raw)
    assert report["invalid_rows_dropped"] == 1
    assert report["zero_registration_rows_dropped"] == 1
    assert len(cleaned) == len(raw) - 2


def test_success_label_follows_explicit_rule():
    df = prep.add_targets(_events())
    expected = (df["attended"] / df["registrations"] >= prep.SUCCESS_MIN_ATTENDANCE_RATE) & \
               (df["total_revenue"] > df["total_expenses"])
    assert (df["is_success"] == expected.astype(int)).all()


def test_pipeline_handles_unseen_event_type():
    df = prep.build_training_frame(prep.clean(_events())[0])
    pipe = prep.make_pipeline(RandomForestRegressor(n_estimators=10, random_state=0))
    pipe.fit(df[prep.FEATURES], df["attendance_rate"])
    row = prep.build_inference_frame(
        dict(event_type="hackathon", capacity=100, ticket_price=0, registration_count=80,
             month=3, day_of_week=5), type_stats={})
    assert 0 <= pipe.predict(row)[0] <= 1
    assert row.iloc[0]["is_weekend"] == 1


def _metric_event(**kw):
    base = dict(id="x", name="E", event_type="conference", status="completed", capacity=100,
                registrations=90, attended=80, total_revenue=80000.0, total_expenses=5000.0,
                budget=10000.0, start_date=datetime.now(timezone.utc))
    base.update(kw)
    return base


def test_anomaly_rules():
    stats = {"conference": dict(mean_fill_rate=0.8, std_fill_rate=0.1, mean_attendance_rate=0.85,
                                std_attendance_rate=0.05, mean_revenue_per_attendee=1000,
                                std_revenue_per_attendee=100, mean_expense_budget_ratio=0.9,
                                std_expense_budget_ratio=0.05)}
    assert anomaly.detect([_metric_event()], stats) == []

    found = anomaly.detect([_metric_event(registrations=20, attended=5, total_expenses=15000.0)], stats)
    assert {a["type"] for a in found} >= {"low_registrations", "low_attendance", "high_expenses"}


def test_anomaly_upcoming_low_fill():
    soon = datetime.now(timezone.utc) + timedelta(days=3)
    ev = _metric_event(status="registration_open", registrations=10, attended=0, total_expenses=0.0,
                       start_date=soon)
    found = anomaly.detect([ev], {"conference": {"mean_fill_rate": 0.8}})
    assert [a["type"] for a in found] == ["low_registrations"]
