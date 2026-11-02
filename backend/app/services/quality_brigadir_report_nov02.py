"""TEMPORARY, READ-ONLY (2026-11-02): every «Отв. бригадир» spelling on the
Quality register («Quality & complaints» sheet) and the IMS unit it is
connected to — DMed once to Burkhon as text + a workbook.

The operator asked: «report me all brigadirs on the sheets and to whom they're
connected on our IMS». The connection is the Quality page's OWN rule, never a
second spelling of it: `name_map.supervisor_match` over every NON-archived unit
(what `routers/quality.get_quality`, the shift report's «Sifat nazorati %», the
brigadir ranking and «Hisobotlar» all read), with `name_map.register_brigadir`
blanking the pinned spellings at the sites they must not reach. For every
spelling the report also says HOW it was connected (a hand pin, an exact folded
name, or a fuzzy score), how many rows it carries and over which dates, and —
for a spelling that reaches no live unit — whether it would match an ARCHIVED
one. Plus every live unit with the spellings that point at it, its Telegram
holders and its Verifix person.

Writes nothing but its flag (`startup.QUALITY_BRIGADIR_REPORT_FLAG`). Delete
this module, `startup.report_quality_brigadirs` / `_quality_brigadirs_job` and
both entrypoint calls once it has landed.
"""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

import requests
from openpyxl import Workbook
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Font
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (Factory, Manager, QualityComplaint, TelegramUser,
                        TelegramUserRole)
from app.services import name_map

TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3


def _how(raw: str, managers: list) -> tuple[str, float | None]:
    """Why `supervisor_match` connected (or did not connect) this spelling —
    its own steps, replayed for the record. The CONNECTION itself is always
    `supervisor_match`'s answer; this only names the step that produced it."""
    tokens = name_map._name_tokens(raw)
    if len(tokens) < 2:
        return "short", None
    canon = [(m, name_map._name_tokens(m.name)) for m in managers]
    by_norm = {" ".join(t): m for m, t in canon}
    by_sorted = {" ".join(sorted(t)): m for m, t in canon}
    forced = name_map._OVERRIDES.get(" ".join(tokens))
    if forced and (by_norm.get(forced) or by_sorted.get(" ".join(sorted(forced.split())))):
        return "pin", None
    if by_norm.get(" ".join(tokens)) is not None:
        return "exact", None
    best = 0.0
    for _m, t in canon:
        best = max(best, name_map._pair_score(tokens, t))
    return ("fuzzy", round(best, 3)) if best > 0 else ("none", None)


HOW_UZ = {
    "pin": "qo'lda pin (_OVERRIDES)",
    "exact": "aniq (ism bir xil)",
    "fuzzy": "o'xshashlik",
    "none": "bog'lanmagan",
    "short": "ism emas (1 so'z)",
}


def collect(db: Session) -> dict:
    # Every (spelling, place) of the register with its rows and dates — the
    # place is what `register_brigadir` needs to blank the pinned spellings.
    grouped = (
        db.query(QualityComplaint.brigadir, QualityComplaint.place,
                 func.count(QualityComplaint.id),
                 func.min(QualityComplaint.date), func.max(QualityComplaint.date))
        .group_by(QualityComplaint.brigadir, QualityComplaint.place)
        .all()
    )
    total_rows = db.query(func.count(QualityComplaint.id)).scalar() or 0

    per: dict[str, dict] = {}
    blank_rows = 0
    for b, place, n, dmin, dmax in grouped:
        raw = (b or "").strip()
        if not raw:
            blank_rows += n
            continue
        e = per.setdefault(b, {"raw": b, "rows": 0, "first": None, "last": None,
                               "excluded": 0, "excluded_places": set()})
        e["rows"] += n
        if dmin and (e["first"] is None or dmin < e["first"]):
            e["first"] = dmin
        if dmax and (e["last"] is None or dmax > e["last"]):
            e["last"] = dmax
        if name_map.register_brigadir(place, b) is None:
            e["excluded"] += n
            e["excluded_places"].add(place or "")

    live = db.query(Manager).filter(Manager.archived.is_(False)).all()
    archived = db.query(Manager).filter(Manager.archived.is_(True)).all()
    sup = name_map.supervisor_match(live, list(per.keys()))
    sup_arch = name_map.supervisor_match(archived, list(per.keys())) if archived else {}

    fac = {f.id: (f.name_uz or f.name_ru or f.code) for f in db.query(Factory).all()}
    holders: dict[int, list[str]] = defaultdict(list)
    tg_names = {u.telegram_id: (u.tg_name or u.full_name)
                for u in db.query(TelegramUser.telegram_id, TelegramUser.tg_name,
                                  TelegramUser.full_name).all()}
    for r in (db.query(TelegramUserRole)
              .filter(TelegramUserRole.role == "supervisor",
                      TelegramUserRole.status == "approved").all()):
        if r.role_id is not None:
            holders[r.role_id].append(tg_names.get(r.telegram_id) or r.full_name)

    def unit_info(m) -> dict:
        meta = m.supervisor_kind_meta if isinstance(m.supervisor_kind_meta, dict) else {}
        vfx = meta.get("vfx") if isinstance(meta.get("vfx"), dict) else {}
        return {
            "id": m.id, "name": m.name, "shift": m.shift,
            "plant": fac.get(m.factory_id) or "",
            "zagruzka": bool(m.zagruzka_on), "archived": bool(m.archived),
            "kind": m.supervisor_kind or "",
            "vfx_id": m.vfx_employee_id or "",
            "vfx_name": vfx.get("name") or "",
            "holders": sorted(set(holders.get(m.id, []))),
        }

    units = {m.id: unit_info(m) for m in live + archived}

    spellings = []
    for raw, e in per.items():
        hit = sup.get(raw)
        how, score = _how(raw, live)
        arch = None
        if not hit:
            a = sup_arch.get(raw)
            if a:
                arch = units.get(a["id"])
        spellings.append({
            **e,
            "excluded_places": sorted(e["excluded_places"]),
            "unit": units.get(hit["id"]) if hit else None,
            "how": how if hit else ("short" if how == "short" else "none"),
            "score": score if hit else None,
            "archived_match": arch,
        })
    spellings.sort(key=lambda s: (s["unit"] is None,
                                  (s["unit"] or {}).get("name") or "",
                                  -s["rows"], s["raw"]))

    by_unit: dict[int, list[dict]] = defaultdict(list)
    for s in spellings:
        if s["unit"]:
            by_unit[s["unit"]["id"]].append(s)

    return {
        "taken": datetime.now(TZ),
        "total_rows": total_rows,
        "blank_rows": blank_rows,
        "spellings": spellings,
        "by_unit": by_unit,
        "live": [units[m.id] for m in sorted(live, key=lambda m: m.name)],
    }


def text(rep: dict) -> str:
    S = rep["spellings"]
    matched = [s for s in S if s["unit"]]
    unmatched = [s for s in S if not s["unit"]]
    m_rows = sum(s["rows"] - s["excluded"] for s in matched)
    ex_rows = sum(s["excluded"] for s in matched)
    u_rows = sum(s["rows"] for s in unmatched)
    L: list[str] = []
    A = L.append
    A(f"Sifat reyestri — «Отв. бригадир» va IMS (holat {rep['taken']:%d.%m.%Y %H:%M})")
    A("")
    A(f"Jami qatorlar: {rep['total_rows']} · brigadir yozilmagan: {rep['blank_rows']}")
    A(f"Turli yozuvlar: {len(S)} — IMS brigadasiga bog'langan: {len(matched)} "
      f"({m_rows} qator, {len(rep['by_unit'])} ta brigada); "
      f"bog'lanmagan: {len(unmatched)} ({u_rows} qator)")
    if ex_rows:
        A(f"Joyi bo'yicha hisobdan chiqarilgan (Келес B2B pin): {ex_rows} qator")
    A("Qoida: Sifat sahifasining o'zi — name_map.supervisor_match, arxivdagi "
      "brigadalar hisobga olinmaydi.")
    A("")
    A("━━ IMS brigadasi ← varaqdagi yozuv(lar) ━━")
    for u in rep["live"]:
        sp = rep["by_unit"].get(u["id"], [])
        if not sp:
            continue
        rows = sum(s["rows"] - s["excluded"] for s in sp)
        A(f"#{u['id']} {u['name']} · {u['shift'] or '—'}-smena"
          f"{' · ' + u['plant'] if u['plant'] else ''} — {rows} qator")
        for s in sp:
            how = HOW_UZ[s["how"]] + (f" {s['score']}" if s["score"] is not None else "")
            ex = f", {s['excluded']} tasi Келес B2B'da hisobga olinmaydi" if s["excluded"] else ""
            A(f"   ← {s['raw']} ({s['rows']} qator, {s['first']}…{s['last']}; {how}{ex})")
    A("")
    A("━━ Bog'lanmagan yozuvlar (hech qaysi IMS brigadasiga) ━━")
    for s in sorted(unmatched, key=lambda s: (-s["rows"], s["raw"])):
        arch = s["archived_match"]
        note = (f" · arxivdagi #{arch['id']} {arch['name']} ga o'xshaydi"
                if arch else "")
        kind = " · bitta so'z — ism emas" if s["how"] == "short" else ""
        A(f"• {s['raw']} — {s['rows']} qator ({s['first']}…{s['last']}){kind}{note}")
    idle = [u for u in rep["live"] if u["id"] not in rep["by_unit"]]
    A("")
    A("━━ Varaqda nomi chiqmaydigan IMS brigadalari ━━")
    for u in idle:
        plant = f" · {u['plant']}" if u["plant"] else ""
        off = "" if u["zagruzka"] else " · zagruzkada yo'q"
        A(f"• #{u['id']} {u['name']} · {u['shift'] or '—'}-smena{plant}{off}")
    A("")
    A("To'liq ro'yxat — ilova qilingan Excel'da (3 varaq). Hech narsa o'zgartirilmadi.")
    return "\n".join(L)


def _cell(v):
    if isinstance(v, str):
        return ILLEGAL_CHARACTERS_RE.sub("", v)
    return v


def _sheet(wb: Workbook, title: str, head: list[str], rows: list[list]) -> None:
    ws = wb.create_sheet(title)
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rows:
        ws.append([_cell(v) for v in r])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(head, start=1):
        width = max([len(str(h))] + [len(str(r[i - 1])) for r in rows[:400]
                                     if i - 1 < len(r) and r[i - 1] is not None])
        ws.column_dimensions[ws.cell(1, i).column_letter].width = min(max(width + 2, 8), 60)


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    rows = []
    for s in rep["spellings"]:
        u = s["unit"] or {}
        a = s["archived_match"] or {}
        rows.append([
            s["raw"], s["rows"], s["first"], s["last"],
            u.get("id"), u.get("name") or "", u.get("shift"), u.get("plant") or "",
            HOW_UZ[s["how"]], s["score"],
            s["excluded"] or None, ", ".join(s["excluded_places"]),
            (f"#{a['id']} {a['name']}" if a else ""),
            ", ".join(u.get("holders") or []), u.get("vfx_name") or "",
        ])
    _sheet(wb, "Varaqdagi yozuvlar", [
        "Varaqdagi «Отв. бригадир»", "Qatorlar", "Birinchi sana", "Oxirgi sana",
        "IMS brigada id", "IMS brigada", "Smena", "Zavod",
        "Qanday bog'langan", "O'xshashlik", "Hisobdan chiqarilgan qator",
        "Qaysi joyda", "Arxivdagi o'xshash brigada",
        "Telegram egasi(lar)", "Verifix shaxsi"], rows)
    urows = []
    for u in rep["live"]:
        sp = rep["by_unit"].get(u["id"], [])
        urows.append([
            u["id"], u["name"], u["shift"], u["plant"],
            "ha" if u["zagruzka"] else "yo'q", u["kind"],
            len(sp), sum(s["rows"] - s["excluded"] for s in sp),
            " | ".join(s["raw"] for s in sp),
            ", ".join(u["holders"]), u["vfx_name"], u["vfx_id"],
        ])
    _sheet(wb, "IMS brigadalari", [
        "id", "Brigada", "Smena", "Zavod", "Zagruzkada", "Lavozim (Verifix)",
        "Yozuvlar soni", "Qatorlar", "Varaqdagi yozuvlar",
        "Telegram egasi(lar)", "Verifix shaxsi", "Verifix id"], urows)
    _sheet(wb, "Bog'lanmagan", [
        "Varaqdagi «Отв. бригадир»", "Qatorlar", "Birinchi sana", "Oxirgi sana",
        "Sabab", "Arxivdagi o'xshash brigada"],
        [[s["raw"], s["rows"], s["first"], s["last"], HOW_UZ[s["how"]],
          (f"#{s['archived_match']['id']} {s['archived_match']['name']}"
           if s["archived_match"] else "")]
         for s in sorted((s for s in rep["spellings"] if not s["unit"]),
                         key=lambda s: (-s["rows"], s["raw"]))])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def _post(method: str, data: dict, files: dict | None = None) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, files=files, timeout=180)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    body = text(rep)
    book = build_workbook(rep).getvalue()
    db.rollback()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    stamp = rep["taken"].strftime("%d.%m.%Y")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": f"Sifat reyestri — brigadirlar va IMS, {stamp}"},
          files={"document": (f"sifat-brigadirlar-{stamp}.xlsx", book,
                              "application/vnd.openxmlformats-officedocument."
                              "spreadsheetml.sheet")})
    return len(chunks) + 1


# ═══ Report 2 (same day): what changes when a row is attributed by its CELL ═══
# The operator's rulings (2026-11-02, asked one by one): a quality row belongs
# to the brigadir and the «Egasi» its «Номер виновного цеха» cell had ON THE
# ROW'S DATE (`cell_links.value_on`; a cell with no Egasi that day → no
# leader), by the code whatever the fault flag says, on all four pages that
# read the register. Rows with no usable code wait on this report: does their
# «Отв. бригадир» name an IMS brigadir? Nothing is changed — it only reports.
# Sent under `startup.QUALITY_CELL_REPORT_FLAG`.

RESULT_UZ = {
    "same": "bir xil",
    "changes": "boshqa brigadaga o'tadi",
    "gains": "ism bo'yicha yo'q edi — endi bor",
    "loses": "yacheykada brigadir yo'q — brigadasiz qoladi",
    "none_both": "ikkalasida ham yo'q",
}
CODE_UZ = {"cell": "yacheyka", "blank": "kod yo'q", "unknown": "/cells'da yo'q kod"}


def collect_cells(db: Session) -> dict:
    from app.models import Cell, RoleProfile
    from app.services import cell_links, shift_report
    from app.services.cell_lookup import by_verifix, resolve_verifix

    q = (db.query(QualityComplaint.id, QualityComplaint.date, QualityComplaint.ref_no,
                  QualityComplaint.place, QualityComplaint.source, QualityComplaint.ctype,
                  QualityComplaint.category, QualityComplaint.fault,
                  QualityComplaint.fault_code, QualityComplaint.brigadir,
                  QualityComplaint.status)
         .order_by(QualityComplaint.date.desc(), QualityComplaint.id.desc()).all())

    mgrs = db.query(Manager).all()
    live = [m for m in mgrs if not m.archived]
    mname = {m.id: m.name for m in mgrs}
    march = {m.id for m in mgrs if m.archived}
    pname = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name).all()}
    match = name_map.supervisor_match(
        live, {name_map.register_brigadir(r.place, r.brigadir) for r in q} - {None, ""})

    table = by_verifix(db)
    cells = {c.id: c for c in db.query(Cell.id, Cell.verifix_code, Cell.manager_id,
                                       Cell.owner_id, Cell.archived_at).all()}
    cell_links.events(fresh=True)

    def label(mid):
        if mid is None:
            return ""
        return mname.get(mid, f"#{mid}") + (" (arxiv)" if mid in march else "")

    rows, trans = [], defaultdict(lambda: {"rows": 0, "codes": defaultdict(int)})
    verdicts = defaultdict(int)
    state_n = defaultdict(int)
    owner_set = owner_none = 0
    per_unit = defaultdict(lambda: {"name_all": 0, "by_cell": 0, "nocell_name": 0})
    nocell = {}
    unknown = {}
    # October's «Sifat nazorati %» (hair aside, actionable statuses) per unit,
    # three ways: today's name rule; by cell with the no-cell rows by name;
    # by cell with the no-cell rows counted for nobody.
    oct_from, oct_to = "2026-10-01", "2026-11-01"
    octs = defaultdict(lambda: {k: [0, 0] for k in ("today", "cell_name", "cell_only")})

    for r in q:
        raw = (r.brigadir or "").strip()
        reg = name_map.register_brigadir(r.place, r.brigadir)
        name_unit = (match.get(reg) or {}).get("id") if reg else None
        code = (r.fault_code or "").strip()
        cell = resolve_verifix(table, code) if code else None
        state = "cell" if cell else ("blank" if not code else "unknown")
        state_n[state] += 1
        cell_unit = owner = None
        ccode = ""
        if cell:
            c = cells.get(cell["id"])
            ccode = (c.verifix_code if c else cell.get("verifix_code")) or code
            if c is not None:
                cell_unit = cell_links.value_on(c, "manager_id", r.date)
                owner = cell_links.value_on(c, "owner_id", r.date)
            if owner:
                owner_set += 1
            else:
                owner_none += 1
            if name_unit == cell_unit:
                v = "same" if cell_unit else "none_both"
            elif cell_unit is None:
                v = "loses"
            elif name_unit is None:
                v = "gains"
            else:
                v = "changes"
            verdicts[v] += 1
            if v in ("changes", "gains", "loses"):
                t = trans[(name_unit, cell_unit)]
                t["rows"] += 1
                t["codes"][ccode] += 1
            if cell_unit:
                per_unit[cell_unit]["by_cell"] += 1
        else:
            e = nocell.setdefault(raw or "(bo'sh)", {
                "raw": raw or "(bo'sh)", "rows": 0, "blank": 0, "unknown": 0,
                "codes": defaultdict(int), "unit": name_unit,
                "first": None, "last": None})
            e["rows"] += 1
            e["blank" if state == "blank" else "unknown"] += 1
            if state == "unknown":
                e["codes"][code] += 1
                u = unknown.setdefault(code.upper(), {"code": code, "rows": 0,
                                                      "places": defaultdict(int),
                                                      "names": defaultdict(int)})
                u["rows"] += 1
                u["places"][r.place or ""] += 1
                u["names"][raw or "(bo'sh)"] += 1
            d = r.date or ""
            if d and (e["first"] is None or d < e["first"]):
                e["first"] = d
            if d and (e["last"] is None or d > e["last"]):
                e["last"] = d
            if name_unit:
                per_unit[name_unit]["nocell_name"] += 1
        if name_unit:
            per_unit[name_unit]["name_all"] += 1

        if (oct_from <= (r.date or "") < oct_to and r.status in shift_report.ACTIONABLE
                and r.category != shift_report.SKIP_CATEGORY):
            done = 1 if r.status == shift_report.RESOLVED else 0
            def add(unit, key):
                if unit:
                    octs[unit][key][0] += done
                    octs[unit][key][1] += 1
            add(name_unit, "today")
            add(cell_unit if cell else name_unit, "cell_name")
            add(cell_unit if cell else None, "cell_only")

        rows.append([
            r.id, r.date, r.ref_no, r.place, r.source, r.ctype, r.category,
            ("ha" if r.fault is True else "yo'q" if r.fault is False else ""),
            code, CODE_UZ[state], ccode, label(cell_unit),
            (pname.get(owner, f"#{owner}") if owner else ""),
            raw, label(name_unit),
            (RESULT_UZ[v] if cell else ""), r.status,
        ])

    units = sorted({*per_unit.keys(), *octs.keys()},
                   key=lambda u: mname.get(u, ""))
    return {
        "taken": datetime.now(TZ), "total": len(q), "state": dict(state_n),
        "verdicts": dict(verdicts), "owner_set": owner_set, "owner_none": owner_none,
        "trans": sorted(([label(a), label(b), t["rows"],
                          ", ".join(f"{k} ({n})" for k, n in sorted(
                              t["codes"].items(), key=lambda kv: -kv[1])[:12])]
                         for (a, b), t in trans.items()), key=lambda x: -x[2]),
        "units": [{"id": u, "name": label(u), **per_unit[u],
                   "oct": {k: tuple(v) for k, v in octs[u].items()}} for u in units],
        "nocell": sorted(nocell.values(), key=lambda e: -e["rows"]),
        "unknown": sorted(unknown.values(), key=lambda u: -u["rows"]),
        "rows": rows, "label": label,
    }


def _pct(pair) -> str:
    done, n = pair
    return f"{round(100 * done / n)}% ({done}/{n})" if n else "—"


def text_cells(rep: dict) -> str:
    L: list[str] = []
    A = L.append
    st, vd = rep["state"], rep["verdicts"]
    label = rep["label"]
    A(f"Sifat reyestri — qatorlar YACHEYKA bo'yicha (holat {rep['taken']:%d.%m.%Y %H:%M})")
    A("Qoida: «Номер виновного цеха» → yacheyka → o'sha SANADAGI brigadir va «Egasi». "
      "Hech narsa o'zgartirilmadi — bu faqat hisobot.")
    A("")
    A(f"Jami qatorlar: {rep['total']}")
    A(f"• Kod /cells'dagi yacheykaga tushadi: {st.get('cell', 0)}")
    A(f"• Kod yo'q: {st.get('blank', 0)}")
    A(f"• Kod bor, lekin /cells'da yo'q: {st.get('unknown', 0)}")
    A("")
    A("━━ Yacheykaga tushgan qatorlar: bugungi (ism bo'yicha) brigadaga nisbatan ━━")
    for k in ("same", "changes", "gains", "loses", "none_both"):
        A(f"• {RESULT_UZ[k]}: {vd.get(k, 0)}")
    A(f"• «Egasi» bor: {rep['owner_set']} · «Egasi» yo'q (lider bo'lmaydi): {rep['owner_none']}")
    A("")
    A("━━ Eng katta o'tishlar (ism bo'yicha → yacheyka bo'yicha) ━━")
    for a, b, n, codes in rep["trans"][:20]:
        A(f"• {a or '—'} → {b or '—'}: {n} qator · kodlar: {codes}")
    A("")
    A("━━ Brigadalar: qatorlar va oktyabr «Sifat nazorati %» ━━")
    A("(bugun · yacheyka + kodsizlar ism bo'yicha · yacheyka, kodsizlar hech kimniki)")
    for u in rep["units"]:
        o = u["oct"]
        A(f"• {u['name']}: ism {u['name_all']} → yacheyka {u['by_cell']} "
          f"(+ kodsiz ism bo'yicha {u['nocell_name']}) · okt: {_pct(o['today'])} · "
          f"{_pct(o['cell_name'])} · {_pct(o['cell_only'])}")
    A("")
    A("━━ Kodsiz / noma'lum kodli qatorlar — «Отв. бригадир» IMS brigadasimi? ━━")
    with_unit = sum(e["rows"] for e in rep["nocell"] if e["unit"])
    no_unit = sum(e["rows"] for e in rep["nocell"] if not e["unit"])
    A(f"IMS brigadasiga tushadi: {with_unit} qator · tushmaydi: {no_unit} qator")
    for e in rep["nocell"][:40]:
        who = label(e["unit"]) if e["unit"] else "IMS brigadasi emas"
        A(f"• {e['raw']} — {e['rows']} (kodsiz {e['blank']}, noma'lum kod {e['unknown']}) → {who}")
    if len(rep["nocell"]) > 40:
        A(f"… yana {len(rep['nocell']) - 40} ta yozuv — Excel'da")
    A("")
    A("━━ /cells'da yo'q kodlar (eng ko'p) ━━")
    for u in rep["unknown"][:20]:
        places = ", ".join(p for p, _ in sorted(u["places"].items(), key=lambda kv: -kv[1])[:2])
        A(f"• {u['code']} — {u['rows']} qator · {places}")
    A("")
    A("Excel: har bir qator, o'tishlar, brigadalar, kodsizlar, noma'lum kodlar.")
    return "\n".join(L)


def build_cells_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    _sheet(wb, "Qatorlar", [
        "id", "Sana", "№", "Joy", "Manba", "Tur", "Kategoriya", "Vina",
        "Kod (varaq)", "Kod holati", "Yacheyka", "Brigada (yacheyka, shu sana)",
        "Egasi (shu sana)", "«Отв. бригадир» (varaq)", "Brigada (ism, bugun)",
        "Natija", "Holat"], rep["rows"])
    _sheet(wb, "O'tishlar", ["Ism bo'yicha (bugun)", "Yacheyka bo'yicha (yangi)",
                             "Qatorlar", "Kodlar"], rep["trans"])
    _sheet(wb, "Brigadalar", [
        "id", "Brigada", "Qatorlar: ism bo'yicha (bugun)", "Qatorlar: yacheyka bo'yicha",
        "Kodsiz qatorlar, ism shu brigada", "Okt %: bugun",
        "Okt %: yacheyka + kodsiz ism bo'yicha", "Okt %: faqat yacheyka"],
        [[u["id"], u["name"], u["name_all"], u["by_cell"], u["nocell_name"],
          _pct(u["oct"]["today"]), _pct(u["oct"]["cell_name"]),
          _pct(u["oct"]["cell_only"])] for u in rep["units"]])
    _sheet(wb, "Kodsiz qatorlar", [
        "«Отв. бригадир»", "Qatorlar", "Kod yo'q", "Noma'lum kod", "Kodlar",
        "IMS brigadasi (ism bo'yicha)", "Birinchi sana", "Oxirgi sana"],
        [[e["raw"], e["rows"], e["blank"], e["unknown"],
          ", ".join(f"{k} ({n})" for k, n in sorted(e["codes"].items(), key=lambda kv: -kv[1])[:15]),
          rep["label"](e["unit"]) if e["unit"] else "", e["first"], e["last"]]
         for e in rep["nocell"]])
    _sheet(wb, "Noma'lum kodlar", ["Kod", "Qatorlar", "Joylar", "«Отв. бригадир»"],
           [[u["code"], u["rows"],
             ", ".join(f"{k} ({n})" for k, n in sorted(u["places"].items(), key=lambda kv: -kv[1])[:6]),
             ", ".join(f"{k} ({n})" for k, n in sorted(u["names"].items(), key=lambda kv: -kv[1])[:6])]
            for u in rep["unknown"]])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


def send_cells(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect_cells(db)
    body = text_cells(rep)
    book = build_cells_workbook(rep).getvalue()
    db.rollback()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    stamp = rep["taken"].strftime("%d.%m.%Y")
    _post("sendDocument",
          {"chat_id": chat_id,
           "caption": f"Sifat reyestri — yacheyka bo'yicha brigada va Egasi, {stamp}"},
          files={"document": (f"sifat-yacheyka-{stamp}.xlsx", book,
                              "application/vnd.openxmlformats-officedocument."
                              "spreadsheetml.sheet")})
    return len(chunks) + 1
