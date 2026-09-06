"""Las cuatro métricas del panel, todas mensuales y todas tasas.

La estrella norte no se acumula por vida: pertenece al mes en que el evento
ocurre. Cada evento aporta sus asistentes y sus inscritos al bucket de su
`date_time`, sin importar cuándo se inscribió la gente. Así los inscritos de un
evento de octubre no mueven la cifra de septiembre.
"""

from datetime import datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

Granularity = Literal["week", "month"]
LIMA = ZoneInfo("America/Lima")

# Una publicación tiene 7 días para conseguir su primera inscripción.
USEFUL_SUPPLY_WINDOW = timedelta(days=7)
# Hábito mira los 30 días que cierran el bucket.
HABIT_LOOKBACK = timedelta(days=30)
# Meses que necesita la cabecera: el actual, el cerrado y uno más para su delta.
HEADLINE_MONTHS = 3


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
    return local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def add_period(start: datetime, granularity: Granularity) -> datetime:
    if granularity == "week":
        return start + timedelta(days=7)
    year, month = start.year, start.month + 1
    if month == 13:
        year, month = year + 1, 1
    return start.replace(year=year, month=month)


def prev_period_start(start: datetime, granularity: Granularity) -> datetime:
    if granularity == "week":
        return start - timedelta(days=7)
    year, month = start.year, start.month - 1
    if month == 0:
        year, month = year - 1, 12
    return start.replace(year=year, month=month)


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


def build_prev_windows(
    first_start: datetime,
    granularity: Granularity,
    periods: int,
) -> list[tuple[datetime, datetime]]:
    """Los `periods` bloques inmediatamente anteriores al rango visible."""
    cursor = prev_period_start(first_start, granularity)
    windows: list[tuple[datetime, datetime]] = []
    for _ in range(periods):
        windows.append((cursor, add_period(cursor, granularity)))
        cursor = prev_period_start(cursor, granularity)
    windows.reverse()
    return windows


def last_months(now: datetime, count: int) -> list[tuple[datetime, datetime]]:
    """Del más antiguo al mes en curso."""
    return build_windows("month", count, now)


def _in_bucket(ts: datetime, start: datetime, end: datetime) -> bool:
    ts_local = ts.astimezone(LIMA)
    return start <= ts_local < end


def _effective_end(end: datetime, now: datetime) -> datetime:
    """Un bucket en curso se cierra en `now`: nada se cuenta del futuro."""
    return min(end, now)


# --------------------------------------------------------------------------- #
# Lectura
# --------------------------------------------------------------------------- #


def _fetch_event_rollup(db: Session, start: datetime, end: datetime) -> list[tuple]:
    """Un renglón por evento: sus inscritos únicos y sus asistentes únicos.

    El bucket lo fija `e.date_time`, no `registered_at` ni `checked_in_at`.
    """
    rows = db.execute(
        text(
            """
            SELECT e.id::text AS event_id,
                   e.date_time AS event_at,
                   COUNT(DISTINCT lower(a.email)) AS registered,
                   COUNT(DISTINCT lower(a.email))
                     FILTER (WHERE t.checked_in IS TRUE) AS checked
            FROM formulario.events e
            JOIN formulario.attendees a ON a.event_id = e.id
            LEFT JOIN formulario.tickets t ON t.attendee_id = a.id
            WHERE COALESCE(e.is_draft, false) IS FALSE
              AND e.date_time IS NOT NULL
              AND e.date_time >= :start
              AND e.date_time < :end
            GROUP BY e.id, e.date_time
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [
        (r.event_id, r.event_at, float(r.registered), float(r.checked)) for r in rows
    ]


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
            SELECT lower(a.email) AS email,
                   a.event_id::text AS event_id,
                   a.registered_at
            FROM formulario.attendees a
            JOIN formulario.events e ON e.id = a.event_id
            WHERE COALESCE(e.is_draft, false) IS FALSE
              AND a.registered_at >= :start
              AND a.registered_at < :end
            """
        ),
        {"start": start, "end": end},
    ).all()
    return [(r.email, r.event_id, r.registered_at) for r in rows]


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


# --------------------------------------------------------------------------- #
# Cálculo por ventana
# --------------------------------------------------------------------------- #


def _count_unique_pairs(rows: list[tuple], start: datetime, end: datetime) -> int:
    seen: set = set()
    for email, event_id, ts in rows:
        if ts is not None and _in_bucket(ts, start, end):
            seen.add((email, event_id))
    return len(seen)


def _count_rows(rows: list[tuple], start: datetime, end: datetime) -> int:
    return sum(1 for _a, _b, ts in rows if ts is not None and _in_bucket(ts, start, end))


def north_star_rates(
    events: list[tuple],
    windows: list[tuple[datetime, datetime]],
    now: datetime,
) -> list[tuple[float, float]]:
    """Asistentes / inscritos de los eventos ya ocurridos en cada bucket."""
    out: list[tuple[float, float]] = []
    for start, end in windows:
        stop = _effective_end(end, now)
        num = 0.0
        den = 0.0
        for _eid, event_at, registered, checked in events:
            if event_at is None:
                continue
            if _in_bucket(event_at, start, stop):
                num += checked
                den += registered
        out.append((num, den))
    return out


def useful_supply_rates(
    published: list[tuple],
    windows: list[tuple[datetime, datetime]],
    now: datetime,
) -> list[tuple[float, float]]:
    """Solo entran los eventos cuya ventana de 7 días ya cerró."""
    out: list[tuple[float, float]] = []
    for start, end in windows:
        num = 0
        den = 0
        for _eid, created, useful in published:
            if created is None or not _in_bucket(created, start, end):
                continue
            if created.astimezone(LIMA) + USEFUL_SUPPLY_WINDOW > now:
                continue
            den += 1
            if useful:
                num += 1
        out.append((float(num), float(den)))
    return out


def match_rates(
    signups: list[tuple],
    views: list[tuple],
    windows: list[tuple[datetime, datetime]],
    now: datetime,
) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for start, end in windows:
        stop = _effective_end(end, now)
        out.append(
            (
                float(_count_rows(signups, start, stop)),
                float(_count_unique_pairs(views, start, stop)),
            )
        )
    return out


def events_created_counts(
    published: list[tuple],
    windows: list[tuple[datetime, datetime]],
    now: datetime,
) -> list[float]:
    """Eventos no-draft publicados en cada bucket.

    Es volumen, no tasa: a diferencia de Oferta útil aquí no se filtra por
    madurez, porque la pregunta es cuántos se publicaron, no cuántos tuvieron
    tiempo de conseguir inscritos.
    """
    out: list[float] = []
    for start, end in windows:
        stop = _effective_end(end, now)
        n = sum(
            1
            for _eid, created, _useful in published
            if created is not None and _in_bucket(created, start, stop)
        )
        out.append(float(n))
    return out


def habit_rates(
    checkins: list[tuple],
    windows: list[tuple[datetime, datetime]],
    now: datetime,
) -> list[tuple[float, float]]:
    """Con ≥2 asistencias en los 30 días que cierran el bucket / con ≥1 en el bucket."""
    out: list[tuple[float, float]] = []
    for start, end in windows:
        stop = _effective_end(end, now)
        denom_emails: set = set()
        for email, _event_id, ts in checkins:
            if ts is not None and _in_bucket(ts, start, stop):
                denom_emails.add(email)
        lookback_start = stop - HABIT_LOOKBACK
        events_by_email: dict[str, set] = {}
        for email, event_id, ts in checkins:
            if ts is None:
                continue
            if _in_bucket(ts, lookback_start, stop):
                events_by_email.setdefault(email, set()).add(event_id)
        num = sum(1 for email in denom_emails if len(events_by_email.get(email, ())) >= 2)
        out.append((float(num), float(len(denom_emails))))
    return out


def _day_cuts(start: datetime, end: datetime, now: datetime) -> list[tuple[datetime, datetime]]:
    """Un par (día, corte) por cada día transcurrido del bucket.

    El corte del último día es `now`, no su medianoche: el día en curso se lee
    hasta donde llegan los datos.
    """
    stop = _effective_end(end, now)
    out: list[tuple[datetime, datetime]] = []
    day = start
    while day < stop:
        out.append((day, min(day + timedelta(days=1), stop)))
        day += timedelta(days=1)
    if not out:
        out.append((start, stop))
    return out


def daily_trend(window: tuple[datetime, datetime], now: datetime, rates_fn) -> list[dict]:
    """La misma métrica recalculada con cortes sucesivos: cómo se armó el mes.

    Reusa la función de tasa tal cual, moviendo solo el `now`, así el acumulado
    diario no puede divergir de la cifra final.
    """
    points: list[dict] = []
    for day, cut in _day_cuts(window[0], window[1], now):
        (num, den), = rates_fn([window], cut)
        points.append(
            {
                "date": day.isoformat(),
                "as_of": cut.isoformat(),
                "value": (num / den) if den else None,
                "numerator": num,
                "denominator": den,
            }
        )
    return points


LIVE_LIMIT = 10
# `formulario.events` no guarda hora de fin, así que se asume la misma duración
# que Utopp Formulario (app/core/datetimes.ASSUMED_EVENT_DURATION_HOURS).
ASSUMED_EVENT_HOURS = 2


def _end_expression(db: Session) -> str:
    """`end_date_time` existe en el modelo de Formulario pero puede no estar aún
    en la base. Se usa si está; si no, se asume la duración por defecto."""
    try:
        row = db.execute(
            text(
                """
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'formulario'
                  AND table_name = 'events'
                  AND column_name = 'end_date_time'
                LIMIT 1
                """
            )
        ).first()
    except Exception:
        db.rollback()
        row = None
    fallback = f"e.date_time + INTERVAL '{ASSUMED_EVENT_HOURS} hours'"
    return f"COALESCE(e.end_date_time, {fallback})" if row is not None else fallback


def _fetch_active_events(db: Session, now: datetime) -> list[dict]:
    """Eventos en curso ahora mismo. Lo que hace que el panel esté 'en vivo'."""
    ends = _end_expression(db)
    rows = db.execute(
        text(
            f"""
            SELECT e.id::text AS id, e.title, e.location,
                   e.date_time AS starts_at, {ends} AS ends_at
            FROM formulario.events e
            WHERE COALESCE(e.is_draft, false) IS FALSE
              AND e.date_time IS NOT NULL
              AND e.date_time <= :now
              AND {ends} > :now
            ORDER BY e.date_time
            """
        ),
        {"now": now},
    ).all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "location": r.location,
            "starts_at": r.starts_at.astimezone(LIMA).isoformat() if r.starts_at else None,
            "ends_at": r.ends_at.astimezone(LIMA).isoformat() if r.ends_at else None,
        }
        for r in rows
    ]


def _fetch_live_feed(db: Session, now: datetime, limit: int = LIVE_LIMIT) -> dict:
    """Los movimientos más recientes: quién acaba de entrar y quién falta.

    Es el pulso operativo del panel, no una métrica: no se agrega ni se
    bucketea, solo se ordena por lo más nuevo.
    """
    check_ins = db.execute(
        text(
            """
            SELECT a.full_name AS name,
                   lower(a.email) AS email,
                   e.title AS event,
                   e.location AS location,
                   e.date_time AS event_at,
                   t.checked_in_at AS at
            FROM formulario.tickets t
            JOIN formulario.attendees a ON a.id = t.attendee_id
            JOIN formulario.events e ON e.id = a.event_id
            WHERE t.checked_in IS TRUE
              AND t.checked_in_at IS NOT NULL
              AND COALESCE(e.is_draft, false) IS FALSE
            ORDER BY t.checked_in_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).all()

    # Inscrito sin ticket marcado. El LEFT JOIN cubre al que ni siquiera lo tiene.
    pending = db.execute(
        text(
            """
            SELECT a.full_name AS name,
                   lower(a.email) AS email,
                   e.title AS event,
                   e.location AS location,
                   e.date_time AS event_at,
                   a.registered_at AS at
            FROM formulario.attendees a
            JOIN formulario.events e ON e.id = a.event_id
            LEFT JOIN formulario.tickets t ON t.attendee_id = a.id
            WHERE COALESCE(t.checked_in, false) IS FALSE
              AND COALESCE(e.is_draft, false) IS FALSE
            ORDER BY a.registered_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit},
    ).all()

    def shape(rows) -> list[dict]:
        return [
            {
                "name": r.name,
                "email": r.email,
                "event": r.event,
                "location": r.location,
                "event_at": r.event_at.astimezone(LIMA).isoformat() if r.event_at else None,
                "at": r.at.astimezone(LIMA).isoformat() if r.at else None,
            }
            for r in rows
        ]

    return {
        "active_events": _fetch_active_events(db, now),
        "check_ins": shape(check_ins),
        "pending": shape(pending),
    }


def _fetch_totals(db: Session) -> dict:
    row = db.execute(
        text(
            """
            SELECT
              (SELECT COUNT(*) FROM formulario.events e
                WHERE COALESCE(e.is_draft, false) IS FALSE) AS events,
              (SELECT COUNT(*) FROM formulario.attendees a
                 JOIN formulario.events e ON e.id = a.event_id
                WHERE COALESCE(e.is_draft, false) IS FALSE) AS signups
            """
        )
    ).first()
    return {"events": int(row.events), "signups": int(row.signups)}


# --------------------------------------------------------------------------- #
# Armado de la respuesta
# --------------------------------------------------------------------------- #


def _rate_block(
    windows: list[tuple[datetime, datetime]],
    per_window: list[tuple[float, float]],
    *,
    available: bool = True,
) -> dict:
    if not available:
        return {
            "available": False,
            "kind": "rate",
            "range": {"value": None, "delta_pct": None},
            "series": [],
            "trend": [],
        }
    series = []
    for (start, end), (num, den) in zip(windows, per_window):
        series.append(
            {
                "start": start.isoformat(),
                "end": end.isoformat(),
                "value": (num / den) if den else None,
                "numerator": num,
                "denominator": den,
            }
        )
    nums = [n for n, _ in per_window]
    dens = [d for _, d in per_window]
    return {
        "available": True,
        "kind": "rate",
        "range": {"value": pooled_rate(nums, dens), "delta_pct": None},
        "series": series,
        "trend": [],
    }


def _count_block(
    windows: list[tuple[datetime, datetime]],
    counts: list[float],
) -> dict:
    """Bloque de volumen. `denominator` va en 0: no hay tasa que calcular."""
    series = [
        {
            "start": start.isoformat(),
            "end": end.isoformat(),
            "value": count,
            "numerator": count,
            "denominator": 0.0,
        }
        for (start, end), count in zip(windows, counts)
    ]
    return {
        "available": True,
        "kind": "count",
        "range": {"value": float(sum(counts)), "delta_pct": None},
        "series": series,
        "trend": [],
    }


def _with_count_delta(block: dict, previous: list[float] | None) -> dict:
    if not previous:
        return block
    block["range"]["delta_pct"] = delta_pct(block["range"]["value"], float(sum(previous)))
    return block


def _with_delta(block: dict, previous: list[tuple[float, float]] | None) -> dict:
    if not block["available"] or not previous:
        return block
    prev_value = pooled_rate([n for n, _ in previous], [d for _, d in previous])
    block["range"]["delta_pct"] = delta_pct(block["range"]["value"], prev_value)
    return block


def _all_rates(
    windows: list[tuple[datetime, datetime]],
    *,
    events: list[tuple],
    published: list[tuple],
    signups: list[tuple],
    views: list[tuple],
    checkins: list[tuple],
    match_on: bool,
    now: datetime,
) -> dict[str, list[tuple[float, float]] | None]:
    return {
        "north_star": north_star_rates(events, windows, now),
        "useful_supply": useful_supply_rates(published, windows, now),
        "match": match_rates(signups, views, windows, now) if match_on else None,
        "habit": habit_rates(checkins, windows, now),
        # Volumen, no tasa: se guarda como (conteo, 0) para viajar en la misma forma.
        "events_created": [(c, 0.0) for c in events_created_counts(published, windows, now)],
    }


METRIC_KEYS = ("north_star", "useful_supply", "match", "habit")
COUNT_KEYS = ("events_created",)


def _month_payload(
    window: tuple[datetime, datetime],
    rates: dict[str, list[tuple[float, float]] | None],
    previous: dict[str, list[tuple[float, float]] | None] | None,
    *,
    now: datetime,
    trend_fns: dict | None = None,
) -> dict:
    start, end = window
    payload: dict = {
        "start": start.isoformat(),
        "end": end.isoformat(),
        "closed": end <= now,
        "as_of": _effective_end(end, now).isoformat(),
    }
    for key in METRIC_KEYS:
        per_window = rates.get(key)
        block = _rate_block([window], per_window or [], available=per_window is not None)
        _with_delta(block, previous.get(key) if previous else None)
        fn = (trend_fns or {}).get(key)
        if block["available"] and fn is not None:
            block["trend"] = daily_trend(window, now, fn)
        payload[key] = block
    for key in COUNT_KEYS:
        counts = [n for n, _ in rates.get(key) or []]
        block = _count_block([window], counts)
        prev = previous.get(key) if previous else None
        payload[key] = _with_count_delta(block, [n for n, _ in prev] if prev else None)
    return payload


def build_headline(
    months: list[tuple[datetime, datetime]],
    per_month: list[dict[str, list[tuple[float, float]] | None]],
    *,
    now: datetime,
    trend_fns: dict | None = None,
) -> dict:
    """Mes en curso + último mes cerrado, cada uno con su delta contra el anterior.

    Solo el mes en curso trae `trend`: es el único que sigue moviéndose.
    """
    current = _month_payload(
        months[-1],
        per_month[-1],
        per_month[-2] if len(per_month) > 1 else None,
        now=now,
        trend_fns=trend_fns,
    )
    previous = (
        _month_payload(months[-2], per_month[-2], per_month[-3] if len(per_month) > 2 else None, now=now)
        if len(months) > 1
        else None
    )
    return {"current": current, "previous": previous}


def list_metrics(
    db: Session,
    *,
    granularity: Granularity = "month",
    periods: int = 6,
    now: datetime | None = None,
) -> dict:
    periods = max(1, min(periods, 36))
    as_of = (now or datetime.now(LIMA)).astimezone(LIMA)

    windows = build_windows(granularity, periods, as_of)
    prev_windows = build_prev_windows(windows[0][0], granularity, periods)
    months = last_months(as_of, HEADLINE_MONTHS)

    fetch_start = min(prev_windows[0][0], months[0][0]) - HABIT_LOOKBACK
    fetch_end = max(windows[-1][1], months[-1][1])

    events = _fetch_event_rollup(db, fetch_start, fetch_end)
    checkins = _fetch_checkins(db, fetch_start, fetch_end)
    signups = _fetch_signups(db, fetch_start, fetch_end)
    published = _fetch_published(db, fetch_start, fetch_end)
    match_on = _match_available(db)
    views = _fetch_views(db, fetch_start, fetch_end) if match_on else []

    sources = {
        "events": events,
        "published": published,
        "signups": signups,
        "views": views,
        "checkins": checkins,
        "match_on": match_on,
        "now": as_of,
    }

    current = _all_rates(windows, **sources)
    previous = _all_rates(prev_windows, **sources)
    per_month = [_all_rates([m], **sources) for m in months]

    # Cada tasa recalculada moviendo solo el corte: alimenta el acumulado diario.
    trend_fns = {
        "north_star": lambda wins, at: north_star_rates(events, wins, at),
        "useful_supply": lambda wins, at: useful_supply_rates(published, wins, at),
        "match": (lambda wins, at: match_rates(signups, views, wins, at)) if match_on else None,
        "habit": lambda wins, at: habit_rates(checkins, wins, at),
    }

    payload: dict = {
        "timezone": str(LIMA),
        "granularity": granularity,
        "periods": periods,
        "as_of": as_of.isoformat(),
        "totals": _fetch_totals(db),
        "live": _fetch_live_feed(db, as_of),
        "headline": build_headline(months, per_month, now=as_of, trend_fns=trend_fns),
    }
    for key in METRIC_KEYS:
        per_window = current.get(key)
        block = _rate_block(windows, per_window or [], available=per_window is not None)
        payload[key] = _with_delta(block, previous.get(key))
    for key in COUNT_KEYS:
        counts = [n for n, _ in current.get(key) or []]
        prev = [n for n, _ in previous.get(key) or []]
        payload[key] = _with_count_delta(_count_block(windows, counts), prev)
    return payload
