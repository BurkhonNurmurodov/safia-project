"""⚠ TEMPORARY (2026-10-17): how IT's ARC apps serve a ticket's photos, printed
into the deploy job's log — the one window onto production a cloud session can
read.

The ticket modal on /arc now draws a ticket's photos through our own origin
(`services/arc_files.py`), because the page's CSP draws nothing off IT's host.
The new app's attachments are relative paths («misc/YYYY/MM/DD/<uuid>.jpeg»)
whose serving base nobody on this platform has seen, so the resolver walks a
list of bases. This runs THAT resolver on a few real tickets and prints what
each attempt answered, so the right base is confirmed (or found) on the box.

Run by `.gitea/workflows/deploy.yaml` after the health check, from `backend/`
as `python ../deploy/diag_arc_files.py`. READ-ONLY: reads the mirror and IT's
API with the stored credential, writes nothing. No person leaves it: no
description, name, phone or comment is printed — only field NAMES, URL shapes
(file names cut to 8 characters), status codes, content types and sizes.
Lives under deploy/ so adding it restarts nothing. Delete it with its step.
"""
from __future__ import annotations

import os
import re
import sys
import time
import traceback

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.models import ArcLegacyRequest, ArcRequest  # noqa: E402
from app.services import arc_files, arc_legacy_client  # noqa: E402
from app.version import APP_VERSION  # noqa: E402

BUDGET_S = 80.0
T0 = time.monotonic()
TAG = "[ARC-FILES]"


def say(*a):
    print(TAG, *a, flush=True)


def shape(u) -> str:
    """A path or URL with its file name cut — enough to read the layout."""
    s = str(u or "")
    m = re.match(r"^(.*/)?([^/?]*)(\?.*)?$", s)
    if not m:
        return s[:80]
    head, name = m.group(1) or "", m.group(2) or ""
    stem, dot, ext = name.rpartition(".")
    short = (stem[:8] + "…" + dot + ext) if dot else (name[:8] + "…")
    return head + short


def left() -> float:
    return BUDGET_S - (time.monotonic() - T0)


def try_fetch(label: str, item: dict) -> None:
    if left() < 15:
        say(label, "skipped — out of time")
        return
    t = time.monotonic()
    data, ctype = arc_files.fetch(item)
    took = time.monotonic() - t
    if data is not None:
        say(f"{label}: OK {ctype} {len(data)} B in {took:.1f}s")
    else:
        say(f"{label}: NOT FOUND ({ctype}) in {took:.1f}s")
    tr = arc_files.trace()
    if tr:
        for a in tr[-1]["tried"]:
            say("    ", shape(a["url"]), "→", a["answer"])


def main() -> None:
    say("version", APP_VERSION, "· legacy configured:", arc_legacy_client.configured())
    db = SessionLocal()
    try:
        N = ArcLegacyRequest
        total = db.query(N).count()
        with_rep = db.query(N).filter(N.photo_report.isnot(None), N.photo_report != "").count()
        say(f"new-app tickets: {total}, with photo_report: {with_rep}")
        reps = [r[0] for r in db.query(N.photo_report)
                .filter(N.photo_report.isnot(None), N.photo_report != "")
                .order_by(N.created_at.desc()).limit(200).all()]
        absolute = sum(1 for r in reps if str(r).startswith(("http://", "https://")))
        say(f"photo_report sample of {len(reps)}: absolute {absolute}, relative {len(reps) - absolute}")
        for r in reps[:4]:
            say("  photo_report shape:", shape(r))
        doc = [r[0] for r in db.query(N.document_url)
               .filter(N.document_url.isnot(None), N.document_url != "").limit(3).all()]
        for r in doc:
            say("  document_url shape:", shape(r))
        recent = [r[0] for r in db.query(N.remote_id).order_by(N.created_at.desc()).limit(40).all()]
        old = (db.query(ArcRequest.files).filter(ArcRequest.files.isnot(None))
               .order_by(ArcRequest.created_at.desc()).limit(30).all())
    finally:
        db.close()

    for i, r in enumerate(reps[:2]):
        try_fetch(f"photo_report #{i + 1}", arc_files.report_item(r))

    # The single-ticket card: what it carries, and its files.
    tried_files = 0
    seen_keys = False
    for rid in recent:
        if left() < 30 or tried_files >= 3:
            break
        card, err = arc_files.card(rid)
        if err:
            say("card", rid[:8], "→", err)
            continue
        if not seen_keys:
            say("card keys:", ", ".join(sorted(card.keys())))
            seen_keys = True
        raw = card.get("files") if isinstance(card.get("files"), list) else []
        if not raw:
            continue
        first = raw[0]
        say(f"card {rid[:8]}: {len(raw)} file(s); entry type {type(first).__name__}"
            + (f", keys {sorted(first.keys())}" if isinstance(first, dict) else ""))
        if isinstance(first, dict):
            for k, v in first.items():
                if isinstance(v, str) and ("/" in v or "." in v):
                    say(f"    {k} shape:", shape(v))
        for f in arc_files.card_files(card, card.get("photo_report"))[:1]:
            tried_files += 1
            try_fetch(f"card file {rid[:8]}", f)
    if tried_files == 0:
        say("no card among the newest", len(recent), "carried files")

    olds = [it for row in old for it in arc_files.old_files(row[0])]
    say(f"old-app files in the newest {len(old)} tickets: {len(olds)}")
    if olds:
        say("  old path shape:", shape(olds[0]["path"]))
        try_fetch("old file", olds[0])
    say(f"done in {time.monotonic() - T0:.0f}s")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        say("FAILED")
        traceback.print_exc()
