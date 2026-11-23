"""«Oshxona» forecast — how many people the hours still ahead of today will hold.

Learned from `kitchen_history` (the plant's attendance as counts, per past day
and shift window) and checked against two years of it on 2026-11-23: replayed
from eight hours of each day, the schedules alone (everybody scheduled comes on
time and leaves at the end) missed the hours ahead of 1 June – 21 November 2026
by 186 people (18.5 %), this by 26 (2.6 %); on 16 February – 10 November 2025,
which no constant was tuned on, 160 against 31 (3.4 %).

Four things decide an hour ahead:
- HOW MANY of a shift's scheduled people come — per shift window and weekday,
  over the last LOOKBACK days, holidays left out (79 % across the plant, 71 %
  on a Sunday, 51 % on «09:00–18:00»);
- WHEN they come and go — each window's own clock-in offsets from its start
  and clock-out offsets from its end (a quarter stay past the end, one in
  twenty leaves an hour early), the plant's pooled offsets blended in where a
  window has little history. Overtime runs in spells (the share of «08:00–
  17:00» still in at 18:00 two days apart correlates 0.70), so a big window's
  leave times lean on its newest RECENT stored days;
- THE HOLIDAY — only three empty the plant, and each the same way every year
  (of a normal day of its weekday): New Year's Eve 0.18 / 0.20, Ramazon hayit
  0.44 / 0.47, Qurbon hayit 0.59 / 0.69, from two days before to five after;
  Navruz, 8 March, 9 May, 1 September and 1 October stay at 0.90 and more. A
  day on such a ramp takes, window by window, how the same day of the same
  holiday came in earlier years (on 31 Dec «08:00–17:00» came 0.12 both years,
  «17:00–02:00» nobody). The Eids move: they are CALCULATED from the moon
  (`calculated`) and, from three days before each, confirmed by the
  President's decree that names it (`eid_dates`), which comes out 2–7 days
  ahead; a past one is settled on the day the plant emptied. On the three
  holidays of the second year this misses 57 people an hour instead of 89 —
  68 instead of 149 at 06:00, before the day shows itself;
- THE DAY ITSELF — the windows already under way (yesterday's at half weight)
  against their expected turnout.

Arrivals and departures are paired by rank — the first in is the first out —
so a «07:00–07:00» schedule worked as two 12-hour halves reads right from its
counts alone. With no history (a box without the table filled) the model is
the schedules: everybody comes at the start and leaves at the end.
"""
from __future__ import annotations

import bisect
import html
import logging
import math
import re
import statistics
import time as clock
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from typing import Iterable

import httpx
from sqlalchemy.orm import Session

log = logging.getLogger(__name__)

LOOKBACK = 84        # days of history the model learns from
LAG = 2              # the newest stored day is this old (`kitchen_history.LAG_DAYS`)
HOLIDAY = 0.85       # a day whose turnout is below this share of the median teaches nothing
RATE_PRIOR = 20      # scheduled people pulling a window's weekday rate toward its overall one
SHAPE_PRIOR = 100    # clock-ins pulling a window's own offsets toward the plant's
DAY_PRIOR = 150      # expected arrivals pulling the day's own factor toward 1
STARTED = 0.5        # a window speaks for the day once this share of its comers is usually in
YESTERDAY = 0.5      # …and yesterday's windows at this weight
RECENT = 5           # the newest stored days whose leave times weigh most…
RECENT_WEIGHT = 0.8  # …this much…
RECENT_MIN = 100     # …in a window with this many comers a day among them
RAMP = range(-2, 6)  # a holiday reaches from two days before it to five after
HOL_PRIOR = 50       # expected people pulling a window's holiday factor toward the day's
YEARS_BACK = 5       # earlier years of a holiday that teach this one
# The Eids are CALCULATED (`calculated`), then confirmed by the President's decree that names
# each one, published 2–7 days before it: the decisions list, newest first.
DECREES_URL = "https://president.uz/oz/site/document/2?menu_id=144"
HAYIT = {"ramazon": "Ramazon hayit", "qurbon": "Qurbon hayit"}
MONTHS = ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr",
          "oktabr", "noyabr", "dekabr")
CHECK = range(-3, 6)   # days around a calculated Eid on which its decree is looked for
DECREE_TTL_S = 3600    # «no decree yet» (or no answer) is asked again after this long


class Curve:
    """The share of a histogram {minute offset: count} lying BEFORE x."""

    def __init__(self, hist: dict):
        self.keys = sorted(hist)
        self.cum, run = [], 0.0
        for k in self.keys:
            run += hist[k]
            self.cum.append(run)
        self.total = run

    def __call__(self, x: float) -> float:
        i = bisect.bisect_left(self.keys, x)
        return self.cum[i - 1] / self.total if i and self.total else 0.0


# No history: everybody scheduled comes at the start, leaves at the end; nobody unscheduled comes.
DEFAULT = {"windows": {}, "pool": ([1.0] * 7, Curve({-10: 1}), Curve({-10: 1})),
           "null": (Curve({}), Curve({}), [0.0] * 7)}


def _window(starts: str, ends: str) -> tuple[int, int]:
    """Minutes since the day's 00:00; an end not after the start is the next morning's."""
    a, b = (int(hm[:2]) * 60 + int(hm[3:5]) for hm in (starts, ends))
    return a, b if b > a else b + 1440


def _mix(a: dict, b: dict, wa: float) -> dict:
    """Two histograms as shares, `wa` of the first and the rest of the second."""
    n, m = sum(a.values()), sum(b.values())
    if not n or not m:
        return dict(a or b)
    out: Counter = Counter()
    for k, v in a.items():
        out[k] += wa * v / n
    for k, v in b.items():
        out[k] += (1 - wa) * v / m
    return out


def _blend(own: Counter, pool: Counter) -> dict:
    """A window's own offsets, pulled toward the plant's by SHAPE_PRIOR."""
    n = sum(own.values())
    return _mix(own, pool, n / (n + SHAPE_PRIOR))


def learn(rows: Iterable, today: date) -> dict:
    """`rows`: (day, starts, ends, planned, came, no_out, arr, dep) of `kitchen_history`."""
    last = today - timedelta(days=LAG)
    first = last - timedelta(days=LOOKBACK - 1)
    by_day = defaultdict(list)
    for r in rows:
        if first <= r[0] <= last:
            by_day[r[0]].append(r)
    share = {d: sum(r[4] for r in rs if r[1]) / max(1, sum(r[3] for r in rs if r[1]))
             for d, rs in by_day.items()}
    if not share:
        return DEFAULT
    floor = HOLIDAY * statistics.median(share.values())
    pc = defaultdict(lambda: [[0, 0] for _ in range(8)])     # window → weekday (7 = any) → [planned, came]
    arr, dep = defaultdict(Counter), defaultdict(Counter)    # window → offset from start / end → count
    p_arr, p_dep = Counter(), Counter()
    n_arr, n_dep, n_came = Counter(), Counter(), defaultdict(list)
    recent = defaultdict(Counter)                             # window → its newest days' leave offsets
    for d, rs in by_day.items():
        if (last - d).days < RECENT:
            for _, s, e, _p, _c, no_out, _a, b in rs:
                if s:
                    e0 = _window(s, e)[1]
                    for k, v in b.items():
                        recent[(s, e)][int(k) - e0] += v
                    recent[(s, e)][0] += no_out
        if share[d] < floor:
            continue
        wd = d.weekday()
        for _, s, e, planned, came, no_out, a, b in rs:
            if not s:
                n_came[wd].append(came)
                for k, v in a.items():
                    n_arr[int(k)] += v
                for k, v in b.items():
                    n_dep[int(k)] += v
                continue
            w = (s, e)
            s0, e0 = _window(s, e)
            for i in (wd, 7):
                pc[w][i][0] += planned
                pc[w][i][1] += came
            for k, v in a.items():
                arr[w][int(k) - s0] += v
                p_arr[int(k) - s0] += v
            for k, v in b.items():
                dep[w][int(k) - e0] += v
                p_dep[int(k) - e0] += v
            if no_out:                                        # never clocked out: gone at the end
                dep[w][0] += no_out
                p_dep[0] += no_out
    tot = [(sum(v[i][0] for v in pc.values()), sum(v[i][1] for v in pc.values())) for i in range(8)]
    g = [c / p if p else 1.0 for p, c in tot]

    def rates(v: list) -> list[float]:
        out = []
        for i in range(7):
            overall = (v[7][1] + RATE_PRIOR * g[i]) / (v[7][0] + RATE_PRIOR)
            out.append((v[i][1] + RATE_PRIOR * overall) / (v[i][0] + RATE_PRIOR))
        return out

    def leave(w: tuple) -> Curve:
        usual = _blend(dep[w], p_dep)
        near = recent.get(w)
        if near and sum(near.values()) >= RECENT_MIN * RECENT:
            return Curve(_mix(near, usual, RECENT_WEIGHT))
        return Curve(usual)

    every = [c for v in n_came.values() for c in v]
    comers = [statistics.mean(n_came[i]) if n_came[i] else (statistics.mean(every) if every else 0.0)
              for i in range(7)]
    return {"windows": {w: (rates(v), Curve(_blend(arr[w], p_arr)), leave(w))
                        for w, v in pc.items()},
            "pool": (g[:7], Curve(p_arr), Curve(p_dep)) if p_arr else DEFAULT["pool"],
            "null": (Curve(n_arr), Curve(n_dep), comers)}


def _sin(deg: float) -> float:
    return math.sin(math.radians(deg))


def _new_moon(k: int) -> datetime:
    """UTC moment of new moon number k (0 = 6 Jan 2000) — Meeus, Astronomical Algorithms, ch. 49."""
    t = k / 1236.85
    jde = 2451550.09766 + 29.530588861 * k + 0.00015437 * t ** 2 - 0.00000015 * t ** 3 + 0.00000000073 * t ** 4
    e = 1 - 0.002516 * t - 0.0000074 * t ** 2
    m = 2.5534 + 29.1053567 * k - 0.0000014 * t ** 2 - 0.00000011 * t ** 3
    mp = 201.5643 + 385.81693528 * k + 0.0107582 * t ** 2 + 0.00001238 * t ** 3 - 0.000000058 * t ** 4
    f = 160.7108 + 390.67050284 * k - 0.0016118 * t ** 2 - 0.00000227 * t ** 3 + 0.000000011 * t ** 4
    om = 124.7746 - 1.56375588 * k + 0.0020672 * t ** 2 + 0.00000215 * t ** 3
    jde += (-0.4072 * _sin(mp) + 0.17241 * e * _sin(m) + 0.01608 * _sin(2 * mp) + 0.01039 * _sin(2 * f)
            + 0.00739 * e * _sin(mp - m) - 0.00514 * e * _sin(mp + m) + 0.00208 * e * e * _sin(2 * m)
            - 0.00111 * _sin(mp - 2 * f) - 0.00057 * _sin(mp + 2 * f) + 0.00056 * e * _sin(2 * mp + m)
            - 0.00042 * _sin(3 * mp) + 0.00042 * e * _sin(m + 2 * f) + 0.00038 * e * _sin(m - 2 * f)
            - 0.00024 * e * _sin(2 * mp - m) - 0.00017 * _sin(om) - 0.00007 * _sin(mp + 2 * m)
            + 0.00004 * _sin(2 * mp - 2 * f) + 0.00004 * _sin(3 * m) + 0.00003 * _sin(mp + m - 2 * f)
            + 0.00003 * _sin(2 * mp + 2 * f) - 0.00003 * _sin(mp + m + 2 * f) + 0.00003 * _sin(mp - m + 2 * f)
            - 0.00002 * _sin(mp - m - 2 * f) - 0.00002 * _sin(3 * mp + m) + 0.00002 * _sin(4 * mp))
    planets = ((325, 299.77 + 0.107408 * k - 0.009173 * t ** 2), (165, 251.88 + 0.016321 * k),
               (164, 251.83 + 26.651886 * k), (126, 349.42 + 36.412478 * k), (110, 84.66 + 18.206239 * k),
               (62, 141.74 + 53.303771 * k), (60, 207.14 + 2.453732 * k), (56, 154.84 + 7.30686 * k),
               (47, 34.52 + 27.261239 * k), (42, 207.19 + 0.121824 * k), (40, 291.34 + 1.844379 * k),
               (37, 161.72 + 24.198154 * k), (35, 239.56 + 25.513099 * k), (23, 331.55 + 3.592518 * k))
    jde += sum(w * 1e-6 * _sin(x) for w, x in planets)
    return datetime(2000, 1, 1, 12) + timedelta(days=jde - 2451545.0, seconds=-69)   # TT → UT


def _sunset_mecca(d: date) -> datetime:
    """UTC sunset at Mecca, NOAA's approximation (about a minute)."""
    g = 2 * math.pi / 365 * (d.timetuple().tm_yday - 0.5)
    eqt = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                    - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    decl = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g)
            + 0.000907 * math.sin(2 * g) - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    lat = math.radians(21.4225)
    ha = math.degrees(math.acos(math.cos(math.radians(90.833)) / (math.cos(lat) * math.cos(decl))
                                - math.tan(lat) * math.tan(decl)))
    return datetime.combine(d, time()) + timedelta(minutes=720 - 4 * (39.8262 - ha) - eqt)


def _month_start(near: date) -> date:
    """The first day of the lunar month whose new moon is nearest `near`: the day after the new
    moon when it falls before sunset at Mecca, else the day after that."""
    nm = _new_moon(round((near - date(2000, 1, 6)).days / 29.530588861))
    day = (nm + timedelta(hours=3)).date()                    # its day in Mecca
    return day + timedelta(days=1 if nm < _sunset_mecca(day) else 2)


def _tabular(year: int, month: int) -> date:
    """The 1st of a month of the arithmetic Islamic calendar (±2 days) — it only tells which
    new moon starts which month."""
    jd = math.ceil(29.5 * (month - 1)) + (year - 1) * 354 + (3 + 11 * year) // 30 + 1948439.5
    return date(2000, 1, 1) + timedelta(days=int(jd - 2451544.5))


def calculated(years: range) -> dict[str, list[date]]:
    """{kind: first days} of the two Eids in these Gregorian years, from the moon. Matches every
    decree of 2024–2026 (and the public calendar's 2021–2023), where Google and timeanddate put
    Qurbon hayit 2025 on 7 June — the decree, and the plant, kept the 6th."""
    out = {"ramazon": [], "qurbon": []}
    for h in range(years.start - 580, years.stop - 577):
        for kind, d in (("ramazon", _month_start(_tabular(h, 10) - timedelta(days=1))),
                        ("qurbon", _month_start(_tabular(h, 12) - timedelta(days=1)) + timedelta(days=9))):
            if d.year in years:
                out[kind].append(d)
    return {k: sorted(v) for k, v in out.items()}


def parse_decree(page: str, kind: str, near: date):
    """The Eid's first day as a decree's text names it («2025-yilda muborak Qurbon hayitining
    birinchi kuni 6-iyun …», «Joriy yilda Ramazon hayitining birinchi kuni 20-mart …»), when it
    lies within two days of the calculated `near`; anything else is no answer."""
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(page)))
    m = re.search(HAYIT[kind] + r"\w*\s+birinchi\s+kuni\s+(\d{1,2})-(\w+)", text, re.I)
    if not m or m.group(2).lower() not in MONTHS:
        return None
    month, day = MONTHS.index(m.group(2).lower()) + 1, int(m.group(1))
    try:
        got = min((date(y, month, day) for y in (near.year - 1, near.year, near.year + 1)),
                  key=lambda d: abs((d - near).days))
    except ValueError:
        return None
    return got if abs((got - near).days) <= 2 else None


def _decree(kind: str, near: date):
    """The decree naming this Eid, from the decisions list (its «… hayitini nishonlash
    to'g'risida»); None while it is not out."""
    with httpx.Client(timeout=8, follow_redirects=True) as cl:
        page = cl.get(DECREES_URL)
        page.raise_for_status()
        for href, title in re.findall(r'href="(/oz/lists/view/\d+)"[^>]*>(.*?)</a>', page.text, re.S):
            title = html.unescape(re.sub(r"<[^>]+>", " ", title)).lower()
            if HAYIT[kind].lower() in title and "nishonlash" in title:
                doc = cl.get("https://president.uz" + href)
                doc.raise_for_status()
                got = parse_decree(doc.text, kind, near)
                if got:
                    return got
    return None


_decrees: dict = {}     # (kind, calculated day) → (asked again after, the decree's day or None)


def eid_dates(today: date) -> tuple[dict, bool]:
    """The Eids as the forecast takes them: calculated, and from three days before each one to
    five after, the decree's day once it is out. The second answer is False while one near today
    is still unconfirmed (no decree yet, or no answer), so the model is learned again soon."""
    eids = calculated(range(today.year - YEARS_BACK, today.year + 2))
    settled = True
    for kind, days in eids.items():
        for i, d in enumerate(days):
            if (today - d).days not in CHECK:
                continue
            until, got = _decrees.get((kind, d), (0.0, None))
            if not got and clock.monotonic() >= until:
                try:
                    got = _decree(kind, d)
                except Exception as exc:  # noqa: BLE001 — the calculation stands
                    log.warning("kitchen-forecast: the decree list did not answer (%s)", exc)
                if got and got != d:
                    log.info("kitchen-forecast: %s is on %s by decree, not the calculated %s", kind, got, d)
                _decrees[(kind, d)] = (clock.monotonic() + DECREE_TTL_S, got)
            if got:
                days[i] = got
            settled = settled and bool(got)
    return eids, settled


def ramp_day(day: date, eids: dict):
    """(kind, offset, first day) when `day` lies within RAMP of New Year's Eve or an Eid."""
    for off in RAMP:
        d0 = day - timedelta(days=off)
        if (d0.month, d0.day) == (12, 31):
            return "new_year", off, d0
        for kind, ds in eids.items():
            if d0 in ds:
                return kind, off, d0
    return None


def _turnout(rs: list) -> float:
    return sum(r[4] for r in rs if r[1]) / max(1, sum(r[3] for r in rs if r[1]))


def _settle(rows_between, d0: date) -> date:
    """A past Eid as the plant lived it: the emptiest of the given day and its neighbours."""
    rs = rows_between(d0 - timedelta(days=1), d0 + timedelta(days=1))
    days = defaultdict(list)
    for r in rs:
        days[r[0]].append(r)
    if len(days) < 3:
        return d0
    return min(days, key=lambda d: (_turnout(days[d]), abs((d - d0).days)))


def holidays(rows_between, today: date, eids: dict) -> dict:
    """Yesterday and today, when on a holiday's ramp → (day factor, {window: factor}): how the
    same day of the same holiday came in earlier years against what the model expected of it.
    `rows_between(first, last)` reads `kitchen_history`; a day on no ramp reads nothing."""
    last = today - timedelta(days=LAG)
    out = {}
    for day in (today - timedelta(days=1), today):
        hit = ramp_day(day, eids)
        if not hit:
            continue
        kind, off, d0 = hit
        if kind == "new_year":
            before = [date(y, 12, 31) for y in range(d0.year - YEARS_BACK, d0.year)]
        else:
            before = [_settle(rows_between, d) for d in eids[kind] if d0.year - YEARS_BACK <= d.year < d0.year]
        exp = came = 0.0
        per: dict = defaultdict(lambda: [0.0, 0.0])
        for past in before:
            d = past + timedelta(days=off)
            if d > last:
                continue
            rs = rows_between(d - timedelta(days=LAG + LOOKBACK - 1), d)
            seen = [r for r in rs if r[0] == d]
            if not seen:
                continue
            m = learn(rs, d)
            for _, s, e, planned, c, *_ in seen:
                if s and planned:
                    x = planned * (m["windows"].get((s, e)) or m["pool"])[0][d.weekday()]
                    exp += x; came += c
                    per[(s, e)][0] += x; per[(s, e)][1] += c
        if exp:
            f = came / exp
            out[day] = (f, {w: (c + HOL_PRIOR * f) / (x + HOL_PRIOR) for w, (x, c) in per.items()})
    return out


def _stay(in_now: float, out_now: float, out_t: float) -> float:
    """The share of those in now still in at t — first in, first out."""
    if in_now - out_now >= 0.05:
        return min(1.0, max(0.0, (in_now - out_t) / (in_now - out_now)))
    return min(1.0, max(0.0, (1 - out_t) / (1 - out_now))) if out_now < 1 else 0.0


def expect(now: datetime, groups: dict, model: dict) -> dict[int, float]:
    """Hour of today still ahead → the people expected in at its start.
    `groups`: (day, starts, ends) → [planned, arrived, in now], read today for
    yesterday's and today's rows; ("", "") holds the people with no window."""
    today = now.date()
    x = (now - datetime.combine(today, time())).total_seconds() / 60
    hours = [h for h in range(24) if h * 60 > x]
    windows, pool = model["windows"], model["pool"]
    hol = model.get("hol") or {}

    def hf(day, w=None):
        f = hol.get(day)
        return 1.0 if not f else (f[0] if w is None else f[1].get(w, f[0]))

    obs = exp = 0.0                                          # the day's own factor
    for (day, s, e), (planned, arrived, _) in groups.items():
        if not s or not planned:
            continue
        rate, fa, _ = windows.get((s, e)) or pool
        share = fa(x - _window(s, e)[0] - (day - today).days * 1440)
        if share >= STARTED:
            w = 1.0 if day == today else YESTERDAY
            obs += w * arrived
            exp += w * planned * rate[day.weekday()] * hf(day, (s, e)) * share
    factor = (obs + DAY_PRIOR) / (exp + DAY_PRIOR)

    out = dict.fromkeys(hours, 0.0)
    for (day, s, e), (planned, arrived, present) in groups.items():
        off = (day - today).days * 1440
        if not s:
            fa, fd, comers = model["null"]
            in_now, out_now = fa(x - off), fd(x - off)
            come = comers[today.weekday()] * hf(today) * factor if day == today else 0.0
            for h in hours:
                out_t = fd(h * 60 - off)
                out[h] += present * _stay(in_now, out_now, out_t) \
                    + come * max(0.0, fa(h * 60 - off) - max(in_now, out_t))
            continue
        rate, fa, fd = windows.get((s, e)) or pool
        s0, e0 = (m + off for m in _window(s, e))
        r = min(1.0, rate[day.weekday()] * hf(day, (s, e)) * factor)
        in_now, out_now = fa(x - s0), fd(x - e0)
        waiting = max(0, planned - arrived)
        for h in hours:
            out_t = fd(h * 60 - e0)
            out[h] += present * _stay(in_now, out_now, out_t)
            if waiting:                                      # of those not in yet, the ones still to come
                out[h] += waiting * r * max(0.0, fa(h * 60 - s0) - max(in_now, out_t)) \
                    / max(1e-9, 1 - r * in_now)
    return out


_cache: tuple = (None, DEFAULT, 0.0)


def load(db: Session, today: date) -> dict:
    """Today's model — learned once a day, since the history grows by a day a day; again after
    DECREE_TTL_S while an Eid near today waits for its decree."""
    global _cache
    if _cache[0] == today and clock.monotonic() < _cache[2]:
        return _cache[1]
    from app.models import KitchenHistory as K

    def rows_between(first: date, last: date) -> list:
        return db.query(K.day, K.starts, K.ends, K.planned, K.came, K.no_out, K.arr, K.dep) \
            .filter(K.day >= first, K.day <= last).all()
    db.rollback()                                    # the caller's reads: no transaction held across the decree read
    eids, settled = eid_dates(today)
    try:
        model = dict(learn(rows_between(today - timedelta(days=LAG + LOOKBACK - 1), today), today))
        model["hol"] = holidays(rows_between, today, eids)
        _cache = (today, model, clock.monotonic() + (86400 if settled else DECREE_TTL_S))
    except Exception:  # noqa: BLE001 — the schedules still forecast; the next read learns again
        db.rollback()
        log.exception("kitchen-forecast: learning from the history failed")
        return DEFAULT
    return model
