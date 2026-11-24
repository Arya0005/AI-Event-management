"""Assign a role to an existing Supabase user (use this to bootstrap the first admin;
after that, admins can manage roles from the Settings page).

Usage (from backend/):  python -m scripts.set_role you@example.com admin

The user must sign out and back in (or refresh their session) to receive a
JWT carrying the new role.
"""
import sys

from sqlalchemy import text

from app.database import engine

ROLES = ("admin", "organizer", "staff")


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[2] not in ROLES:
        raise SystemExit(f"Usage: python -m scripts.set_role <email> <{'|'.join(ROLES)}>")
    email, role = sys.argv[1].lower(), sys.argv[2]
    with engine.begin() as conn:
        updated = conn.execute(text(
            "update auth.users "
            "set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', :role) "
            "where lower(email) = :email returning id"), {"role": role, "email": email}).first()
    if updated is None:
        raise SystemExit(f"No Supabase user with email {email}. Register in the app first.")
    print(f"{email} is now '{role}' (user id {updated[0]}). Sign out and back in to refresh the token.")


if __name__ == "__main__":
    main()
