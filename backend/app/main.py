import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError

from app.config import get_settings
from app.ml.predict import registry
from app.routes import (analytics, attendees, events, finance, ml_models, predictions,
                        recommendations, users)

logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    registry.reload()
    yield


app = FastAPI(
    lifespan=lifespan,
    title="AI Event Management API",
    description="Event management, analytics and ML forecasting for event organizers.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type"],
)

for module in (users, events, attendees, finance, analytics, predictions, recommendations, ml_models):
    app.include_router(module.router)


# PostgreSQL error codes → HTTP. RLS denials surface as 42501.
_PG_STATUS = {
    "42501": (status.HTTP_403_FORBIDDEN, "Permission denied"),
    "23505": (status.HTTP_409_CONFLICT, "A record with these details already exists"),
    "23503": (status.HTTP_409_CONFLICT, "Referenced record does not exist or is still in use"),
    "23514": (status.HTTP_422_UNPROCESSABLE_CONTENT, "Value violates a database constraint"),
    "22023": (status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid parameter"),
    "P0002": (status.HTTP_404_NOT_FOUND, "Not found"),
}


@app.exception_handler(DBAPIError)
async def db_error_handler(_: Request, exc: DBAPIError):
    code = getattr(exc.orig, "pgcode", None)
    if code in _PG_STATUS:
        http_status, detail = _PG_STATUS[code]
        return JSONResponse(status_code=http_status, content={"detail": detail})
    logger.exception("Database error", exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Database error"})


@app.get("/api/health", tags=["Health"])
def health():
    meta = registry.metadata
    return {
        "status": "ok",
        "models_loaded": meta is not None,
        "model_versions": {k: m["version"] for k, m in meta["models"].items()} if meta else {},
    }
