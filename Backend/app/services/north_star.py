from datetime import datetime, timedelta, time
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

Granularity = Literal["week", "month", "year"]
LIMA = ZoneInfo("America/Lima")


def pooled_rate(numerators: list[float], denominators: list[float]) -> float | None:
    num = sum(numerators)
    den = sum(denominators)
    if den == 0:
        return None
    return num / den


def delta_pct(current: float | None, previous: float | None) -> float | None:
    if current is None or previous is None or previous == 0:
        return None
    return ((current - previous) / previous) * 100


def start_of_period(dt: datetime, granularity: Granularity) -> datetime:
    local = dt.astimezone(LIMA)
    if granularity == "week":
        monday = local.date() - timedelta(days=local.weekday())
        return datetime.combine(monday, time.min, tzinfo=LIMA)
    if granularity == "month":
        return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return local.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)


def add_period(start: datetime, granularity: Granularity) -> datetime:
    if granularity == "week":
        return start + timedelta(days=7)
    if granularity == "month":
        year, month = start.year, start.month + 1
        if month == 13:
            year, month = year + 1, 1
        return start.replace(year=year, month=month)
    return start.replace(year=start.year + 1)


def prev_period_start(start: datetime, granularity: Granularity) -> datetime:
    if granularity == "week":
        return start - timedelta(days=7)
    if granularity == "month":
        year, month = start.year, start.month - 1
        if month == 0:
            year, month = year - 1, 12
        return start.replace(year=year, month=month)
    return start.replace(year=start.year - 1)


def build_windows(
    granularity: Granularity,
    periods: int,
    now: datetime | None = None,
) -> list[tuple[datetime, datetime]]:
    cursor = start_of_period(now or datetime.now(LIMA), granularity)
    windows: list[tuple[datetime, datetime]] = []
    for _ in range(periods):
        windows.append((cursor, add_period(cursor, granularity)))
        cursor = prev_period_start(cursor, granularity)
    windows.reverse()
    return windows


def _in_bucket(ts: datetime, start: datetime, end: datetime) -> bool:
    ts_local = ts.astimezone(LIMA)
    return start <= ts_local < end


def _metric_block(
    *,
    windows: list[tuple[datetime, datetime]],
    per_window: list[tuple[float, float]],
    kind: Literal["count", "rate"],
    available: bool = True,
) -> dict:
    if not available:
        return {
            "available": False,
            "kind": kind,
            "range": {"value": None, "delta_pct": None},
            "series": [],
        }

    series = []
    nums = []
    dens = []
    vals = []
    for (start, end), (num, den) in zip(windows, per_window):
        value = num if kind == "count" else (num / den if den else None)
        series.append(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "value": value,
                "numerator": num,
                "denominator": den if kind == "rate" else num,
            }
        )
        nums.append(num)
        dens.append(den)
        vals.append(num if kind == "count" else (num / den if den else 0.0))

    if kind == "count":
        range_value = float(sum(nums))
    else:
        range_value = pooled_rate(nums, dens)

    return {
        "available": True,
        "kind": kind,
        "range": {"value": range_value, "delta_pct": None},
        "series": series,
        "_nums": nums,
        "_dens": dens,
        "_kind": kind,
    }


def _attach_delta(current: dict, previous_nums: list[float], previous_dens: list[float]) -> dict:
    kind = current.pop("_kind", "count")
    nums = current.pop("_nums", [])
    dens = current.pop("_dens", [])
    if kind == "count":
        prev_val = float(sum(previous_nums)) if previous_nums else None
        cur_val = current["range"]["value"]
    else:
        prev_val = pooled_rate(previous_nums, previous_dens)
        cur_val = current["range"]["value"]
    current["range"]["delta_pct"] = delta_pct(cur_val, prev_val)
    return current


def _fetch_checkins(db: Session, start: datetime, end: datetime) -> list[tuple]:
    rows = db.execute(
        text(
            """
            SELECT lower(a.email) AS email,
                   a.event_id::text AS event_id,
                   t.checked_in_at
            FROM formulario.tickets t
            JOIN formulario.attendees a ON a.id = t.attendee_id
            JOIN formulario.events e ON e.id = a.event_id
            WHERE t.checked_in IS TRUE
              AND COALESCE(e.is_draft, false) IS FALSE
              AND t.checked_in_at >= :start
              AND t.checked_in_at < :end
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [(r.email, r.event_id, r.checked_in_at) for r in rows]


def _fetch_signups(db: Session, start: datetime, end: datetime) -> list[tuple]:
    rows = db.execute(
        text(
            """
            SELECT a.event_id::text AS event_id, a.registered_at
            FROM formulario.attendees a
            JOIN formulario.events e ON e.id = a.event_id
            WHERE COALESCE(e.is_draft, false) IS FALSE
              AND a.registered_at >= :start
              AND a.registered_at < :end
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [(r.event_id, r.registered_at) for r in rows]


def _fetch_published(db: Session, start: datetime, end: datetime) -> list[tuple]:
    rows = db.execute(
        text(
            """
            SELECT e.id::text AS event_id, e.created_at,
                   EXISTS (
                     SELECT 1 FROM formulario.attendees a
                     WHERE a.event_id = e.id
                       AND a.registered_at < e.created_at + INTERVAL '7 days'
                       AND a.registered_at >= e.created_at
                   ) AS useful
            FROM formulario.events e
            WHERE COALESCE(e.is_draft, false) IS FALSE
              AND e.created_at >= :start
              AND e.created_at < :end
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [(r.event_id, r.created_at, bool(r.useful)) for r in rows]


def _match_available(db: Session) -> bool:
    try:
        row = db.execute(
            text(
                """
                SELECT 1
                FROM public.activity_events
                WHERE event_type = 'event_viewed'
                LIMIT 1
                """
            )
        ).first()
        return row is not None
    except Exception:
        db.rollback()
        return False


def _fetch_views(db: Session, start: datetime, end: datetime) -> list[tuple]:
    rows = db.execute(
        text(
            """
            SELECT DISTINCT ae.user_id,
                   ae.metadata->>'event_id' AS event_id,
                   ae.created_at
            FROM public.activity_events ae
            WHERE ae.event_type = 'event_viewed'
              AND ae.metadata ? 'event_id'
              AND ae.created_at >= :start
              AND ae.created_at < :end
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [(r.user_id, r.event_id, r.created_at) for r in rows]


def _count_unique_pairs_in_windows(
    rows: list[tuple],
    windows: list[tuple[datetime, datetime]],
    pair_idx: tuple[int, int] = (0, 1),
    time_idx: int = 2,
) -> list[int]:
    counts = []
    i, j = pair_idx
    for start, end in windows:
        seen: set = set()
        for row in rows:
            ts = row[time_idx]
            if ts is None:
                continue
            if _in_bucket(ts, start, end):
                seen.add((row[i], row[j]))
        counts.append(len(seen))
    return counts


def _habit_per_window(
    checkins: list[tuple],
    windows: list[tuple[datetime, datetime]],
    *,
    yearly: bool,
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for start, end in windows:
        denom_emails: set = set()
        for email, event_id, ts in checkins:
            if ts is None:
                continue
            if _in_bucket(ts, start, end):
                denom_emails.add(email)
        lookback_start = start if yearly else end - timedelta(days=30)
        events_by_email: dict[str, set] = {}
        for email, event_id, ts in checkins:
            if ts is None:
                continue
            ts_l = ts.astimezone(LIMA)
            if lookback_start <= ts_l < end:
                events_by_email.setdefault(email, set()).add(event_id)
        num = sum(1 for email in denom_emails if len(events_by_email.get(email, ())) >= 2)
        if yearly:
            num = sum(1 for evs in events_by_email.values() if len(evs) >= 2)
            den = sum(1 for evs in events_by_email.values() if len(evs) >= 1)
        else:
            den = len(denom_emails)
        out.append((float(num), float(den)))
    return out


def list_metrics(
    db: Session,
    *,
    granularity: Granularity = "week",
    periods: int = 8,
    now: datetime | None = None,
) -> dict:
    periods = max(1, min(periods, 36))
    windows = build_windows(granularity, periods, now)
    range_start, range_end = windows[0][0], windows[-1][1]
    lookback = range_start - timedelta(days=30)

    prev_windows = []
    cursor = prev_period_start(windows[0][0], granularity)
    for _ in range(periods):
        end = add_period(cursor, granularity)
        prev_windows.append((cursor, end))
        cursor = prev_period_start(cursor, granularity)
    prev_windows.reverse()
    prev_start = prev_windows[0][0]

    fetch_start = min(lookback, prev_start)

    checkins = _fetch_checkins(db, fetch_start, range_end)
    signups = _fetch_signups(db, prev_start, range_end)
    published = _fetch_published(db, prev_start, range_end)
    match_on = _match_available(db)
    views = _fetch_views(db, prev_start, range_end) if match_on else []

    ns_cur = _count_unique_pairs_in_windows(checkins, windows)
    ns_prev = _count_unique_pairs_in_windows(checkins, prev_windows)
    north = _metric_block(
        windows=windows,
        per_window=[(float(n), float(n)) for n in ns_cur],
        kind="count",
    )
    north = _attach_delta(north, [float(n) for n in ns_prev], [float(n) for n in ns_prev])

    def useful_counts(wins):
        counts = []
        for start, end in wins:
            n = 0
            for _eid, created, useful in published:
                if useful and created is not None and _in_bucket(created, start, end):
                    n += 1
            counts.append(n)
        return counts

    us_cur = useful_counts(windows)
    us_prev = useful_counts(prev_windows)
    supply = _metric_block(
        windows=windows,
        per_window=[(float(n), float(n)) for n in us_cur],
        kind="count",
    )
    supply = _attach_delta(supply, [float(n) for n in us_prev], [float(n) for n in us_prev])

    if match_on:
        sign_cur = [
            float(
                sum(
                    1
                    for _eid, ts in signups
                    if ts is not None and _in_bucket(ts, s, e)
                )
            )
            for s, e in windows
        ]
        view_cur = _count_unique_pairs_in_windows(views, windows)
        sign_prev = [
            float(sum(1 for _eid, ts in signups if ts is not None and _in_bucket(ts, s, e)))
            for s, e in prev_windows
        ]
        view_prev = _count_unique_pairs_in_windows(views, prev_windows)
        match = _metric_block(
            windows=windows,
            per_window=list(zip(sign_cur, [float(v) for v in view_cur])),
            kind="rate",
        )
        match = _attach_delta(match, sign_prev, [float(v) for v in view_prev])
    else:
        match = _metric_block(windows=windows, per_window=[], kind="rate", available=False)

    yearly = granularity == "year"
    habit_cur = _habit_per_window(checkins, windows, yearly=yearly)
    habit_prev = _habit_per_window(checkins, prev_windows, yearly=yearly)
    habit = _metric_block(windows=windows, per_window=habit_cur, kind="rate")
    habit = _attach_delta(
        habit,
        [n for n, _ in habit_prev],
        [d for _, d in habit_prev],
    )

    return {
        "timezone": str(LIMA),
        "granularity": granularity,
        "periods": periods,
        "north_star": north,
        "useful_supply": supply,
        "match": match,
        "habit": habit,
        "signups_bridge": {
            "kind": "count",
            "range": {
                "value": float(
                    sum(
                        1
                        for _eid, ts in signups
                        if ts is not None and range_start <= ts.astimezone(LIMA) < range_end
                    )
                )
            },
        },
    }
