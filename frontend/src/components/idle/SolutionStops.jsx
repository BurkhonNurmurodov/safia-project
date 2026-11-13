import { createElement, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, Clock, ListChecks,
  Pencil, PenLine,
} from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import StyledSelect from "../ui/StyledSelect";
import ActionMenu from "../ui/ActionMenu";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import KPICard from "../ui/KPICard";
import { SplitBar, SplitLegend } from "../ui/Meter";
import Pagination from "../ui/Pagination";
import EmptyState from "../ui/EmptyState";
import FormField from "../ui/FormField";
import CellLink from "../ui/CellLink";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";
import { ROLE_LABEL_KEYS } from "../../config/pages";
import { catColor, iconFor } from "./categories";
import OwnerChip from "./OwnerChip";
import { fill } from "../../pages/idleSolutionsText";
import api from "../../utils/api";

/**
 * «Muammolar» tab of «Kutish yechimlari» (GET /api/idle-solutions/stops,
 * routers/idle_solutions.py) — built for a brigadir with a phone in one hand:
 * every filed stop in reach as ONE flat list, newest first under its day, and
 * one button on each that opens the writing sheet.
 *
 *   the card on top   how many stops still wait (for the brigadir and the
 *                     cause's owner: for THEIR own answer), as one split bar
 *   the list          a stop = its cause, cell, clock and the leader's own
 *                     comment, then what was already written to it
 *   the sheet         «Siz nima qildingiz?» — and «Saqlash va keyingisi»
 *                     walks the stops still waiting, one after another
 *
 * The server says whose each row is (`mine`, `can_edit`) and whether this
 * reader is one whose own answer every stop waits for (`expects_me`).
 */
const AMBER = "var(--status-warn)";
const GREEN = "var(--status-ok)";
const GREY = "#94a3b8";
const BLUE = "#3b82f6";
const STATE_INK = { none: GREY, open: AMBER, doing: BLUE, done: GREEN };
// a FILL takes the raw hue (Meter.jsx): written / waiting / nothing yet
const FILL = { done: "#22c55e", wait: "#eab308", none: GREY };
const STATUS_ORDER = ["done", "doing", "open"];   // «what did you do» — done leads
const PAGE = 20;
const NONE = new Set();

const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "");
const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const ddmmyy = (iso) => (iso ? `${ddmm(iso)}.${iso.slice(0, 4)}` : "");
// a keyboard that rises by itself hides the comment the reader came to answer
const FINE_POINTER = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: fine)").matches;

const fieldCls = "w-full rounded-xl px-3 py-2 text-base sm:text-sm resize-y min-h-[88px]";
const fieldStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

function StateChip({ T, state }) {
  const ink = STATE_INK[state] || GREY;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap flex-shrink-0"
      style={{ color: ink, background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)` }}>
      {T.st[state] || state}
    </span>
  );
}

function CauseIcon({ category, size = 28 }) {
  const hue = catColor(category);
  return (
    <span className="rounded-lg inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue }}>
      {createElement(iconFor(catCode(category)), { size: Math.round(size * 0.54) })}
    </span>
  );
}

/** Who wrote a solution and when: «A. Manzura (siz) · Brigadir · 12.11.2026». */
function useByline(T) {
  const { t } = useLang();
  const { tl } = useTranslit();
  return (x) => {
    const who = x.author_name ? shortPerson(tl(x.author_name) || x.author_name) : "—";
    const role = ROLE_LABEL_KEYS[x.author_role] ? t(ROLE_LABEL_KEYS[x.author_role]) : "";
    return { who, text: `${who}${x.mine ? ` (${T.youTag})` : ""}${role ? ` · ${role}` : ""} · ${ddmmyy(x.created_at)}` };
  };
}

/** A solution on a stop's card: read at a glance; its author marks it done in one tap. */
function SolutionLine({ T, x, byline, onDone }) {
  const b = byline(x);
  return (
    <li className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: STATE_INK[x.status] || GREY }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{x.text}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>{b.text} · {T.st[x.status] || x.status}</div>
        </div>
        {/* the one-tap «done» is the AUTHOR's — an admin changes somebody else's row inside the sheet */}
        {x.mine && x.can_edit && x.status !== "done" && (
          <Button size="sm" variant="success" tint icon={<Check size={12} />} title={T.markDone}
            aria-label={T.markDone} onClick={() => onDone(x)}>
            {T.st.done}
          </Button>
        )}
      </div>
    </li>
  );
}

/** The same solution inside the sheet: its author (and an admin) change its status and words. */
function SolutionRow({ T, x, byline, notify, onChanged }) {
  const [draft, setDraft] = useState(null);   // null = reading, a string = editing the text
  const [busy, setBusy] = useState(false);
  const b = byline(x);
  async function put(body) {
    try {
      await api.put(`/api/idle-solutions/${x.id}`, body);
      onChanged();
      return true;
    } catch {
      notify(T.saveFail, "error");
      return false;
    }
  }
  async function saveText() {
    if (!draft.trim()) return;
    setBusy(true);
    if (await put({ text: draft.trim() })) setDraft(null);
    setBusy(false);
  }
  return (
    <li className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[11px] min-w-0" style={{ color: "var(--text-3)" }}>{b.text}</div>
        {x.can_edit ? (
          <div className="flex items-center gap-1 flex-shrink-0" data-no-draft>
            <StyledSelect value={x.status} onChange={(v) => put({ status: v })}
              options={STATUS_ORDER.map((k) => ({ value: k, label: T.st[k] }))}
              triggerClassName="px-2.5 py-1.5 text-xs" />
            <ActionMenu label={`${T.actions}: ${b.who}`}
              items={[{ key: "edit", label: T.edit, icon: Pencil, onSelect: () => setDraft(x.text) }]} />
          </div>
        ) : <StateChip T={T} state={x.status} />}
      </div>
      {draft == null ? (
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{x.text}</p>
      ) : (
        <div className="mt-1.5" data-no-draft>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000}
            autoFocus className={fieldCls} style={fieldStyle} aria-label={T.edit} />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>{T.cancel}</Button>
            <Button onClick={saveText} loading={busy} disabled={!draft.trim() || draft.trim() === x.text}>{T.save}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** One filed stop: what happened, where, when — and the one button that answers it. */
function StopRow({ T, s, label, unit, perm, byline, first, onOpen, onDone }) {
  const code = catCode(s.category);
  const asked = perm.write && perm.expects && !s.mine;   // this reader's own answer is the one missing
  return (
    <li className="px-4 py-3" style={{ borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div className="flex items-start gap-2.5 min-w-0">
        <CauseIcon category={s.category} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
            {label(code) || s.category}
            {label(code) ? <span className="font-normal max-sm:hidden" style={{ color: "var(--text-3)" }}> · {code}</span> : null}
          </div>
          <div className="text-[11px] tabular-nums mt-0.5" style={{ color: "var(--text-3)" }}>
            <CellLink id={s.cell_id} className="font-semibold" style={{ color: "var(--text-2)" }}>{s.cell}</CellLink>
            {s.start ? ` · ${s.start}–${s.end}` : ""}
            {s.minutes ? ` · ${fill(T.minutes, { m: Math.round(s.minutes) })}` : ""}
            {unit ? ` · ${unit}` : ""}
          </div>
        </div>
        <StateChip T={T} state={s.state} />
      </div>
      <p className="text-sm mt-2 whitespace-pre-wrap break-words" style={{ color: s.note ? "var(--text-1)" : "var(--text-3)" }}>
        {s.note ? `«${s.note}»` : T.noNote}
      </p>
      {s.solutions.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {s.solutions.map((x) => <SolutionLine key={x.id} T={T} x={x} byline={byline} onDone={onDone} />)}
        </ul>
      )}
      {perm.write && (
        <div className="mt-2.5">
          <Button size={asked ? "lg" : "md"} variant={asked ? "primary" : "secondary"}
            className={asked ? "w-full sm:w-auto" : ""} icon={<PenLine size={asked ? 15 : 13} />}
            onClick={() => onOpen(s.id)}>
            {s.mine ? T.addAnother : T.writeOne}
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * The writing sheet. ONE dialog stays up while the reader works through the
 * stops still waiting: «Saqlash va keyingisi» saves and shows the next one.
 */
function Writer({ T, label, queue, byId, units, owners, mineTexts, perm, isPending, byline, showUnit, notify, onClose, onSaved, refresh }) {
  const { tl } = useTranslit();
  const [pos, setPos] = useState(0);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("done");
  const [busy, setBusy] = useState(false);
  const stop = byId.get(queue[pos]);
  if (!stop) return null;
  const code = catCode(stop.category);
  const next = queue.findIndex((id, i) => i > pos && byId.has(id) && isPending(byId.get(id)));
  const unit = showUnit ? units[String(stop.manager_id)]?.manager_name : null;
  const owner = owners[stop.category];
  const before = mineTexts(stop);
  const move = (to) => { setPos(to); setText(""); setStatus("done"); };
  async function save() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.post("/api/idle-solutions", { category: stop.category, manager_id: stop.manager_id, event_id: stop.id, text: body, status });
      onSaved(stop.id);
      if (next >= 0) {
        notify(T.saved, "success");
        move(next);
      } else {
        notify(queue.length > 1 ? T.allWritten : T.saved, "success");
        onClose();
      }
    } catch {
      notify(T.saveFail, "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} dismissable={!busy} dirty={text.trim().length > 0}
      icon={createElement(iconFor(code), { size: 18, style: { color: catColor(stop.category) } })}
      title={label(code) || stop.category}
      subtitle={[
        ddmmyy(stop.date), stop.cell, stop.start ? `${stop.start}–${stop.end}` : null,
        stop.minutes ? fill(T.minutes, { m: Math.round(stop.minutes) }) : null,
        unit ? shortPerson(tl(unit) || unit) : null,
        queue.length > 1 ? fill(T.sheetProgress, { i: pos + 1, n: queue.length }).replace(/ /g, "\u00a0") : null,
      ].filter(Boolean).join(" · ")}
      footer={
        <>
          {/* Two buttons, so they fit a phone: the way on while stops still wait
              (the X closes), the way out once they do not. A draft is never
              skipped past — it is saved or cleared first. */}
          {next >= 0
            ? <Button variant="secondary" onClick={() => move(next)} disabled={busy || !!text.trim()}>{T.skip}</Button>
            : <Button variant="secondary" onClick={onClose} disabled={busy}>{T.close}</Button>}
          {perm.write && (
            <Button onClick={save} loading={busy} disabled={!text.trim()}>{next >= 0 ? T.saveNext : T.save}</Button>
          )}
        </>
      }>
      <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          {T.comment}{stop.leader ? ` · ${T.leader}: ${shortPerson(tl(stop.leader) || stop.leader)}` : ""}
        </div>
        <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: stop.note ? "var(--text-1)" : "var(--text-3)" }}>
          {stop.note || T.noNote}
        </p>
      </div>
      {owner && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: "var(--text-3)" }}>
          <span>{T.owner}:</span>
          <OwnerChip owners={owners} category={stop.category} full />
        </div>
      )}
      {stop.solutions.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>{T.written}</div>
          <ul className="space-y-2">
            {stop.solutions.map((x) => <SolutionRow key={x.id} T={T} x={x} byline={byline} notify={notify} onChanged={refresh} />)}
          </ul>
        </div>
      )}
      {perm.write && (
        <>
          <FormField label={T.whatDid}>
            <textarea key={stop.id} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000}
              autoFocus={FINE_POINTER} placeholder={T.whatDidPh} className={fieldCls} style={fieldStyle} />
          </FormField>
          {before.length > 0 && (
            <div>
              <div className="text-[11px] mb-1.5" style={{ color: "var(--text-3)" }}>{T.mineBefore}</div>
              <div className="flex flex-wrap gap-1.5">
                {before.map((b) => (
                  <button key={b} type="button" onClick={() => setText((v) => (v.trim() ? `${v.trim()} ${b}` : b))}
                    className="text-xs text-left rounded-lg px-2.5 py-1.5 max-w-full truncate"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }} title={b}>
                    {b}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FormField label={T.statusLabel}>
            <SegmentedToggle fill value={status} onChange={setStatus} options={STATUS_ORDER.map((k) => [k, T.st[k]])} />
          </FormField>
        </>
      )}
    </Modal>
  );
}

export default function SolutionStops({ T, data, label, isSupervisor, cats, cells, listKey, initialShow, onClearFilters, refresh }) {
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const toast = useToast({ position: "bottom" });
  const byline = useByline(T);
  const top = useRef(null);
  const perm = { write: data.can_write ?? true, expects: !!data.expects_me };
  // «waiting»: for the brigadir and the cause's owner — their OWN answer; for the rest — anybody's
  const isPending = (s) => (perm.expects ? !s.mine : s.solutions.length === 0);
  const [show, setShow] = useState(initialShow || (data.expects_me ? "pending" : "all"));
  // Stops answered while «waiting» is on stay in place until the list is asked
  // for again: saving must not pull the row out from under the reader.
  const [keptOn, setKeptOn] = useState({ key: "", ids: NONE });
  const [pageOn, setPageOn] = useState({ key: "", page: 1 });
  // { queue: [stop ids], n: opened count } — `n` keys the sheet per opening, under
  // a name of its own: the toast beside it is keyed 1, 2, 3 … as well
  const [writer, setWriter] = useState(null);
  const [legacyOpen, setLegacyOpen] = useState(false);

  const all = data.stops;
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const pool = useMemo(
    () => all.filter((s) => (!cats.length || cats.includes(s.category)) && (!cells.length || cells.includes(s.cell))),
    [all, cats, cells]);
  const narrowed = cats.length > 0 || cells.length > 0;
  const viewKey = `${listKey}|${cats.join(",")}|${cells.join(",")}`;
  const kept = keptOn.key === viewKey ? keptOn.ids : NONE;
  const waitingN = pool.filter(isPending).length;
  const list = show === "pending" ? pool.filter((s) => isPending(s) || kept.has(s.id)) : pool;
  const pageKey = `${viewKey}|${show}`;
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE));
  const page = Math.min(pageOn.key === pageKey ? pageOn.page : 1, pageCount);
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const days = [];
  for (const s of rows) {
    if (!days.length || days[days.length - 1].date !== s.date) days.push({ date: s.date, items: [] });
    days[days.length - 1].items.push(s);
  }
  const perDay = useMemo(() => {
    const n = new Map();
    for (const s of list) n.set(s.date, (n.get(s.date) || 0) + 1);
    return n;
  }, [list]);

  const notify = (message, tone) => toast.show(message, tone);
  const unitOf = (s) => {
    const n = data.units?.[String(s.manager_id)]?.manager_name;
    return n ? shortPerson(tl(n) || n) : "";
  };
  const dayLabel = (iso) => {
    const d = new Date(`${iso}T00:00:00`);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const back = Math.round((now - d) / 864e5);
    if (back === 0) return `${T.today} · ${ddmm(iso)}`;
    if (back === 1) return `${T.yesterday} · ${ddmm(iso)}`;
    return `${ddmm(iso)} · ${T.an.wdFull[(d.getDay() + 6) % 7]}`;
  };
  // what this reader wrote before for the same cause — a tap puts it into the text
  const mineTexts = (stop) => {
    const here = new Set(stop.solutions.map((x) => x.text));
    const out = [];
    for (const s of all) {
      if (s.category !== stop.category) continue;
      for (const x of s.solutions) {
        if (x.mine && !here.has(x.text) && !out.includes(x.text)) out.push(x.text);
        if (out.length === 3) return out;
      }
    }
    return out;
  };
  const pickShow = (v) => { setKeptOn({ key: "", ids: NONE }); setShow(v); };
  const open = (id) => {
    const s = byId.get(id);
    let queue = [id];
    if (s && isPending(s)) {
      // the stops still waiting, in the list's own order, starting from this one
      const ids = list.filter(isPending).map((x) => x.id);
      const i = ids.indexOf(id);
      if (i >= 0) queue = [...ids.slice(i), ...ids.slice(0, i)];
    }
    setWriter({ queue, n: (writer?.n || 0) + 1 });
  };
  const onSaved = (id) => {
    if (show === "pending") setKeptOn({ key: viewKey, ids: new Set(kept).add(id) });
    refresh();
  };
  const markDone = async (x) => {
    try {
      await api.put(`/api/idle-solutions/${x.id}`, { status: "done" });
      refresh();
    } catch {
      notify(T.saveFail, "error");
    }
  };
  const goPage = (p) => {
    setPageOn({ key: pageKey, page: p });
    top.current?.scrollIntoView({ block: "start" });
  };

  const written = pool.length - waitingN;
  const parts = perm.expects
    ? [{ key: "done", label: T.pWritten, value: written, color: FILL.done },
       { key: "wait", label: T.pWaiting, value: waitingN, color: FILL.wait }]
    : [{ key: "done", label: T.pAnswered, value: written, color: FILL.done },
       { key: "none", label: T.pNone, value: waitingN, color: FILL.none }];

  if (all.length === 0) {
    return (
      <>
        <EmptyState icon={Clock} title={T.noStops} message={T.emptySub} showUploadLink={false} />
        {toast.node}
      </>
    );
  }
  return (
    <>
      <KPICard size="lg" className="mb-4" icon={perm.expects ? PenLine : ClipboardList}
        color={perm.expects ? (waitingN ? FILL.wait : FILL.done) : undefined}
        valueColor={perm.expects ? (waitingN ? AMBER : GREEN) : "var(--text-1)"}
        label={perm.expects ? T.cardMine : T.cardAll}
        value={perm.expects ? waitingN : pool.length} unit={T.unitStops}
        sub={narrowed ? null : fill(T.periodMinutes, { m: num(data.total_minutes) })}>
        <SplitBar parts={parts} height={8} />
        <SplitLegend parts={parts} className="mt-2" />
      </KPICard>

      {data.is_admin && data.no_owner?.length > 0 && (
        <div className="rounded-xl px-3 py-2.5 mb-4 flex items-center gap-2.5 flex-wrap text-xs"
          style={{ color: "var(--text-2)", background: `color-mix(in srgb, ${AMBER} 8%, transparent)`,
            border: `1px solid color-mix(in srgb, ${AMBER} 30%, transparent)` }}>
          <AlertTriangle size={14} className="flex-shrink-0" style={{ color: AMBER }} />
          <span className="flex-1 min-w-0 basis-40">
            {fill(T.noOwnerNote, { n: data.no_owner.length, list: data.no_owner.map(catCode).join(", ") })}
          </span>
          <Button size="sm" variant="secondary" onClick={() => navigate("/panel/idleowners")}>{T.assign}</Button>
        </div>
      )}

      <section ref={top} className="rounded-2xl overflow-hidden mb-4 scroll-mt-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={ListChecks} title={T.secStops}
          right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.countStops, { n: list.length })}</span>} />
        <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <SegmentedToggle size="sm" value={show} onChange={pickShow}
            options={perm.expects
              ? [["pending", `${T.fPendingMine} · ${waitingN}`], ["all", `${T.fAll} · ${pool.length}`]]
              : [["all", `${T.fAll} · ${pool.length}`], ["pending", `${T.fPendingAny} · ${waitingN}`]]} />
        </div>
        {pool.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="text-sm" style={{ color: "var(--text-2)" }}>{T.emptyFiltered}</div>
            <div className="mt-3"><Button variant="secondary" onClick={onClearFilters}>{T.clearFilters}</Button></div>
          </div>
        ) : list.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <span className="w-11 h-11 rounded-2xl inline-flex items-center justify-center"
              style={{ background: `color-mix(in srgb, ${GREEN} 14%, transparent)`, color: GREEN }}>
              <CheckCircle2 size={22} />
            </span>
            <div className="text-sm font-semibold mt-3" style={{ color: "var(--text-1)" }}>
              {perm.expects ? T.noPendingMine : T.noPendingAny}
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{T.noPendingSub}</div>
            <div className="mt-3"><Button variant="secondary" onClick={() => pickShow("all")}>{T.seeAll}</Button></div>
          </div>
        ) : days.map((g) => (
          <div key={g.date}>
            <div className="px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)", borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)" }}>
              <span>{dayLabel(g.date)}</span>
              <span className="font-medium normal-case tracking-normal tabular-nums">{fill(T.dayCount, { n: perDay.get(g.date) || g.items.length })}</span>
            </div>
            <ul>
              {g.items.map((s, i) => (
                <StopRow key={s.id} T={T} s={s} label={label} unit={isSupervisor ? "" : unitOf(s)} perm={perm}
                  byline={byline} first={i === 0} onOpen={open} onDone={markDone} />
              ))}
            </ul>
          </div>
        ))}
      </section>
      <Pagination page={page} pageCount={pageCount} total={list.length} pageSize={PAGE} onPage={goPage} />

      {data.legacy?.length > 0 && (
        <section className="rounded-2xl overflow-hidden mt-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <button type="button" onClick={() => setLegacyOpen((o) => !o)} aria-expanded={legacyOpen}
            className="w-full text-left px-4 py-3 flex items-center gap-2">
            {legacyOpen ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} /> : <ChevronRight size={16} style={{ color: "var(--text-3)" }} />}
            <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.legacyTitle}</span>
            <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{data.legacy.length}</span>
          </button>
          {legacyOpen && (
            <div className="px-4 pb-4 brk-in">
              <div className="text-[11px] mb-2.5" style={{ color: "var(--text-3)" }}>{T.legacyHint}</div>
              <ul className="space-y-3">
                {data.legacy.map((x) => (
                  <li key={x.id}>
                    <div className="flex items-center gap-2 min-w-0 mb-1.5">
                      <CauseIcon category={x.category} size={22} />
                      <span className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>
                        {label(catCode(x.category)) || x.category}
                      </span>
                      <span className="text-[11px] flex-shrink-0" style={{ color: "var(--text-3)" }}>
                        {x.manager_name ? shortPerson(tl(x.manager_name) || x.manager_name) : T.wholeCause}
                      </span>
                    </div>
                    <ul><SolutionRow T={T} x={x} byline={byline} notify={notify} onChanged={refresh} /></ul>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {writer && (
        <Writer key={`sheet-${writer.n}`} T={T} label={label} queue={writer.queue} byId={byId} units={data.units || {}}
          owners={data.owners || {}} mineTexts={mineTexts} perm={perm} isPending={isPending} byline={byline}
          showUnit={!isSupervisor} notify={notify} onClose={() => setWriter(null)} onSaved={onSaved} refresh={refresh} />
      )}
      {toast.node}
    </>
  );
}
