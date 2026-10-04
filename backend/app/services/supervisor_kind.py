"""Is a supervisor unit's brigadir a BRIGADIR on Verifix, or running the unit?

From 2026-10-04 (the operator's directive, after the leaders got theirs) every
supervisor unit carries ``managers.supervisor_kind`` — the twin of
``role_profiles.leader_kind`` (``services/leader_kind.py``):

* ``"supervisor"`` — Verifix lists the person under a brigadir's job
  («Бригадир»);
* ``"acting"`` — the person runs the unit while Verifix lists them under
  another job (a «Лидер» whose cell is measured as a unit of its own) —
  «Brigadir o'rnida» on the page;
* ``NULL`` — not determined yet.

``supervisor_kind_meta`` says where the answer came from, in leader_kind's
shape, so the profile page can show it and a later check can tell a person's
choice from its own::

    {"src": "manual" | "verifix", "at": ISO, "by": "name",
     "vfx": {"checked_at": ISO, "found": bool, "reason": …,
             "name": …, "job": …, "cell": …, "status": …}}

A value set by hand (``src == "manual"``) is never overwritten by a Verifix
check. A REGISTER only: nothing scores, filters or routes by it.
"""
from __future__ import annotations

import re
from typing import Optional

from app.services.leader_kind import _VFX_KEYS, now_iso

KINDS = ("supervisor", "acting")

# A brigadir's job on Verifix. An assistant or a deputy is not the brigadir,
# and «и.о.» literally means «in place of».
_SUPERVISOR_RE = re.compile(r"бригадир|brigadir", re.I)
_NOT_RE = re.compile(
    r"помощ|ассист|замест|\bзам\b|\bи\.?\s*о\b|yordamchi|o['’ʻ‘`]?rinbosar|"
    r"assistant|deputy|acting", re.I)


def is_supervisor_job(job: Optional[str]) -> bool:
    j = job or ""
    return bool(_SUPERVISOR_RE.search(j)) and not _NOT_RE.search(j)


def set_manual(m, kind: str, by: Optional[str]) -> None:
    """A person's answer, from the switch on the profile page. Keeps what
    Verifix said (``vfx``) — the evidence stays beside the choice."""
    meta = dict(m.supervisor_kind_meta or {})
    meta.update(src="manual", at=now_iso(), by=(by or "").strip() or None)
    m.supervisor_kind = kind
    m.supervisor_kind_meta = meta


def info(m) -> Optional[dict]:
    """The page's view of ``supervisor_kind_meta`` — exactly `leader_kind.out`'s
    shape, so one note component on the page reads both."""
    meta = m.supervisor_kind_meta if isinstance(m.supervisor_kind_meta, dict) else None
    if not meta:
        return None
    vfx = meta.get("vfx") if isinstance(meta.get("vfx"), dict) else None
    return {
        "src": meta.get("src"),
        "at": meta.get("at"),
        "by": meta.get("by"),
        "vfx": {k: vfx.get(k) for k in _VFX_KEYS if k in vfx} if vfx else None,
    }
