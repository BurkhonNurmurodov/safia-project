// «Reyestr» — every goal on ONE table, one fact per column.
//
// The board (the other tab) answers «which goals need somebody now» with charts
// and status groups; this answers «show me all of them side by side». Every
// column sorts, columns hide and reorder through the ColumnsPicker (saved per
// profile in ui-prefs, like every picker-equipped table), and a row opens the
// goal's page. Nothing here is computed that utils/targets does not already
// define — the card, the goal page and this table read the same functions, so
// the three can never state two figures for one goal.
//
// Read left to right, the columns ask: what is it · how is it going · when ·
// who and where · is anybody updating it. The title column is frozen, so a row
// keeps its name while a narrow screen scrolls the rest sideways. Below `sm` a
// table this wide cannot be read, so a phone gets the platform's usual answer —
// a list, sorted by the same control the headers drive.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TableProperties, RefreshCw, History, ArrowUpNarrowWide, ArrowDownWideNarrow, Gauge, ListChecks, CalendarPlus,
} from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import ColumnsPicker from "../ui/ColumnsPicker";
import StyledSelect from "../ui/StyledSelect";
import Button from "../ui/Button";
import SaveState from "./SaveState";
import { StatusChip, AreaTag, PaceBar } from "./bits";
import { DaysLeft, GoalMeta } from "./GoalCard";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { AMBER } from "../../utils/statusBands";
import {
  PACE, STATUS_RANK, STATUS_COLOR, targetProgress, lastActivity, daysLeft, dayDiff, fmtDate, fmtPct, fill,
} from "../../utils/targets";

// The column catalog — the ONE source of order, labels and header tooltips.
// Cells are drawn by the per-key switch in `Cell`, so hiding and reordering
// cost nothing.
const COLS = [
  { key: "goal", label: "targets.col.goal" },
  { key: "status", label: "targets.col.status", hint: "targets.col.statusHint" },
  { key: "progress", label: "targets.col.progress", hint: "targets.col.progressHint" },
  { key: "pace", label: "targets.col.pace", hint: "targets.col.paceHint" },
  { key: "results", label: "targets.col.results", hint: "targets.col.resultsHint", align: "right" },
  { key: "start", label: "targets.col.start" },
  { key: "due", label: "targets.col.due" },
  { key: "owner", label: "targets.col.owner" },
  { key: "area", label: "targets.col.area" },
  { key: "updated", label: "targets.col.updated", hint: "targets.col.updatedHint" },
];
// The title IS the row's identity — hiding it would leave anonymous rows.
const LOCKED = new Set(["goal"]);
// Off until somebody asks for them: the default set fits a 1280px screen
// without scrolling sideways.
const DEFAULT_HIDDEN = ["results", "start"];
const COL_PREF_KEY = "targets.register.cols";

// The first click on a header sorts the way that column is usually asked: the
// most urgent status, the furthest behind, the nearest date and the stalest
// update first; the most done and the most results reached first.
const FIRST_DIR = {
  goal: "asc", status: "asc", progress: "desc", pace: "asc", results: "desc",
  start: "asc", due: "asc", owner: "asc", area: "asc", updated: "asc",
};
const DEFAULT_SORT = { key: "status", dir: "asc" };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const cmp = (a, b) => (typeof a === "string" ? collator.compare(a, b) : a - b);
const byDue = (a, b) => cmp(a.g.due ?? "9999-12-31", b.g.due ?? "9999-12-31");

// What a row is sorted by, per column. null = no answer (a goal with no dates,
// no owner, no results) — it sinks to the bottom whichever way the column
// runs, because «unknown» is neither smaller nor larger than a real value.
function sortValue(key, r, t) {
  switch (key) {
    case "goal": return (r.g.title ?? "").trim() || null;
    case "status": return STATUS_RANK[r.st];
    case "progress": return r.p;
    case "pace": return r.gap;
    case "results": return r.krTotal ? r.krDone / r.krTotal : null;
    case "start": return r.g.start;
    case "due": return r.g.due;
    case "owner": return (r.g.owner ?? "").trim() || null;
    case "area": return t(`targets.cat.${r.g.category}`);
    // Never updated is the stalest of all, so it leads «stalest first».
    case "updated": return r.last ?? "";
    default: return null;
  }
}

// Ties fall back on the board's own order: the most urgent status, the
// furthest behind, the nearest deadline, then the name.
const tieBreak = (a, b) =>
  (STATUS_RANK[a.st] - STATUS_RANK[b.st]) || ((a.gap ?? 9) - (b.gap ?? 9)) || byDue(a, b)
  || collator.compare(a.g.title ?? "", b.g.title ?? "");

// «18% orqada» / «5% oldinda» / «rejada» — the card's own pace words, in whole
// points of the goal. `gap` is done − plan, so a negative gap is behind.
function paceWords(gap, t) {
  const d = Math.round(-gap * 100);
  if (d > 0) return fill(t("targets.pace.behind"), { d: `${d}%` });
  if (d < 0) return fill(t("targets.pace.ahead"), { d: `${-d}%` });
  return t("targets.reg.onPlan");
}

// «3 kun oldin» — stale (amber) after a week without a value, or never: the
// card's «last update» rule, in the words a narrow column can hold.
function updatedWords(last, today, t) {
  if (!last) return { text: t("targets.reg.never"), stale: true };
  const n = Math.max(0, dayDiff(last, today));
  return { text: n === 0 ? t("targets.reg.today") : fill(t("targets.reg.ago"), { n }), stale: n >= 7 };
}

const Dash = ({ title }) => <span title={title} style={{ color: "var(--text-3)" }}>—</span>;

// The frozen title column paints its own right edge: a collapsed table border
// stays behind in the grid when its cell sticks, so the divider would scroll
// away from the column it belongs to.
const FROZEN_EDGE = "shadow-[inset_-1px_0_0_var(--border)]";

function Cell({ k, r, t, today, frozen }) {
  const td = "px-3 py-2.5";
  switch (k) {
    case "goal":
      return (
        <td
          className={`${td} ${frozen ? `sticky left-0 z-[1] bg-[var(--bg-card)] group-hover:bg-[var(--bg-inner)] ${FROZEN_EDGE}` : ""}`}
        >
          <div className="min-w-[13rem] whitespace-normal">
            <Link
              to={`/targets/${encodeURIComponent(r.g.id)}`} title={r.g.title}
              className="text-[13px] font-semibold leading-snug line-clamp-2 break-words rounded-sm outline-none hover:underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
              style={{ color: "var(--text-1)" }}
            >
              {r.g.title}
            </Link>
          </div>
        </td>
      );
    case "status":
      return <td className={td}><StatusChip status={r.st} t={t} /></td>;
    case "progress": {
      // The fill is the work done, the upright tick is where the plan says the
      // goal should be today — the card's bar, cut to a table row.
      const plan = r.e !== null && r.st !== "achieved";
      return (
        <td className={td}>
          <div className="flex items-center gap-2.5">
            <span className="w-10 text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
              {fmtPct(r.p)}
            </span>
            <PaceBar
              progress={r.p} expected={plan ? r.e : null} color={STATUS_COLOR[r.st]} height={6}
              label={plan
                ? fill(t("targets.pace.aria"), { p: fmtPct(r.p), e: fmtPct(r.e) })
                : fill(t("targets.pace.ariaDone"), { p: fmtPct(r.p) })}
              className="w-20 flex-shrink-0"
            />
          </div>
        </td>
      );
    }
    case "pace":
      return (
        <td className={td}>
          {r.gap === null ? (
            <Dash title={r.st === "achieved" ? t("targets.pace.achieved") : t("targets.noDates")} />
          ) : (
            <div className="leading-tight tabular-nums">
              <div className="font-semibold" style={{ color: "var(--text-1)" }}>{paceWords(r.gap, t)}</div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                {fill(t("targets.planShort"), { e: fmtPct(r.e) })}
              </div>
            </div>
          )}
        </td>
      );
    case "results":
      return (
        <td className={`${td} text-right tabular-nums`}>
          {r.krTotal ? (
            <span title={fill(t("targets.resultsDone"), { done: r.krDone, total: r.krTotal })}>
              <span className="font-semibold" style={{ color: "var(--text-1)" }}>{r.krDone}</span>
              <span style={{ color: "var(--text-3)" }}> / {r.krTotal}</span>
            </span>
          ) : <Dash />}
        </td>
      );
    case "start":
      return (
        <td className={td} style={{ color: "var(--text-2)" }}>
          {r.g.start ? fmtDate(r.g.start, t, today) : <Dash title={t("targets.noDates")} />}
        </td>
      );
    case "due":
      return (
        <td className={td}>
          {r.g.due ? (
            <div className="leading-tight">
              <div style={{ color: "var(--text-1)" }}>{fmtDate(r.g.due, t, today)}</div>
              {r.st !== "achieved" && <DaysLeft left={daysLeft(r.g, today)} t={t} className="block mt-0.5 text-[11px]" />}
            </div>
          ) : <Dash title={t("targets.noDates")} />}
        </td>
      );
    case "owner": {
      const o = (r.g.owner ?? "").trim();
      return (
        <td className={td} title={o || t("targets.noOwner")}>
          {o ? <span className="block max-w-[12rem] truncate" style={{ color: "var(--text-1)" }}>{o}</span> : <Dash />}
        </td>
      );
    }
    case "area":
      return (
        <td className={td} style={{ color: "var(--text-2)" }}>
          <AreaTag category={r.g.category} t={t} iconStyle={{ color: "var(--text-3)" }} />
        </td>
      );
    case "updated": {
      const u = updatedWords(r.last, today, t);
      return (
        <td className={td} title={r.last ? fill(t("targets.lastCheckin"), { date: fmtDate(r.last, t, today) }) : undefined}>
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-2)" }}>
            <History size={13} strokeWidth={2.2} className="flex-shrink-0" style={{ color: u.stale ? AMBER : "var(--text-3)" }} aria-hidden />
            {u.text}
          </span>
        </td>
      );
    }
    default:
      return <td className={td} />;
  }
}

// On a phone the list shows the title, done, the bar, the status, the owner and
// the due date. Sorted by anything else, the row also shows THAT fact — a list
// ordered by something it does not print reads as no order at all.
function SortFact({ k, r, t, today }) {
  const icon = { color: "var(--text-3)" };
  const wrap = "inline-flex items-center gap-1.5 text-xs min-w-0";
  switch (k) {
    case "pace":
      return r.gap === null ? null : (
        <span className={wrap} style={{ color: "var(--text-2)" }}>
          <Gauge size={13} strokeWidth={2.2} className="flex-shrink-0" style={icon} aria-hidden />
          {paceWords(r.gap, t)} · {fill(t("targets.planShort"), { e: fmtPct(r.e) })}
        </span>
      );
    case "results":
      return !r.krTotal ? null : (
        <span className={wrap} style={{ color: "var(--text-2)" }}>
          <ListChecks size={13} strokeWidth={2.2} className="flex-shrink-0" style={icon} aria-hidden />
          {fill(t("targets.resultsDone"), { done: r.krDone, total: r.krTotal })}
        </span>
      );
    case "start":
      return !r.g.start ? null : (
        <span className={wrap} style={{ color: "var(--text-2)" }}>
          <CalendarPlus size={13} strokeWidth={2.2} className="flex-shrink-0" style={icon} aria-hidden />
          {t("targets.col.start")}: {fmtDate(r.g.start, t, today)}
        </span>
      );
    case "area":
      return (
        <span className="text-xs min-w-0" style={{ color: "var(--text-2)" }}>
          <AreaTag category={r.g.category} t={t} iconStyle={icon} />
        </span>
      );
    case "updated": {
      const u = updatedWords(r.last, today, t);
      return (
        <span className={wrap} style={{ color: "var(--text-2)" }}>
          <History size={13} strokeWidth={2.2} className="flex-shrink-0" style={{ color: u.stale ? AMBER : "var(--text-3)" }} aria-hidden />
          {u.text}
        </span>
      );
    }
    default:
      return null;
  }
}

function PhoneRow({ r, t, today, sortKey, first }) {
  const plan = r.e !== null && r.st !== "achieved";
  return (
    <li className="relative px-4 py-3 transition-colors active:bg-[var(--bg-inner)]" style={first ? undefined : { borderTop: "1px solid var(--border)" }}>
      <div className="flex items-start gap-3">
        <h3 className="flex-1 min-w-0 text-sm font-semibold leading-snug line-clamp-2 break-words" style={{ color: "var(--text-1)" }}>
          {/* Stretched over the whole row: one tap target, one focus ring. */}
          <Link
            to={`/targets/${encodeURIComponent(r.g.id)}`}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--brand-ring)]"
          >
            {r.g.title}
          </Link>
        </h3>
        <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{fmtPct(r.p)}</span>
      </div>
      <PaceBar
        progress={r.p} expected={plan ? r.e : null} color={STATUS_COLOR[r.st]} height={6} className="mt-2"
        label={plan
          ? fill(t("targets.pace.aria"), { p: fmtPct(r.p), e: fmtPct(r.e) })
          : fill(t("targets.pace.ariaDone"), { p: fmtPct(r.p) })}
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusChip status={r.st} t={t} />
        <GoalMeta goal={r.g} st={r.st} today={today} t={t} area={false} />
        <SortFact k={sortKey} r={r} t={t} today={today} />
      </div>
    </li>
  );
}

export default function GoalRegister({ rows, total, today, t, onUpdate }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── column visibility / order — the Concerns / Позиции wiring ────────────
  const { data: savedCols } = useQuery({
    queryKey: ["ui-pref", COL_PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${COL_PREF_KEY}`).then((r) => r.data?.value),
    staleTime: Infinity,
  });
  const [colsLocal, setColsLocal] = useState(null); // this session's edits win over the fetch
  const colCfg = useMemo(() => {
    // Reconcile the saved pref against the catalog: drop keys that no longer
    // exist, seat a new column where COLS puts it (not at the far right), and
    // never let the locked one hide.
    const saved = colsLocal ?? savedCols;
    const keys = COLS.map((c) => c.key);
    const order = Array.isArray(saved?.order) ? saved.order.filter((k) => keys.includes(k)) : [];
    keys.forEach((k, i) => {
      if (order.includes(k)) return;
      const before = keys.slice(0, i).filter((p) => order.includes(p)).pop();
      order.splice(before ? order.indexOf(before) + 1 : 0, 0, k);
    });
    const hidden = (Array.isArray(saved?.hidden) ? saved.hidden : DEFAULT_HIDDEN)
      .filter((k) => keys.includes(k) && !LOCKED.has(k));
    return { order, hidden };
  }, [colsLocal, savedCols]);
  const saveCols = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }),
  });
  const onColsChange = (value) => {
    setColsLocal(value);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], value);
    saveCols.mutate(value);
  };
  const visible = useMemo(() => {
    const off = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k)).filter((c) => c && !off.has(c.key));
  }, [colCfg]);

  // ── sort — remembered like every page's; a column the reader has since
  // hidden cannot be what the list is ordered by, so it falls back ──────────
  const [sort, setSort] = usePersistentState("targets_reg_sort", DEFAULT_SORT);
  const eff = sort && visible.some((c) => c.key === sort.key) && (sort.dir === "asc" || sort.dir === "desc")
    ? sort : DEFAULT_SORT;
  const onSort = (k) => setSort(eff.key === k
    ? { key: k, dir: eff.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: FIRST_DIR[k] ?? "asc" });

  const data = useMemo(() => rows.map((r) => {
    const tgs = r.g.targets ?? [];
    return {
      ...r,
      // done − plan: negative is behind. No plan to measure against once the
      // goal is achieved or when it has no dates.
      gap: r.e === null || r.st === "achieved" ? null : r.p - r.e,
      last: lastActivity(r.g),
      krTotal: tgs.length,
      krDone: tgs.filter((tg) => targetProgress(tg) >= 1).length,
    };
  }), [rows]);

  const sorted = useMemo(() => {
    const { key, dir } = eff;
    return [...data].sort((a, b) => {
      const va = sortValue(key, a, t), vb = sortValue(key, b, t);
      if (va === null || vb === null) {
        if (va !== vb) return va === null ? 1 : -1;
      } else {
        const c = cmp(va, vb);
        if (c) return dir === "asc" ? c : -c;
      }
      return tieBreak(a, b);
    });
  }, [data, eff.key, eff.dir, t]); // eslint-disable-line react-hooks/exhaustive-deps

  // The title freezes only while it is the first column — a frozen column in
  // the middle would slide over its neighbours.
  const frozen = visible[0]?.key === "goal";
  const hintOf = (c) => (c.hint
    ? fill(t(c.hint), { grace: Math.round(PACE.grace * 100), risk: Math.round(PACE.risk * 100) })
    : undefined);

  // A row opens its goal. The title is the real link (keyboard, middle-click);
  // the rest of the row is a mouse convenience that never swallows the button,
  // the link, or a reader selecting text to copy.
  const openRow = (ev, id) => {
    if (ev.target.closest("a, button")) return;
    if (window.getSelection?.()?.toString()) return;
    navigate(`/targets/${encodeURIComponent(id)}`);
  };

  const phone = (
    <>
      <div
        className="sticky top-0 z-[2] flex items-center gap-2 px-4 py-2"
        style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}
      >
        <span className="text-xs flex-shrink-0" style={{ color: "var(--text-2)" }}>{t("targets.reg.sortBy")}</span>
        <StyledSelect
          value={eff.key}
          onChange={(k) => setSort({ key: k, dir: FIRST_DIR[k] ?? "asc" })}
          options={visible.map((c) => ({ value: c.key, label: t(c.label) }))}
          triggerClassName="px-2.5 py-1.5 text-xs"
          className="flex-1 min-w-0"
        />
        <Button
          variant="secondary"
          icon={eff.dir === "asc" ? <ArrowUpNarrowWide size={14} /> : <ArrowDownWideNarrow size={14} />}
          onClick={() => setSort({ key: eff.key, dir: eff.dir === "asc" ? "desc" : "asc" })}
          aria-label={t(eff.dir === "asc" ? "targets.reg.sortAsc" : "targets.reg.sortDesc")}
          title={t(eff.dir === "asc" ? "targets.reg.sortAsc" : "targets.reg.sortDesc")}
          className="flex-shrink-0"
        />
      </div>
      <ul role="list">
        {sorted.map((r, i) => (
          <PhoneRow key={r.g.id} r={r} t={t} today={today} sortKey={eff.key} first={i === 0} />
        ))}
      </ul>
    </>
  );

  return (
    <TableCard
      // A container: the row button keeps its word only while the card is wide
      // enough to hold every default column without scrolling sideways.
      className="@container"
      icon={TableProperties}
      title={t("targets.reg.title")}
      subtitle={rows.length === total ? null : fill(t("targets.overview.countOf"), { n: rows.length, total })}
      right={
        <div className="flex items-center gap-3">
          <SaveState t={t} />
          <span
            className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}
            title={fill(t("targets.overview.count"), { n: rows.length })}
          >
            {rows.length}
          </span>
          {/* Hidden below `sm`, where the table gives way to the list — a
              picker over a table nobody can see is a control with no effect. */}
          <ColumnsPicker
            className="hidden sm:block"
            columns={COLS.map((c) => ({ key: c.key, label: t(c.label), locked: LOCKED.has(c.key) }))}
            order={colCfg.order}
            hidden={colCfg.hidden}
            onChange={onColsChange}
          />
        </div>
      }
      mobile={phone}
    >
      <thead>
        <tr>
          {visible.map((c) => (
            <Th
              key={c.key} label={t(c.label)} k={c.key} sort={eff} onSort={onSort} hint={hintOf(c)} align={c.align}
              cls={c.key === "goal" ? `w-full ${frozen ? `left-0 z-20 ${FROZEN_EDGE}` : ""}` : ""}
            />
          ))}
          <Th label={<span className="sr-only">{t("targets.col.actions")}</span>} />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={r.g.id} className="group cursor-pointer" onClick={(ev) => openRow(ev, r.g.id)}>
            {visible.map((c) => <Cell key={c.key} k={c.key} r={r} t={t} today={today} frozen={frozen} />)}
            <td className="px-3 py-2 text-right">
              <Button
                size="sm" variant="secondary" icon={<RefreshCw size={13} />}
                onClick={() => onUpdate(r.g.id)}
                aria-label={fill(t("targets.reg.updateAria"), { title: r.g.title })}
                title={t("targets.update")}
              >
                <span className="hidden @min-[76rem]:inline">{t("targets.update")}</span>
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}
