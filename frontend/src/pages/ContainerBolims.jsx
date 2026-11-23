// «Bo'limlar» — each team's room, set by hand (2026-11-23).
//
// The operator, on «Konteyner taqsimlash»: «open another row after container
// split … most of teams location written is incorrect, i want to change it by
// hand, so make it possible and easy». A menu row of its own in the container
// app (page key `container-bolims`, admin-only): the cells of every brigadir
// the flow serves, grouped by brigadir.
//
// TYPED LIKE A SPREADSHEET (the operator's pick, the same day): each team has
// three fields — Room · Block · Floor. The room field suggests the rooms that
// exist (a picked one fills its block and floor and saves at once); a name
// that matches no room with that block and floor makes a new room by itself
// (backend `put_cell_place`). A row saves when focus leaves it or on Enter,
// and Enter moves to the next team's room field. A blank room clears it.
// The rooms are the `bolims` of /cells (`services/bolims.py`).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Check, Loader2, MapPin } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import BolimsModal from "../components/BolimsModal";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import { cellName } from "../utils/cellName";
import { latinFold } from "../utils/latinCode";
import { bolimName, bolimWhere } from "../utils/bolim";
import api from "../utils/api";

const DOOR = "/api/container-flow/bolims";
const KEY = ["cflow-bolims"];
const fold = (s) => latinFold(String(s ?? "").trim().replace(/\s+/g, " "));
const FIELD = "w-full min-w-0 px-2.5 py-1.5 text-sm rounded-lg outline-none focus:ring-2 focus:ring-[var(--brand)]";
const FIELD_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

// The rooms that match what is typed, under the room field — portaled to
// <body> and seated against the field, so the table's scroller never clips
// it. ↑ ↓ walk it, Enter or a click picks; the field keeps the focus.
function Suggestions({ anchor, items, active, onPick }) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    const place = () => { const r = anchor.current?.getBoundingClientRect(); if (r) setRect(r); };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [anchor]);
  if (!rect || !items.length) return null;
  const below = window.innerHeight - rect.bottom > 220 || rect.top < 220;
  return createPortal(
    <ul role="listbox" className="pop fixed z-[220] rounded-xl py-1 overflow-y-auto shadow-xl"
      data-side={below ? undefined : "top"}
      style={{
        left: rect.left, width: Math.max(rect.width, 280), maxHeight: 216,
        ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
        background: "var(--bg-card)", border: "1px solid var(--border)",
      }}>
      {items.map(([label], i) => (
        <li key={label} role="option" aria-selected={i === active}
          onMouseDown={(e) => { e.preventDefault(); onPick(i); }}
          className="px-3 py-2 text-sm cursor-pointer truncate"
          style={{ color: "var(--text-1)", background: i === active ? "var(--hover-bg)" : undefined }}>
          {label}
        </li>
      ))}
    </ul>,
    document.body,
  );
}

// One team's three fields. `layout` "row" = table cells, "card" = a phone card.
function PlaceRow({ cell, rooms, byId, nameOf, suggest, onSave, status, registerFirst, onEnter, t, layout }) {
  const fromRoom = () => {
    const r = cell.bolim_id ? byId.get(cell.bolim_id) : null;
    return r ? { name: nameOf(r), block: r.block || "", floor: r.floor == null ? "" : String(r.floor) }
      : { name: "", block: "", floor: "" };
  };
  const [d, setD] = useState(fromRoom);
  const [bad, setBad] = useState(false);
  const base = fromRoom();
  // THIS row's room changed underneath (its save, a rename, a refresh): show
  // it. Keyed on the row's own room only — another row's save adding a room
  // must not wipe what is being typed here.
  const baseKey = JSON.stringify(base);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setD(fromRoom()); setBad(false); }, [baseKey]);
  const boxRef = useRef(null);
  const nameRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = fold(d.name);
  const items = open ? [...suggest].filter(([label]) => !q || fold(label).includes(q)).slice(0, 8) : [];
  const norm = (x) => ({ name: x.name.trim().replace(/\s+/g, " "), block: x.block.trim().toUpperCase(), floor: x.floor.trim().replace("−", "-") });
  const dirty = (x) => JSON.stringify(norm(x)) !== JSON.stringify(norm(base));

  const commit = (x = d) => {
    if (!dirty(x)) return;
    const n = norm(x);
    if (n.floor !== "" && !/^-?\d+$/.test(n.floor)) { setBad(true); return; }
    setBad(false);
    const floor = n.floor === "" ? null : Number(n.floor);
    if (!n.name) { onSave(cell, { name: "" }); return; }
    const hit = rooms.find((r) => fold(nameOf(r)) === fold(n.name) && (r.block || "") === n.block
      && (r.floor ?? null) === floor);
    onSave(cell, hit ? { bolim_id: hit.id } : { name: n.name, block: n.block, floor });
  };
  // a suggestion picked: its block and floor come with it, saved at once
  const pickAt = (i) => {
    const r = items[i]?.[1];
    if (!r) return;
    const x = { name: nameOf(r), block: r.block || "", floor: r.floor == null ? "" : String(r.floor) };
    setD(x);
    setOpen(false);
    setActive(-1);
    commit(x);
  };
  const change = (k, v) => {
    if (k === "name") { setOpen(true); setActive(-1); }
    setD((p) => ({ ...p, [k]: v }));
  };
  const onBlur = (e) => {
    if (!boxRef.current?.contains(e.relatedTarget)) { setOpen(false); commit(); }
  };
  const onKey = (e) => {
    if (open && items.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((a) => (e.key === "ArrowDown" ? Math.min(items.length - 1, a + 1) : Math.max(-1, a - 1)));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) { pickAt(active); return; }
      setOpen(false);
      commit();
      onEnter(cell.id);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (open) { setOpen(false); return; }
      setD(base); setBad(false);
    }
  };
  const mark = bad
    ? <AlertTriangle size={14} style={{ color: "var(--status-bad)" }} aria-label={t("cbol.floorBad")} title={t("cbol.floorBad")} />
    : status === "saving" ? <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-3)" }} aria-label={t("common.save")} />
    : status === "saved" ? <Check size={14} style={{ color: "var(--status-ok)" }} aria-label={t("cbol.saved")} />
    : status === "error" ? <AlertTriangle size={14} style={{ color: "var(--status-bad)" }} aria-label={t("admin.profiles.error")} />
    : null;
  const name = (
    <>
      <input ref={(el) => { nameRef.current = el; registerFirst(cell.id, el); }} value={d.name} placeholder={t("cbol.roomPh")}
        onChange={(e) => change("name", e.target.value)} onKeyDown={onKey} onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)} className={FIELD} style={FIELD_STYLE}
        role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list"
        aria-label={`${cell.code} — ${t("cbol.colName")}`} autoComplete="off" />
      {open && <Suggestions anchor={nameRef} items={items} active={active} onPick={pickAt} />}
    </>
  );
  const block = (
    <input value={d.block} maxLength={8} placeholder="—" onChange={(e) => change("block", e.target.value.toUpperCase())}
      onKeyDown={onKey} className={`${FIELD} text-center uppercase`} style={FIELD_STYLE}
      aria-label={`${cell.code} — ${t("cbol.colBlock")}`} autoComplete="off" />
  );
  const floor = (
    <input value={d.floor} inputMode="text" maxLength={3} placeholder="—" onChange={(e) => change("floor", e.target.value)}
      onKeyDown={onKey} className={`${FIELD} text-center tabular-nums`}
      style={{ ...FIELD_STYLE, ...(bad ? { borderColor: "var(--status-bad)" } : null) }}
      aria-label={`${cell.code} — ${t("cbol.colFloor")}`} aria-invalid={bad || undefined} autoComplete="off" />
  );
  if (layout === "card") {
    return (
      <div ref={boxRef} onBlur={onBlur} className="flex flex-col gap-2">
        {name}
        <div className="grid grid-cols-[1fr_1fr_20px] gap-2 items-center">
          {block}{floor}<span className="flex justify-center">{mark}</span>
        </div>
      </div>
    );
  }
  return (
    <div ref={boxRef} onBlur={onBlur} className="grid grid-cols-[minmax(0,1fr)_64px_64px_20px] gap-2 items-center">
      {name}{block}{floor}<span className="flex justify-center">{mark}</span>
    </div>
  );
}

export default function ContainerBolims() {
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });
  // Always read fresh on open: the app keeps its query cache across reloads,
  // and a page edited by hand must never open on a copy from before a save.
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get(DOOR).then((r) => r.data),
    staleTime: 0, refetchOnMount: "always" });
  const [search, setSearch] = usePersistentState("cbol_search", "");
  const [only, setOnly] = usePersistentState("cbol_only", "all");     // all · unset
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [status, setStatus] = useState({});              // cell id → saving · saved · error

  const bolims = q.data?.bolims ?? [];
  const units = q.data?.units ?? [];
  const nameOf = (b) => tx(bolimName(b, lang));
  const byId = useMemo(() => new Map(bolims.map((b) => [b.id, b])), [bolims]);
  // The suggestions: «name · A blok · 2-qavat», each unique, mapped back to its room.
  const suggest = useMemo(() => {
    const m = new Map();
    for (const b of bolims) {
      const label = [nameOf(b), bolimWhere(t, b)].filter(Boolean).join(" · ");
      if (label && !m.has(label)) m.set(label, b);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bolims, lang, t, tx]);

  const shop = (c) => tx(cellName(c.workshop, lang, ""));
  const groups = useMemo(() => {
    const qq = latinFold(search.trim());
    return units.map((u) => ({
      ...u,
      shown: u.cells.filter((c) => (only !== "unset" || !c.bolim_id)
        && (!qq || latinFold(`${c.code} ${shop(c)} ${tl(u.name)}`).includes(qq))),
    })).filter((u) => u.shown.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, search, only, lang, tl, tx]);
  const order = useMemo(() => groups.flatMap((u) => u.shown.map((c) => c.id)), [groups]);
  const unsetCount = units.reduce((n, u) => n + u.cells.filter((c) => !c.bolim_id).length, 0);

  // Enter → the next team's room field (the table's on a PC, the card's on a phone).
  const firsts = useRef(new Map());
  const registerFirst = (id, el) => {
    const m = firsts.current;
    if (!el) return;
    const list = m.get(id) || new Set();
    list.add(el);
    m.set(id, list);
  };
  const onEnter = (id) => {
    const next = order[order.indexOf(id) + 1];
    if (next == null) return;
    const els = [...(firsts.current.get(next) || [])].filter((el) => el.isConnected && el.offsetParent !== null);
    els[0]?.focus();
  };

  const patch = (cid, bolim_id, room) => qc.setQueryData(KEY, (d) => d && ({
    ...d,
    bolims: room && !d.bolims.some((b) => b.id === room.id) ? [...d.bolims, room] : d.bolims,
    units: d.units.map((u) => ({ ...u, cells: u.cells.map((c) => (c.id === cid ? { ...c, bolim_id } : c)) })),
  }));
  const save = async (cell, body) => {
    setStatus((s) => ({ ...s, [cell.id]: "saving" }));
    try {
      const r = (await api.put(`${DOOR}/cell/${cell.id}/place`, body)).data;
      patch(cell.id, r.bolim_id, r.bolim);
      setStatus((s) => ({ ...s, [cell.id]: "saved" }));
      setTimeout(() => setStatus((s) => (s[cell.id] === "saved" ? { ...s, [cell.id]: undefined } : s)), 1800);
      if (r.created && r.bolim) toast.success(t("cbol.savedNew").replace("{name}", tx(bolimName(r.bolim, lang))));
      // the split and /cells read the same rooms
      qc.invalidateQueries({ queryKey: ["cflow-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-cells"] });
    } catch (e) {
      setStatus((s) => ({ ...s, [cell.id]: "error" }));
      toast.error(`${cell.code}: ${e?.response?.data?.detail || t("admin.profiles.error")}`);
    }
  };
  const rowProps = (c) => ({
    cell: c, rooms: bolims, byId, nameOf, suggest, onSave: save, status: status[c.id],
    registerFirst, onEnter, t,
  });

  const unitHead = (u) => {
    const unset = u.cells.filter((c) => !c.bolim_id).length;
    return (
      <span className="flex items-center gap-2 min-w-0">
        <span className="font-semibold truncate" style={{ color: "var(--text-1)" }}>{tl(u.name)}</span>
        <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {t("cbol.cells").replace("{n}", u.cells.length)}
          {unset > 0 && <span style={{ color: "var(--status-warn)" }}> · {t("cbol.unsetCount").replace("{n}", unset)}</span>}
        </span>
      </span>
    );
  };

  const mobile = q.isLoading ? (
    <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-24 w-full" />)}</div>
  ) : !groups.length ? (
    <div className="py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{t("cbol.empty")}</div>
  ) : (
    <div className="flex flex-col gap-4">
      {groups.map((u) => (
        <section key={u.id} className="flex flex-col gap-2">
          <div className="px-1">{unitHead(u)}</div>
          {u.shown.map((c) => (
            <div key={c.id} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <div className="flex items-baseline gap-2 min-w-0">
                <b className="font-mono tabular-nums" style={{ color: "var(--text-1)" }}>{c.code}</b>
                <span className="text-xs truncate" style={{ color: "var(--text-2)" }}>{shop(c)}</span>
              </div>
              <PlaceRow {...rowProps(c)} layout="card" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );

  return (
    <Layout title={t("nav.containerBolims")}>
      <p className="text-sm mb-3" style={{ color: "var(--text-3)" }}>{t("cbol.hint")}</p>
      <TableCard
        icon={MapPin}
        title={t("nav.containerBolims")}
        fixed
        minWidth={760}
        mobile={mobile}
        mobileCards
        mobileMaxHeight="none"
        maxHeight="none"
        right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{order.length}</span>}
        toolbar={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder={t("cbol.search")} className="w-full sm:w-64" />
            <SegmentedToggle value={only === "unset" ? "unset" : "all"} onChange={setOnly}
              options={[["all", t("cbol.all")], ["unset", `${t("cbol.unset")} · ${unsetCount}`]]} />
            <div className="ml-auto flex items-center gap-2">
              <Button size="lg" variant="secondary" icon={<Building2 size={14} />} onClick={() => setRoomsOpen(true)} className="whitespace-nowrap">
                {t("cbol.rooms")}
              </Button>
            </div>
          </>
        }
      >
        <thead>
          <tr>
            <Th label={t("cbol.colCode")} cls="w-[11%]" />
            <Th label={t("cbol.colWorkshop")} cls="w-[25%]" />
            <Th icon={MapPin} label={`${t("cbol.colName")} · ${t("cbol.colBlock")} · ${t("cbol.colFloor")}`} cls="w-[64%]" />
          </tr>
        </thead>
        <tbody>
          {q.isLoading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={`sk-${i}`}>{[0, 1, 2].map((j) => <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>)}</tr>
          ))}
          {!q.isLoading && !groups.length && (
            <tr><td colSpan={3} className="px-3 py-10 text-center" style={{ color: "var(--text-4)" }}>{t("cbol.empty")}</td></tr>
          )}
          {groups.map((u) => (
            <Fragment key={u.id}>
              <tr>
                <td colSpan={3} className="px-3 py-2" style={{ background: "var(--bg-inner)" }}>{unitHead(u)}</td>
              </tr>
              {u.shown.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-1.5 font-mono font-semibold whitespace-nowrap" style={{ color: "var(--text-1)" }}>{c.code}</td>
                  <td className="px-3 py-1.5"><span className="block truncate" style={{ color: "var(--text-2)" }} title={shop(c)}>{shop(c) || "—"}</span></td>
                  <td className="px-3 py-1.5"><PlaceRow {...rowProps(c)} layout="row" /></td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </TableCard>

      {roomsOpen && (
        <BolimsModal bolims={bolims} endpoint={DOOR} canDelete={false}
          onClose={() => setRoomsOpen(false)} onChanged={() => qc.invalidateQueries({ queryKey: KEY })} />
      )}
      {toast.node}
    </Layout>
  );
}
