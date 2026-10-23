"""⚠ TEMPORARY (2026-10-23): which personal fields Verifix's employee list
carries, printed into the deploy job's log — the one window onto production a
cloud session can read.

The Workers page is getting a «who works here» analysis (gender, age, years at
Safia, where people live) read from `core/employee$list`. Gender, birthday and
hiring date are known fields; WHERE A PERSON LIVES has never been read on this
platform, so its field names (an address text? a region id? both?) and the
shape of `pro/region$list` are confirmed here before the analysis relies on
them.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_vfx_person_fields.py`. READ-ONLY: reads Verifix with
the stored credential, writes nothing. No PERSON leaves it: no name, phone,
document, date of birth or address is printed — only field NAMES, fill counts,
the values of low-cardinality coded fields (gender, status, region ids), and
LOCALITY words counted over everybody («Chilonzor tumani · 112»). Region names
from `pro/region$list` are geography, not people. Lives under deploy/ so adding
it restarts nothing. Delete it with its step.
"""
from __future__ import annotations

import os
import re
import sys
import time
import traceback
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.services import verifix  # noqa: E402
from app.version import APP_VERSION  # noqa: E402

BUDGET_S = 140.0
T0 = time.monotonic()
TAG = "[VFX-FIELDS]"
MAX_EMP_PAGES = 8          # 4,000 people — the whole working list is ~3,000

# Fields whose VALUES may be printed (coded, low cardinality, not a person).
SAFE_VALUES = re.compile(r"(gender|status|region|district|city|town|country|nationality|citizenship|"
                         r"marital|medical|has_|is_|kind|type|state|fte|lang)", re.I)
# Never print a value of these, however few distinct values they have.
NEVER = re.compile(r"(name|phone|mail|npin|pinfl|tin|iapa|passport|document|birth|address|photo|"
                   r"sha|code|_id$|^id$|date|card|account|inn|street|house|apartment|flat)", re.I)
PLACEISH = re.compile(r"(address|region|district|city|town|place|live|resid|regist|propis|locat|"
                      r"mahalla|village|country)", re.I)
# A locality word and the word before it: «Chilonzor tumani», «Яшнабадский район».
LOCALITY = re.compile(
    r"([A-Za-zА-Яа-яЁёЎўҚқҒғҲҳʻʼ'`’\-]{3,}\s+(?:tumani|tuman|t\.|shahri|shahar|sh\.|viloyati|viloyat|vil\.|"
    r"район|р-н|р\-н|город|г\.|область|обл\.|туман[и]?|шаҳри|шахри|вилояти|mahallasi|маҳалла|qishlog'i|qishlogi))",
    re.I)


def say(*a):
    print(TAG, *a, flush=True)


def left() -> float:
    return BUDGET_S - (time.monotonic() - T0)


def kind_of(v) -> str:
    if v is None or v == "":
        return "empty"
    if isinstance(v, dict):
        return "dict"
    if isinstance(v, list):
        return "list"
    return type(v).__name__


def filled(v) -> bool:
    return not (v is None or v == "" or v == [] or v == {})


def main() -> None:
    say(f"app {APP_VERSION}")
    db = SessionLocal()
    try:
        cfg = verifix.config(db, with_password=True)
    finally:
        db.close()
    if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
        say("Verifix is not configured — nothing to probe")
        return
    say("host", cfg["host"])
    deadline = time.monotonic() + min(90.0, left() - 30)

    emps: list[dict] = []
    with verifix.client(cfg) as cl:
        cursor = None
        for _ in range(MAX_EMP_PAGES):
            if time.monotonic() > deadline:
                say("stopped at the time limit")
                break
            data, nxt = verifix.call(cl, "core/employee$list",
                                     {"employee_ids": [], "statuses": ["W"], "npins": []},
                                     limit=verifix.LIMIT_LIST, cursor=cursor)
            emps.extend(x for x in (data or []) if isinstance(x, dict))
            if not nxt or nxt == cursor:
                break
            cursor = nxt
    say(f"working employees read: {len(emps)} in {time.monotonic() - T0:.1f}s")
    if not emps:
        return

    fills, kinds, values = Counter(), defaultdict(Counter), defaultdict(Counter)
    nested = defaultdict(Counter)
    for e in emps:
        for k, v in e.items():
            kinds[k][kind_of(v)] += 1
            if filled(v):
                fills[k] += 1
            if isinstance(v, dict):
                for sk in v:
                    nested[k][sk] += 1
            elif isinstance(v, list):
                for item in v[:5]:
                    if isinstance(item, dict):
                        for sk in item:
                            nested[k][sk] += 1
            elif filled(v) and SAFE_VALUES.search(k) and not NEVER.search(k):
                values[k][str(v)[:40]] += 1
    say(f"top-level fields ({len(kinds)}):")
    for k in sorted(kinds):
        line = f"  {k}: filled {fills[k]}/{len(emps)} · {dict(kinds[k])}"
        if k in values and len(values[k]) <= 25:
            line += f" · values {dict(values[k].most_common(25))}"
        elif k in values:
            line += f" · {len(values[k])} distinct values"
        say(line)
    for k, sub in sorted(nested.items()):
        say(f"  nested {k}: {dict(sub.most_common(30))}")

    # Coded fields that hold ids (region_id …): print their value counts too —
    # an id is not a person, and it is what region$list resolves.
    for k in sorted(kinds):
        if PLACEISH.search(k) and k.endswith("_id"):
            c = Counter(str(e.get(k)) for e in emps if filled(e.get(k)))
            say(f"  {k} value counts ({len(c)} distinct): {dict(c.most_common(40))}")

    # Free-text place fields: how long they are and which LOCALITY words occur,
    # counted over everybody — never one person's text.
    for k in sorted(kinds):
        if not PLACEISH.search(k) or k.endswith("_id"):
            continue
        texts = [str(e.get(k)) for e in emps if isinstance(e.get(k), str) and e.get(k).strip()]
        if not texts:
            continue
        lens = sorted(len(t) for t in texts)
        say(f"  text field {k}: {len(texts)} filled · length median {lens[len(lens)//2]} · max {lens[-1]}")
        loc = Counter()
        none = 0
        for t in texts:
            hits = LOCALITY.findall(t)
            if not hits:
                none += 1
            for h in hits:
                loc[re.sub(r"\s+", " ", h.strip())] += 1
        say(f"    no locality word in {none} of {len(texts)}")
        say(f"    locality words: {dict(loc.most_common(60))}")
        # The first word of the text (often the region/city) — counted.
        first = Counter(re.split(r"[,\s]+", t.strip())[0][:24] for t in texts if t.strip())
        say(f"    first words: {dict(first.most_common(30))}")

    # Birthdays and hiring dates: how filled, which format (pattern only).
    for k in ("birthday", "hiring_date"):
        pats = Counter(re.sub(r"\d", "9", str(e.get(k)))[:20] for e in emps if filled(e.get(k)))
        say(f"  {k} formats: {dict(pats.most_common(5))} (filled {sum(pats.values())})")
    years = Counter(str(e.get("birthday"))[-4:] for e in emps if filled(e.get("birthday")))
    decades = Counter((y[:3] + "0s") for y in years.elements() if y.isdigit())
    say(f"  birth decades: {dict(sorted(decades.items()))}")

    with verifix.client(cfg) as cl:
        for path, body in (("pro/region$list", {"region_ids": []}),
                           ("core/nationality$list", {"nationality_ids": []})):
            if left() < 15:
                break
            try:
                rows, cursor = [], None
                for _ in range(6):
                    data, nxt = verifix.call(cl, path, body, limit=500, cursor=cursor)
                    rows.extend(x for x in (data or []) if isinstance(x, dict))
                    if not nxt or nxt == cursor:
                        break
                    cursor = nxt
                fields = Counter(k for r in rows for k in r)
                say(f"{path}: {len(rows)} rows · fields {dict(fields)}")
                if path == "pro/region$list":
                    by = {str(r.get("region_id")): r for r in rows}
                    depth = Counter()
                    for r in rows:
                        d, p, seen = 0, str(r.get("parent_id") or ""), set()
                        while p and p in by and p not in seen:
                            seen.add(p)
                            d += 1
                            p = str(by[p].get("parent_id") or "")
                        depth[d] += 1
                    say(f"  depth (0 = top): {dict(depth)}")
                    for r in rows[:60]:
                        say("  ", {k: (str(v)[:40] if not isinstance(v, (dict, list)) else kind_of(v))
                                   for k, v in r.items()})
            except verifix.VerifixError as exc:
                say(f"{path}: {exc.code} {exc.status} {(exc.message or '')[:120]}")

        if left() > 15:
            try:
                data, _ = verifix.call(cl, "pro/employee$list",
                                       {"staff_ids": [], "fte_ids": [], "statuses": []}, limit=50)
                rows = [x for x in (data or []) if isinstance(x, dict)]
                say(f"pro/employee$list: {len(rows)} rows · fields {dict(Counter(k for r in rows for k in r))}")
            except verifix.VerifixError as exc:
                say(f"pro/employee$list: {exc.code} {exc.status} {(exc.message or '')[:120]}")
    say(f"done in {time.monotonic() - T0:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — a probe never fails the deploy
        say("FAILED")
        traceback.print_exc()
