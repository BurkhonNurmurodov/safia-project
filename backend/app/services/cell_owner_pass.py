"""ONE-SHOT (2026-10-08): every cell's «Egasi» from Verifix — the pass the
6 Oct dry run proposed, with the operator's answers to it (8 Oct, asked one by
one). Read Verifix ONCE, write, DM what was written; afterwards both slots are
set by hand on /cells.

A cell carries TWO leader slots, at most one person each, and in most cells
they are the same person:

* **Boshqaruvchi** — the leader who RUNS the cell here: ``cells.leader_id``,
  so the checklist, the automatic checks, «Ish grafigi», ojidaniya and the
  concerns box keep reading exactly what they read. This pass never touches it.
* **Egasi** — the leader Verifix SEATS in the cell (``cells.owner_id``): a
  working employee with a leader's job (``leader_verifix_check.is_leader_job``)
  whose org unit is the cell (``verifix_cells_leaders_sync.cell_nodes`` /
  ``_people``). It moves nothing — no unit, no checklist. Read later by
  «Kadrlar qo'nimsizligi» and «Ishchi havotirlari» alone.

The rules, every one the operator's:

- Verifix seats Y in a cell X runs here → Y Egasi, X keeps running it
  («Follow Verifix for ownership and our platform for managing» — 9123, 9425
  and 8821 included; no profile moves).
- A cell nobody with a leader's job sits in → no Egasi.
- Y is tied to a profile by name, strictly (``leader_verifix_check._match``:
  full name, surname + first name, the operator's pins). A tie that is not
  sure, one Verifix leader for two profiles, or no profile at all → no Egasi.
- Two Verifix leaders seated in one cell → no Egasi until the operator says
  which (0111, 0822 and 0912).
- 6822: the profile «Jonizoqoqv Urolboy Quziboy O'g'li» is RENAMED to
  «Jonizoqov …» first (a typo) and tied to that Verifix person (``RENAMES``).
- A cell with no brigadir here gets its Egasi only when this pass gives it one;
  the 9 cells under no Verifix brigadir wait.
- The NINE units the dry run proposed for Verifix brigadirs with none here are
  CREATED (``NEW_UNITS`` — no other), and the brigadir-less cells Verifix puts
  under them JOIN them. Their owners' profiles stay without a brigadir until
  the next ship, like the owners of 3911 / 4312 / 4315.
- A value somebody set on /cells (``owner_meta.src == "manual"``) is never
  overwritten.

Everything lands in ONE transaction with the record (app setting
``cell_owner_pass_2026_10_08`` — every value it replaced), and the report — text
and a workbook, with both KPI pages re-counted by Egasi for the next step — goes
to the operator's chat. A delivery that fails is re-sent from the record; the
writes never run twice.

Temporary: delete this module, ``startup.set_cell_owners_from_verifix`` and its
job pair and the call in BOTH entrypoints once the report has landed — BEFORE
``verifix_cells_leaders_sync``, ``verifix_leader_sync`` and
``leader_verifix_check``, whose helpers it imports. ``cells.owner_id`` /
``owner_meta`` and the /cells slot STAY.
"""
from __future__ import annotations

import html
import json
from collections import Counter, defaultdict
from datetime import date, datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, LeaderConcern, Manager, RoleProfile, TurnoverMonth
from app.services import action_log, leader_kind, supervisor_kind, wc_group
from app.services import leader_verifix_check as lv
from app.services import verifix_cells_leaders_sync as vcl
from app.services.name_map import _name_tokens, _pair_score

TZ = ZoneInfo("Asia/Tashkent")
SNAPSHOT_KEY = "cell_owner_pass_2026_10_08"

# The units the operator approved (8 Oct: «Create new 9 units»), by the Verifix
# brigadir's name → the unit's name here. A brigadir the plan finds with no
# unit who is NOT on this list is reported, never created.
NEW_UNITS = {
    "ABDULLAYEV YUSUF BAXROMOVICH": "Abdullayev Yusuf Baxromovich",
    "ALIMOVA GULNORA ISMAILOVNA": "Alimova Gulnora Ismailovna",
    "AXADXO'JAYEVA KAMILA ALISHEROVNA": "Axadxo'jayeva Kamila Alisherovna",
    "KULMURODOV DAVRON DARVISHALIYEVICH": "Kulmurodov Davron Darvishaliyevich",
    "SALIMOV DAMIR FARITOVICH": "Salimov Damir Faritovich",
    "TURDIQULOV MIRZA SODIQJONOVICH": "Turdiqulov Mirza Sodiqjonovich",
    "URAZBOYEVA AYIMGUL MAMUTOVNA": "Urazboyeva Ayimgul Mamutovna",
    # Verifix writes this one patronymic first, with a Cyrillic Х in it.
    "XAYRULLO O'G'LI ХABIBULLO": "Xabibullo Xayrullo o'g'li",
    "YULDASHEVA DILNOZA ULMASOVNA": "Yuldasheva Dilnoza Ulmasovna",
}
_NEW_UNIT_KEYS = {" ".join(_name_tokens(k)): v for k, v in NEW_UNITS.items()}

# Profiles renamed before matching: (the name as it stands, the name it takes,
# the Verifix person it is tied to). 8 Oct: «Tie + fix spelling».
RENAMES = [
    ("Jonizoqoqv Urolboy Quziboy O'g'li", "Jonizoqov Urolboy Quziboy O'g'li",
     "JONIZOQOV UROLBOY QUZIBOY O'G'LI"),
]

# Bounds on what one pass may write — the dry run proposed 121 owners, 9 units
# and 30 cell moves; anything far past that is a different register than the one
# the operator looked at.
MAX_OWNERS = 250
MAX_JOINS = 60
# The record of the 5 Oct pass — why a Verifix leader got no profile.
SYNC_KEY = "verifix_cells_leaders_2026_10_05"
# A tie by the full name, surname + first name or an operator's pin IS the
# person; anything weaker is only probably them, and the operator names those
# («report me them and I tell you which ones to match»).
SURE_HOW = ("full", "two", "pin")
# A profile this alike is offered as a possible match for a Verifix leader
# nobody is tied to — offered, never taken.
HINT_MIN = 0.8
HINTS = 3

# The words for every cell outcome — (DM, workbook).
STATUS = {
    "same": ("Egasi = Boshqaruvchi", "Egasi = Boshqaruvchi"),
    "differs": ("Egasi ≠ Boshqaruvchi", "Egasi boshqa"),
    "owner_only": ("Egasi only — nobody runs it here", "Faqat Egasi (Boshqaruvchi yo'q)"),
    "nobody": ("no leader on Verifix — no Egasi", "Verifixda lider yo'q — Egasi yo'q"),
    "waits_brigadir": ("Egasi waits for a brigadir", "Brigadir yo'q — Egasi kutadi"),
    "two_leaders": ("two Verifix leaders in the cell", "Verifixda ikki lider"),
    "unsure": ("the Verifix leader's tie is not sure", "Lider bog'lanishi aniq emas"),
    "shared": ("one Verifix leader, two profiles", "Bitta lider — ikki profil"),
    "no_profile": ("the Verifix leader has no profile here", "Liderning profili yo'q"),
}
DECISION = ("two_leaders", "unsure", "shared", "no_profile")
OWNED = ("same", "differs", "owner_only")

# Why a weak tie is weak.
WEAK = {
    "spelled_swap": "the profile is typed first name first",
    "spelled_near": "the surname is typed differently (same first name, their own cell)",
    "stored_only": "only the 4–5 Oct tie still finds them — today's match does not",
    "conflict": "today's match and the 4–5 Oct tie name two different people",
    "shared": "one Verifix person answers to both profiles",
}
WEAK_UZ = {
    "spelled_swap": "ism-familiya teskari yozilgan",
    "spelled_near": "familiya boshqacha yozilgan",
    "stored_only": "faqat 4–5 oktabr bog'lanishi topadi",
    "conflict": "bugungi moslik va 4–5 oktabr bog'lanishi boshqa odamlar",
    "shared": "bitta odam — ikki profil",
}

# How OUR brigadir of a cell sits beside Verifix's.
BRIG = {
    "agree": ("same brigadir", "Bir xil"),
    "differs": ("another unit here", "Bizda boshqa brigada"),
    "vx_no_unit": ("Verifix's brigadir has no unit here", "Verifix brigadirining bizda brigadasi yo'q"),
    "ours_none": ("none here, Verifix's has a unit here", "Bizda yo'q, Verifix brigadirining brigadasi bor"),
    "vx_none": ("no brigadir above it on Verifix", "Verifixda tepasida brigadir yo'q"),
    "not_vx": ("not a Verifix cell", "Verifix yacheykasi emas"),
}

# Why a Verifix brigadir with no unit would NOT get one.
HELD = {
    "unit_archived": ("their unit here is archived", "Brigadasi arxivda"),
    "short_name": ("their Verifix name is one word", "Verifixdagi ism to'liq emas"),
    "same_vx_name": ("two Verifix brigadirs share this name", "Verifixda shu ismli ikki brigadir"),
    "maybe_unit": ("a unit here may be them — Verifix could not find its brigadir by name",
                   "Bizdagi brigada bo'lishi mumkin"),
    "doubtful_tie": ("the 4 Oct check tied a unit here to them, but its name no longer looks "
                     "like theirs", "4-oktabrda bizdagi brigadaga bog'langan, nomi mos emas"),
    "other_role": ("a profile here carries their name", "Shu ismli profil bor"),
    "not_approved": ("not among the nine units the operator approved", "Tasdiqlangan 9 tadan emas"),
}


def _same_person(a: str, b: str) -> bool:
    """Two spellings of one person — the photo pass's test (either word order)."""
    x, y = _name_tokens(a), _name_tokens(b)
    if len(x) < 2 or len(y) < 2:
        return False
    return _pair_score(x, y) > 0 or _pair_score([x[1], x[0]] + x[2:], y) > 0


def _sure(how: str | None) -> bool:
    return bool(how) and how.split("+")[0] in SURE_HOW


def _vx(x: dict | None) -> dict | None:
    if not x:
        return None
    return {"id": x["id"], "name": x["name"], "job": x["job"], "status": x["status"],
            "cell": x.get("cell_raw"), "unit_name": x.get("unit_name")}


# ── profile ↔ Verifix person ──────────────────────────────────────────────────

def _ties(people: list[dict], cells: list[Cell], leaders: list[RoleProfile]) -> dict[int, dict]:
    """Every leader profile → its Verifix person, and whether that tie is SURE."""
    working_rows = [p for p in people if p["status"] == "W"]
    widx = lv._index(working_rows)
    gidx = lv._index([p for p in people if p["status"] != "W"])
    by_emp = {p["id"]: p for p in people}
    own: dict[int, set] = defaultdict(set)
    unit_cells: dict[int, set] = defaultdict(set)
    for c in cells:
        k = vcl._key(c.verifix_code)
        if not k:
            continue
        if c.leader_id:
            own[c.leader_id].add(k)
        if c.manager_id:
            unit_cells[c.manager_id].add(k)
    out: dict[int, dict] = {}
    for p in leaders:
        toks = _name_tokens(p.name)
        m = lv._match(toks, own.get(p.id, set()), unit_cells.get(p.manager_id, set()),
                      widx, gidx, working_rows)
        e, how = m.get("emp"), m.get("how")
        stored = (p.leader_kind_meta or {}).get("vfx") or {}
        sid = str(stored["id"]) if stored.get("id") else None
        sx = by_emp.get(sid) if sid else None
        stored_ok = bool(sx and sx["status"] == "W" and _same_person(p.name, sx["name"]))
        why = None
        if e:
            if stored_ok and sx["id"] != e["id"]:
                why = "conflict"
        elif stored_ok:
            e, how, why = sx, "stored", "stored_only"
        sure = bool(e) and why is None and _sure(how)
        if e and not sure and why is None:
            why = "spelled_swap" if (how or "").startswith("swap") else "spelled_near"
        out[p.id] = {"emp": e, "how": how, "sure": sure, "why": why,
                     "reason": None if e else m.get("reason"),
                     "cands": [_vx(x) for x in (m.get("cands") or [])][:4]}
    # One Verifix person answering for two profiles is no sure tie for either.
    count = Counter(t["emp"]["id"] for t in out.values() if t["sure"])
    for t in out.values():
        if t["sure"] and count[t["emp"]["id"]] > 1:
            t["shared"], t["why"] = True, "shared"
    return out


# ── the plan ──────────────────────────────────────────────────────────────────

def _brig_verdict(mid: int | None, bs: list[dict], is_vx: bool) -> str:
    if not is_vx:
        return "not_vx"
    if not bs:
        return "vx_none"
    if mid and any(mid in (b["unit"] or ()) for b in bs):
        return "agree"
    if not any(b["unit"] for b in bs):
        return "vx_no_unit"
    return "differs" if mid else "ours_none"


def _sync_skips(db: Session) -> dict[str, dict]:
    """Verifix id → why the 5 Oct pass gave that leader no profile."""
    row = db.query(AppSetting).filter_by(key=SYNC_KEY).first()
    if not row:
        return {}
    try:
        rec = json.loads(row.value)
    except (TypeError, ValueError):
        return {}
    out = {}
    for s in ((rec.get("leaders") or {}).get("skipped") or []):
        if s.get("id"):
            out[str(s["id"])] = {"reason": s.get("reason"), "who": s.get("who")}
    return out


def plan(db: Session, divs: dict, emps: dict, jobs: dict) -> dict:
    cn = vcl.cell_nodes(divs, emps, jobs)
    people = vcl._people(divs, emps, jobs, cn)
    working_rows = [p for p in people if p["status"] == "W"]
    by_emp = {p["id"]: p for p in people}

    units = {m.id: m for m in db.query(Manager).all()}
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    leaders = (db.query(RoleProfile).filter(RoleProfile.role == "leader")
               .order_by(RoleProfile.name).all())
    profs = {p.id: p for p in db.query(RoleProfile).all()}

    def uname(mid):
        return units[mid].name if mid in units else None

    # ── leaders ──
    ties = _ties(people, cells, leaders)
    sure_of: dict[str, list[int]] = defaultdict(list)
    weak_of: dict[str, list[int]] = defaultdict(list)
    for pid, t in ties.items():
        if t["emp"]:
            (sure_of if t["sure"] and not t.get("shared") else weak_of)[t["emp"]["id"]].append(pid)
    seated: dict[str, list[dict]] = defaultdict(list)
    for p in working_rows:
        if lv.is_leader_job(p["job"]) and p["where"] == "cell" and p["cell"]:
            seated[p["cell"]].append(p)
    vx_leaders = [p for p in working_rows if lv.is_leader_job(p["job"])]

    # ── brigadirs ──
    unit_tie: dict[str, list[int]] = defaultdict(list)
    # A stored tie whose Verifix name no longer looks like the unit's is not
    # used — but that brigadir is not «missing» either: never a second unit.
    doubtful_tie: dict[str, list[str]] = defaultdict(list)
    tied_mids: set[int] = set()
    for m in units.values():
        v = (m.supervisor_kind_meta or {}).get("vfx") or {}
        vid = str(v["id"]) if v.get("id") else None
        e = by_emp.get(vid) if vid else None
        if e and _same_person(m.name, e["name"]):
            unit_tie[vid].append(m.id)
            tied_mids.add(m.id)
        elif e and not m.archived:
            doubtful_tie[vid].append(m.name)
    # An archived unit is no unit: a brigadir tied only to one reads as unit-less.
    live = {mid for mid, m in units.items() if not m.archived}
    over = vcl._brigadirs_over(divs, emps, jobs,
                               {k: tuple(m for m in v if m in live) for k, v in unit_tie.items()})
    vx_brigs = [p for p in working_rows if supervisor_kind.is_supervisor_job(p["job"])]

    # Profiles that may be the same person as a brigadir: every role but a
    # leader, and a leader profile only when Verifix ties it to nobody else.
    others: dict[str, list[tuple[str, str | None]]] = defaultdict(list)
    for p in profs.values():
        tied_to = ((ties.get(p.id) or {}).get("emp") or {}).get("id") if p.role == "leader" else None
        for k in vcl._two_keys(_name_tokens(p.name)):
            others[k].append((f"{p.role} «{p.name}»", tied_to))
    untied = [m for m in units.values() if not m.archived and m.id not in tied_mids]
    no_unit = [b for b in vx_brigs if not any(mid in live for mid in unit_tie.get(b["id"], []))]
    full_count = Counter(b["full"] for b in no_unit if len(b["toks"]) >= 2)
    new_units: dict[str, dict] = {}
    held_units: list[dict] = []
    for b in sorted(no_unit, key=lambda b: b["name"]):
        keys = vcl._two_keys(b["toks"])
        item = {**_vx(b), "new_name": _NEW_UNIT_KEYS.get(b["full"])}
        why, who = None, None
        if unit_tie.get(b["id"]):
            why, who = "unit_archived", ", ".join(uname(m) or "?" for m in unit_tie[b["id"]])
        elif doubtful_tie.get(b["id"]):
            why, who = "doubtful_tie", ", ".join(doubtful_tie[b["id"]])
        elif len(b["toks"]) < 2:
            why = "short_name"
        elif full_count[b["full"]] > 1:
            why = "same_vx_name"
        else:
            maybe = [m.name for m in untied
                     if keys & vcl._two_keys(_name_tokens(m.name))
                     or vcl._similar(_name_tokens(m.name), b["toks"])]
            if maybe:
                why, who = "maybe_unit", ", ".join(maybe)
            else:
                hits = sorted({who for k in keys for who, tied_to in others.get(k, [])
                               if tied_to in (None, b["id"])})
                if hits:
                    why, who = "other_role", "; ".join(hits)
        if not why and not item["new_name"]:
            why = "not_approved"
        if why:
            held_units.append({**item, "reason": why, "who": who})
        else:
            new_units[b["id"]] = {**item, "joins": [], "join_ids": [], "stays": [], "shared": [],
                                  "absent": [], "people": 0, "leaders": []}

    # ── every Verifix cell under each would-be unit ──
    our_by_key: dict[str, list[Cell]] = defaultdict(list)
    for c in cells:
        k = vcl._key(c.verifix_code)
        if k:
            our_by_key[k].append(c)
    working_in = Counter(p["unit_id"] for p in working_rows)
    for k, n in cn["nodes"].items():
        if not n["open"]:
            continue
        bs = over(n["id"])
        mine = [b for b in bs if b["id"] in new_units]
        if not mine:
            continue
        for b in mine:
            u = new_units[b["id"]]
            u["people"] += working_in.get(n["id"], 0)
            u["leaders"] += [x["name"] for x in seated.get(k, [])]
            cs = our_by_key.get(k) or []
            if len(bs) > 1:
                u["shared"].append(n["code"])
            elif not cs:
                u["absent"].append(n["code"])
            else:
                for c in cs:
                    m = units.get(c.manager_id)
                    if m and not m.archived:
                        u["stays"].append({"code": c.verifix_code, "unit": m.name})
                    elif c.archived_at is None:
                        u["joins"].append(c.verifix_code)
                        u["join_ids"].append(c.id)

    # ── every cell of ours ──
    rows: list[dict] = []
    owner_of: dict[int, int] = {}          # cell id → its Egasi's profile id
    for c in cells:
        k = vcl._key(c.verifix_code)
        n = cn["nodes"].get(k) if k else None
        mgr = units.get(c.manager_id)
        alive = bool(mgr and not mgr.archived)
        bs = over(n["id"]) if n else []
        bv = _brig_verdict(c.manager_id if alive else None, bs, n is not None)
        join = None
        if (not alive and n and n["open"] and c.archived_at is None and len(bs) == 1
                and bs[0]["id"] in new_units):
            join = new_units[bs[0]["id"]]["new_name"]
        resp = profs.get(c.leader_id) if c.leader_id else None
        sat = seated.get(k, []) if k else []
        owner, status, proposal, weak_why, how = None, None, [], None, None
        if not sat:
            status = "nobody"
        elif len(sat) > 1:
            status = "two_leaders"
        else:
            y = sat[0]
            sure, weak = sure_of.get(y["id"], []), weak_of.get(y["id"], [])
            if len(sure) == 1:
                owner = sure[0]
                how = ties[owner]["how"]
            elif weak:
                status = "shared" if any(ties[p].get("shared") for p in weak) else "unsure"
                proposal = weak
                weak_why = next((ties[p]["why"] for p in weak if ties[p]["why"]), None)
            else:
                status = "no_profile"
        if owner:
            if not alive and not join:
                status = "waits_brigadir"
            elif resp is None:
                status = "owner_only"
            elif resp.id == owner:
                status = "same"
            else:
                status = "differs"
        if status in OWNED:
            owner_of[c.id] = owner
        op = profs.get(owner) if owner else None
        rt = ties.get(resp.id) if resp else None
        rows.append({
            "id": c.id, "code": c.verifix_code, "archived": c.archived_at is not None,
            "unit": mgr.name if mgr else None, "unit_archived": bool(mgr and mgr.archived),
            "vx": n is not None, "vx_name": n["name"] if n else None,
            "vx_open": n["open"] if n else None, "vx_parent": n["parent_name"] if n else None,
            "vx_brigadirs": [{"name": b["name"], "units": [uname(m) for m in (b["unit"] or ())]}
                             for b in bs],
            "brig": bv, "join": join, "join_vx": bs[0]["id"] if join else None,
            "manager_id": resp.id if resp else None, "manager": resp.name if resp else None,
            "manager_kind": resp.leader_kind if resp else None,
            "manager_vx": _vx(rt["emp"]) if rt else None,
            "seated": [_vx(x) for x in sat],
            "status": status, "how": how,
            "owner_id": owner, "owner": op.name if op else None,
            "owner_unit": uname(op.manager_id) if op else None,
            "owner_no_unit": bool(op and not op.manager_id),
            "owner_kind": op.leader_kind if op else None,
            "proposal": [{"id": p, "name": profs[p].name, "unit": uname(profs[p].manager_id),
                          "why": ties[p]["why"]} for p in proposal],
            "weak_why": weak_why,
        })

    # ── Verifix leaders nowhere near an owned cell ──
    ours_keys = set(our_by_key)
    skips = _sync_skips(db)
    leader_hints = [(p.id, p.name, _name_tokens(p.name)) for p in leaders]
    elsewhere = []
    for p in sorted(vx_leaders, key=lambda p: (p["cell_raw"] or "~", p["name"])):
        if p["where"] == "cell" and p["cell"] in ours_keys:
            continue
        tied = sure_of.get(p["id"], []) + weak_of.get(p["id"], [])
        elsewhere.append({**_vx(p), "where": p["where"],
                          "profiles": [profs[x].name for x in tied]})
    no_prof = {}
    for r in rows:
        if r["status"] == "no_profile":
            y = r["seated"][0]
            yt = _name_tokens(y["name"])
            scored = sorted(((max(_pair_score(t, yt), _pair_score(t[1:2] + t[:1] + t[2:], yt)), name)
                             for _, name, t in leader_hints), key=lambda s: -s[0])
            no_prof[r["code"]] = {
                "hints": [name for s, name in scored[:HINTS] if s >= HINT_MIN],
                "skip": skips.get(y["id"]),
            }
            r["hints"] = no_prof[r["code"]]["hints"]
            r["skip"] = no_prof[r["code"]]["skip"]

    # ── the guards the real pass will apply ──
    found = sum(1 for t in ties.values() if t["emp"])
    cut = None
    if len(divs) < vcl.MIN_DIVISIONS or len(emps) < vcl.MIN_EMPLOYEES:
        cut = (f"Verifix handed over only {len(divs)} subdivisions and {len(emps)} employees "
               f"(expected at least {vcl.MIN_DIVISIONS} and {vcl.MIN_EMPLOYEES})")
    elif len(vx_leaders) < vcl.MIN_LEADERS:
        cut = f"Verifix handed over only {len(vx_leaders)} leaders (expected at least {vcl.MIN_LEADERS})"
    elif leaders and found < vcl.MIN_FOUND_SHARE * len(leaders):
        cut = f"only {found} of our {len(leaders)} leader profiles were found in Verifix"

    # ── per leader ──
    manages: dict[int, list[str]] = defaultdict(list)
    owns: dict[int, list[str]] = defaultdict(list)
    for r in rows:
        if r["archived"]:
            continue
        if r["manager_id"]:
            manages[r["manager_id"]].append(r["code"])
        if r["id"] in owner_of:
            owns[owner_of[r["id"]]].append(r["code"])
    leader_rows = []
    for p in leaders:
        t = ties[p.id]
        leader_rows.append({
            "id": p.id, "name": p.name, "unit": uname(p.manager_id), "kind": p.leader_kind,
            "vx": _vx(t["emp"]), "how": t["how"], "sure": t["sure"] and not t.get("shared"),
            "why": t["why"], "reason": t["reason"],
            "manages": sorted(manages.get(p.id, [])), "owns": sorted(owns.get(p.id, [])),
        })

    vx = {"divisions": len(divs), "employees": len(emps), "working": len(working_rows),
          "leaders": len(vx_leaders), "seated": sum(len(v) for v in seated.values()),
          "brigadirs": len(vx_brigs),
          "brigadirs_tied": sum(1 for b in vx_brigs if unit_tie.get(b["id"])),
          "profiles": len(leaders), "found": found,
          "sure": sum(1 for t in ties.values() if t["sure"] and not t.get("shared"))}
    return {"cut": cut, "vx": vx, "cells": rows, "leaders": leader_rows,
            "elsewhere": elsewhere, "owner_of": owner_of,
            "units": {"new": list(new_units.values()), "held": held_units,
                      # Approved units the plan no longer proposes (one created
                      # since by hand, a brigadir dismissed) — said, never forced.
                      "missing": [name for key, name in _NEW_UNIT_KEYS.items()
                                  if key not in {" ".join(_name_tokens(u["name"]))
                                                 for u in new_units.values()}]}}


# ── the two KPI pages, re-counted ─────────────────────────────────────────────

def _wc(bucket: Counter) -> dict:
    from app.services.worker_concerns_export import whole_pct
    total = sum(bucket.values())
    rated = total - bucket.get("uplifted", 0)
    return {"total": total, "done": bucket.get("done", 0), "rated": rated,
            "pct0": whole_pct(bucket.get("done", 0), rated)}


def concerns_impact(db: Session, cells: list[dict], owner_of: dict[int, int],
                    names: dict[int, str]) -> dict:
    """Every worker concern, by the leader it was filed to and by its cell's
    Egasi — all time and this month."""
    from app.routers.worker_concerns import BUCKET
    by_key: dict[str, int] = {}
    for r in cells:
        k = vcl._key(r["code"])
        if k and k not in by_key:
            by_key[k] = r["id"]
    month = datetime.now(TZ).date().replace(day=1)
    before = {"all": defaultdict(Counter), "month": defaultdict(Counter)}
    after = {"all": defaultdict(Counter), "month": defaultdict(Counter)}
    moved = stay = nobody_after = nobody_before = 0
    q = (db.query(LeaderConcern.leader_profile_id, LeaderConcern.cell_code,
                  LeaderConcern.entry_date, BUCKET)
         .filter(LeaderConcern.worker_name.isnot(None)))
    total = 0
    for lid, code, d, st in q:
        total += 1
        k = vcl._key(code) if code else None
        cid = by_key.get(k) if k else None
        oid = owner_of.get(cid) if cid else None
        periods = ("all", "month") if d and d >= month else ("all",)
        for per in periods:
            before[per][lid][st] += 1
            after[per][oid][st] += 1
        if lid is None:
            nobody_before += 1
        if oid is None:
            nobody_after += 1
        elif lid == oid:
            stay += 1
        else:
            moved += 1
    ids = sorted({i for per in ("all",) for i in list(before[per]) + list(after[per]) if i})
    per_leader = []
    for i in ids:
        b, a = before["all"].get(i, Counter()), after["all"].get(i, Counter())
        bm, am = before["month"].get(i, Counter()), after["month"].get(i, Counter())
        per_leader.append({"id": i, "name": names.get(i) or f"#{i}",
                           "before": _wc(b), "after": _wc(a),
                           "month_before": _wc(bm), "month_after": _wc(am)})
    return {"total": total, "stay": stay, "moved": moved, "nobody_after": nobody_after,
            "nobody_before": nobody_before, "month": month.isoformat(),
            "nobody": {"before": _wc(before["all"].get(None, Counter())),
                       "after": _wc(after["all"].get(None, Counter()))},
            "leaders": per_leader}


def turnover_impact(db: Session, owner_of: dict[int, int], profs: dict[int, RoleProfile]) -> list[dict]:
    """Every turnover month the page can score, by its own map and by the
    Egasi map — the open month, and every closed and saved one."""
    from app.services import turnover as tv
    now = tv.local(tv.now_aware())
    months = sorted({r.month for r in db.query(TurnoverMonth.month).all()}
                    | {tv.month_start(now.date())})

    def swap(cmap: dict) -> dict:
        out = {}
        for k, v in cmap.items():
            pid = owner_of.get(v.get("id"))
            p = profs.get(pid) if pid else None
            out[k] = {**v, "leader_id": p.id if p else None, "leader": p.name if p else None,
                      "leader_kind": p.leader_kind if p else None}
        return out

    def brief(x: dict) -> dict:
        return {"name": x["name"], "cells": [c["code"] for c in x["cells"]],
                "working": x["working"], "left": x["left"], "rate": x["rate"], "score": x["score"]}

    out = []
    for m in months:
        state, row = tv.month_state(db, m, now)
        if state not in ("open", "closing", "saved", "closed"):
            continue
        inp = tv._inputs(db, m, state, row, now)
        b = tv.aggregate(inp["roster"], inp["leavers"], inp["cmap"], inp["rule"])
        a = tv.aggregate(inp["roster"], inp["leavers"], swap(inp["cmap"]), inp["rule"])
        bl = {x["id"]: brief(x) for x in b["leaders"]}
        al = {x["id"]: brief(x) for x in a["leaders"]}
        leaders = []
        for i in sorted(set(bl) | set(al), key=lambda i: ((bl.get(i) or al.get(i))["name"] or "")):
            leaders.append({"id": i, "before": bl.get(i), "after": al.get(i)})
        out.append({
            "month": m.isoformat(), "state": state,
            "scored_before": sum(1 for x in bl.values() if x["score"] is not None),
            "scored_after": sum(1 for x in al.values() if x["score"] is not None),
            "changed": sum(1 for x in leaders if x["before"] and x["after"]
                           and x["before"]["score"] != x["after"]["score"]),
            "dropped": sum(1 for x in leaders if x["before"] and not x["after"]),
            "joined": sum(1 for x in leaders if x["after"] and not x["before"]),
            "left_counted_before": b["totals"]["left_leader"],
            "left_counted_after": a["totals"]["left_leader"],
            "leaders": leaders,
        })
    return out


# ── the writes ────────────────────────────────────────────────────────────────

def _rename(db: Session) -> list[dict]:
    """``RENAMES``, through the profile register's own cascade (registrations,
    translation overrides). A profile already carrying the new name is done; one
    with neither name, or a rename the register refuses, is reported."""
    from app.routers.profiles import _rename_profile   # lazily: a router helper
    out = []
    for old, new, vx_name in RENAMES:
        it = {"old": old, "new": new, "vx_name": vx_name, "id": None, "done": False}
        p = db.query(RoleProfile).filter_by(role="leader", name=old).first()
        if p is None:
            q = db.query(RoleProfile).filter_by(role="leader", name=new).first()
            it.update(id=q.id if q else None, state="already" if q else "not_found")
            out.append(it)
            continue
        it["id"] = p.id
        try:
            _rename_profile(db, "leader", p.id, new)
        except Exception as exc:   # HTTPException 409 — the name is taken in that unit
            it.update(state="refused", why=str(getattr(exc, "detail", exc)))
            out.append(it)
            continue
        for col in ("name_uz_cyrl", "name_ru", "name_en"):
            if getattr(p, col) == old:
                setattr(p, col, new)
        it.update(state="renamed", done=True)
        out.append(it)
    db.flush()
    return out


def _tie_renamed(db: Session, rep: dict, at: str) -> None:
    """A renamed profile is tied to its Verifix person the way the 4 Oct check
    ties one: ``leader_kind_meta.vfx`` plus the kind its job says — unless a
    person set the kind by hand (``lv._apply``'s rule)."""
    lrows = {x["id"]: x for x in rep["leaders"]}
    for it in rep["renames"]:
        x = lrows.get(it["id"]) if it["id"] else None
        p = db.query(RoleProfile).filter_by(id=it["id"]).first() if it["id"] else None
        want = " ".join(_name_tokens(it["vx_name"]))
        vx = (x or {}).get("vx")
        if not p or not x or not x["sure"] or not vx or " ".join(_name_tokens(vx["name"])) != want:
            it["tied"] = False
            continue
        meta = dict(p.leader_kind_meta or {})
        meta["vfx"] = {"checked_at": at, "found": True, "id": vx["id"], "name": vx["name"],
                       "job": vx["job"] or None, "cell": vx["cell"], "status": vx["status"],
                       "how": x["how"]}
        kind = "leader" if lv.is_leader_job(vx["job"]) else "acting"
        if not (meta.get("src") == "manual" and p.leader_kind in leader_kind.KINDS):
            meta.update(src="verifix", at=at, by="Verifix")
            it["kind_before"], p.leader_kind = p.leader_kind, kind
        p.leader_kind_meta = meta
        it["tied"] = True


def apply(db: Session, rep: dict) -> dict:
    """Create the approved units, move their brigadir-less cells in, write every
    Egasi. Returns what it wrote, with the values it replaced. Never commits."""
    from app.services import leader_load
    at = leader_kind.now_iso()
    w = {"units": [], "joined": [], "group_cleared": [], "owners": [], "kept": [],
         "unchanged": 0}

    # ── units ──
    next_id = (db.query(func.max(Manager.id)).scalar() or 0) + 1
    unit_of: dict[str, int] = {}          # Verifix brigadir id → the unit created here
    names = {(m.name or "").strip().lower() for m in db.query(Manager).all()}
    for u in rep["units"]["new"]:
        if (u["new_name"] or "").strip().lower() in names:
            u["created"] = False          # a unit of that name exists — never a second
            continue
        m = Manager(id=next_id, name=u["new_name"], shift=None, archived=False,
                    zagruzka_on=False, supervisor_kind="supervisor",
                    supervisor_kind_meta={
                        "src": "verifix", "at": at, "by": "Verifix",
                        "vfx": {"checked_at": at, "found": True, "id": u["id"],
                                "name": u["name"], "job": u["job"] or None,
                                "cell": u["cell"], "status": u["status"],
                                "how": "created"}})
        db.add(m)
        unit_of[u["id"]] = next_id
        u["created"], u["unit_id"] = True, next_id
        w["units"].append({"id": next_id, "name": u["new_name"], "vx": u["name"]})
        next_id += 1
    db.flush()

    # ── cells join them ──
    for u in rep["units"]["new"]:
        mid = unit_of.get(u["id"])
        if not mid:
            continue
        moved = []
        for c in db.query(Cell).filter(Cell.id.in_(u["join_ids"] or [0])).all():
            alive = (c.manager_id is not None and
                     db.query(Manager.id).filter(Manager.id == c.manager_id,
                                                 Manager.archived.is_(False)).first())
            if alive or c.archived_at is not None:
                continue                  # somebody gave it a brigadir meanwhile
            w["joined"].append({"cell_id": c.id, "code": c.verifix_code,
                                "unit_id": mid, "unit": u["new_name"],
                                "old_manager_id": c.manager_id})
            c.manager_id = mid
            moved.append(c)
        w["group_cleared"] += wc_group.settle_moved(db, moved, mid)
    db.flush()
    leader_load.forget()

    # ── owners ──
    cells = {c.id: c for c in db.query(Cell).all()}
    moved_in = {x["cell_id"] for x in w["joined"]}
    for r in rep["cells"]:
        if r["status"] not in OWNED or not r["owner_id"]:
            continue
        c = cells.get(r["id"])
        if c is None:
            continue
        if r["join"] and r["id"] not in moved_in:
            # Its new unit was not made (or it got a brigadir meanwhile): a cell
            # with no brigadir here gets no Egasi.
            w.setdefault("not_joined", []).append(c.verifix_code)
            continue
        meta = c.owner_meta if isinstance(c.owner_meta, dict) else {}
        if meta.get("src") == "manual":
            w["kept"].append({"code": c.verifix_code, "owner_id": c.owner_id})
            continue
        if c.owner_id == r["owner_id"] and meta.get("src") == "verifix":
            w["unchanged"] += 1
            continue
        y = r["seated"][0]
        w["owners"].append({"cell_id": c.id, "code": c.verifix_code,
                            "old_owner_id": c.owner_id, "owner_id": r["owner_id"]})
        c.owner_id = r["owner_id"]
        c.owner_meta = {"src": "verifix", "at": at, "by": "Verifix",
                        "vfx": {"checked_at": at, "found": True, "id": y["id"],
                                "name": y["name"], "job": y["job"] or None,
                                "cell": y["cell"], "status": y["status"],
                                "how": r["how"]}}
    _tie_renamed(db, rep, at)
    db.flush()
    return w


# ── the run ───────────────────────────────────────────────────────────────────

def _save(db: Session, rep: dict) -> None:
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    value = json.dumps(rep, ensure_ascii=False, default=str)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SNAPSHOT_KEY, value=value))


def run(db: Session, data: tuple | None = None) -> dict:
    """Rename, read Verifix, plan, write, keep the record — ONE transaction.
    ``data`` = (divs, emps, jobs) skips the read (a test). A read that looks cut,
    or a plan past the bounds, writes nothing but the record of the refusal."""
    divs, emps, jobs = data or vcl._read(db)
    renames = _rename(db)
    rep = plan(db, divs, emps, jobs)
    rep["renames"] = renames
    owners = sum(1 for r in rep["cells"] if r["status"] in OWNED)
    joins = sum(len(u["join_ids"]) for u in rep["units"]["new"])
    refused = rep["cut"]
    if not refused and owners > MAX_OWNERS:
        refused = f"{owners} owners to write (at most {MAX_OWNERS})"
    if not refused and joins > MAX_JOINS:
        refused = f"{joins} cells to move into new units (at most {MAX_JOINS})"
    if not refused and len(rep["units"]["new"]) > len(NEW_UNITS):
        refused = f"{len(rep['units']['new'])} units to create (at most {len(NEW_UNITS)})"
    if refused:
        db.rollback()                     # the rename goes with everything else
        rep["written"] = None
    else:
        rep["written"] = apply(db, rep)
    rep["refused"] = refused
    rep["at"] = datetime.now(TZ).isoformat(timespec="minutes")
    rep.pop("owner_of", None)
    rep["kpi"] = None
    _save(db, rep)
    db.commit()                           # the writes and their record, together

    # The two KPI pages re-counted by the owners as they now stand — what the
    # next step (the pages reading the Egasi) will move. Read only, and taken
    # AFTER the commit: whatever it might leave behind is rolled back, and a
    # failure here costs the figures, never the pass.
    try:
        profs = {p.id: p for p in db.query(RoleProfile).all()}
        names = {i: p.name for i, p in profs.items()}
        owner_of = {c.id: c.owner_id for c in db.query(Cell).filter(Cell.owner_id.isnot(None))}
        kpi = {"concerns": concerns_impact(db, rep["cells"], owner_of, names),
               "turnover": turnover_impact(db, owner_of, profs)}
        db.rollback()
        rep["kpi"] = kpi
        _save(db, rep)
        db.commit()
    except Exception as exc:
        db.rollback()
        rep["kpi_error"] = lv._why(exc)
    wr = rep["written"] or {}
    action_log.record_system(
        "org", "org.cell_owners_verifix", db=db,
        outcome="refused" if refused else "done",
        details=[("owners", len(wr.get("owners") or [])),
                 ("added", len(wr.get("units") or [])),
                 ("moved", len(wr.get("joined") or [])),
                 ("renamed", sum(1 for x in renames if x.get("done")))],
        reason=refused,
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _month_word(iso: str) -> str:
    d = date.fromisoformat(iso)
    return d.strftime("%b %Y")


def _cell_line(r: dict) -> str:
    return _e(r["code"]) + (" (archived)" if r["archived"] else "")


def _unit_part(r: dict) -> str:
    return f" ({_e(r['owner_unit'])})" if r["owner_unit"] else " (no brigadir)"


def _vb(r: dict) -> str:
    return "; ".join(b["name"] + (f" (unit {', '.join(b['units'])})" if b["units"] else " (no unit here)")
                     for b in r["vx_brigadirs"])


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    v = rep["vx"]
    w = rep.get("written") or {}
    refused = rep.get("refused")
    active = [r for r in rep["cells"] if not r["archived"]]
    by = defaultdict(list)
    for r in active:
        by[r["status"]].append(r)
    written = {x["code"] for x in w.get("owners") or []}
    kept = {x["code"] for x in w.get("kept") or []}
    U = rep["units"]
    made = [u for u in U["new"] if u.get("created")]
    L = [f"<b>Cell owners × Verifix — {'NOT WRITTEN' if refused else 'DONE'}</b> · {at:%d.%m.%Y %H:%M}"]
    if refused:
        L += [f"⚠ <b>Nothing was written</b>: {_e(refused)}. The figures below are what the pass "
              "found; tell me and I run it again.", ""]
    else:
        L += [f"Written in one go: <b>{len(w.get('owners') or [])}</b> cells got their Egasi · "
              f"<b>{len(made)}</b> new units · <b>{len(w.get('joined') or [])}</b> cells moved into "
              f"them · {sum(1 for x in rep['renames'] if x.get('done'))} profile renamed. Nobody's "
              "Boshqaruvchi, unit or checklist changed. From now on both slots are set by hand on "
              "/cells.", ""]
    L += [f"Verifix: {v['divisions']} subdivisions · {v['working']:,} working · {v['leaders']} "
          f"leaders ({v['seated']} seated in a cell) · {v['brigadirs']} brigadirs. Our "
          f"{v['profiles']} leader profiles: {v['found']} found in Verifix, {v['sure']} of them "
          "surely.", ""]

    for x in rep["renames"]:
        if x.get("state") == "renamed":
            tie = (" and tied to Verifix " + _e(x["vx_name"]) if x.get("tied")
                   else " — <b>not tied</b>: Verifix did not answer with that person")
            L.append(f"✏️ «{_e(x['old'])}» → <b>«{_e(x['new'])}»</b>{tie}.")
        elif x.get("state") == "already":
            L.append(f"✏️ «{_e(x['new'])}» was already spelled right.")
        else:
            L.append(f"✏️ «{_e(x['old'])}» was NOT renamed: "
                     + _e(x.get("why") or "no leader profile carries that name") + ".")
    L.append("")

    owned = by["same"] + by["differs"] + by["owner_only"]
    L.append(f"<b>🧱 Cells — {len(active)} active</b>, {len(owned)} with an Egasi"
             + (f" ({len(kept)} kept as somebody set them by hand)" if kept else ""))
    L.append(f"✅ Egasi = Boshqaruvchi — <b>{len(by['same'])}</b>")
    L.append(f"🔀 Egasi ≠ Boshqaruvchi — <b>{len(by['differs'])}</b> (the Egasi gets only the "
             "cell's KPI; the Boshqaruvchi keeps all the work):")
    for r in by["differs"]:
        L.append(f"  {_cell_line(r)} — Egasi <b>{_e(r['owner'])}</b>{_unit_part(r)} · "
                 f"Boshqaruvchi {_e(r['manager'])}" + (f" ({_e(r['unit'])})" if r["unit"] else ""))
    L.append(f"👤 Egasi only, nobody runs it here — <b>{len(by['owner_only'])}</b> (a "
             "Boshqaruvchi is picked on /cells):")
    for r in by["owner_only"]:
        L.append(f"  {_cell_line(r)} — {_e(r['owner'])}"
                 + (f" · now in {_e(r['join'])}" if r["join"] else "")
                 + (" · the profile has no brigadir" if r["owner_no_unit"] else ""))
    no_unit = [r for r in owned if r["owner_no_unit"]]
    if no_unit:
        L.append(f"🚫 Egasi whose profile has no brigadir yet — <b>{len(no_unit)}</b> (the next "
                 "ship gives them one): " + ", ".join(
                     f"{_e(r['code'])} {_e(r['owner'])}" for r in no_unit))
    nob = by["nobody"]
    L.append(f"⭕ No leader on Verifix → no Egasi — <b>{len(nob)}</b>"
             + (": " + ", ".join(_e(r["code"]) for r in nob) if nob else ""))
    if by["waits_brigadir"]:
        L.append(f"⏳ No Egasi — the cell has no brigadir here — "
                 f"<b>{len(by['waits_brigadir'])}</b>:")
        for r in by["waits_brigadir"]:
            L.append(f"  {_cell_line(r)} — Verifix leader {_e(r['owner'])} · "
                     + (f"Verifix brigadir: {_e(_vb(r))}" if _vb(r)
                        else "no brigadir over it on Verifix"))
    arch = [r for r in rep["cells"] if r["archived"]]
    if arch:
        L.append(f"🗄 Archived cells — {len(arch)}, "
                 f"{sum(1 for r in arch if r['status'] in OWNED)} with an Egasi")
    L.append("")

    dec = [r for r in rep["cells"] if r["status"] in DECISION]
    if dec:
        L.append(f"<b>🤔 Still yours to decide — {len(dec)}</b> (no Egasi until you say which "
                 "profile is the cell's Verifix leader)")
        groups = defaultdict(list)
        for r in dec:
            groups[r["status"]].append(r)
        for r in groups["two_leaders"]:
            L.append(f"  {_cell_line(r)} — two leaders on Verifix: " + "; ".join(
                f"{_e(x['name'])} «{_e(x['job'])}»" for x in r["seated"])
                + (f" · runs here: {_e(r['manager'])}" if r["manager"] else ""))
        for r in groups["unsure"]:
            y = r["seated"][0]
            for pr in r["proposal"]:
                L.append(f"  {_cell_line(r)} — Verifix {_e(y['name'])} → profile "
                         f"<b>{_e(pr['name'])}</b>" + (f" ({_e(pr['unit'])})" if pr["unit"] else "")
                         + f" · {_e(WEAK.get(pr['why'], pr['why'] or ''))}")
        for r in groups["shared"]:
            L.append(f"  {_cell_line(r)} — Verifix {_e(r['seated'][0]['name'])} → "
                     + " / ".join(_e(pr["name"]) for pr in r["proposal"]))
        for r in groups["no_profile"]:
            y = r["seated"][0]
            L.append(f"  {_cell_line(r)} — {_e(y['name'])} «{_e(y['job'])}» has no profile here"
                     + (f" · may be {_e(', '.join(r['hints']))}" if r.get("hints") else ""))
        L.append("")

    L.append(f"<b>🏭 New units — {len(made)}</b> («Brigadir», source Verifix, zagruzka OFF, no "
             "shift and no plant yet — set them on the profile page):")
    for u in made:
        joined = [x["code"] for x in w.get("joined") or [] if x["unit_id"] == u.get("unit_id")]
        L.append(f"  <b>{_e(u['new_name'])}</b> (#{u['unit_id']}) — Verifix «{_e(u['unit_name'] or '—')}»"
                 + (" · cells: " + ", ".join(sorted(joined)) if joined else " · no cell joined"))
    for u in U["new"]:
        if not u.get("created"):
            L.append(f"  {_e(u['new_name'])} — NOT created: a unit of that name already exists")
    for h in U["held"]:
        L.append(f"  {_e(h['name'])} «{_e(h['job'])}» — not created: {HELD[h['reason']][0]}"
                 + (f": {_e(h['who'])}" if h.get("who") else ""))
    for name in U.get("missing") or []:
        L.append(f"  {_e(name)} — approved, but Verifix no longer shows them as a brigadir "
                 "with no unit here: not created")
    if w.get("group_cleared"):
        L.append("  Group letters cleared by the move: " + ", ".join(_e(x) for x in w["group_cleared"]))
    L.append("")

    K = rep.get("kpi")
    if K:
        C = K["concerns"]
        ch = [x for x in C["leaders"] if x["before"]["total"] != x["after"]["total"]]
        unowned = [x for x in rep["leaders"] if x["manages"] and not x["owns"]]
        L.append("<b>📊 What the next step moves</b> — the two KPI pages still count as before; "
                 "once they read the Egasi:")
        L.append(f"<i>Ishchi havotirlari</i> — {C['total']:,} worker concerns: {C['stay']:,} stay with "
                 f"the leader they were filed to, <b>{C['moved']:,}</b> move to the cell's Egasi, "
                 f"<b>{C['nobody_after']:,}</b> count for nobody (their cell has no Egasi). "
                 f"{len(ch)} leaders change their total.")
        L.append(f"  Leaders who run cells but own none — <b>{len(unowned)}</b>: shown unranked "
                 "(«not a cell owner») on both pages.")
        for t in K["turnover"]:
            L.append(f"<i>Kadrlar qo'nimsizligi</i> {_month_word(t['month'])} ({t['state']}) — leaders "
                     f"scored {t['scored_before']} → {t['scored_after']}; {t['changed']} change score, "
                     f"{t['dropped']} drop out, {t['joined']} new")
        L.append("")
    elif rep.get("kpi_error"):
        L += [f"(The KPI preview could not be computed: {_e(rep['kpi_error'])}.)", ""]
    L.append("Every cell, leader and unit is in the attached workbook.")
    return "\n".join(L).strip()


def _wcs(w: dict | None) -> str:
    if not w or not w["total"]:
        return ""
    return f"{w['total']} · {w['pct0']}%" if w["pct0"] is not None else str(w["total"])


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    w = rep.get("written") or {}
    wrote = {x["code"] for x in w.get("owners") or []}
    kept = {x["code"] for x in w.get("kept") or []}
    joined = {x["code"]: x["unit"] for x in w.get("joined") or []}

    def state(r):
        if r["code"] in wrote:
            return "yozildi"
        if r["code"] in kept:
            return "qo'lda belgilangan — saqlandi"
        if r["status"] in OWNED:
            return "o'zgarmadi" if w else "yozilmadi"
        return ""
    lv._sheet(wb, "Yacheykalar", [
        "Kod", "Arxivda", "Brigadir", "Yangi brigadaga o'tdi", "Boshqaruvchi",
        "Boshqaruvchi turi", "Natija", "Egasi", "Egasining brigadasi", "Yozildi",
        "Verifixda o'tirgan lider(lar)", "Bog'lanish", "Taklif (aniq emas)",
        "Verifix nomi", "Verifix bo'limi", "Verifix brigadiri", "Brigadir solishtiruvi",
        "Ehtimol"],
        [[r["code"], "ha" if r["archived"] else "", r["unit"], joined.get(r["code"]),
          r["manager"], lv.KIND_WORD.get(r["manager_kind"], "") if r["manager"] else "",
          STATUS[r["status"]][1], r["owner"] if r["status"] in OWNED else None,
          (r["owner_unit"] or "— (brigadirsiz)") if r["status"] in OWNED else None,
          state(r),
          "; ".join(f"{x['name']} «{x['job']}»" for x in r["seated"]),
          r["how"],
          "; ".join(f"{x['name']} — {WEAK_UZ.get(x['why'], x['why'] or '')}" for x in r["proposal"]),
          r["vx_name"], r["vx_parent"],
          "; ".join(b["name"] + (f" ({', '.join(b['units'])})" if b["units"] else " (brigadasi yo'q)")
                    for b in r["vx_brigadirs"]),
          BRIG[r["brig"]][1], ", ".join(r.get("hints") or [])] for r in rep["cells"]])
    dec = [r for r in rep["cells"] if r["status"] in DECISION]
    lv._sheet(wb, "Qaror kerak", [
        "Kod", "Nima", "Verifixdagi lider(lar)", "Taklif qilingan profil", "Nega aniq emas",
        "Boshqaruvchi", "Ehtimol", "5-oktabr: nega profil yaratilmagan"],
        [[r["code"], STATUS[r["status"]][1],
          "; ".join(f"{x['name']} «{x['job']}»" for x in r["seated"]),
          "; ".join(x["name"] + (f" ({x['unit']})" if x["unit"] else "") for x in r["proposal"]),
          "; ".join(WEAK_UZ.get(x["why"], x["why"] or "") for x in r["proposal"]),
          r["manager"], ", ".join(r.get("hints") or []),
          (vcl.SKIP.get((r.get("skip") or {}).get("reason"), ("", ""))[1]
           + (f": {r['skip']['who']}" if (r.get("skip") or {}).get("who") else ""))
          if r.get("skip") else None] for r in dec])
    K = rep.get("kpi") or {"concerns": {"leaders": []}, "turnover": []}
    tv_last = next((t for t in reversed(K["turnover"]) if t["state"] != "open"), None)
    tv_open = next((t for t in K["turnover"] if t["state"] == "open"), None)

    def tv_score(t, pid, side):
        if not t:
            return None
        x = next((y for y in t["leaders"] if y["id"] == pid), None)
        sc = (x or {}).get(side)
        return None if not sc else (sc["score"] if sc["score"] is not None else "—")
    wc = {x["id"]: x for x in K["concerns"]["leaders"]}
    lv._sheet(wb, "Liderlar", [
        "Profil", "Brigadir", "Turi", "Verifix ismi", "Verifix lavozimi", "Verifix yacheykasi",
        "Qanday topildi", "Aniq", "Nega aniq emas", "Boshqaradi", "Egasi",
        "Havotirlar: hozir", "Havotirlar: Egasi bo'yicha", "Shu oy: hozir", "Shu oy: Egasi bo'yicha",
        f"Qo'nimsizlik {tv_open['month'][:7] if tv_open else ''}: hozir", "Egasi bo'yicha",
        f"Qo'nimsizlik {tv_last['month'][:7] if tv_last else ''}: hozir", "Egasi bo'yicha "],
        [[x["name"], x["unit"], lv.KIND_WORD.get(x["kind"], ""),
          (x["vx"] or {}).get("name"), (x["vx"] or {}).get("job"), (x["vx"] or {}).get("cell"),
          x["how"], "ha" if x["sure"] else ("yo'q" if x["vx"] else ""),
          WEAK_UZ.get(x["why"], x["why"] or "") if x["vx"] else (x["reason"] or ""),
          ", ".join(x["manages"]), ", ".join(x["owns"]),
          _wcs(wc.get(x["id"], {}).get("before")), _wcs(wc.get(x["id"], {}).get("after")),
          _wcs(wc.get(x["id"], {}).get("month_before")), _wcs(wc.get(x["id"], {}).get("month_after")),
          tv_score(tv_open, x["id"], "before"), tv_score(tv_open, x["id"], "after"),
          tv_score(tv_last, x["id"], "before"), tv_score(tv_last, x["id"], "after")]
         for x in rep["leaders"]])
    U = rep["units"]
    lv._sheet(wb, "Yangi brigadalar", [
        "Brigada nomi", "ID", "Yaratildi", "Verifix ismi", "Lavozim", "Verifix bo'limi",
        "Ishlayotganlar", "Qo'shilgan yacheykalar", "O'z brigadasida qoladi",
        "Boshqa brigadir bilan", "Platformada yo'q", "Yacheykalardagi liderlar"],
        [[u["new_name"], u.get("unit_id"), "ha" if u.get("created") else "yo'q — shu nomli brigada bor",
          u["name"], u["job"], u["unit_name"], u["people"],
          ", ".join(sorted(x["code"] for x in w.get("joined") or [] if x["unit_id"] == u.get("unit_id"))),
          ", ".join(f"{st['code']} ({st['unit']})" for st in u["stays"]),
          ", ".join(sorted(u["shared"])), ", ".join(sorted(u["absent"])),
          ", ".join(u["leaders"])] for u in U["new"]])
    lv._sheet(wb, "Yaratilmagan brigadalar", ["Verifix ismi", "Lavozim", "Verifix bo'limi",
                                              "Sabab", "Kim bo'lishi mumkin"],
              [[h["name"], h["job"], h["unit_name"], HELD[h["reason"]][1], h.get("who")]
               for h in U["held"]]
              + [[name, None, None, "Tasdiqlangan, lekin Verifix endi ko'rsatmaydi", None]
                 for name in U.get("missing") or []])
    lv._sheet(wb, "Yacheykadan tashqari liderlar", [
        "Verifix ismi", "Lavozim", "Bo'lim", "Kod", "Qayerda", "Bizdagi profil"],
        [[x["name"], x["job"], x["unit_name"], x["cell"],
          {"cell": "platformada yo'q yacheyka", "dept": "departament", "codeless": "kodsiz bo'lim",
           "unsure": "kodi noaniq", "none": "bo'limsiz"}.get(x["where"], x["where"]),
          ", ".join(x["profiles"])] for x in rep["elsewhere"]])
    trows = []
    for t in K["turnover"]:
        for x in t["leaders"]:
            bf, af = x["before"] or {}, x["after"] or {}
            if bf == af:
                continue
            trows.append([t["month"][:7], t["state"], bf.get("name") or af.get("name"),
                          ", ".join(bf.get("cells") or []), bf.get("working"), bf.get("left"),
                          bf.get("rate"), bf.get("score"),
                          ", ".join(af.get("cells") or []), af.get("working"), af.get("left"),
                          af.get("rate"), af.get("score")])
    lv._sheet(wb, "Qo'nimsizlik o'zgarishi", [
        "Oy", "Holati", "Lider", "Hozir: yacheykalar", "ishlagan", "ketgan", "%", "ball",
        "Egasi bo'yicha: yacheykalar", "ishlagan ", "ketgan ", "% ", "ball "], trows)
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── delivery ──────────────────────────────────────────────────────────────────

def _chunks(body: str, limit: int = 3900) -> list[str]:
    """Messages of at most ``limit`` characters, cut at line ends — and a line
    longer than a message (a list of codes) at a «; » or «, » inside it, never
    inside a tag or an entity."""
    lines: list[str] = []
    for line in body.split("\n"):
        while len(line) > limit:
            cut = max(line.rfind("; ", 0, limit), line.rfind(", ", 0, limit))
            if cut <= 0:
                lines.append(line[:limit])
                line = line[limit:]
            else:
                lines.append(line[:cut + 1])
                line = "  " + line[cut + 2:]
        lines.append(line)
    chunks, cur = [], ""
    for line in lines:
        if cur and len(cur) + len(line) + 1 > limit:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    if cur.strip():
        chunks.append(cur)
    return chunks


def send(db: Session, chat_id: int, *_window) -> int:
    """Run once and DM the report. A pass an earlier attempt already made, whose
    delivery failed, is sent from its stored record — the writes never run twice."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    if row:
        rep = json.loads(row.value)
    else:
        try:
            rep = run(db)
        except Exception as exc:
            db.rollback()
            try:
                lv._post("sendMessage", {
                    "chat_id": chat_id,
                    "text": f"Cell owners × Verifix could not run: {lv._why(exc)}. Nothing was "
                            "changed; it tries again on the next deploy."})
            except Exception:
                pass
            raise
    chunks = _chunks(text(rep))
    for c in chunks:
        lv._post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
    stamp = datetime.fromisoformat(rep["at"]).strftime("%d.%m.%Y")
    lv._post("sendDocument", {"chat_id": chat_id,
                              "caption": "Cell owners × Verifix — every cell with its Egasi and "
                                         "Boshqaruvchi, every leader, the new units, and both KPI "
                                         "pages now → by Egasi"},
             files={"document": (f"yacheyka-egalari-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
