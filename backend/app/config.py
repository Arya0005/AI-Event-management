import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


class Settings:
    def __init__(self) -> None:
        self.database_url = os.getenv("DATABASE_URL", "")
        self.supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")
        # Legacy HS256 secret. Projects using asymmetric signing keys are
        # verified against the JWKS endpoint instead.
        self.supabase_jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "")
        self.cors_origins = [
            o.strip()
            for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
            if o.strip()
        ]
        self.model_dir = Path(os.getenv("MODEL_DIR", BACKEND_DIR / "app" / "ml" / "models"))


@lru_cache
def get_settings() -> Settings:
    return Settings()
