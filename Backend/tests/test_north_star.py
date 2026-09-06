from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.services.north_star import (
    add_period,
    build_headline,
    build_prev_windows,
    build_windows,
    daily_trend,
    delta_pct,
    events_created_counts,
    habit_rates,
    last_months,
    match_rates,
    north_star_rates,
    pooled_rate,
    start_of_period,
    useful_supply_rates,
    _all_rates,
    _in_bucket,
)

LIMA = ZoneInfo("America/Lima")


def _sources(**over):
    base = {
        "events": [],
        "published": [],
        "signups": [],
        "views": [],
        "checkins": [],
        "match_on": False,
        "now": datetime(2026, 9, 6, 12, 0, tzinfo=LIMA),
    }
    base.update(over)
    return base


def test_pooled_rate_does_not_average_ratios():
    # 7/15, 4/10, 5/12, 8/21 → 24/58 = 0.4138, not mean of ratios
    rate = pooled_rate([7, 4, 5, 8], [15, 10, 12, 21])
    assert rate is not None
    assert abs(rate - 24 / 58) < 1e-9


def test_pooled_rate_empty_denominator():
    assert pooled_rate([1, 2], [0, 0]) is None


def test_delta_pct():
    assert delta_pct(12, 10) == 20
    assert delta_pct(10, 0) is None


def test_week_starts_monday_lima():
    # Thursday 13 Aug 2026 15:00 Lima
    now = datetime(2026, 8, 13, 15, 0, tzinfo=LIMA)
    start = start_of_period(now, "week")
    assert start.weekday() == 0
    assert start.date().isoformat() == "2026-08-10"
    assert add_period(start, "week").date().isoformat() == "2026-08-17"


def test_month_windows_start_on_the_first():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    windows = build_windows("month", 3, now)
    assert [w[0].date().isoformat() for w in windows] == [
        "2026-07-01",
        "2026-08-01",
        "2026-09-01",
    ]
    assert windows[-1][1].date().isoformat() == "2026-10-01"


def test_prev_windows_sit_immediately_before_the_range():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    windows = build_windows("month", 3, now)
    prev = build_prev_windows(windows[0][0], "month", 3)
    assert prev[-1][1] == windows[0][0]
    assert prev[0][0].date().isoformat() == "2026-04-01"


def test_bucket_uses_checkin_not_signup():
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    registered = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    checked = datetime(2026, 8, 12, 18, 0, tzinfo=timezone.utc)
    assert not _in_bucket(registered, start, end)
    assert _in_bucket(checked, start, end)


# --------------------------------------------------------------------------- #
# Estrella norte: el bucket lo fija la fecha del evento
# --------------------------------------------------------------------------- #


def test_north_star_buckets_by_event_date_not_by_signup_date():
    """Un evento de octubre no toca la cifra de septiembre, aunque sus
    inscritos se hayan registrado en septiembre."""
    now = datetime(2026, 10, 20, 12, 0, tzinfo=LIMA)
    sept = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    events = [
        # evento A: ocurre en septiembre, 3 de 10 asistieron
        ("a", datetime(2026, 9, 15, 19, 0, tzinfo=LIMA), 10.0, 3.0),
        # evento B: ocurre en octubre, 200 inscritos que se registraron en septiembre
        ("b", datetime(2026, 10, 10, 19, 0, tzinfo=LIMA), 200.0, 100.0),
    ]
    (num, den), = north_star_rates(events, [sept], now)
    assert (num, den) == (3.0, 10.0)


def test_north_star_ignores_events_that_have_not_happened_yet():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    events = [
        ("pasado", datetime(2026, 9, 3, 19, 0, tzinfo=LIMA), 8.0, 4.0),
        ("futuro", datetime(2026, 9, 25, 19, 0, tzinfo=LIMA), 500.0, 0.0),
    ]
    (num, den), = north_star_rates(events, [month], now)
    assert (num, den) == (4.0, 8.0)


def test_north_star_resets_each_month():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    windows = build_windows("month", 2, now)
    events = [
        ("ago", datetime(2026, 8, 12, 19, 0, tzinfo=LIMA), 10.0, 1.0),
        ("sep", datetime(2026, 9, 2, 19, 0, tzinfo=LIMA), 10.0, 9.0),
    ]
    rates = north_star_rates(events, windows, now)
    assert rates == [(1.0, 10.0), (9.0, 10.0)]


def test_north_star_pools_events_inside_the_month():
    now = datetime(2026, 10, 1, 12, 0, tzinfo=LIMA)
    sept = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    events = [
        ("e1", datetime(2026, 9, 5, 19, 0, tzinfo=LIMA), 15.0, 7.0),
        ("e2", datetime(2026, 9, 20, 19, 0, tzinfo=LIMA), 10.0, 4.0),
    ]
    (num, den), = north_star_rates(events, [sept], now)
    assert (num, den) == (11.0, 25.0)
    assert pooled_rate([num], [den]) == 11 / 25


def test_north_star_weekly_uses_the_same_event_rule():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    windows = build_windows("week", 2, now)
    events = [
        ("prev", datetime(2026, 8, 26, 19, 0, tzinfo=LIMA), 4.0, 2.0),
        ("cur", datetime(2026, 9, 2, 19, 0, tzinfo=LIMA), 6.0, 6.0),
    ]
    assert north_star_rates(events, windows, now) == [(2.0, 4.0), (6.0, 6.0)]


def test_north_star_month_without_finished_events_has_no_denominator():
    now = datetime(2026, 9, 2, 9, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    (num, den), = north_star_rates([], [month], now)
    assert (num, den) == (0.0, 0.0)
    assert pooled_rate([num], [den]) is None


# --------------------------------------------------------------------------- #
# Las otras tres
# --------------------------------------------------------------------------- #


def test_useful_supply_skips_events_whose_week_is_still_open():
    now = datetime(2026, 9, 20, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    published = [
        ("maduro", datetime(2026, 9, 1, 9, 0, tzinfo=LIMA), True),
        ("reciente", datetime(2026, 9, 18, 9, 0, tzinfo=LIMA), False),
    ]
    (num, den), = useful_supply_rates(published, [month], now)
    assert (num, den) == (1.0, 1.0)


def test_useful_supply_rate_one_of_two():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    created = datetime(2026, 8, 11, 9, 0, tzinfo=LIMA)
    published = [("e1", created, True), ("e2", created, False)]
    rates = useful_supply_rates(published, [(start, end)], now)
    assert rates[0] == (1.0, 2.0)


def test_habit_requires_two_events_in_30_days():
    now = datetime(2026, 8, 20, 12, 0, tzinfo=LIMA)
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    checkins = [
        ("a@utec.edu.pe", "e1", datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)),
        ("a@utec.edu.pe", "e2", datetime(2026, 8, 5, 12, 0, tzinfo=LIMA)),
        ("b@utec.edu.pe", "e1", datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)),
    ]
    num, den = habit_rates(checkins, [(start, end)], now)[0]
    assert (num, den) == (1.0, 2.0)


def test_match_counts_signups_over_unique_views():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    at = datetime(2026, 9, 3, 12, 0, tzinfo=LIMA)
    signups = [("a", "e1", at), ("b", "e1", at)]
    views = [(1, "e1", at), (1, "e1", at), (2, "e1", at), (3, "e1", at), (4, "e1", at)]
    assert match_rates(signups, views, [month], now)[0] == (2.0, 4.0)


def test_in_progress_bucket_never_counts_the_future():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    later = datetime(2026, 9, 20, 12, 0, tzinfo=LIMA)
    signups = [("a", "e1", later)]
    views = [(1, "e1", later)]
    assert match_rates(signups, views, [month], now)[0] == (0.0, 0.0)


# --------------------------------------------------------------------------- #
# Cabecera: mes en curso + mes cerrado
# --------------------------------------------------------------------------- #


def test_headline_pairs_current_month_with_the_closed_one():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    months = last_months(now, 3)
    events = [
        ("jul", datetime(2026, 7, 10, 19, 0, tzinfo=LIMA), 10.0, 2.0),
        ("ago", datetime(2026, 8, 10, 19, 0, tzinfo=LIMA), 10.0, 4.0),
        ("sep", datetime(2026, 9, 2, 19, 0, tzinfo=LIMA), 10.0, 6.0),
    ]
    per_month = [_all_rates([m], **_sources(events=events, now=now)) for m in months]
    head = build_headline(months, per_month, now=now)

    assert head["current"]["north_star"]["range"]["value"] == 0.6
    assert head["current"]["closed"] is False
    assert head["previous"]["north_star"]["range"]["value"] == 0.4
    assert head["previous"]["closed"] is True
    # 0.6 vs 0.4 → +50 %; 0.4 vs 0.2 → +100 %
    assert head["current"]["north_star"]["range"]["delta_pct"] == pytest.approx(50.0)
    assert head["previous"]["north_star"]["range"]["delta_pct"] == pytest.approx(100.0)


def test_headline_marks_match_unavailable_without_views():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    months = last_months(now, 3)
    per_month = [_all_rates([m], **_sources(now=now)) for m in months]
    head = build_headline(months, per_month, now=now)
    assert head["current"]["match"]["available"] is False
    assert head["current"]["north_star"]["available"] is True


# --------------------------------------------------------------------------- #
# Acumulado diario
# --------------------------------------------------------------------------- #


def test_daily_trend_ends_on_the_period_figure():
    """El último punto del acumulado es, por construcción, la cifra del mes."""
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    events = [
        ("e1", datetime(2026, 9, 2, 19, 0, tzinfo=LIMA), 10.0, 2.0),
        ("e2", datetime(2026, 9, 5, 19, 0, tzinfo=LIMA), 10.0, 8.0),
    ]
    fn = lambda wins, at: north_star_rates(events, wins, at)
    points = daily_trend(month, now, fn)

    # Un punto por día transcurrido, el último cortado en `now`.
    assert [p["date"][8:10] for p in points] == ["01", "02", "03", "04", "05", "06"]
    assert points[0]["value"] is None  # el día 1 aún no ocurre ningún evento
    assert points[1]["numerator"] == 2.0 and points[1]["denominator"] == 10.0
    assert points[-1]["numerator"] == 10.0 and points[-1]["denominator"] == 20.0
    (num, den), = north_star_rates(events, [month], now)
    assert points[-1]["value"] == num / den


def test_daily_trend_on_the_first_day_has_a_single_point():
    now = datetime(2026, 9, 1, 8, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    points = daily_trend(month, now, lambda wins, at: north_star_rates([], wins, at))
    assert len(points) == 1
    assert points[0]["value"] is None


def test_headline_current_carries_trend_and_previous_does_not():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    months = last_months(now, 3)
    events = [("e1", datetime(2026, 9, 2, 19, 0, tzinfo=LIMA), 10.0, 5.0)]
    src = _sources(events=events, now=now)
    per_month = [_all_rates([m], **src) for m in months]
    fns = {"north_star": lambda wins, at: north_star_rates(events, wins, at)}
    head = build_headline(months, per_month, now=now, trend_fns=fns)
    assert len(head["current"]["north_star"]["trend"]) == 6
    assert head["previous"]["north_star"]["trend"] == []
    # Una métrica sin fn de trend queda con la lista vacía, no rota.
    assert head["current"]["habit"]["trend"] == []


# --------------------------------------------------------------------------- #
# Eventos creados (volumen)
# --------------------------------------------------------------------------- #


def test_events_created_counts_publications_without_maturity_filter():
    """A diferencia de Oferta útil, aquí sí entra lo recién publicado."""
    now = datetime(2026, 9, 12, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    published = [
        ("maduro", datetime(2026, 9, 1, 9, 0, tzinfo=LIMA), True),
        ("reciente", datetime(2026, 9, 10, 9, 0, tzinfo=LIMA), False),
    ]
    assert events_created_counts(published, [month], now) == [2.0]
    # Oferta útil, en cambio, descarta al que aún tiene la ventana abierta.
    assert useful_supply_rates(published, [month], now) == [(1.0, 1.0)]


def test_events_created_ignores_the_future_part_of_the_bucket():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    month = (datetime(2026, 9, 1, tzinfo=LIMA), datetime(2026, 10, 1, tzinfo=LIMA))
    published = [("futuro", datetime(2026, 9, 20, 9, 0, tzinfo=LIMA), False)]
    assert events_created_counts(published, [month], now) == [0.0]


def test_headline_carries_events_created_as_a_count_block():
    now = datetime(2026, 9, 6, 12, 0, tzinfo=LIMA)
    months = last_months(now, 3)
    published = [
        ("a", datetime(2026, 8, 3, 9, 0, tzinfo=LIMA), True),
        ("b", datetime(2026, 8, 9, 9, 0, tzinfo=LIMA), True),
        ("c", datetime(2026, 9, 2, 9, 0, tzinfo=LIMA), True),
    ]
    per_month = [_all_rates([m], **_sources(published=published, now=now)) for m in months]
    head = build_headline(months, per_month, now=now)
    assert head["current"]["events_created"]["kind"] == "count"
    assert head["current"]["events_created"]["range"]["value"] == 1.0
    assert head["previous"]["events_created"]["range"]["value"] == 2.0
    # 1 vs 2 → -50 %
    assert head["current"]["events_created"]["range"]["delta_pct"] == pytest.approx(-50.0)
