import { createElement, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronDown, ChevronRight, ClipboardCheck, Clock, Lightbulb, Pencil, PenLine, UserRound, Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import ActionMenu from "../components/ui/ActionMenu";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";
import { ROLE_LABEL_KEYS } from "../config/pages";
import SolutionAnalytics from "../components/idle/SolutionAnalytics";
import { usePersistentState } from "../hooks/usePersistentState";
import OwnerChip from "../components/idle/OwnerChip";
import { catColor, iconFor } from "../components/idle/categories";
import { TXT, fill } from "./idleSolutionsText";
import api from "../utils/api";

/**
 * «Kutish yechimlari» — beside /downtime in Production. Which waiting cause
 * costs the most, and what everybody did about each filed stop.
 * GET /api/idle-solutions/analysis (routers/idle_solutions.py): the minutes are
 * /downtime's own, summed per category; the only new fact is the solution log.
 *
 * EVERYBODY who reads the page writes their OWN solution to a stop they can see
 * (2026-11-13) — the unit's brigadir, the cause's owner, a manager, an admin:
 * «what did you do». A solution belongs to its author; the server says which
 * rows the reader may edit (`can_edit`) and which stops still wait for their
 * own answer (`mine`). Same page key as /downtime.
 */

const AMBER = "var(--status-warn)";
const GREEN = "var(--status-ok)";
const GREY = "#94a3b8";
const STATE_INK = { none: GREY, open: AMBER, doing: "#3b82f6", done: GREEN };
const STATUS_ORDER = ["done", "doing", "open"];   // «what did you do» — done leads
const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "");
const num = (v) => Math.round(Number(v) || 0).toLocaleString("ru-RU");
const NONE = new Set();

function useT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

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

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <Icon size={13} className="flex-shrink-0" /> <span>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums truncate" style={{ color: tone || "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{sub || " "}</div>
    </div>
  );
}

const fieldCls = "w-full rounded-xl px-3 py-2 text-base sm:text-sm resize-y min-h-[64px]";
const fieldStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" };

/** «What did you do?» — the reader's own solution to one stop. */
function Composer({ T, cat, manager, eventId, onSaved, onCancel }) {
  const toast = useToast({ position: "bottom" });
  const [text, setText] = useState("");
  const [status, setStatus] = useState("done");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/idle-solutions", { category: cat, manager_id: manager ?? null, event_id: eventId ?? null, text: text.trim(), status });
      setText("");
      setStatus("done");
      toast.success(T.saved);
      onSaved();
    } catch {
      toast.error(T.saveFail);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2">
      <FormField label={T.whatDid}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={T.whatDidPh}
          className={fieldCls}
          style={fieldStyle}
        />
      </FormField>
      <div className="flex flex-wrap items-end gap-2 mt-2">
        <div className="min-w-0 max-w-full">
          <FormField label={T.statusLabel}>
            <SegmentedToggle value={status} onChange={setStatus}
              options={STATUS_ORDER.map((s) => [s, T.st[s]])} />
          </FormField>
        </div>
        {onCancel && <Button size="lg" variant="secondary" onClick={onCancel}>{T.cancel}</Button>}
        <Button size="lg" onClick={save} loading={busy} disabled={!text.trim()}>{T.save}</Button>
      </div>
      {toast.node}
    </div>
  );
}

/** One written solution: whose it is, how far along, and — for its author and
 *  an admin — the status and the text to change. */
function SolutionRow({ T, s, fallbackEdit, onChanged, ddmmyy }) {
  const toast = useToast({ position: "bottom" });
  const { t } = useLang();
  const { tl } = useTranslit();
  const [draft, setDraft] = useState(null);   // null = reading, a string = editing the text
  const [busy, setBusy] = useState(false);
  // `can_edit` is the server's answer; a payload from before it existed falls
  // back to the cause's old write flag.
  const canEdit = s.can_edit ?? fallbackEdit;
  const who = s.author_name ? shortPerson(tl(s.author_name) || s.author_name) : "—";
  const role = ROLE_LABEL_KEYS[s.author_role] ? t(ROLE_LABEL_KEYS[s.author_role]) : "";
  async function put(body) {
    try {
      await api.put(`/api/idle-solutions/${s.id}`, body);
      onChanged();
      return true;
    } catch {
      toast.error(T.saveFail);
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
        <div className="text-[11px] min-w-0" style={{ color: "var(--text-3)" }}>
          <span className="font-semibold" style={{ color: "var(--text-2)" }}>{who}</span>
          {s.mine ? ` (${T.youTag})` : ""}{role ? ` · ${role}` : ""} · {ddmmyy(s.created_at)}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <StyledSelect
              value={s.status}
              onChange={(v) => put({ status: v })}
              options={STATUS_ORDER.map((x) => ({ value: x, label: T.st[x] }))}
              triggerClassName="px-2.5 py-1.5 text-xs"
            />
            <ActionMenu label={`${T.actions}: ${who}`}
              items={[{ key: "edit", label: T.edit, icon: Pencil, onSelect: () => setDraft(s.text) }]} />
          </div>
        ) : <StateChip T={T} state={s.status} />}
      </div>
      {draft == null ? (
        <p className="text-sm mt-1.5 whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{s.text}</p>
      ) : (
        <div className="mt-1.5">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} maxLength={2000}
            autoFocus className={fieldCls} style={fieldStyle} aria-label={T.edit} />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Button variant="secondary" onClick={() => setDraft(null)}>{T.cancel}</Button>
            <Button onClick={saveText} loading={busy} disabled={!draft.trim() || draft.trim() === s.text}>{T.save}</Button>
          </div>
        </div>
      )}
      {toast.node}
    </li>
  );
}

function EventCard({ T, c, u, e, perm, refresh, onAnswered, ddmmyy }) {
  const [adding, setAdding] = useState(false);
  const has = e.solutions.length > 0;
  // The brigadir and the cause's owner are asked outright on every stop they
  // have not answered; the others open the form themselves.
  const write = perm.write ?? c.can_write;   // a payload from before `can_write`: the cause's own flag
  const asked = write && perm.expects && !e.mine;
  const open = write && (adding || asked);
  return (
    <li className="rounded-lg p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
          {ddmmyy(e.date)}{e.cell ? ` · ${e.cell}` : ""}{e.start ? ` · ${e.start}–${e.end}` : ""}
          {e.minutes ? ` · ${fill(T.minutes, { m: Math.round(e.minutes) })}` : ""}
        </div>
        <StateChip T={T} state={e.state} />
      </div>
      <div className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: e.note ? "var(--text-1)" : "var(--text-3)" }}>
        {e.note || T.noNote}
      </div>
      {has && (
        <ul className="space-y-2 mt-2">
          {e.solutions.map((s) => (
            <SolutionRow key={s.id} T={T} s={s} fallbackEdit={c.can_write} onChanged={refresh} ddmmyy={ddmmyy} />
          ))}
        </ul>
      )}
      {!has && !open && (
        <div className="text-xs mt-2" style={{ color: "var(--text-2)" }}>{T.noSol}</div>
      )}
      {open && (
        <Composer T={T} cat={c.category} manager={u.manager_id} eventId={e.id}
          onCancel={asked ? undefined : () => setAdding(false)}
          onSaved={() => { setAdding(false); onAnswered(e.id); refresh(); }} />
      )}
      {write && !open && (
        <button type="button" onClick={() => setAdding(true)} className="text-xs mt-2 py-1 font-medium" style={{ color: "var(--brand-text)" }}>
          {has ? T.addAnother : T.writeOne}
        </button>
      )}
    </li>
  );
}

/** How many of a block's stops still wait — for the reader's own answer when
 *  theirs is the one asked for, else for anybody's. */
const waiting = (x, expects) => (x.events_n ?? 0) - ((expects ? x.mine_n : x.solved_n) ?? 0);

function Progress({ T, perm, got, of }) {
  if (!(of > 0)) return null;
  return (
    <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: got < of ? AMBER : GREEN }}>
      {fill(perm.expects ? T.mineOf : T.solvedOf, { a: got, b: of })}
    </span>
  );
}

function ProblemBlock({ T, c, u, n, perm, pending, kept, refresh, onAnswered, ddmmyy }) {
  const { tl } = useTranslit();
  const [all, setAll] = useState(false);
  const every = u.events || [];
  const events = pending
    ? every.filter((e) => (perm.expects ? !e.mine : e.solutions.length === 0) || kept.has(e.id))
    : every;
  const shown = all ? events : events.slice(0, 3);
  return (
    <section className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        <span className="w-5 text-xs tabular-nums text-center flex-shrink-0" style={{ color: "var(--text-3)" }}>{n}</span>
        <UserRound size={14} style={{ color: "var(--text-3)" }} className="flex-shrink-0" />
        <span className="text-sm font-semibold truncate flex-1 basis-32" style={{ color: "var(--text-1)" }}>
          {shortPerson(tl(u.manager_name) || u.manager_name)}
        </span>
        <Progress T={T} perm={perm} got={perm.expects ? u.mine_n ?? 0 : u.solved_n} of={u.events_n ?? every.length} />
        <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>
          {fill(T.minutes, { m: num(u.minutes) })}
        </span>
      </div>

      <div className="mt-2.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{T.stops}</div>
      {events.length === 0 ? (
        <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{T.noStops}</div>
      ) : (
        <ul className="mt-1.5 space-y-2">
          {shown.map((e) => (
            <EventCard key={e.id ?? `${e.date}-${e.start}`} T={T} c={c} u={u} e={e} perm={perm}
              refresh={refresh} onAnswered={onAnswered} ddmmyy={ddmmyy} />
          ))}
        </ul>
      )}
      {events.length > 3 && (
        <button type="button" onClick={() => setAll(!all)} className="text-xs mt-1.5 py-1 font-medium" style={{ color: "var(--brand-text)" }}>
          {all ? T.hide : fill(T.moreStops, { n: events.length - 3 })}
        </button>
      )}

      {!pending && u.solutions.length > 0 && (
        <>
          <div className="mt-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{T.unitSol}</div>
          <ul className="space-y-2">
            {u.solutions.map((s) => (
              <SolutionRow key={s.id} T={T} s={s} fallbackEdit={c.can_write} onChanged={refresh} ddmmyy={ddmmyy} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function CauseRow({ T, c, max, open, onToggle, perm, pending, kept, arrive, refresh, onAnswered, label, ddmmyy }) {
  const code = catCode(c.category);
  const hue = catColor(c.category);
  const pct = max > 0 ? Math.max(2, (c.minutes / max) * 100) : 0;
  const owners = useMemo(() => (c.owner ? { [c.category]: c.owner } : {}), [c]);
  const stops = c.stops_n ?? c.problems_n;
  const problems = pending
    ? c.problems.filter((u) => waiting(u, perm.expects) > 0 || (u.events || []).some((e) => kept.has(e.id)))
    : c.problems;
  return (
    <div ref={arrive} style={{ borderTop: "1px solid var(--border)", opacity: c.minutes > 0 ? 1 : 0.6 }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full text-left px-4 py-3 flex flex-col gap-2 hover:bg-[var(--bg-inner)] transition-colors">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 text-xs tabular-nums text-center flex-shrink-0" style={{ color: "var(--text-3)" }}>{c.rank ?? "·"}</span>
          <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center flex-shrink-0"
            style={{ background: `color-mix(in srgb, ${hue} 14%, transparent)`, color: hue }}>
            {createElement(iconFor(code), { size: 16 })}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold sm:truncate" style={{ color: "var(--text-1)" }}>
              {c.category} <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(code)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {c.owner
                ? <OwnerChip owners={owners} category={c.category} full />
                : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: AMBER }}>
                    <AlertTriangle size={11} /> {T.noOwner}
                  </span>
                )}
              <Progress T={T} perm={perm} got={perm.expects ? c.mine_n ?? 0 : c.solved_n} of={stops} />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-sm font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{fill(T.minutes, { m: num(c.minutes) })}</div>
            <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.share, { p: c.share })}</div>
          </div>
          {open ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} /> : <ChevronRight size={16} style={{ color: "var(--text-3)" }} />}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: hue }} />
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {problems.length === 0 ? (
            <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.noUnits}</div>
          ) : problems.map((u, i) => (
            <ProblemBlock key={u.manager_id} T={T} c={c} u={u} n={i + 1} perm={perm} pending={pending} kept={kept}
              refresh={refresh} onAnswered={onAnswered} ddmmyy={ddmmyy} />
          ))}
          {!pending && c.solutions.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-3)" }}>{T.generalSol}</div>
              <ul className="space-y-2">
                {c.solutions.map((s) => (
                  <SolutionRow key={s.id} T={T} s={s} fallbackEdit={c.can_write} onChanged={refresh} ddmmyy={ddmmyy} />
                ))}
              </ul>
            </div>
          )}
          {!c.owner && <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{T.assignHint}</div>}
        </div>
      )}
    </div>
  );
}

export default function IdleSolutions() {
  const T = useT();
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const isSupervisor = auth?.role === "supervisor"; // own unit's problems only: no Tahlil, no brigadir filter
  const qc = useQueryClient();
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, shift, setShift, brigadirIds, setBrigadirIds } = useFilters();
  const fparams = useFactoryParams(params);
  const factorySection = useFactorySection();
  const [openCat, setOpenCat] = useState(null);
  const jump = useRef(null);                  // a cause the Tahlil tab asked to open
  const [show, setShow] = useState("all");    // all | pending — which stops the list shows
  // Stops answered while «pending» is on stay in place until the list is asked
  // for again: saving must not pull the row out from under the reader.
  const [keptOn, setKeptOn] = useState({ key: "", ids: NONE });
  const [savedView, setView] = usePersistentState("idle_solutions_view", "problems"); // problems | analytics
  const view = isSupervisor ? "problems" : savedView;
  // Brigadir picker: several at once, limited to the plant on screen (a pick
  // the plant no longer offers is dropped, never left over an empty page).
  const { data: allSupervisors = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
  });
  const scopedSupervisors = useFactorySupervisors(allSupervisors, brigadirIds, setBrigadirIds);
  const supOptions = useMemo(
    () => [...scopedSupervisors]
      .map((b) => ({ value: String(b.manager_id), label: tl(b.name) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [scopedSupervisors, tl]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["idle-solutions", fparams],
    queryFn: () => api.get("/api/idle-solutions/analysis", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  const analyticsQ = useQuery({
    queryKey: ["idle-solutions-analytics", fparams],
    queryFn: () => api.get("/api/idle-solutions/analytics", { params: fparams }).then((r) => r.data),
    enabled: ready && view === "analytics",
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["idle-solutions"] });
    qc.invalidateQueries({ queryKey: ["idle-solutions-analytics"] });
  };

  const label = (code) => {
    const v = t(`downtime.cat.${code}.label`);
    return v && !v.startsWith("downtime.cat.") ? v : "";
  };
  const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

  const cats = data?.categories || [];
  const active = cats.filter((c) => c.minutes > 0);
  const quiet = cats.filter((c) => c.minutes <= 0);
  const max = active[0]?.minutes || 0;
  const top = active[0];
  // Everybody who reads a stop may answer it (`can_write`); `expects` marks the
  // brigadir and the cause's owner, whose own answer each stop waits for.
  const perm = useMemo(() => ({ write: data?.can_write, expects: !!data?.expects_me }),
    [data?.can_write, data?.expects_me]);
  const stopsN = data?.stops_n ?? 0;
  const pendingN = cats.reduce((s, c) => s + c.problems.reduce((x, u) => x + Math.max(0, waiting(u, perm.expects)), 0), 0);
  const pending = show === "pending";
  // A new list (another period, plant, shift, brigadir) starts with nothing kept.
  const listKey = JSON.stringify(fparams);
  const kept = keptOn.key === listKey ? keptOn.ids : NONE;
  const listed = pending
    ? [...active, ...quiet].filter((c) => c.problems.some((u) => waiting(u, perm.expects) > 0 || (u.events || []).some((e) => kept.has(e.id))))
    : [...active, ...quiet];

  const pickShow = (v) => { setKeptOn({ key: "", ids: NONE }); setShow(v); };
  const onAnswered = (id) => {
    if (pending && id != null) setKeptOn({ key: listKey, ids: new Set(kept).add(id) });
  };

  // «Open in Problems» from the Tahlil tab: the cause opens and, once its row
  // is on the page, comes into view — one time.
  const arrive = (category) => (el) => {
    if (!el || jump.current !== category) return;
    jump.current = null;
    el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const openCause = (category) => {
    jump.current = category;
    setShow("all");
    setOpenCat(category);
    setView("problems");
  };

  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Clock, label: t("filter.shift"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all") || "—"], [1, "S1"], [2, "S2"]]} />
      ),
    },
    ...(isSupervisor ? [] : [{
      key: "supervisor", icon: UserRound, label: t("tasks.colSupervisor"),
      active: brigadirIds.length > 0,
      display: brigadirIds.length === 1
        ? (supOptions.find((o) => o.value === String(brigadirIds[0]))?.label || "")
        : `${brigadirIds.length} ${t("filter.selected2")}`,
      onClear: () => setBrigadirIds([]),
      render: () => (
        <OptsFilter
          opts={supOptions.map((o) => o.value)}
          sel={brigadirIds.map(String)}
          onChange={(v) => setBrigadirIds(v.map(Number))}
          render={(v) => supOptions.find((o) => o.value === v)?.label || v}
        />
      ),
    }]),
  ];

  return (
    <Layout title={T.title} subtitle={null}>
      {!isSupervisor && (
        <div className="mb-3">
          <SegmentedToggle asTabs value={view === "analytics" ? "analytics" : "problems"} onChange={setView}
            options={[["problems", T.tabProblems], ["analytics", T.tabAnalytics]]} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm" />
        <FilterPanel sections={sections} />
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>{view === "analytics" ? T.hintAnalytics : T.hint}</p>

      {view === "analytics" ? (
        analyticsQ.isError ? (
          <EmptyState tone="danger" title={T.errLoad} message="" showUploadLink={false} action={<Button onClick={() => analyticsQ.refetch()}>{T.retry}</Button>} />
        ) : analyticsQ.isLoading || !analyticsQ.data ? (
          <div className="space-y-3"><SkeletonBlock className="h-32" /><SkeletonBlock className="h-64" /><SkeletonBlock className="h-72" /></div>
        ) : (
          <SolutionAnalytics T={T} data={analyticsQ.data} label={label} onOpenCause={openCause} />
        )
      ) : isError ? (
        <EmptyState tone="danger" title={T.errLoad} message="" showUploadLink={false} action={<Button onClick={() => refetch()}>{T.retry}</Button>} />
      ) : isLoading || !data ? (
        <div className="space-y-3"><SkeletonBlock className="h-24" /><SkeletonBlock className="h-72" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi icon={Clock} label={T.kTotal} value={num(data.total)} sub={T.kTotalSub} />
            <Kpi icon={Lightbulb} label={T.kTop}
              value={top ? top.category : "—"}
              sub={top ? `${label(catCode(top.category))} · ${fill(T.share, { p: top.share })}` : ""} />
            {perm.expects ? (
              <Kpi icon={PenLine} label={T.kMine} value={pendingN}
                sub={fill(T.ofStops, { n: stopsN })} tone={pendingN ? AMBER : GREEN} />
            ) : (
              <Kpi icon={UserRound} label={T.kNoOwner} value={data.no_owner_n}
                sub={fill(T.ofCauses, { n: active.length })} tone={data.no_owner_n ? AMBER : undefined} />
            )}
            <Kpi icon={ClipboardCheck} label={T.kNoSol} value={data.no_solution_n}
              sub={fill(T.ofStops, { n: data.problems_n })} tone={data.no_solution_n ? AMBER : undefined} />
          </div>

          {cats.length === 0 ? (
            <EmptyState icon={Clock} title={T.empty} message={T.emptySub} showUploadLink={false} />
          ) : (
            <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SectionHead icon={Lightbulb} title={T.secCauses} right={fill(T.ofCauses, { n: cats.length })} />
              <div className="px-4 py-2.5" style={{ borderBottom: listed.length ? "none" : "1px solid var(--border)" }}>
                <SegmentedToggle size="sm" value={show} onChange={pickShow}
                  options={[["all", `${T.fAll} · ${stopsN}`],
                    ["pending", `${perm.expects ? T.fPendingMine : T.fPendingAny} · ${pendingN}`]]} />
              </div>
              {listed.length === 0 ? (
                <div className="px-4 py-6 text-sm" style={{ color: "var(--text-2)" }}>
                  {perm.expects ? T.noPendingMine : T.noPendingAny}
                </div>
              ) : listed.map((c) => (
                <CauseRow key={c.category} T={T} c={c} max={max} label={label} ddmmyy={ddmmyy}
                  perm={perm} pending={pending} kept={kept} arrive={arrive(c.category)} onAnswered={onAnswered}
                  open={openCat === c.category}
                  onToggle={() => setOpenCat(openCat === c.category ? null : c.category)}
                  refresh={refresh} />
              ))}
            </div>
          )}

          {data.units.length > 0 && (
            <TableCard icon={Users} title={T.secUnits} right={fill(T.units, { n: data.units.length })} maxHeight="60vh">
              <thead>
                <tr>
                  <Th label={T.cUnit} />
                  <Th label={T.cTotal} align="right" />
                  <Th label={T.cTop} />
                </tr>
              </thead>
              <tbody>
                {data.units.map((u) => (
                  <tr key={u.manager_id}>
                    <td className="px-3 py-2 font-medium">{shortPerson(tl(u.manager_name) || u.manager_name)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{num(u.total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {u.top.map((x) => {
                          const hue = catColor(x.category);
                          return (
                            <span key={x.category} title={`${x.category} — ${label(catCode(x.category))}`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums"
                              style={{ color: hue, background: `color-mix(in srgb, ${hue} 12%, transparent)`,
                                border: `1px solid color-mix(in srgb, ${hue} 35%, transparent)` }}>
                              {catCode(x.category)} · {Math.round(x.minutes)}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}
        </>
      )}
    </Layout>
  );
}
