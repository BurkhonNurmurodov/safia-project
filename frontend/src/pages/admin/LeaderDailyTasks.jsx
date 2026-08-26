import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList, Bot, FileSpreadsheet, Clock, UserCog, Users, Trash2, Camera,
  Hourglass, AlertTriangle, Layers, GitBranch, Minus,
} from "lucide-react";
import TableCard, { Th } from "../../components/ui/DataTable";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { FilterPanel, OptsFilter } from "../../components/ui/ColumnFilter";
import DaySubmissionModal from "../../components/leaders/DaySubmissionModal";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import api from "../../utils/api";

/**
 * «Liderlar kunlik vazifalari» — what the leaders actually FILED, in both
 * collection layers, with the proofs behind it and the authority to act on it.
 *
 * Why it exists. The daily checklist is collected through two doors — the
 * Google Form (→ `leader_checklists`) and the in-bot /tasks flow (→
 * `leader_task_days`) — and every read surface on the platform serves the
 * MERGED answer: /api/leaders drops a sheet row the moment a bot day replaces
 * it. So a leader who filed through both doors left one submission an admin
 * could open and one they could not see anywhere at all. This tab lists each
 * layer WHOLE and says, of every day, which of the two counts.
 *
 * Three rules it is built on:
 *
 *  - **Two tabs, one question each.** «Formada» is the sheet layer, «Botda» is
 *    the bot layer. They are not two filters on one table: the two layers hold
 *    different facts (a sheet row is filed once and cannot be unfiled; a bot day
 *    can be open, closed, locked per task, and deleted), so they carry different
 *    columns and different authority.
 *  - **The fill-out layer is READ-ONLY, and says why.** `leader_checklists` is
 *    wiped and reloaded from the sheet on every Refresh, so a delete here would
 *    reappear on the next sync — a button that lies about what it did. The row
 *    is removed in the Google sheet itself.
 *  - **A day filed through both is a CHOICE, not a rule.** The merge rule is
 *    right in general and cannot be right in every case; a leader who answered
 *    twice leaves two honest submissions and only a person can say which is the
 *    record. The «Hisobda» column is that person's answer, and it is offered
 *    only where both submissions genuinely exist.
 */

const PAGE_SIZE = 20;
const CHALLENGE = "CLEAR";

const ddmm = (iso) => (iso ? String(iso).split("-").reverse().join(".") : "—");
const hhmm = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function Chip({ color, icon: Icon, label, title, onClick }) {
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      title={title}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
      className={`inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap${onClick ? " cursor-pointer" : ""}`}
      style={{ background: `${color}1F`, border: `1px solid ${color}59`, color }}
    >
      {Icon && <Icon size={11} />}{label}
    </Tag>
  );
}

/**
 * Which submission counts for this (leader, day), and — where there are two —
 * the way to change the answer.
 *
 * Renders in every row rather than only where a choice exists: a column that
 * appeared and vanished would leave the reader unable to tell whether the
 * platform forgot the control or this day simply has one submission.
 *
 * FOUR states, and the fourth is why this is not a one-line cell. A dash is a
 * day nothing counts YET (an open bot checklist is not a submission). «Bot» and
 * «Forma» name the layer in force. But a BOT row that resolves to «Forma» with
 * no form row under it counts NOWHERE — a rehearsal day, or a shift-1 unit the
 * merge rule does not carry — and printing «Forma» there would name a
 * submission that does not exist. It gets its own red-free, explicit state.
 */
function CountedCell({ row, both, bot, onPick }) {
  const { t } = useLang();
  if (!row.counted) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const isBot = row.counted === "bot";
  // On the BOT tab every closed day can be ruled on, whether or not a Form row
  // exists under it: choosing «Bot» only ever ADDS a finished, scored day the
  // rule was hiding. On the FORM tab the control appears only where a bot twin
  // exists — a sheet row with no twin IS the record already, and neither option
  // would change anything.
  const canPick = bot || both;
  // Only reachable on the bot tab: a sheet row counting as "sheet" is the
  // record, twin or no twin. Here it means the day counts NOWHERE, and this
  // chip is the way to fix that — so it is a button like the others.
  if (bot && !isBot && !both) {
    return (
      <Chip color="#94a3b8" icon={Minus} label={t("admin.ltd.notCounted")}
        title={t("admin.ltd.notCountedHint")} onClick={() => onPick(row)} />
    );
  }
  const label = t(isBot ? "admin.ltd.srcBot" : "admin.ltd.srcForm");
  const chosen = !!row.pick;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Chip
        color={both ? "#C8973F" : "#94a3b8"}
        icon={isBot ? Bot : FileSpreadsheet}
        label={label}
        title={both ? t("admin.ltd.bothHint")
          : (chosen ? undefined : t("admin.ltd.autoRule"))}
        onClick={canPick ? () => onPick(row) : undefined}
      />
      {/* A dot, not a second chip: it says only that a PERSON decided this
          rather than the rule, and names them on hover. The answer itself is
          already on the chip beside it. */}
      {chosen && (
        <span className="text-[10px] leading-none" style={{ color: "var(--brand)" }}
          title={row.pick_by
            ? t("admin.ltd.pickedBy").replace("{who}", row.pick_by)
            : t("admin.ltd.pickedBy").replace("{who}", "—")}>
          ●
        </span>
      )}
    </span>
  );
}

/** The choice itself. Both options are always offered, plus the way back to the
 *  rule — a setting you can only ever set is a setting you cannot correct. */
function SourcePicker({ row, bot, onClose, onSaved }) {
  const { t } = useLang();
  const save = useMutation({
    mutationFn: (source) =>
      api.post("/admin/leader-tasks/day-source",
        { leader_id: row.leader_id, date: row.date, source }).then((r) => r.data),
    onSuccess: (d) => onSaved(d),
  });
  // Which side actually has a submission behind it. The bot tab knows both
  // facts (`has_sheet` on the row, and the row itself IS the bot day); the form
  // tab is only ever opened where a bot twin exists.
  const hasSheet = bot ? !!row.has_sheet : true;
  const hasBot = bot ? true : !!row.has_bot;
  // What is in force RIGHT NOW. A bot day the rule resolves to «sheet» with no
  // sheet row under it is in force nowhere — marking «Forma» active there would
  // point at the one option that is also disabled, which reads as a bug.
  const current = hasSheet ? row.counted : null;
  const opts = [
    { v: "bot", Icon: Bot, label: t("admin.ltd.srcBot"), ok: hasBot,
      why: t("admin.ltd.noBot") },
    { v: "sheet", Icon: FileSpreadsheet, label: t("admin.ltd.srcForm"), ok: hasSheet,
      why: t("admin.ltd.noSheet") },
  ];
  return (
    <Modal
      open
      onClose={onClose}
      title={t("admin.ltd.chooseTitle")}
      subtitle={`${row.leader} · ${ddmm(row.date)}`}
      icon={GitBranch}
      zIndex={60}
      footer={<Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>}
    >
      {/* The "you answered twice" explanation belongs only to the case it
          describes. A day with one submission is a different question — the
          note under the options answers that one. */}
      {hasSheet && hasBot && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>
          {t("admin.ltd.chooseBody")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {opts.map(({ v, Icon, label, ok, why }) => {
          const on = current === v;
          return (
            <button
              key={v}
              type="button"
              // An option with no submission behind it is refused by the
              // endpoint anyway; disabling it here means the reason is on the
              // button rather than in an error the operator has to provoke.
              disabled={save.isPending || !ok}
              title={ok ? undefined : why}
              onClick={() => save.mutate(v)}
              className="rounded-xl px-3 py-3 flex flex-col items-center gap-1 transition-colors"
              style={{
                background: on ? "rgba(200,151,63,0.12)" : "var(--bg-inner)",
                border: `1px solid ${on ? "var(--brand)" : "var(--border)"}`,
                color: on ? "var(--brand)" : "var(--text-2)",
                opacity: ok ? 1 : 0.45,
                cursor: ok ? "pointer" : "not-allowed",
              }}
            >
              <Icon size={18} />
              <span className="text-xs font-semibold">{label}</span>
              {!ok && (
                <span className="text-[10px] leading-tight text-center"
                  style={{ color: "var(--text-4)" }}>{why}</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Why one side is greyed out, and — because a per-day ruling repeated
          every shift is the wrong tool — where the durable switch lives. */}
      {!hasSheet && (
        <p className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {t("admin.ltd.noSheetHint")} {t("admin.ltd.unitHint")}
        </p>
      )}
      <div className="pt-1">
        <Button variant="ghost" size="sm" loading={save.isPending}
          onClick={() => save.mutate(null)}>
          {t("admin.ltd.chooseAuto")}
        </Button>
        <p className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>
          {t("admin.ltd.chooseAutoHint")}
        </p>
      </div>
      {save.isError && (
        <p className="text-[11px]" style={{ color: "#ef4444" }}>
          {save.error?.response?.data?.detail || t("admin.ltd.chooseFailed")}
        </p>
      )}
    </Modal>
  );
}

export default function LeaderDailyTasks() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const toast = useToast({ position: "bottom" });
  const qc = useQueryClient();

  const [view, setView] = usePersistentState("ltd_view", "form");
  const [from, setFrom] = usePersistentState("ltd_from", "");
  const [to, setTo] = usePersistentState("ltd_to", "");
  const [shift, setShift] = usePersistentState("ltd_shift", 0);
  const [mgrs, setMgrs] = usePersistentState("ltd_mgrs", []);
  const [leads, setLeads] = usePersistentState("ltd_leads", []);
  const [state, setState] = usePersistentState("ltd_state", "all");
  const [bothOnly, setBothOnly] = usePersistentState("ltd_both", false);
  const [q, setQ] = usePersistentState("ltd_q", "");
  const [sort, setSort] = usePersistentState("ltd_sort", { key: "date", dir: "desc" });
  const [page, setPage] = usePersistentState("ltd_page", 1);
  // Never persisted: returning to the tab must not find a delete pre-armed
  // from a previous visit.
  const [sel, setSel] = useState(() => new Set());
  const [detail, setDetail] = useState(null);
  const [pick, setPick] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const bot = view === "bot";

  const form = useQuery({
    queryKey: ["leader-fillout"],
    queryFn: () => api.get("/admin/leader-tasks/fillout").then((r) => r.data),
    enabled: !bot,
  });
  const days = useQuery({
    queryKey: ["leader-bot-submissions"],
    queryFn: () => api.get("/admin/leader-tasks/submissions").then((r) => r.data),
    enabled: bot,
  });

  const src = bot ? days : form;
  const rows = useMemo(() => {
    const raw = src.data?.rows ?? [];
    // ONE row shape for both tables, so the sort, the search, the filters and
    // the detail modal are written once. `source` is what the modal reads to
    // decide which authority it may offer.
    return raw.map((r) => ({ ...r, source: bot ? "bot" : "sheet" }));
  }, [src.data, bot]);

  // Pickers built from what the register actually holds, so a filter can never
  // offer a unit with nothing behind it.
  const sups = useMemo(() => {
    const m = new Map();
    for (const r of rows) if (r.manager_id) m.set(r.manager_id, { id: r.manager_id, name: r.supervisor, shift: r.shift });
    return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [rows]);
  const supById = useMemo(() => new Map(sups.map((s) => [s.id, s])), [sups]);
  const supOpts = useMemo(
    () => (shift ? sups.filter((s) => s.shift === shift) : sups), [sups, shift]);
  const leaders = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (!r.leader_id) continue;
      if (shift && r.shift !== shift) continue;
      if (mgrs.length && !mgrs.includes(r.manager_id)) continue;
      m.set(r.leader_id, { id: r.leader_id, name: r.leader, manager_id: r.manager_id });
    }
    return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }, [rows, shift, mgrs]);
  const leadById = useMemo(() => new Map(leaders.map((l) => [l.id, l])), [leaders]);

  const supLabel = (id) => tl(supById.get(id)?.name || `#${id}`);
  const leadLabel = (id) => tl(leadById.get(id)?.name || `#${id}`);
  // A pick the narrowed list no longer offers is dropped rather than left
  // naming a value the page cannot show.
  const mgrSel = mgrs.filter((id) => supOpts.some((s) => s.id === id));
  const leadSel = leads.filter((id) => leadById.has(id));

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      const d = String(r.date || "").slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (shift && r.shift !== shift) return false;
      if (mgrSel.length && !mgrSel.includes(r.manager_id)) return false;
      if (leadSel.length && !leadSel.includes(r.leader_id)) return false;
      if (bot && state === "open" && !r.open) return false;
      if (bot && state === "closed" && r.open) return false;
      if (bothOnly && !(bot ? r.has_sheet : r.has_bot)) return false;
      if (needle && !tl(r.leader).toLowerCase().includes(needle)
        && !tl(r.supervisor).toLowerCase().includes(needle)) return false;
      return true;
    });
    const dir = sort.dir === "asc" ? 1 : -1;
    const num = ["completion", "tasks", "media", "done"];
    return out.sort((a, b) => {
      const k = sort.key;
      const av = num.includes(k) ? Number(a[k] || 0) : String(a[k] ?? "");
      const bv = num.includes(k) ? Number(b[k] || 0) : String(b[k] ?? "");
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return String(a.leader).localeCompare(String(b.leader));
    });
  }, [rows, q, from, to, shift, mgrSel, leadSel, state, bothOnly, sort, bot, tl]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // What a delete would take is exactly what is on screen: a row that fell out
  // of the filter can never stay armed behind it. Open days are excluded here
  // as well as server-side — pulling the table out from under a running
  // checklist would strand the leader in it.
  const armed = useMemo(
    () => filtered.filter((r) => !r.open && sel.has(r.id)), [filtered, sel]);

  const switchView = (v) => {
    setView(v);
    setSel(new Set());
    setPage(1);
    setSort({ key: "date", dir: "desc" });
  };

  const onSort = (k) =>
    setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  const toggle = (id) =>
    setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSel((s) => {
      const n = new Set(s);
      const pool = filtered.filter((r) => !r.open);
      const all = pool.length > 0 && pool.every((r) => n.has(r.id));
      for (const r of pool) (all ? n.delete(r.id) : n.add(r.id));
      return n;
    });

  const del = useMutation({
    mutationFn: (ids) =>
      api.post("/admin/leader-tasks/submissions/delete", { ids }).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["leader-bot-submissions"] });
      qc.invalidateQueries({ queryKey: ["leader-fillout"] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setSel(new Set());
      setConfirmDel(null);
      toast.success(t("admin.ltd.deleted").replace("{n}", d.days));
    },
  });

  const clearAll = () => {
    setFrom(""); setTo(""); setShift(0); setMgrs([]); setLeads([]);
    setState("all"); setBothOnly(false); setPage(1);
  };

  const sections = [
    {
      key: "shift", icon: Clock, label: t("admin.ltd.fShift"), group: t("admin.ltd.grpWho"),
      active: shift !== 0, display: shift ? `S${shift}` : "",
      onClear: () => setShift(0),
      render: () => (
        <SegmentedToggle fill size="sm" value={shift} onChange={(v) => { setShift(v); setPage(1); }}
          options={[[0, t("admin.ltd.stAll")], [1, "S1"], [2, "S2"]]}
          ariaLabel={t("admin.ltd.fShift")} />
      ),
    },
    {
      key: "mgr", icon: UserCog, label: t("admin.ltd.fBrigadir"), group: t("admin.ltd.grpWho"),
      active: mgrSel.length > 0,
      display: mgrSel.length === 1 ? supLabel(mgrSel[0]) : String(mgrSel.length),
      onClear: () => setMgrs([]),
      render: () => (
        <OptsFilter searchable opts={supOpts.map((s) => s.id)} sel={mgrSel}
          onChange={(v) => { setMgrs(v); setPage(1); }} render={supLabel} labelOf={supLabel}
          note={shift ? `${t("admin.ltd.fShift")} S${shift} · ${supOpts.length}` : null} />
      ),
    },
    {
      key: "lead", icon: Users, label: t("admin.ltd.fLeader"), group: t("admin.ltd.grpWho"),
      active: leadSel.length > 0,
      display: leadSel.length === 1 ? leadLabel(leadSel[0]) : String(leadSel.length),
      onClear: () => setLeads([]),
      render: () => (
        <OptsFilter searchable opts={leaders.map((l) => l.id)} sel={leadSel}
          onChange={(v) => { setLeads(v); setPage(1); }} render={leadLabel} labelOf={leadLabel}
          groupBy={(id) => supLabel(leadById.get(id)?.manager_id)}
          note={(shift || mgrSel.length)
            ? `${t("admin.ltd.fBrigadir")} · ${leaders.length}` : null} />
      ),
    },
    // Only the bot layer has a state: a sheet row is filed once and cannot be
    // half-filed, so offering this there would be a control with one answer.
    ...(bot ? [{
      key: "state", icon: Hourglass, label: t("admin.ltd.fState"), group: t("admin.ltd.grpWhat"),
      active: state !== "all",
      display: state === "all" ? "" : t(state === "open" ? "admin.ltd.stOpen" : "admin.ltd.stClosed"),
      onClear: () => setState("all"),
      render: () => (
        <SegmentedToggle fill size="sm" value={state} onChange={(v) => { setState(v); setPage(1); }}
          options={[["all", t("admin.ltd.stAll")], ["closed", t("admin.ltd.stClosed")],
                    ["open", t("admin.ltd.stOpen")]]}
          ariaLabel={t("admin.ltd.fState")} />
      ),
    }] : []),
    {
      key: "both", icon: Layers, label: t("admin.ltd.fBoth"), group: t("admin.ltd.grpWhat"),
      active: bothOnly, display: bothOnly ? t("admin.ltd.fBothOn") : "",
      onClear: () => setBothOnly(false),
      render: () => (
        <SegmentedToggle fill size="sm" value={bothOnly ? 1 : 0}
          onChange={(v) => { setBothOnly(!!v); setPage(1); }}
          options={[[0, t("admin.ltd.stAll")], [1, t("admin.ltd.fBothOn")]]}
          ariaLabel={t("admin.ltd.fBoth")} />
      ),
    },
  ];

  const bothCount = filtered.filter((r) => (bot ? r.has_sheet : r.has_bot)).length;

  const toolbar = (
    <>
      <DateRangePicker compactLabel dateFrom={from} dateTo={to}
        setDateFrom={(v) => { setFrom(v); setPage(1); }}
        setDateTo={(v) => { setTo(v); setPage(1); }} />
      {/* FilterPanel stays a DIRECT child of this row — its fit check measures
          the row's own children. */}
      <FilterPanel sections={sections} onClearAll={clearAll} />
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }}
        placeholder={t("admin.ltd.search")} />
    </>
  );

  const cols = bot
    ? [
      ["date", t("admin.ltd.thDate")], ["leader", t("admin.ltd.thLeader")],
      ["supervisor", t("admin.ltd.thSup")], ["shift", t("admin.ltd.thShift")],
      ["tasks", t("admin.ltd.thTasks")], ["media", t("admin.ltd.thMedia")],
      ["completion", t("admin.ltd.thScore")], ["closed_at", t("admin.ltd.thClosed")],
      [null, t("admin.ltd.thCounted")], [null, t("admin.ltd.thState")],
    ]
    : [
      ["date", t("admin.ltd.thDate")], ["leader", t("admin.ltd.thLeader")],
      ["supervisor", t("admin.ltd.thSup")], ["shift", t("admin.ltd.thShift")],
      ["tasks", t("admin.ltd.thTasks")], ["media", t("admin.ltd.thMedia")],
      ["completion", t("admin.ltd.thScore")], ["submitted_at", t("admin.ltd.thSubmitted")],
      [null, t("admin.ltd.thCounted")],
    ];

  return (
    <div className="space-y-3">
      {/* View tabs sit ABOVE the filter row: they choose which register is on
          screen, while everything below narrows whichever one that is. */}
      <SegmentedToggle
        asTabs value={view} onChange={switchView}
        ariaLabel={t("admin.tabLtDaily")}
        options={[
          { value: "form", label: <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={13} />{t("admin.ltd.tabForm")}</span> },
          { value: "bot", label: <span className="inline-flex items-center gap-1.5"><Bot size={13} />{t("admin.ltd.tabBot")}</span> },
        ]}
      />

      <p className="text-[11px] leading-snug rounded-xl px-3 py-2"
        style={{ color: "var(--text-3)", background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        {t(bot ? "admin.ltd.botNote" : "admin.ltd.formNote")}
      </p>

      <TableCard
        icon={ClipboardList}
        title={t(bot ? "admin.ltd.botTitle" : "admin.ltd.formTitle")}
        subtitle={bothCount ? t("admin.ltd.bothCount").replace("{n}", bothCount) : undefined}
        right={<span className="text-xs" style={{ color: "var(--text-3)" }}>
          {t("admin.ltd.rows").replace("{n}", filtered.length)}
        </span>}
        toolbar={toolbar}
        minWidth={bot ? "1080px" : "980px"}
        mobile={
          // This platform runs in a 390px Telegram WebView; a ten-column table
          // there is a horizontal scroll nobody finishes. Same rows, same
          // actions, stacked — the card carries the two facts a phone reader is
          // here for (who filed what, and which submission counts).
          <div className="p-3 space-y-2">
            {filtered.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "var(--text-4)" }}>
                {rows.length === 0
                  ? t(bot ? "admin.ltd.emptyBotMsg" : "admin.ltd.emptyFormMsg")
                  : t("admin.ltd.noMatch")}
              </p>
            ) : pageRows.map((r) => {
              const both = bot ? r.has_sheet : r.has_bot;
              return (
                <div key={`m-${r.source}-${r.id}`}
                  onClick={() => setDetail(r)}
                  className="rounded-xl p-3 cursor-pointer"
                  style={{ background: "var(--bg-inner)",
                           border: `1px solid ${sel.has(r.id) ? "rgba(239,68,68,0.45)" : "var(--border)"}` }}>
                  <div className="flex items-start gap-2.5">
                    {bot && !r.open && (
                      <input type="checkbox" className="cb-danger mt-0.5"
                        checked={sel.has(r.id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggle(r.id)} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
                          {tl(r.leader)}
                        </span>
                        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>
                          {ddmm(r.date)}
                        </span>
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                        {tl(r.supervisor)}{r.shift ? ` · S${r.shift}` : ""}
                      </div>
                      <div className="text-[11px] mt-1 tabular-nums" style={{ color: "var(--text-4)" }}>
                        {r.open
                          ? `${t("admin.ltd.thTasks")}: ${r.answered ?? 0}/${r.enabled ?? 0}`
                          : `${t("admin.ltd.thTasks")}: ${r.done}/${r.tasks} · ${Math.round(r.completion || 0)}%`}
                        {` · ${t("admin.ltd.thMedia")}: ${r.media || 0}`}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <CountedCell row={r} both={both} bot={bot} onPick={setPick} />
                        {bot && r.open && (
                          <Chip color={r.expired ? "#ef4444" : "#94a3b8"} icon={Hourglass}
                            label={t(r.expired ? "admin.ltd.expiredChip" : "admin.ltd.openChip")} />
                        )}
                        {bot && r.open && r.pending_media > 0 && (
                          <Chip color="#eab308" icon={Camera} label={r.pending_media}
                            title={t("admin.ltd.rollHint").replace("{n}", r.pending_media)} />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        }
      >
        <thead>
          <tr style={{ background: "var(--bg-inner)" }}>
            {bot && (
              <th className="px-3 py-2 w-8">
                <input type="checkbox" aria-label={t("admin.ltd.selected").replace("{n}", armed.length)}
                  checked={armed.length > 0 && armed.length === filtered.filter((r) => !r.open).length}
                  onChange={toggleAll} />
              </th>
            )}
            {cols.map(([k, label], i) => (
              <Th key={i} label={label} k={k ?? undefined}
                sort={k ? sort : undefined} onSort={k ? onSort : undefined} />
            ))}
          </tr>
        </thead>
        <tbody>
          {src.isLoading ? (
            [...Array(6)].map((_, i) => (
              <tr key={i}>
                <td colSpan={cols.length + (bot ? 1 : 0)} className="px-3 py-2">
                  <SkeletonBlock className="h-5 w-full rounded" />
                </td>
              </tr>
            ))
          ) : filtered.length === 0 ? (
            <tr>
              <td colSpan={cols.length + (bot ? 1 : 0)} className="px-3 py-10">
                <EmptyState showUploadLink={false}
                  icon={bot ? Bot : FileSpreadsheet}
                  title={rows.length === 0
                    ? t(bot ? "admin.ltd.emptyBotTitle" : "admin.ltd.emptyFormTitle")
                    : t("admin.ltd.noMatch")}
                  message={rows.length === 0
                    ? t(bot ? "admin.ltd.emptyBotMsg" : "admin.ltd.emptyFormMsg")
                    : ""}
                  action={rows.length === 0 ? null : (
                    <Button size="sm" variant="secondary" onClick={clearAll}>
                      {t("admin.ltd.clearSel")}
                    </Button>
                  )} />
              </td>
            </tr>
          ) : (
            pageRows.map((r) => {
              const both = bot ? r.has_sheet : r.has_bot;
              return (
                <tr key={`${r.source}-${r.id}`} className="cursor-pointer"
                  onClick={() => setDetail(r)}>
                  {bot && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel.has(r.id)} disabled={r.open}
                        title={r.open ? t("admin.ltd.delOpenOnly") : undefined}
                        onChange={() => toggle(r.id)} />
                    </td>
                  )}
                  <td className="px-3 py-2">{ddmm(r.date)}</td>
                  <td className="px-3 py-2">{tl(r.leader)}</td>
                  <td className="px-3 py-2">{tl(r.supervisor)}</td>
                  <td className="px-3 py-2">{r.shift ? `S${r.shift}` : "—"}</td>
                  <td className="px-3 py-2">
                    {r.open
                      ? <span style={{ color: "#eab308" }}>{r.answered ?? 0}/{r.enabled ?? 0}</span>
                      : <>{r.done}/{r.tasks}</>}
                  </td>
                  <td className="px-3 py-2">
                    {r.media > 0
                      ? <span className="inline-flex items-center gap-1"><Camera size={11} />{r.media}</span>
                      : <span style={{ color: "var(--text-4)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.open ? <span style={{ color: "var(--text-4)" }}>—</span>
                      : `${Math.round(r.completion || 0)}%`}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                    {bot
                      ? (r.closed_at ? hhmm(r.closed_at) : "—")
                      : (r.submitted_at ? `${ddmm(String(r.submitted_at).slice(0, 10))} ${hhmm(r.submitted_at)}` : "—")}
                  </td>
                  <td className="px-3 py-2">
                    <CountedCell row={r} both={both} bot={bot} onPick={setPick} />
                  </td>
                  {bot && (
                    <td className="px-3 py-2">
                      {r.open ? (
                        <Chip color={r.expired ? "#ef4444" : "#94a3b8"} icon={Hourglass}
                          label={t(r.expired ? "admin.ltd.expiredChip" : "admin.ltd.openChip")}
                          title={t("admin.ltd.openHint")
                            .replace("{a}", r.answered ?? 0).replace("{e}", r.enabled ?? 0)} />
                      ) : (
                        <Chip color="#22c55e" label={t("admin.ltd.stClosed")} />
                      )}
                      {r.open && r.pending_media > 0 && (
                        <span className="ml-1.5">
                          <Chip color="#eab308" icon={Camera} label={r.pending_media}
                            title={t("admin.ltd.rollHint").replace("{n}", r.pending_media)} />
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </TableCard>

      <Pagination page={pageSafe} pageCount={pageCount} total={filtered.length}
        pageSize={PAGE_SIZE} onPage={setPage} />

      {/* The delete bar names its own count and carries it into the button —
          a bulk action whose scope is only visible in a checkbox column is a
          bulk action nobody can audit before pressing it. */}
      {bot && armed.length > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)",
                   boxShadow: "0 12px 30px rgba(0,0,0,0.25)" }}>
          <AlertTriangle size={15} style={{ color: "#ef4444" }} />
          <span className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
            {t("admin.ltd.selected").replace("{n}", armed.length)}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button size="md" variant="ghost" onClick={() => setSel(new Set())}>
              {t("admin.ltd.clearSel")}
            </Button>
            <Button size="md" variant="danger"
              onClick={() => setConfirmDel(armed.map((r) => r.id))}>
              <Trash2 size={13} className="mr-1" />
              {t("admin.ltd.delN").replace("{n}", armed.length)}
            </Button>
          </div>
        </div>
      )}

      {detail && (
        <DaySubmissionModal
          row={detail}
          onClose={() => setDetail(null)}
          onChanged={(kind) => toast.success(t(kind === "wiped" ? "admin.ltd.wiped" : "admin.ltd.reopened"))}
        />
      )}

      {pick && (
        <SourcePicker
          row={pick}
          bot={bot}
          onClose={() => setPick(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["leader-fillout"] });
            qc.invalidateQueries({ queryKey: ["leader-bot-submissions"] });
            qc.invalidateQueries({ queryKey: ["leaders"] });
            setPick(null);
            toast.success(t("admin.ltd.chooseSaved"));
          }}
        />
      )}

      {confirmDel && (
        <ConfirmDialog
          tone="danger"
          icon={Trash2}
          title={t("admin.ltd.delTitle").replace("{n}", confirmDel.length)}
          message={t("admin.ltd.delBody")}
          confirmLabel={t("admin.ltd.del")}
          loading={del.isPending}
          error={del.isError
            ? (del.error?.response?.data?.detail || t("admin.ltd.delFailed"))
            : null}
          // A sweep that would empty the whole register demands the operator
          // type it out — the one delete here with no undo behind it.
          challenge={confirmDel.length >= rows.filter((r) => !r.open).length ? CHALLENGE : null}
          challengeLabel={t("admin.ltd.delChallenge")}
          onCancel={() => { del.reset(); setConfirmDel(null); }}
          onConfirm={() => del.mutate(confirmDel)}
        />
      )}

      {toast.node}
    </div>
  );
}
