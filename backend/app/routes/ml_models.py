import threading
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.auth import CurrentUser, require_admin, require_manager
from app.ml.predict import registry

router = APIRouter(prefix="/api/models", tags=["ML Models"])

_training_lock = threading.Lock()
_training_state: dict = {"running": False, "started_at": None, "finished_at": None, "error": None}


@router.get("")
def model_info(_: CurrentUser = Depends(require_manager)):
    meta = registry.metadata
    if meta is None:
        return {"trained": False, "training": _training_state}
    summary = {k: meta[k] for k in ("trained_at", "n_events", "n_train", "n_test", "split",
                                    "features", "data_quality", "success_definition")}
    summary["models"] = {kind: {k: v for k, v in m.items() if k != "file"}
                         for kind, m in meta["models"].items()}
    summary["event_types"] = sorted(meta["type_stats"].keys())
    return {"trained": True, **summary, "training": _training_state}


def _run_training() -> None:
    from app.database import SessionLocal
    from app.ml.train import train

    db = SessionLocal()
    try:
        train(db)
        registry.reload()
        _training_state["error"] = None
    except Exception as exc:  # surfaced through GET /api/models
        _training_state["error"] = str(exc)
    finally:
        db.close()
        _training_state["running"] = False
        _training_state["finished_at"] = datetime.now(timezone.utc).isoformat()
        _training_lock.release()


@router.post("/retrain", status_code=status.HTTP_202_ACCEPTED)
def retrain(_: CurrentUser = Depends(require_admin)):
    """Retrain on all completed events in a background thread — closes the
    feedback loop (completed events → historical dataset → new models)."""
    if not _training_lock.acquire(blocking=False):
        raise HTTPException(status.HTTP_409_CONFLICT, "Training is already running")
    _training_state.update(running=True, started_at=datetime.now(timezone.utc).isoformat(),
                           finished_at=None, error=None)
    threading.Thread(target=_run_training, daemon=True).start()
    return {"status": "started"}
