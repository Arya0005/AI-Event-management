"""Apply SQL migrations in supabase/migrations to DATABASE_URL, in filename order.

Usage (from backend/):  python -m scripts.migrate

Every migration is written to be idempotent, so re-running is safe. You can
also paste the files into the Supabase SQL editor instead.
"""
from pathlib import Path

from sqlalchemy import text

from app.database import engine

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"


def main() -> None:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        raise SystemExit(f"No migrations found in {MIGRATIONS_DIR}")
    for path in files:
        print(f"Applying {path.name} ...")
        with engine.begin() as conn, conn.connection.cursor() as cur:
            # Raw cursor with no parameters, so '%' in plpgsql isn't treated as a placeholder.
            cur.execute(path.read_text(encoding="utf-8"))
    with engine.connect() as conn:
        tables = conn.execute(text(
            "select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1")).all()
    for name, rls in tables:
        print(f"  {name:<14} RLS {'on' if rls else 'OFF'}")
    print("Done.")


if __name__ == "__main__":
    main()
