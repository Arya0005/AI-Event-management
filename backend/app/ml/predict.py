"""Real-time inference against the currently deployed model versions."""
from __future__ import annotations

import json
import threading
from typing import Any

import joblib
import numpy as np

from app.config import get_settings
from app.ml.preprocessing import SUCCESS_DEFINITION, build_inference_frame


class ModelsNotTrained(RuntimeError):
    pass


class ModelRegistry:
    """Loads `current.json` and its joblib pipelines once; `reload()` swaps in
    a newly trained set atomically."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._meta: dict | None = None
        self._pipelines: dict[str, Any] = {}

    def reload(self) -> None:
        model_dir = get_settings().model_dir
        current = model_dir / "current.json"
        if not current.exists():
            with self._lock:
                self._meta, self._pipelines = None, {}
            return
        meta = json.loads(current.read_text())
        pipelines = {kind: joblib.load(model_dir / m["file"]) for kind, m in meta["models"].items()}
        with self._lock:
            self._meta, self._pipelines = meta, pipelines

    def _ensure(self) -> tuple[dict, dict]:
        if self._meta is None:
            self.reload()
        if self._meta is None:
            raise ModelsNotTrained("No trained models found. Run `python -m app.ml.train` first.")
        return self._meta, self._pipelines

    @property
    def metadata(self) -> dict | None:
        try:
            return self._ensure()[0]
        except ModelsNotTrained:
            return None

    def _features(self, payload: dict) -> tuple[Any, dict, dict]:
        meta, pipelines = self._ensure()
        frame = build_inference_frame(payload, meta["type_stats"])
        used = {k: (None if isinstance(v, float) and np.isnan(v) else v)
                for k, v in frame.iloc[0].to_dict().items()}
        used = {k: (v.item() if hasattr(v, "item") else v) for k, v in used.items()}
        if payload["event_type"] not in meta["type_stats"]:
            used["note"] = "event_type not seen in training data; prediction relies on other features"
        return frame, used, pipelines

    def predict_attendance(self, payload: dict) -> dict:
        frame, used, pipelines = self._features(payload)
        rate = float(np.clip(pipelines["attendance"].predict(frame)[0], 0, 1))
        regs = payload["registration_count"]
        return {
            "predicted_attendance": int(round(rate * regs)),
            "attendance_rate": round(rate, 4),
            "registration_count": regs,
            "model_version": self._meta["models"]["attendance"]["version"],
            "features": used,
        }

    def predict_revenue(self, payload: dict) -> dict:
        frame, used, pipelines = self._features(payload)
        value = max(0.0, float(pipelines["revenue"].predict(frame)[0]))
        return {
            "predicted_revenue": round(value, 2),
            "model_version": self._meta["models"]["revenue"]["version"],
            "features": used,
        }

    def predict_success(self, payload: dict) -> dict:
        frame, used, pipelines = self._features(payload)
        pipe = pipelines["success"]
        classes = list(pipe.classes_)
        proba = float(pipe.predict_proba(frame)[0][classes.index(1)]) if 1 in classes else 0.0
        return {
            "success_probability": round(proba, 4),
            "is_likely_successful": proba >= 0.5,
            "success_definition": SUCCESS_DEFINITION,
            "model_version": self._meta["models"]["success"]["version"],
            "features": used,
        }


registry = ModelRegistry()
