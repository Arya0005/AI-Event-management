"""Offline training for the attendance, revenue and success models.

Usage (from backend/):  python -m app.ml.train

Reads completed events from Supabase PostgreSQL, cleans them, engineers
pre-event features, evaluates on a time-based hold-out (the most recent 20%
of events — the model never sees the future during evaluation), then refits
on all data and saves versioned joblib artifacts plus metadata.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, mean_absolute_error,
                             mean_squared_error, precision_score, r2_score, recall_score,
                             roc_auc_score)
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sqlalchemy import text

from app.config import get_settings
from app.ml import preprocessing as prep
from app.services.metrics import EXPENSE_BY_CATEGORY_SQL

MIN_EVENTS = 30
TEST_FRACTION = 0.2
RANDOM_STATE = 42


def _regression_metrics(y_true, y_pred) -> dict:
    mse = mean_squared_error(y_true, y_pred)
    return {
        "mae": round(float(mean_absolute_error(y_true, y_pred)), 4),
        "mse": round(float(mse), 4),
        "rmse": round(float(np.sqrt(mse)), 4),
        "r2": round(float(r2_score(y_true, y_pred)), 4),
    }


def _classification_metrics(y_true, y_pred, y_proba) -> dict:
    out = {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 4),
        "confusion_matrix": confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist(),
    }
    if len(set(y_true)) == 2:
        out["roc_auc"] = round(float(roc_auc_score(y_true, y_proba)), 4)
    return out


def _cv_score(pipeline, X, y, scoring: str) -> dict:
    n_splits = min(5, max(2, len(X) // 15))
    scores = cross_val_score(clone(pipeline), X, y, cv=TimeSeriesSplit(n_splits=n_splits),
                             scoring=scoring)
    return {"scoring": scoring, "folds": n_splits,
            "mean": round(float(np.mean(scores)), 4), "std": round(float(np.std(scores)), 4)}


def _type_stats(df: pd.DataFrame) -> dict:
    """Historical per-type statistics, used for inference-time prior features,
    anomaly baselines and recommendations."""
    stats = {}
    for event_type, g in df.groupby("event_type"):
        stats[event_type] = {
            "count": int(len(g)),
            "mean_attendance_rate": float(g["attendance_rate"].mean()),
            "std_attendance_rate": float(g["attendance_rate"].std(ddof=0)),
            "mean_fill_rate": float((g["registrations"] / g["capacity"]).mean()),
            "std_fill_rate": float((g["registrations"] / g["capacity"]).std(ddof=0)),
            "mean_revenue_per_attendee": float((g["total_revenue"] / g["attended"].clip(lower=1)).mean()),
            "std_revenue_per_attendee": float((g["total_revenue"] / g["attended"].clip(lower=1)).std(ddof=0)),
            "mean_expense_budget_ratio": float((g["total_expenses"] / g["budget"].replace(0, np.nan)).mean()),
            "std_expense_budget_ratio": float((g["total_expenses"] / g["budget"].replace(0, np.nan)).std(ddof=0)),
            "success_rate": float(g["is_success"].mean()),
        }
    return {k: {kk: (None if pd.isna(vv) else vv) for kk, vv in v.items()} for k, v in stats.items()}


def _resource_stats(db, df: pd.DataFrame) -> dict:
    """Median spend per attendee by expense category and event type."""
    exp = pd.read_sql(text(EXPENSE_BY_CATEGORY_SQL), db.connection())
    if exp.empty:
        return {}
    exp["event_id"] = exp["event_id"].astype(str)
    attended = df.assign(event_id=df["id"].astype(str))[["event_id", "attended"]]
    exp = exp.merge(attended, on="event_id")
    exp["per_attendee"] = exp["amount"] / exp["attended"].clip(lower=1)
    out: dict = {}
    for (event_type, category), g in exp.groupby(["event_type", "category"]):
        out.setdefault(event_type, {})[category] = {
            "median_per_attendee": round(float(g["per_attendee"].median()), 2),
            "events": int(len(g)),
        }
    return out


def _venue_stats(df: pd.DataFrame) -> list[dict]:
    rows = []
    for (venue, event_type), g in df.dropna(subset=["venue"]).groupby(["venue", "event_type"]):
        rows.append({
            "venue": venue,
            "event_type": event_type,
            "capacity": int(g["capacity"].max()),
            "events": int(len(g)),
            "mean_attendance_rate": round(float(g["attendance_rate"].mean()), 4),
            "mean_fill_rate": round(float((g["registrations"] / g["capacity"]).mean()), 4),
            "success_rate": round(float(g["is_success"].mean()), 4),
        })
    return rows


def train(db) -> dict:
    settings = get_settings()
    raw = prep.load_completed_events(db)
    if len(raw) < MIN_EVENTS:
        raise RuntimeError(f"Need at least {MIN_EVENTS} completed events to train; found {len(raw)}. "
                           "Run `python -m scripts.seed` to generate historical data.")

    cleaned, quality = prep.clean(raw)
    df = prep.build_training_frame(cleaned)  # sorted by start_date
    X = df[prep.FEATURES]

    split = int(len(df) * (1 - TEST_FRACTION))
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    train_df, test_df = df.iloc[:split], df.iloc[split:]

    trained_at = datetime.now(timezone.utc)
    stamp = trained_at.strftime("%Y%m%d%H%M%S")
    rf_params = dict(n_estimators=300, min_samples_leaf=2, random_state=RANDOM_STATE, n_jobs=-1)

    results = {}

    # --- Attendance: predict attendance *rate*, convert to headcount ---------
    att = prep.make_pipeline(RandomForestRegressor(**rf_params))
    att.fit(X_train, train_df["attendance_rate"])
    rate_pred = np.clip(att.predict(X_test), 0, 1)
    head_pred = rate_pred * test_df["registration_count"]
    results["attendance"] = {
        "target": "attendance_rate (× registration_count → attendees)",
        "test_metrics": {
            "attendees": _regression_metrics(test_df["attended"], head_pred),
            "rate": _regression_metrics(test_df["attendance_rate"], rate_pred),
        },
        "cross_validation": _cv_score(att, X_train, train_df["attendance_rate"],
                                      "neg_mean_absolute_error"),
        "pipeline": prep.make_pipeline(RandomForestRegressor(**rf_params)).fit(X, df["attendance_rate"]),
    }

    # --- Revenue ---------------------------------------------------------------
    rev = prep.make_pipeline(RandomForestRegressor(**rf_params))
    rev.fit(X_train, train_df["total_revenue"])
    results["revenue"] = {
        "target": "total_revenue (ticket + sponsorship + other)",
        "test_metrics": _regression_metrics(test_df["total_revenue"], rev.predict(X_test)),
        "cross_validation": _cv_score(rev, X_train, train_df["total_revenue"],
                                      "neg_mean_absolute_error"),
        "pipeline": prep.make_pipeline(RandomForestRegressor(**rf_params)).fit(X, df["total_revenue"]),
    }

    # --- Success classification ----------------------------------------------
    clf_params = dict(rf_params, class_weight="balanced")
    clf = prep.make_pipeline(RandomForestClassifier(**clf_params))
    clf.fit(X_train, train_df["is_success"])
    if len(clf.classes_) == 2:
        proba = clf.predict_proba(X_test)[:, 1]
    else:  # degenerate training set with a single class
        proba = np.full(len(X_test), float(clf.classes_[0]))
    results["success"] = {
        "target": f"is_success — {prep.SUCCESS_DEFINITION}",
        "test_metrics": _classification_metrics(test_df["is_success"], (proba >= 0.5).astype(int), proba),
        "class_balance": round(float(df["is_success"].mean()), 4),
        "pipeline": prep.make_pipeline(RandomForestClassifier(**clf_params)).fit(X, df["is_success"]),
    }

    # --- Persist -----------------------------------------------------------------
    settings.model_dir.mkdir(parents=True, exist_ok=True)
    common = {
        "trained_at": trained_at.isoformat(),
        "n_events": int(len(df)),
        "n_train": int(len(X_train)),
        "n_test": int(len(X_test)),
        "split": "time-based hold-out: most recent 20% of events by start_date",
        "features": prep.FEATURES,
        "data_quality": quality,
    }
    registry = {"models": {}, "type_stats": _type_stats(df),
                "resource_stats": _resource_stats(db, df), "venue_stats": _venue_stats(df),
                "success_definition": prep.SUCCESS_DEFINITION, **common}

    for kind, r in results.items():
        version = f"{kind}_rf_{stamp}"
        pipeline = r.pop("pipeline")
        joblib.dump(pipeline, settings.model_dir / f"{version}.joblib")
        registry["models"][kind] = {
            "version": version,
            "file": f"{version}.joblib",
            "algorithm": "RandomForestClassifier" if kind == "success" else "RandomForestRegressor",
            "feature_importances": prep.grouped_importances(pipeline),
            **r,
        }

    current = settings.model_dir / "current.json"
    tmp = current.with_suffix(".tmp")
    tmp.write_text(json.dumps(registry, indent=2, default=str))
    tmp.replace(current)
    (settings.model_dir / f"registry_{stamp}.json").write_text(json.dumps(registry, indent=2, default=str))
    return registry


def main() -> int:
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        registry = train(db)
    except RuntimeError as exc:
        print(f"Training aborted: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"Trained on {registry['n_events']} completed events "
          f"({registry['n_train']} train / {registry['n_test']} test)")
    print("Data quality:", json.dumps(registry["data_quality"]))
    for kind, m in registry["models"].items():
        print(f"\n[{m['version']}]")
        print(json.dumps(m["test_metrics"], indent=2))
        top = list(m["feature_importances"].items())[:5]
        print("Top features:", ", ".join(f"{k}={v:.3f}" for k, v in top))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
