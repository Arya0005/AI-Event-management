"""Generate a synthetic historical dataset so the ML pipeline has something to
learn from before real events accumulate.

Usage (from backend/):
    python -m scripts.seed                      # 200 completed + 12 upcoming events
    python -m scripts.seed --events 300 --owner-email you@example.com
    python -m scripts.seed --reset              # remove previously seeded data only

Seeded events are tagged with SEED_TAG in their description so they can be
removed without touching real data. Outcomes follow explicit, documented
relationships (type, price, season, marketing, weekday) plus noise — useful for
exercising the pipeline, but the resulting model metrics say nothing about
real-world accuracy.
"""
from __future__ import annotations

import argparse
import io
import random
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.database import engine

SEED_TAG = "[seed]"
RNG = random.Random(42)

# type: capacity range, price range, base attendance rate, weekend bonus,
#       sponsorship ₹/seat, duration range (days), extra-revenue ₹/attendee
TYPES = {
    "conference": dict(cap=(200, 1500), price=(500, 3000), att=0.82, weekend=-0.02, sponsor=(300, 900),
                       dur=(1, 3), extra=(0, 0), catering=(250, 500)),
    "workshop":   dict(cap=(20, 120), price=(300, 2500), att=0.88, weekend=0.02, sponsor=(0, 200),
                       dur=(1, 2), extra=(0, 0), catering=(150, 300)),
    "concert":    dict(cap=(300, 3000), price=(800, 4000), att=0.93, weekend=0.03, sponsor=(100, 500),
                       dur=(1, 1), extra=(150, 400), catering=(0, 0)),
    "seminar":    dict(cap=(50, 400), price=(0, 500), att=0.66, weekend=-0.04, sponsor=(50, 300),
                       dur=(1, 1), extra=(0, 0), catering=(100, 250)),
    "meetup":     dict(cap=(30, 200), price=(0, 200), att=0.56, weekend=0.03, sponsor=(0, 150),
                       dur=(1, 1), extra=(0, 50), catering=(80, 200)),
    "exhibition": dict(cap=(200, 2000), price=(100, 800), att=0.78, weekend=0.05, sponsor=(200, 700),
                       dur=(2, 5), extra=(50, 200), catering=(0, 0)),
    "sports":     dict(cap=(500, 4000), price=(200, 2000), att=0.90, weekend=0.04, sponsor=(150, 600),
                       dur=(1, 1), extra=(100, 300), catering=(0, 0)),
    "festival":   dict(cap=(800, 5000), price=(500, 3000), att=0.87, weekend=0.03, sponsor=(200, 800),
                       dur=(2, 3), extra=(200, 600), catering=(0, 0)),
}
TYPE_WEIGHTS = {"conference": 18, "workshop": 20, "concert": 12, "seminar": 15, "meetup": 15,
                "exhibition": 8, "sports": 6, "festival": 6}

VENUES = [
    ("Lakeside Convention Centre", 1500), ("Riverside Expo Grounds", 5000),
    ("Harbor View Arena", 4000), ("City Central Auditorium", 800),
    ("Greenfield Open Grounds", 5000), ("Tech Park Hall A", 400),
    ("Tech Park Hall B", 150), ("Metro Business Hotel Ballroom", 600),
    ("Old Town Community Hall", 200), ("Innovation Hub Studio", 120),
    ("Skyline Rooftop Lounge", 250), ("University Main Auditorium", 1200),
    ("Northside Stadium", 4000), ("Garden Pavilion", 3000),
]

FIRST = ["Aarav", "Vivaan", "Aditya", "Ananya", "Diya", "Isha", "Kabir", "Meera", "Rohan", "Saanvi",
         "Arjun", "Priya", "Rahul", "Sneha", "Vikram", "Neha", "Karan", "Pooja", "Nikhil", "Riya",
         "Sam", "Alex", "Maria", "Chen", "Fatima", "Omar", "Lena", "Tomas", "Yuki", "Grace"]
LAST = ["Sharma", "Patel", "Reddy", "Iyer", "Nair", "Gupta", "Singh", "Rao", "Das", "Menon",
        "Kumar", "Joshi", "Mehta", "Shah", "Khan", "Fernandes", "Smith", "Garcia", "Lee", "Brown"]


def _season(month: int) -> tuple[float, float]:
    """(registration multiplier, attendance-rate shift) by month."""
    if month in (10, 11, 12):   # festive season
        return 1.12, 0.02
    if month in (6, 7, 8):      # monsoon
        return 0.85, -0.05
    return 1.0, 0.0


def _clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _event(start: datetime, completed: bool, owner: str | None) -> tuple[dict, list[dict], list[dict], list[dict]]:
    etype = RNG.choices(list(TYPE_WEIGHTS), weights=list(TYPE_WEIGHTS.values()))[0]
    t = TYPES[etype]
    capacity = int(round(RNG.uniform(*t["cap"]), -1)) or 10
    lo, hi = t["price"]
    price = round(RNG.uniform(lo, hi) / 50) * 50 if hi > 0 else 0
    if t["price"][0] == 0 and RNG.random() < 0.4:
        price = 0
    duration = RNG.randint(*t["dur"])
    if etype in ("concert", "sports", "festival") and RNG.random() < 0.7:
        start += timedelta(days=(5 - start.weekday()) % 7)  # pull to Saturday
    start = start.replace(hour=RNG.choice([9, 10, 17, 18]), minute=0, second=0, microsecond=0)
    end = start + timedelta(days=duration - 1, hours=RNG.choice([3, 6, 8]))
    weekend = start.weekday() >= 5
    mk_per_seat = RNG.uniform(20, 150)
    marketing = round(capacity * mk_per_seat, -2)

    reg_mult, att_shift = _season(start.month)
    price_pos = (price - lo) / (hi - lo) if hi > lo else 0
    fill = (0.72 * reg_mult * (1 - 0.25 * price_pos) * (0.85 + 0.3 * (mk_per_seat - 20) / 130)
            + RNG.gauss(0, 0.08))
    fill = _clip(fill, 0.08, 1.0)
    registrations = max(1, int(capacity * fill))

    att_rate = (t["att"] + att_shift + (t["weekend"] if weekend else 0)
                + (0.04 if price > 0 else -0.06) + 0.03 * price_pos + RNG.gauss(0, 0.05))
    if RNG.random() < 0.04:  # occasional disrupted event (weather, clash) → anomaly
        att_rate -= RNG.uniform(0.25, 0.4)
    att_rate = _clip(att_rate, 0.15, 1.0)
    venue = RNG.choice([v for v, c in VENUES if c >= capacity] or [VENUES[1][0]])

    event_id = str(uuid.uuid4())
    status = "completed" if completed else None
    event = dict(id=event_id, name=f"{etype.title()} {start:%b %Y} #{RNG.randint(100, 999)}",
                 description=f"{SEED_TAG} Synthetic historical event generated for ML training.",
                 event_type=etype, venue=venue, start_date=start, end_date=end, capacity=capacity,
                 ticket_price=price, budget=0, marketing_budget=marketing, status=status,
                 organizer_id=owner, created_at=start - timedelta(days=90))

    # Attendees
    attendees = []
    if not completed:
        days_out = (start - datetime.now(timezone.utc)).days
        registrations = int(registrations * _clip(1 - days_out / 90, 0.1, 0.9))
    for i in range(registrations):
        roll = RNG.random()
        ticket_type, tprice = ("vip", price * 2) if roll < 0.12 else \
                              ("early_bird", price * 0.8) if roll < 0.27 else ("general", price)
        if completed:
            attendance = "attended" if RNG.random() < att_rate else "no_show"
        else:
            attendance = "registered"
        payment = "paid" if tprice > 0 and RNG.random() < 0.96 else ("pending" if tprice > 0 else "paid")
        attendees.append(dict(
            event_id=event_id,
            name=f"{RNG.choice(FIRST)} {RNG.choice(LAST)}",
            email=f"guest{i}.{event_id[:8]}@example.com",
            ticket_type=ticket_type, ticket_price=round(tprice, 2),
            payment_status=payment, attendance_status=attendance,
            registered_at=start - timedelta(days=RNG.uniform(1, 75)),
        ))
    # ~3% cancellations: refunded and excluded from registration counts
    for a in RNG.sample(attendees, k=len(attendees) // 33):
        a["attendance_status"], a["payment_status"] = "cancelled", "refunded" if a["ticket_price"] else "paid"

    attended = sum(a["attendance_status"] == "attended" for a in attendees)
    expected_att = registrations * t["att"]

    revenue, expenses = [], []
    if completed:
        if t["sponsor"][1] > 0 and RNG.random() < 0.75:
            revenue.append(dict(event_id=event_id, source="sponsorship",
                                amount=round(capacity * RNG.uniform(*t["sponsor"]) * (0.6 + fill * 0.6), -2)))
        if t["extra"][1] > 0:
            src = "food_beverage" if etype in ("concert", "festival", "sports") else "merchandise"
            revenue.append(dict(event_id=event_id, source=src,
                                amount=round(attended * RNG.uniform(*t["extra"]), -1)))

        costs = {
            "venue": capacity * RNG.uniform(60, 180) * duration,
            "equipment": capacity * RNG.uniform(20, 90),
            "staff": attended * RNG.uniform(40, 140) * duration,
            "marketing": marketing * RNG.uniform(0.9, 1.1),
            "logistics": capacity * RNG.uniform(5, 25),
        }
        if t["catering"][1] > 0:
            costs["catering"] = attended * RNG.uniform(*t["catering"]) * duration
        if RNG.random() < 0.05:  # overspend → anomaly
            costs["venue"] *= 1.8
        expenses = [dict(event_id=event_id, category=k, amount=round(v, -1)) for k, v in costs.items()]

    # The budget is planned before the event, so it may only use expected values —
    # never realised costs or attendance (that would leak outcomes into a feature).
    event["budget"] = round(_planned_budget(t, capacity, expected_att, duration, marketing)
                            * RNG.uniform(0.95, 1.2), -2)
    return event, attendees, revenue, expenses


def _planned_budget(t: dict, capacity: int, expected_att: float, duration: int, marketing: float) -> float:
    planned = (capacity * 120 * duration      # venue (midpoint of 60–180)
               + capacity * 55                # equipment
               + expected_att * 90 * duration  # staff
               + marketing
               + capacity * 15)               # logistics
    if t["catering"][1] > 0:
        planned += expected_att * sum(t["catering"]) / 2 * duration
    return planned


def _copy(conn, table: str, columns: list[str], rows: list[dict]) -> None:
    if not rows:
        return
    buf = io.StringIO()
    for r in rows:
        values = []
        for c in columns:
            v = r.get(c)
            values.append("\\N" if v is None else
                          v.isoformat() if isinstance(v, datetime) else
                          str(v).replace("\t", " ").replace("\n", " "))
        buf.write("\t".join(values) + "\n")
    buf.seek(0)
    with conn.connection.cursor() as cur:
        cur.copy_expert(f"copy public.{table} ({', '.join(columns)}) from stdin", buf)


def reset() -> None:
    with engine.begin() as conn:
        n = conn.execute(text("delete from public.events where description like :tag"),
                         {"tag": f"{SEED_TAG}%"}).rowcount
    print(f"Removed {n} seeded events (attendees, revenue, expenses, predictions cascade).")


def seed(n_completed: int, n_upcoming: int, owner_email: str | None) -> None:
    with engine.begin() as conn:
        if owner_email:
            owner = conn.execute(text("select id from public.profiles where lower(email) = :e"),
                                 {"e": owner_email.lower()}).scalar()
            if owner is None:
                raise SystemExit(f"No profile for {owner_email}; register in the app first.")
        else:
            owner = conn.execute(text(
                "select id from public.profiles order by (role = 'admin') desc, (role = 'organizer') desc, "
                "created_at limit 1")).scalar()
        owner = str(owner) if owner else None

    now = datetime.now(timezone.utc)
    history_start = now - timedelta(days=3 * 365)
    history_span = (now - timedelta(days=14) - history_start).total_seconds()

    events, attendees, revenue, expenses = [], [], [], []
    for _ in range(n_completed):
        start = history_start + timedelta(seconds=RNG.uniform(0, history_span))
        e, a, r, x = _event(start, completed=True, owner=owner)
        events.append(e); attendees += a; revenue += r; expenses += x

    upcoming_status = (["draft"] * 2 + ["published"] * 3 + ["registration_open"] * 6 + ["registration_closed"])
    for i in range(n_upcoming):
        start = now + timedelta(days=RNG.uniform(3, 120))
        e, a, r, x = _event(start, completed=False, owner=owner)
        e["status"] = upcoming_status[i % len(upcoming_status)]
        if e["status"] in ("draft", "published"):
            a = []
        events.append(e); attendees += a

    with engine.begin() as conn:
        _copy(conn, "events", ["id", "name", "description", "event_type", "venue", "start_date",
                               "end_date", "capacity", "ticket_price", "budget", "marketing_budget",
                               "status", "organizer_id", "created_at"], events)
        _copy(conn, "attendees", ["event_id", "name", "email", "ticket_type", "ticket_price",
                                  "payment_status", "attendance_status", "registered_at"], attendees)
        _copy(conn, "revenue", ["event_id", "source", "amount"], revenue)
        _copy(conn, "expenses", ["event_id", "category", "amount"], expenses)

    print(f"Seeded {n_completed} completed + {n_upcoming} upcoming events, {len(attendees):,} attendees, "
          f"{len(revenue)} revenue and {len(expenses)} expense rows"
          + (f" (organizer {owner})." if owner else " (no organizer — no users exist yet)."))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--events", type=int, default=200, help="completed historical events")
    parser.add_argument("--upcoming", type=int, default=12, help="future events")
    parser.add_argument("--owner-email", help="organizer to own seeded events (default: first admin)")
    parser.add_argument("--reset", action="store_true", help="delete seeded data and exit")
    args = parser.parse_args()
    if args.reset:
        reset()
        return
    seed(args.events, args.upcoming, args.owner_email)


if __name__ == "__main__":
    main()
