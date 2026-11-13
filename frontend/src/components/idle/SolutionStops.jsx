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
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
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
 *   the card on top   what waits on the reader — or, for a manager, how many
 *                     of the period's stops have an answer — as one split bar
 *   the list          a stop = its cause, cell, clock and the leader's own
 *                     comment, then what was already written to it
 *   the sheet         «Siz nima qildingiz?» — and «Saqlash va keyingisi»
 *                     walks the stops still waiting, one after another
 *
 * The server says whose each row is (`mine`, `can_edit`), whether a plan's own
 * date has passed (`overdue`, `due_in`) and — for a brigadir and a cause's
 * owner — WHAT WAITS ON THEM (`todo`, the server's `waiting()`): the stops of
 * the last two weeks they wrote nothing to and the stops carrying their own
 * overdue plan. That list has no period: it is a to-do list, the very one the
 * menu number and the daily reminder count. The period on the bar belongs to
 * «Hammasi».
 */
const AMBER = "var(--status-warn)";
const GREEN = "var(--status-ok)";
const RED = "var(--status-bad)";
const GREY = "#94a3b8";
const BLUE = "#3b82f6";
const STATE_INK = { none: GREY, open: AMBER, doing: BLUE, done: GREEN, late: RED };
// a FILL takes the raw hue (Meter.jsx): written / waiting / late / nothing yet
const FILL = { done: "#22c55e", wait: "#eab308", late: "#ef4444", none: GREY };
const STATUS_ORDER = ["done", "doing", "open"];   // «what did you do» — done leads
const PAGE = 20;
const NO_ROWS = new Map();

const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "");
const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const ddmmyy = (iso) => (iso ? `${ddmm(iso)}.${iso.slice(0, 4)}` : "");
const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
};
// the list's own order, as the server sorts it: newest first
const newestFirst = (a, b) =>
  (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  || ((a.start || "") < (b.start || "") ? 1 : (a.start || "") > (b.start || "") ? -1 : 0)
  || (b.id - a.id);
// a stop's chip — the server's `_state`: the least finished solution wins
const stateOf = (sols) => (!sols.length ? "none"
  : sols.some((x) => x.status === "open") ? "open"
  : sols.some((x) => x.status === "doing") ? "doing" : "done");
const hasOverdue = (s) => s.solutions.some((x) => x.overdue);
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

/** A plan's own date in words — nothing for a done row or a plan without one. */
function dueNote(T, x) {
  if (x.status === "done" || !x.due_date) return null;
  if (x.overdue) return { text: fill(T.dueLate, { d: ddmm(x.due_date), n: Math.abs(x.due_in ?? 0) }), ink: RED, strong: true };
  if (x.due_in === 0) return { text: T.dueToday, ink: AMBER, strong: true };
  return { text: fill(T.dueBy, { d: ddmm(x.due_date) }), ink: "var(--text-3)", strong: false };
}

function DueNote({ T, x }) {
  const due = dueNote(T, x);
  if (!due) return null;
  return <span style={{ color: due.ink, fontWeight: due.strong ? 600 : 400 }}> · {due.text}</span>;
}

/**
 * A solution on a stop's card: read at a glance; its author marks it done in
 * one tap. `was` is the row as it stood before that tap, in this very list: the
 * button and the date it carried keep their room (unseen), so the line — and
 * every stop under it — stays where the reader's thumb left it.
 */
function SolutionLine({ T, x, byline, onDone, was }) {
  const b = byline(x);
  const justDone = !!was && x.status === "done";
  return (
    <li className="rounded-lg px-2.5 py-2" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-start gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
          style={{ background: x.overdue ? RED : STATE_INK[x.status] || GREY }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{x.text}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {b.text} · {T.st[x.status] || x.status}<DueNote T={T} x={x} />
            {justDone && <span className="invisible" aria-hidden="true"><DueNote T={T} x={was} /></span>}
          </div>
        </div>
        {/* the one-tap «done» is the AUTHOR's — an admin changes somebody else's row inside the sheet */}
        {x.mine && x.can_edit && x.status !== "done" ? (
          <Button size="sm" variant="success" tint icon={<Check size={12} />} title={T.markDone}
            aria-label={T.markDone} onClick={() => onDone(x)}>
            {T.st.done}
          </Button>
        ) : justDone ? (
          <span className="invisible" aria-hidden="true">
            <Button size="sm" variant="success" tint icon={<Check size={12} />} disabled tabIndex={-1}>{T.st.done}</Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The same solution inside the sheet: its author (and an admin) change its
 * status, its words and — while it is not done — the date it is promised for.
 * `days` = { today, max } bounds that date; without it (the older stop-less
 * rows) no date is offered.
 */
function SolutionRow({ T, x, byline, notify, onChanged, days }) {
  const [draft, setDraft] = useState(null);   // null = reading, a string = editing the text
  const [busy, setBusy] = useState(false);
  const b = byline(x);
  async function put(body) {
    try {
      const r = await api.put(`/api/idle-solutions/${x.id}`, body);
      onChanged(r.data);
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
        <div className="text-[11px] min-w-0" style={{ color: "var(--text-3)" }}>{b.text}<DueNote T={T} x={x} /></div>
        {x.can_edit ? (
          <div className="flex items-center justify-end gap-1 flex-wrap" data-no-draft>
            {days && x.status !== "done" && (
              <DateRangePicker single dateFrom={x.due_date || ""} dateTo={x.due_date || ""}
                setDateFrom={(iso) => { if (iso && iso !== x.due_date) put({ due_date: iso }); }} setDateTo={() => {}}
                min={days.today} max={days.max} placeholder={T.dueSet} triggerClassName="px-2.5 py-1.5 text-xs" />
            )}
            <StyledSelect value={x.status} onChange={(v) => put({ status: v })}
              options={STATUS_ORDER.map((k) => ({ value: k, label: T.st[k] }))}
              triggerClassName="px-2.5 py-1.5 text-xs" />
            <ActionMenu label={`${T.actions}: ${b.who}`}
              items={[{ key: "edit", label: T.edit, icon: Pencil, onSelect: () => setDraft(x.text) }]} />
          </div>
        ) : <StateChip T={T} state={x.overdue ? "late" : x.status} />}
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
function StopRow({ T, s, label, unit, perm, asked, byline, first, onOpen, onDone, doneHere }) {
  const code = catCode(s.category);
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
        {/* a plan past its own date is what the stop is, until it is done or moved */}
        <StateChip T={T} state={hasOverdue(s) ? "late" : s.state} />
      </div>
      <p className="text-sm mt-2 whitespace-pre-wrap break-words" style={{ color: s.note ? "var(--text-1)" : "var(--text-3)" }}>
        {s.note ? `«${s.note}»` : T.noNote}
      </p>
      {s.solutions.length > 0 && (
        <ul className="space-y-1.5 mt-2">
          {s.solutions.map((x) => (
            <SolutionLine key={x.id} T={T} x={x} byline={byline} onDone={onDone} was={doneHere.get(x.id)} />
          ))}
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
 * A plan («Rejada» / «Bajarilmoqda») is saved with the day it is promised for.
 */
function Writer({ T, label, queue, lookup, units, owners, mineTexts, perm, isPending, byline, showUnit, days, notify, onClose, onSaved, onChanged }) {
  const { tl } = useTranslit();
  const [pos, setPos] = useState(0);
  const [text, setText] = useState("");
  const [status, setStatus] = useState("done");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const stop = lookup(queue[pos]);
  if (!stop) return null;
  const code = catCode(stop.category);
  const next = queue.findIndex((id, i) => i > pos && lookup(id) && isPending(lookup(id)));
  const unit = showUnit ? units[String(stop.manager_id)]?.manager_name : null;
  const owner = owners[stop.category];
  const before = mineTexts(stop);
  const planned = status !== "done";
  const ready = !!text.trim() && (!planned || !!due);
  const move = (to) => { setPos(to); setText(""); setStatus("done"); setDue(""); };
  async function save() {
    const body = text.trim();
    if (!ready) return;
    setBusy(true);
    try {
      const r = await api.post("/api/idle-solutions", {
        category: stop.category, manager_id: stop.manager_id, event_id: stop.id, text: body, status,
        ...(planned ? { due_date: due } : {}),
      });
      onSaved(r.data);
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
        queue.length > 1 ? fill(T.sheetProgress, { i: pos + 1, n: queue.length }).replace(/ /g, " ") : null,
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
            <Button onClick={save} loading={busy} disabled={!ready}>{next >= 0 ? T.saveNext : T.save}</Button>
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
            {stop.solutions.map((x) => (
              <SolutionRow key={x.id} T={T} x={x} byline={byline} notify={notify} onChanged={onChanged} days={days} />
            ))}
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
          {/* a plan is a promise with a day on it: one tap for the usual ones, the calendar for any other */}
          {planned && (
            <div className="brk-in">
              <FormField label={T.dueLabel} required hint={T.dueHint}>
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedToggle value={due} onChange={setDue} ariaLabel={T.dueLabel}
                    options={[[days.today, T.today], [addDays(days.today, 1), T.dTomorrow],
                      [addDays(days.today, 3), T.d3], [addDays(days.today, 7), T.d7]]} />
                  <DateRangePicker single weekday dateFrom={due} dateTo={due} setDateFrom={setDue} setDateTo={() => {}}
                    min={days.today} max={days.max} placeholder={T.duePick} triggerClassName="px-3 py-2 text-sm" />
                </div>
              </FormField>
            </div>
          )}
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
  // «Sizni kutmoqda» — only for a reader the page asks; absent from a server
  // one release behind, where the older rule below still answers.
  const todo = perm.expects && Array.isArray(data.todo?.stops) ? data.todo : null;
  const [show, setShow] = useState(initialShow || (data.expects_me ? "pending" : "all"));
  // The stops this reader has just written on, as last known — { key, rows, was }.
  // One of them stays where it is until the list is asked for again, even after
  // it stopped waiting (or left the payload altogether): saving must not pull a
  // row out from under the reader, nor close the sheet they are writing in.
  // `was` = solution id → the row before its one-tap «done» (SolutionLine).
  const [local, setLocal] = useState({ key: "", rows: NO_ROWS, was: NO_ROWS });
  const [pageOn, setPageOn] = useState({ key: "", page: 1 });
  // { queue: [stop ids], n: opened count } — `n` keys the sheet per opening, under
  // a name of its own: the toast beside it is keyed 1, 2, 3 … as well
  const [writer, setWriter] = useState(null);
  const [legacyOpen, setLegacyOpen] = useState(false);

  const today = data.today || localISO(new Date());
  const days = useMemo(() => ({ today, max: addDays(today, data.max_plan_days || 90) }), [today, data.max_plan_days]);
  const all = data.stops;
  const waitingOn = todo?.stops;
  const byId = useMemo(() => {
    const m = new Map((waitingOn || []).map((s) => [s.id, s]));
    for (const s of all) m.set(s.id, s);
    return m;
  }, [all, waitingOn]);
  const why = useMemo(() => new Map((waitingOn || []).map((s) => [s.id, s.why])), [waitingOn]);
  const inFilter = (s) => (!cats.length || cats.includes(s.category)) && (!cells.length || cells.includes(s.cell));
  const pool = useMemo(
    () => all.filter((s) => (!cats.length || cats.includes(s.category)) && (!cells.length || cells.includes(s.cell))),
    [all, cats, cells]);
  const narrowed = cats.length > 0 || cells.length > 0;
  const viewKey = `${listKey}|${cats.join(",")}|${cells.join(",")}`;
  const held = local.key === viewKey ? local.rows : NO_ROWS;
  const doneHere = local.key === viewKey ? local.was : NO_ROWS;
  const lookup = (id) => byId.get(id) || held.get(id);
  // «waiting»: what the server says waits on this reader; for a manager — a stop nobody answered
  const isPending = (s) => (todo ? why.has(s.id) : perm.expects ? !s.mine : s.solutions.length === 0);
  const pendingRows = todo ? waitingOn.filter(inFilter) : pool.filter(isPending);
  const lateRows = pool.filter(hasOverdue);
  const base = show === "pending" ? pendingRows : show === "overdue" ? lateRows : null;
  let list = pool;
  if (base) {
    const ids = new Set(base.map((s) => s.id));
    const kept = [...held.values()].filter((s) => !ids.has(s.id) && inFilter(s)).map((s) => byId.get(s.id) || s);
    list = kept.length ? [...base, ...kept].sort(newestFirst) : base;
  }
  const pageKey = `${viewKey}|${show}`;
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE));
  const page = Math.min(pageOn.key === pageKey ? pageOn.page : 1, pageCount);
  const rows = list.slice((page - 1) * PAGE, page * PAGE);
  const groups = [];
  for (const s of rows) {
    if (!groups.length || groups[groups.length - 1].date !== s.date) groups.push({ date: s.date, items: [] });
    groups[groups.length - 1].items.push(s);
  }
  const perDay = new Map();
  for (const s of list) perDay.set(s.date, (perDay.get(s.date) || 0) + 1);

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
    for (const s of byId.values()) {
      if (s.category !== stop.category) continue;
      for (const x of s.solutions) {
        if (x.mine && !here.has(x.text) && !out.includes(x.text)) out.push(x.text);
        if (out.length === 3) return out;
      }
    }
    return out;
  };
  const pickShow = (v) => { setLocal({ key: "", rows: NO_ROWS, was: NO_ROWS }); setShow(v); };
  // A row the server just returned (a new solution, a changed one) goes onto
  // its stop as last known, and the lists are asked for again. `before` is the
  // row a one-tap «done» replaced.
  const wrote = (item, before) => {
    const s = item?.event_id != null ? lookup(item.event_id) : null;
    if (s) {
      const sols = s.solutions.some((x) => x.id === item.id)
        ? s.solutions.map((x) => (x.id === item.id ? item : x))
        : [item, ...s.solutions];
      const next = { ...s, solutions: sols, state: stateOf(sols), mine: s.mine || !!item.mine };
      setLocal((cur) => {
        const mine = cur.key === viewKey;
        const was = new Map(mine ? cur.was : NO_ROWS);
        if (before) was.set(item.id, before);
        return { key: viewKey, rows: new Map(mine ? cur.rows : NO_ROWS).set(s.id, next), was };
      });
    }
    refresh();
  };
  const open = (id) => {
    const s = lookup(id);
    let queue = [id];
    if (s && isPending(s)) {
      // the stops still waiting, in the list's own order, starting from this one
      const ids = list.filter(isPending).map((x) => x.id);
      const i = ids.indexOf(id);
      if (i >= 0) queue = [...ids.slice(i), ...ids.slice(0, i)];
    }
    setWriter({ queue, n: (writer?.n || 0) + 1 });
  };
  const markDone = async (x) => {
    try {
      const r = await api.put(`/api/idle-solutions/${x.id}`, { status: "done" });
      wrote(r.data, x);
    } catch {
      notify(T.saveFail, "error");
    }
  };
  const goPage = (p) => {
    setPageOn({ key: pageKey, page: p });
    top.current?.scrollIntoView({ block: "start" });
  };

  // The card: what waits on the reader — or how the period's stops stand.
  let card;
  if (todo) {
    const late = pendingRows.filter((s) => s.why === "overdue").length;
    const blank = pendingRows.length - late;
    const done = narrowed
      ? (todo.written_rows || []).filter(([c, cell]) => inFilter({ category: c, cell })).length
      : todo.written || 0;
    card = {
      icon: PenLine, label: T.cardMine, value: pendingRows.length,
      color: late ? FILL.late : blank ? FILL.wait : FILL.done,
      ink: late ? RED : blank ? AMBER : GREEN,
      sub: fill(T.todoWindow, { a: ddmm(todo.from), b: ddmm(todo.to) }),
      parts: [{ key: "done", label: T.pWritten, value: done, color: FILL.done },
              { key: "wait", label: T.pWaiting, value: blank, color: FILL.wait },
              { key: "late", label: T.pOverdue, value: late, color: FILL.late }],
    };
  } else {
    const waitingN = pendingRows.length;
    const written = pool.length - waitingN;
    card = {
      icon: perm.expects ? PenLine : ClipboardList,
      label: perm.expects ? T.cardMine : T.cardAll,
      value: perm.expects ? waitingN : pool.length,
      color: perm.expects ? (waitingN ? FILL.wait : FILL.done) : undefined,
      ink: perm.expects ? (waitingN ? AMBER : GREEN) : "var(--text-1)",
      sub: narrowed ? null : fill(T.periodMinutes, { m: num(data.total_minutes) }),
      parts: perm.expects
        ? [{ key: "done", label: T.pWritten, value: written, color: FILL.done },
           { key: "wait", label: T.pWaiting, value: waitingN, color: FILL.wait }]
        : [{ key: "done", label: T.pAnswered, value: written, color: FILL.done },
           { key: "none", label: T.pNone, value: waitingN, color: FILL.none }],
    };
  }
  const views = todo
    ? [["pending", `${T.fTodo} · ${pendingRows.length}`], ["all", `${T.fAll} · ${pool.length}`]]
    : perm.expects
      ? [["pending", `${T.fPendingMine} · ${pendingRows.length}`], ["all", `${T.fAll} · ${pool.length}`]]
      : [["all", `${T.fAll} · ${pool.length}`], ["pending", `${T.fPendingAny} · ${pendingRows.length}`],
         ["overdue", `${T.fOverdue} · ${lateRows.length}`]];
  const viewHint = show === "all" ? T.hintAll : show === "overdue" ? T.hintOverdue : todo ? T.hintTodo : T.hintNone;
  // «nothing here»: the «Sabab» / «Yacheyka» picks cut everything this view
  // draws from, or the view simply has nothing left
  const ofTodo = show === "pending" && !!todo;
  const cutByFilter = narrowed && list.length === 0
    && (ofTodo ? pendingRows.length === 0 && waitingOn.length > 0 : pool.length === 0 && all.length > 0);

  if (all.length === 0 && !(waitingOn?.length)) {
    return (
      <>
        <EmptyState icon={Clock} title={T.noStops} message={T.emptySub} showUploadLink={false} />
        {toast.node}
      </>
    );
  }
  return (
    <>
      <KPICard size="lg" className="mb-4" icon={card.icon} color={card.color} valueColor={card.ink}
        label={card.label} value={card.value} unit={T.unitStops} sub={card.sub}>
        <SplitBar parts={card.parts} height={8} />
        <SplitLegend parts={card.parts} className="mt-2" />
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
          <SegmentedToggle size="sm" value={show} onChange={pickShow} options={views} />
          {/* always one line of what this list is — it changes with the toggle, never with a save */}
          <p className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>{viewHint}</p>
        </div>
        {cutByFilter ? (
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
              {show === "all" ? T.noStops : show === "overdue" ? T.noOverdue : perm.expects ? T.noPendingMine : T.noPendingAny}
            </div>
            {show !== "all" && (
              <>
                <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{show === "pending" ? T.noPendingSub : ""}</div>
                <div className="mt-3"><Button variant="secondary" onClick={() => pickShow("all")}>{T.seeAll}</Button></div>
              </>
            )}
          </div>
        ) : groups.map((g) => (
          <div key={g.date}>
            <div className="px-4 py-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)", borderBottom: "1px solid var(--border)", borderTop: "1px solid var(--border)" }}>
              <span>{dayLabel(g.date)}</span>
              <span className="font-medium normal-case tracking-normal tabular-nums">{fill(T.dayCount, { n: perDay.get(g.date) || g.items.length })}</span>
            </div>
            <ul>
              {g.items.map((s, i) => (
                <StopRow key={s.id} T={T} s={s} label={label} unit={isSupervisor ? "" : unitOf(s)} perm={perm}
                  // the big button: this reader's own answer is the one missing
                  asked={perm.write && (todo ? why.get(s.id) === "unanswered" : perm.expects && !s.mine)}
                  byline={byline} first={i === 0} onOpen={open} onDone={markDone} doneHere={doneHere} />
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
        <Writer key={`sheet-${writer.n}`} T={T} label={label} queue={writer.queue} lookup={lookup} units={data.units || {}}
          owners={data.owners || {}} mineTexts={mineTexts} perm={perm} isPending={isPending} byline={byline}
          showUnit={!isSupervisor} days={days} notify={notify} onClose={() => setWriter(null)}
          onSaved={(item) => wrote(item)} onChanged={(item) => wrote(item)} />
      )}
      {toast.node}
    </>
  );
}
