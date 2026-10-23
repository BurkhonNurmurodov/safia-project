"""⚠ TEMPORARY (2026-10-23): how well «Tarkib»'s place rule reads the REAL
addresses, printed into the deploy job's log — the one window onto production
a cloud session can read.

Runs `services/workforce.read` (the very read the tab stores) on production's
Verifix and prints only aggregates: how many people got a region / district,
the districts found with their counts, and — for the addresses that got NO
district — the locality words they carry, counted over everybody, so a gap in
the gazetteer shows as «X tumani · 40». No person is printed: no name, no
address, no date. Writes nothing (the read is not stored — the app's own job
stores its own). Lives under deploy/ so adding it restarts nothing. Delete it
with its step.
"""
from __future__ import annotations

import os
import re
import sys
import time
import traceback
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.services import verifix, workforce, workforce_place as wp  # noqa: E402
from app.version import APP_VERSION  # noqa: E402

TAG = "[WF-PLACES]"
T0 = time.monotonic()
LOCALITY = re.compile(
    r"([A-Za-zА-Яа-яЁёЎўҚқҒғҲҳʻʼ'`’\-]{3,}\s+(?:tumani|tuman|t\.|shahri|shahar|sh\.|район|р-н|туман[и]?|"
    r"шаҳри|шахри|город|г\.))", re.I)


def say(*a):
    print(TAG, *a, flush=True)


def main() -> None:
    say(f"app {APP_VERSION}")
    db = SessionLocal()
    try:
        cfg = verifix.config(db, with_password=True)
    finally:
        db.close()
    if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
        say("Verifix is not configured")
        return
    # The read itself, and — to see what it could NOT place — the texts once
    # more, counted here and dropped.
    unplaced = {"live": Counter(), "prop": Counter()}
    nolocal = Counter()
    orig = workforce._person

    def spy(e, jobs):
        out = orig(e, jobs)
        if out:
            _, _, live, prop, addr, legal = out
            for side, (r, d, stem), text in (("live", live, addr), ("prop", prop, legal)):
                if not d and not stem and text:
                    hits = LOCALITY.findall(text)
                    if not hits:
                        nolocal[side] += 1
                    for h in hits:
                        unplaced[side][re.sub(r"\s+", " ", h.strip()).lower()] += 1
        return out

    workforce._person = spy
    data = workforce.read(cfg)
    workforce._person = orig
    say(f"read in {time.monotonic() - T0:.1f}s · stats {data['stats']}")
    emps = data["emps"].values()
    lr = Counter(e.get("lr") or "none" for e in emps)
    ld = Counter(e.get("ld") or "none" for e in emps)
    pr = Counter(e.get("pr") or "none" for e in emps)
    pd = Counter(e.get("pd") or "none" for e in emps)
    say(f"live regions: {dict(lr.most_common())}")
    say(f"live districts ({len(ld)}): {dict(ld.most_common(60))}")
    say(f"prop regions: {dict(pr.most_common())}")
    say(f"prop districts ({len(pd)}): {dict(pd.most_common(40))}")
    say(f"generic names: {data['names']}")
    for side in ("live", "prop"):
        say(f"{side} — no district, no locality word: {nolocal[side]}")
        say(f"{side} — no district, locality words: {dict(unplaced[side].most_common(50))}")
    say(f"done in {time.monotonic() - T0:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except Exception:  # noqa: BLE001 — a probe never fails the deploy
        say("FAILED")
        traceback.print_exc()
