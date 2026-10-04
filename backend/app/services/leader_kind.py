"""Is a leader profile a LEADER on Verifix, or filling a leader's place?

From 2026-10-04 (the operator's directive) every leader profile carries
``role_profiles.leader_kind``:

* ``"leader"`` — Verifix lists the person under a leader job («Лидер»);
* ``"acting"`` — the person does a leader's work while Verifix lists them under
  another job (a «Кондитер» running a cell) — «Lider o'rnida» on the page;
* ``NULL`` — not determined yet.

``leader_kind_meta`` says where the answer came from, so the profile page can
show it and a later check can tell a person's choice from its own::

    {"src": "manual" | "verifix", "at": ISO, "by": "name",
     "vfx": {"checked_at": ISO, "found": bool, "reason": …,
             "name": …, "job": …, "cell": …, "status": …}}

A value set by hand (``src == "manual"``) is never overwritten by a Verifix
check; the check only records what Verifix said beside it.

It has ONE reader that ranks by it: «Ishchi havotirlari» (/worker-concerns)
ranks only ``"leader"`` profiles (routers/worker_concerns.RANKED_KIND, from
2026-10-04) — «Lider o'rnida» and not-determined rows stay listed, unranked.
Nothing else scores, filters or routes by it.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

KINDS = ("leader", "acting")

# What `vfx` may carry onto the page — everything else stays server-side.
_VFX_KEYS = ("checked_at", "found", "reason", "name", "job", "cell", "status", "count")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def set_manual(p, kind: str, by: Optional[str]) -> None:
    """A person's answer, from the switch on the profile page. Keeps what
    Verifix said (``vfx``) — the evidence stays beside the choice."""
    meta = dict(p.leader_kind_meta or {})
    meta.update(src="manual", at=now_iso(), by=(by or "").strip() or None)
    p.leader_kind = kind
    p.leader_kind_meta = meta


def out(p) -> Optional[dict]:
    """The page's view of ``leader_kind_meta``: who set the kind, when, and
    what Verifix said at its last check. None when nothing is known."""
    meta = p.leader_kind_meta if isinstance(p.leader_kind_meta, dict) else None
    if not meta:
        return None
    vfx = meta.get("vfx") if isinstance(meta.get("vfx"), dict) else None
    return {
        "src": meta.get("src"),
        "at": meta.get("at"),
        "by": meta.get("by"),
        "vfx": {k: vfx.get(k) for k in _VFX_KEYS if k in vfx} if vfx else None,
    }
