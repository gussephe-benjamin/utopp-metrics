from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.services.north_star import (
    add_period,
    build_windows,
    compute_lifetime,
    delta_pct,
    north_star_rates,
    pooled_rate,
    start_of_period,
    useful_supply_rates,
    _habit_per_window,
    _in_bucket,
)

LIMA = ZoneInfo("America/Lima")


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


def test_windows_include_current_and_go_backward():
    now = datetime(2026, 8, 15, 12, 0, tzinfo=LIMA)
    windows = build_windows("week", 4, now)
    assert len(windows) == 4
    assert windows[-1][0].date().isoformat() == "2026-08-10"
    assert windows[0][0].date().isoformat() == "2026-07-20"


def test_bucket_uses_checkin_not_signup():
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    registered = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    checked = datetime(2026, 8, 12, 18, 0, tzinfo=timezone.utc)
    assert not _in_bucket(registered, start, end)
    assert _in_bucket(checked, start, end)


def test_habit_requires_two_events_in_30_days():
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    checkins = [
        ("a@utec.edu.pe", "e1", datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)),
        ("a@utec.edu.pe", "e2", datetime(2026, 8, 5, 12, 0, tzinfo=LIMA)),
        ("b@utec.edu.pe", "e1", datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)),
    ]
    pairs = _habit_per_window(checkins, [(start, end)], yearly=False)
    num, den = pairs[0]
    assert den == 2
    assert num == 1


def test_north_star_rate_two_of_four():
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    in_week = datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)
    checkins = [
        ("a@utec.edu.pe", "e1", in_week),
        ("b@utec.edu.pe", "e1", in_week),
    ]
    signups = [
        ("a@utec.edu.pe", "e1", in_week),
        ("b@utec.edu.pe", "e1", in_week),
        ("c@utec.edu.pe", "e1", in_week),
        ("d@utec.edu.pe", "e2", in_week),
    ]
    rates = north_star_rates(checkins, signups, [(start, end)])
    assert rates[0] == (2.0, 4.0)
    assert pooled_rate([2], [4]) == 0.5


def test_useful_supply_rate_one_of_two():
    start = datetime(2026, 8, 10, 0, 0, tzinfo=LIMA)
    end = datetime(2026, 8, 17, 0, 0, tzinfo=LIMA)
    created = datetime(2026, 8, 11, 9, 0, tzinfo=LIMA)
    published = [
        ("e1", created, True),
        ("e2", created, False),
    ]
    rates = useful_supply_rates(published, [(start, end)])
    assert rates[0] == (1.0, 2.0)
    assert pooled_rate([1], [2]) == 0.5


def test_lifetime_ignores_period_windows():
    first = datetime(2026, 1, 5, 10, 0, tzinfo=LIMA)
    now = datetime(2026, 8, 15, 12, 0, tzinfo=LIMA)
    old = datetime(2026, 2, 1, 12, 0, tzinfo=LIMA)
    recent = datetime(2026, 8, 12, 12, 0, tzinfo=LIMA)
    checkins = [
        ("a@utec.edu.pe", "e1", old),
        ("b@utec.edu.pe", "e1", recent),
    ]
    signups = [
        ("a@utec.edu.pe", "e1", old),
        ("b@utec.edu.pe", "e1", recent),
        ("c@utec.edu.pe", "e2", old),
        ("d@utec.edu.pe", "e2", old),
    ]
    published = [
        ("e1", first, True),
        ("e2", old, False),
    ]
    lt = compute_lifetime(
        first_event_at=first,
        last_event_at=old,
        now=now,
        checkins=checkins,
        signups=signups,
        published=published,
        views=[],
        match_on=False,
    )
    assert lt["north_star"]["range"]["value"] == 0.5
    assert lt["useful_supply"]["range"]["value"] == 0.5
    assert lt["north_star"]["range"]["delta_pct"] is None
    assert lt["match"]["available"] is False
    assert lt["habit"]["range"]["value"] == 0.0
    assert not lt["north_star"]["series"]

    windows_8 = build_windows("week", 8, now)
    windows_4 = build_windows("week", 4, now)
    assert len(windows_8) != len(windows_4)
    temporal_4 = north_star_rates(checkins, signups, windows_4)
    assert pooled_rate([n for n, _ in temporal_4], [d for _, d in temporal_4]) == 1.0
    again = compute_lifetime(
        first_event_at=first,
        last_event_at=old,
        now=now,
        checkins=checkins,
        signups=signups,
        published=published,
        views=[],
        match_on=False,
    )
    assert again["north_star"]["range"]["value"] == lt["north_star"]["range"]["value"]