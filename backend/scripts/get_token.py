"""Print a Supabase access token for API testing (e.g. in Swagger's Authorize box).

Usage (from backend/):  python -m scripts.get_token you@example.com
The password is prompted for, so it never ends up in shell history or source.
"""
import getpass
import sys

from supabase import create_client

from app.config import get_settings


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python -m scripts.get_token <email>")
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_anon_key)
    response = client.auth.sign_in_with_password(
        {"email": sys.argv[1], "password": getpass.getpass("Password: ")})
    print(response.session.access_token)


if __name__ == "__main__":
    main()
