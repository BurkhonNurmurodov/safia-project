import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowUp, ArrowUpRight, Boxes, CheckCheck, ChevronDown, CircleDot, ClipboardList, Clock,
  FileSpreadsheet, LayoutGrid, ListFilter, Megaphone, Settings2, TrendingUp, Trophy, UserCog, UserRound,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker, { ALL_TIME_FROM } from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import CellLink from "../components/ui/CellLink";
import Tooltip from "../components/ui/Tooltip";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { cardStyle, Chart, NoChart, RankedList, StackLegend } from "../components/ui/AnalysisBoard";
import { TONE_HEX, toneTint } from "../utils/statusBands";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import useIsMobile from "../hooks/useIsMobile";
import useElementWidth from "../hooks/useElementWidth";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { usePageAccess } from "../hooks/usePageAccess";
import { useCapabilities } from "../hooks/useCapabilities";
import { canAccessPage } from "../config/pages";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { padChartFrom, listChartDays, AXIS_GUTTER_PX } from "../utils/chartRange";
import { softHyphenate, surnameInitial } from "../utils/personName";
import { TXT, ST_LBL, LI, fill } from "./workerConcernsText";

// «Ishchi havotirlari» — the leaders' KPI over the concerns workers file on
// «Yacheyka havotirlari» (/cell-concerns), read by routers/worker_concerns.py.
//
// The page answers ONE question first — how much of what workers raise does
// each leader resolve — so it opens on that: the headline rate, then the
// leaders ranked by it. Everything else (units, cells, the daily trend) is
// context under it, and the concerns themselves are the second tab. A LEADER
// (locked to their own rows server-side) gets their own result, their open
// concerns and their cells instead of a ranking of one.

// ── statuses ─────────────────────────────────────────────────────────────────
// Traffic-light FILLS for bars and dots; text in a status colour uses the
// theme's --status-* inks, which hold AA contrast on both themes. «todo» —
// nobody has started it — is GREY, the platform's word for «not started»
// (/cell-concerns and /concerns print the same rows so): red is a fault, not a
// state. «uplifted» (handed up the chain — resolved above since or not, no
// longer the leader's, and out of every %) is a darker slate, and every status
// carries its own ICON, so the two greys differ by shape and not by shade alone.
const ST_KEYS = ["done", "doing", "todo", "uplifted"];
// What still waits on the LEADER — the «Ochiq» count and every open list.
const OPEN_KEYS = ["doing", "todo"];
const SLATE = "#94a3b8";
const SLATE_DARK = "#64748b";
const ST_FILL = { done: TONE_HEX.ok, doing: TONE_HEX.warn, todo: SLATE, uplifted: SLATE_DARK };
const ST_INK = { done: "var(--status-ok)", doing: "var(--status-warn)", todo: "var(--text-2)", uplifted: "var(--text-2)" };
const ST_ICON = { done: CheckCheck, doing: Clock, todo: CircleDot, uplifted: ArrowUp };
// The icon's ink inside a filled status badge — dark on the light fills, white
// on the dark slate (each ≥ 4.5:1 against its fill).
const ST_GLYPH = { done: "#052e16", doing: "#422006", todo: "#0f172a", uplifted: "#ffffff" };
const BAND_TONE = { green: "ok", yellow: "warn", red: "bad" };
const BAND_INK = {
  green: "var(--status-ok)", yellow: "var(--status-warn)", red: "var(--status-bad)",
  low: "var(--text-2)", nl: "var(--text-2)", none: "var(--text-2)", plain: "var(--text-1)",
};
// A period shorter than this is not colour-graded: its newest concerns have
// not had the time to be resolved, so every leader would read red on the
// first days of a month (the default period) whatever they did.
const SHORT_PERIOD_DAYS = 7;
// A change of fewer points than this reads «about the same»: on a few dozen
// concerns one resolved more or less moves the rate by more than that.
const DELTA_MIN = 3;
// A phone opens the ranking on this many leaders; the rest are one tap away.
const PHONE_ROWS = 10;
// A button a finger has to hit: 44 px tall below sm (dialogs, empty states).
const PHONE_TAP = "max-sm:min-h-[44px]";
const PAGE_SIZE = 50;
const CHART_MAX_DAYS = 92;      // past this the trend reads per WEEK

// A status filter saved before the switch may still name the sheet era's keys:
// «deferred» was their word for the same act as «uplifted», «other» has none.
const cleanStatuses = (sel) =>
  [...new Set((sel || []).map((s) => (s === "deferred" ? "uplifted" : s)))]
    .filter((s) => ST_KEYS.includes(s));
// The view key outlived the three-tab page: «obzor» and «leaders» were both the
// KPI side of what is now one tab.
const cleanView = (v) => (v === "register" || v === "havotirlar" ? "havotirlar" : "reyting");

const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "—");
const fmtShort = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "—");
const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ` +
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const n0 = (v) => (v ?? 0).toLocaleString("ru-RU");
const share = (n, total) => (total ? Math.round((n * 100) / total) : 0);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
// Two tokens recognise a person and fit a phone row (a worker's name is free
// text, so this is all it ever claims).
const twoWords = (name) => (name || "").trim().split(/\s+/).slice(0, 2).join(" ");
// THE whole percent — the server's `pct0`: rounded ONCE, half up, from the
// counts, and the very integer the Excel file prints. `pct` (one decimal) only
// stands in for a backend that predates it.
const whole = (r) => (r?.pct0 ?? (r?.pct == null ? null : Math.round(r.pct)));
// What a % is taken over: every concern that stayed with the leader — the
// total less what was handed up (routers/worker_concerns._rated). The operator,
// 2026-10-04: an uplifted concern must not move a leader's rating.
const ratedOf = (r) => r?.rated ?? ((r?.total || 0) - (r?.uplifted || 0));
// The exact share resolved — for ORDER only: two whole percents can tie where
// the fractions behind them do not.
const ratio = (r) => (ratedOf(r) ? r.done / ratedOf(r) : -1);
// Only a leader on Verifix is ranked (services/leader_kind.py). A leader row
// names its kind; any other row (a unit, the headline) carries none.
const notLeader = (r) => r?.kind !== undefined && r.kind !== "leader";
// A concern nobody has resolved yet, wherever it sits.
const unresolved = (c) => (c.status ? c.status !== "done" : c.st !== "done");
// A leader row's key — its profile id, else its name. The Excel export is sent
// the screen's order in these (routers/worker_concerns._row_key).
const rankKey = (r) => (r.leader_id != null ? String(r.leader_id) : (r.leader || ""));
// What a failed export said. A browser asks for a blob, so the error body comes
// back as one too and must be read before its words can be shown.
const exportError = async (e) => {
  let data = e?.response?.data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    try { data = JSON.parse(await data.text()); } catch { data = null; }
  }
  const d = data?.detail_raw ?? data?.detail;
  if (d && typeof d === "object" && d.code) return d;
  return { message: typeof d === "string" ? d : (e?.message || "") };
};

// The meta line under a concern: its cell, then who wrote it and to whom —
// «worker → leader», the arrow being the filing itself. The leader is dropped
// where every row is the viewer's own.
const whoLine = (c, tl, showLeader) => {
  const who = surnameInitial(tl(c.owner || "")) || "—";
  const to = showLeader && c.leader ? ` → ${surnameInitial(tl(c.leader))}` : "";
  return [c.cell, `${who}${to}`].filter(Boolean).join(" · ");
};

// A sentence with ONE of its slots rendered as a node (a number in its own
// colour), the words around it still the translation's own.
const fillAround = (str, vars, key, node) => {
  const [before, after = ""] = fill(str, vars).split(`{${key}}`);
  return <>{before}{node}{after}</>;
};

// The band a % is judged by — the WHOLE percent the reader sees, never the raw
// fraction (utils/statusBands.js's rule), and only with enough concerns behind
// it: 1 of 1 is noise, not performance. A profile that is not a leader on
// Verifix is never graded («nl»).
const bandOf = (row, bands, plain = false) => {
  if (!row.total) return "none";
  if (notLeader(row)) return "nl";
  const p = whole(row);
  if (!row.ranked || p == null) return "low";
  if (plain) return "plain";
  return p >= bands.green ? "green" : p >= bands.yellow ? "yellow" : "red";
};

// ── small pieces ─────────────────────────────────────────────────────────────

function PctChip({ pct, band, big = false }) {
  if (band === "none") {
    return <span className="text-sm tabular-nums" style={{ color: "var(--text-2)" }}>—</span>;
  }
  const tone = BAND_TONE[band];
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg font-bold tabular-nums whitespace-nowrap ${
        big ? "text-base px-3 py-1 min-w-[72px]" : "text-sm px-2 py-0.5 min-w-[60px]"}`}
      style={{
        background: tone ? toneTint(tone) : "var(--bg-inner)",
        color: BAND_INK[band],
        border: band === "low" || band === "nl" ? "1px dashed var(--border-md)" : "1px solid transparent",
      }}>
      {pct == null ? "—" : `${pct}%`}
    </span>
  );
}

// The status of ONE concern — and, for one handed up and resolved there since,
// a line saying so: «Ko'tarilgan» alone would read as still open.
function ConcernStatus({ T, stL, c, inline = false }) {
  const up = c.st === "uplifted";
  const doneAbove = up && c.status === "done";
  return (
    <>
      <StChip st={c.st} label={stL(c.st)} hint={up ? T.stUpHint : undefined} />
      {doneAbove && (
        <span className={`${inline ? "inline-flex" : "flex mt-1"} items-center gap-1 text-[11px]`} style={{ color: "var(--status-ok)" }}>
          <CheckCheck size={12} strokeWidth={2.4} aria-hidden className="flex-shrink-0" />
          {T.upDone}
        </span>
      )}
    </>
  );
}

// «Lider o'rnida» / «Lavozimi aniqlanmagan» — why a row is listed and not ranked.
function KindTag({ T, kind }) {
  return (
    <span className="inline-flex items-center px-1.5 py-px rounded-md text-[11px] font-medium whitespace-nowrap align-middle"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
      {kind === "acting" ? T.kindActing : T.kindNone}
    </span>
  );
}

// «X of Y resolved» — Y is what stayed with the leader, and what was handed up
// is named beside it, so the reader can see why Y is not the total.
function OfLine({ T, r, className = "text-sm", color = "var(--text-2)" }) {
  const up = r.uplifted || 0;
  return (
    <>
      <p className={className} style={{ color }}>
        {up ? fill(T.hOfRated, { done: n0(r.done), rated: n0(ratedOf(r)) })
          : fill(T.hOf, { done: n0(r.done), total: n0(r.total) })}
      </p>
      {up > 0 && (
        <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--text-2)" }}>
          <ArrowUp size={12} strokeWidth={2.4} aria-hidden className="flex-shrink-0" style={{ color: SLATE_DARK }} />
          {fill(T.hUpOut, { u: n0(up) })}
        </p>
      )}
    </>
  );
}

function StChip({ st, label, hint }) {
  const Icon = ST_ICON[st] || CircleDot;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap"
      style={{ background: `${ST_FILL[st] || SLATE}1a`, color: ST_INK[st] || "var(--text-2)" }}
      title={hint}>
      <Icon size={12} strokeWidth={2.4} aria-hidden className="flex-shrink-0" style={{ color: ST_FILL[st] || SLATE }} />
      {label}
    </span>
  );
}

// A status as a filled badge — its bar segment's own colour with its icon
// inside — so a label is matched to its segment by colour AND shape.
function StBadge({ st, size = 16 }) {
  const Icon = ST_ICON[st] || CircleDot;
  return (
    <span aria-hidden className="grid place-items-center rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: ST_FILL[st] || SLATE }}>
      <Icon size={size - 6} strokeWidth={3} style={{ color: ST_GLYPH[st] || "#0f172a" }} />
    </span>
  );
}

// The four statuses as ONE bar that adds up to the total, with each part's
// count and share under it — the old five KPI cards overlapped («Hal
// bo'lmagan» already held «Jarayonda»), this cannot. Its labels are also the
// page's status key: the bar lists further down wear the same colours and
// icons without repeating one.
function StatusSplit({ counts, stL, upHint, grid = "grid-cols-2 sm:grid-cols-4" }) {
  const total = ST_KEYS.reduce((s, k) => s + (counts[k] || 0), 0);
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
        role="img" aria-label={ST_KEYS.map((k) => `${stL(k)}: ${counts[k] || 0}`).join(", ")}>
        {ST_KEYS.map((k) => (counts[k] > 0 ? (
          <div key={k} className="h-full" style={{ width: `${(counts[k] / total) * 100}%`, background: ST_FILL[k] }} />
        ) : null))}
      </div>
      <dl className={`grid ${grid} gap-x-4 gap-y-3 mt-4`}>
        {ST_KEYS.map((k) => (
            <div key={k} className="min-w-0" title={k === "uplifted" ? upHint : undefined}>
              <dt className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                <StBadge st={k} />
                <span className="truncate">{stL(k)}</span>
              </dt>
              <dd className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{n0(counts[k])}</span>
                <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{share(counts[k] || 0, total)}%</span>
              </dd>
            </div>
        ))}
      </dl>
    </div>
  );
}

// The % bands as one short line, named where the coloured %s begin — not under
// the last of seventy rows. With a count per band where the caller has one.
function BandKey({ T, bands, minRanked, counts }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" style={{ color: "var(--text-2)" }}>
      {[
        ["green", `≥ ${bands.green}%`],
        ["yellow", `${bands.yellow}–${bands.green - 1}%`],
        ["red", `< ${bands.yellow}%`],
        ["low", fill(T.bandLowL, { m: minRanked })],
      ].map(([b, label]) => (
        <li key={b} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ background: BAND_TONE[b] ? TONE_HEX[BAND_TONE[b]] : "transparent", border: BAND_TONE[b] ? "none" : "1px dashed var(--text-4)" }} />
          <span>{label}</span>
          {counts && <span className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{fill(T.rCount, { n: counts[b] })}</span>}
        </li>
      ))}
    </ul>
  );
}

// A leader's cells as links onto /cells/:id — a cell is its CODE. A code the
// register does not know has no id, and CellLink prints it as plain text.
// On a touch screen each code is a chip with a 44 px target (32 px tall plus
// an invisible pad) and a gap from its neighbour — four digits of dotted text
// were 30×16 px, side by side, inside a row whose own tap opens a dialog.
function CellCodes({ codes, cellIds }) {
  return (
    <span className="pointer-coarse:inline-flex pointer-coarse:flex-wrap pointer-coarse:gap-1.5 pointer-coarse:py-1.5">
      {(codes || []).map((c, i) => (
        <span key={c} className="whitespace-nowrap">
          <span className="pointer-coarse:hidden">{i ? ", " : ""}</span>
          <CellLink id={cellIds?.[c]}
            className="relative tabular-nums pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:min-h-[32px] pointer-coarse:px-2 pointer-coarse:rounded-md pointer-coarse:bg-[var(--bg-inner)]">
            {c}
            {cellIds?.[c] ? <span aria-hidden="true" className="absolute inset-x-0 -top-1.5 -bottom-1.5 hidden pointer-coarse:block" /> : null}
          </CellLink>
        </span>
      ))}
    </span>
  );
}

// A section that could not load says so, with the way out — a failure must
// never read as «nothing happened» (it used to print zeros), nor look like an
// empty section: a red glyph, words clear of the card's edges, a retry a
// finger can hit.
function SectionError({ T, title, onRetry, height = "h-48" }) {
  return (
    <div className="px-4">
      <EmptyState icon={AlertTriangle} tone="danger" height={height} showUploadLink={false}
        title={title || T.loadFailed} message={T.loadFailedMsg}
        action={<Button size="md" variant="secondary" onClick={onRetry} className="max-sm:min-h-[44px] max-sm:px-5">{T.retry}</Button>} />
    </div>
  );
}

function Card({ children, className = "", label }) {
  return (
    <section className={`rounded-2xl overflow-hidden ${className}`} style={cardStyle} aria-label={label}>
      {children}
    </section>
  );
}

// ── headline ─────────────────────────────────────────────────────────────────

// How the rate compares with the period of the same length just before it —
// read as that period stood the same time after it ended (routers/
// worker_concerns._previous), so an older window does not win just by age.
// The line names that window by its dates, says how far the rate moved, and
// colours the move only where the headline itself is graded: a short or thin
// period is not, and a move of a point or two is noise either way.
function DeltaLine({ T, pct, prev, days, graded }) {
  if (!prev || pct == null) return null;
  // The window's dates travel with its figure: «(05.08–03.09): 66%» never
  // breaks, on a phone or beside a narrow column.
  const lead = fill(T.hPrevLead, { n: days });
  const range = `(${fmtShort(prev.from)}–${fmtShort(prev.to)})`;
  const tip = fill(T.hPrevTip, { from: fmtDate(prev.from), to: fmtDate(prev.to), done: n0(prev.done), total: n0(prev.total) });
  if (!prev.total) {
    return (
      <p className="flex items-start gap-1.5 text-xs leading-snug mt-2" style={{ color: "var(--text-2)" }}>
        <span>{lead} <span className="whitespace-nowrap">{range}</span>: {T.hPrevNoneTail}</span>
        <Tooltip text={tip} size={12} width="16rem" />
      </p>
    );
  }
  const was = whole(prev);
  const diff = pct - was;
  const flat = Math.abs(diff) < DELTA_MIN;
  const tone = flat || !graded ? null : diff > 0 ? "var(--status-ok)" : "var(--status-bad)";
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <p className="flex items-start gap-1.5 text-xs leading-snug mt-2">
      {flat
        ? <span aria-hidden className="w-3.5 text-center font-bold flex-shrink-0" style={{ color: "var(--text-2)" }}>≈</span>
        : <Icon size={14} strokeWidth={2.6} aria-hidden className="flex-shrink-0 mt-px" style={{ color: tone || "var(--text-2)" }} />}
      <span style={{ color: "var(--text-2)" }}>
        <span className="font-semibold whitespace-nowrap" style={{ color: tone || "var(--text-1)" }}>
          {flat ? T.hSame : fill(diff > 0 ? T.hUp : T.hDown, { d: Math.abs(diff) })}
        </span>
        {" · "}
        {lead}{" "}
        <span className="whitespace-nowrap">{range}: {was}%</span>
      </span>
      <Tooltip text={tip} size={12} width="16rem" />
    </p>
  );
}

function Headline({ T, stL, kpi, prev, days, band, facts }) {
  const pct = whole(kpi);
  return (
    <Card label={T.hLabel}>
      <div className="p-4 sm:p-5">
        {/* Side by side only where both halves have room: below xl the
            status key goes under the figure, full width, and its labels fit. */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-5 xl:gap-10">
          <div className="min-w-0 xl:w-96 flex-shrink-0">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
              {T.hLabel}
              <Tooltip text={T.hInfo} size={13} width="18rem" />
            </h2>
            <div className="text-5xl font-bold tabular-nums leading-none tracking-tight mt-2.5" style={{ color: BAND_INK[band] }}>
              {pct == null ? "—" : `${pct}%`}
            </div>
            <div className="mt-2"><OfLine T={T} r={kpi} /></div>
            {band === "low" && <p className="text-xs mt-1" style={{ color: "var(--text-2)" }}>{T.hLow}</p>}
            {band === "plain" && <p className="text-xs mt-1 max-w-xs" style={{ color: "var(--text-2)" }}>{fill(T.hShort, { n: days })}</p>}
            <DeltaLine T={T} pct={pct} prev={prev} days={days} graded={!!BAND_TONE[band]} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Beside the figure (xl) the column is narrow until 2xl: two by
                two there, so no label is cut («Передано выше» was). */}
            <StatusSplit counts={kpi} stL={stL} upHint={T.stUpHint}
              grid="grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4" />
          </div>
        </div>
        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 mt-4 pt-3 text-xs" style={{ borderTop: "1px solid var(--border)", color: "var(--text-2)" }}>
            {facts.map((f) => (
              <li key={f.key} className="inline-flex items-center gap-1.5" style={f.warn ? { color: "var(--status-warn)" } : undefined}>
                {f.warn && <AlertTriangle size={12} className="flex-shrink-0" aria-hidden />}
                {f.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function HeadlineSkeleton() {
  return (
    <Card>
      <div className="p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center gap-5 xl:gap-10">
        <div className="xl:w-96 space-y-3">
          <SkeletonBlock className="h-3 w-40" />
          <SkeletonBlock className="h-12 w-28" />
          <SkeletonBlock className="h-3 w-48" />
        </div>
        <div className="flex-1 space-y-4">
          <SkeletonBlock className="h-3 w-full rounded-full" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── leader ranking ───────────────────────────────────────────────────────────

// A cell spanning the WHOLE row of a table whose columns change at xl. A span
// wider than the columns shown is not harmless in a fixed-layout table: it
// invents empty columns, which then take their share of the width — at 768 px
// the names column shrank to 90 px beside an empty strip. One cell per layout,
// each visible only where its count is true.
function SpanCell({ narrow, wide, className = "", style, children }) {
  return (
    <>
      <td colSpan={narrow} className={`xl:hidden ${className}`} style={style}>{children}</td>
      <td colSpan={wide} className={`hidden xl:table-cell ${className}`} style={style}>{children}</td>
    </>
  );
}

// The ranking's groups in on-screen order — ONE function, read by the card and
// by the Excel export, which follows the screen (`leader_order`): ranked
// leaders by the exact share resolved, then the leaders with too few concerns
// to rank, then the profiles that are not leaders on Verifix (listed, never
// ranked — the operator, 2026-10-04), then the ones nobody filed to. Names
// tie-break in the reader's own alphabet (tl), the way they are printed.
function rankGroups(rows, sort, tl) {
  const name = (r) => tl(r.leader);
  const rankOf = new Map();
  rows.filter((r) => r.total > 0 && r.ranked)
    .sort((a, b) => (ratio(b) - ratio(a)) || (b.total - a.total) || name(a).localeCompare(name(b)))
    .forEach((r, i) => rankOf.set(rankKey(r), i + 1));
  const dir = sort.dir === "asc" ? 1 : -1;
  const cmp = (a, b) => {
    switch (sort.key) {
      case "leader": return name(a).localeCompare(name(b)) * dir;
      case "total": return ((a.total - b.total) || (ratio(a) - ratio(b))) * dir;
      case "open": return ((a.open - b.open) || (a.total - b.total)) * dir;
      default: return (rankOf.get(rankKey(b)) - rankOf.get(rankKey(a))) * dir;
    }
  };
  const byColumn = sort.key === "leader" || sort.key === "open" || sort.key === "total";
  return {
    rankOf,
    ranked: rows.filter((r) => r.total > 0 && r.ranked).sort(cmp),
    low: rows.filter((r) => r.total > 0 && !r.ranked && !notLeader(r))
      .sort((a, b) => (byColumn ? cmp(a, b) : (b.total - a.total) || name(a).localeCompare(name(b)))),
    nl: rows.filter((r) => r.total > 0 && notLeader(r))
      .sort((a, b) => (byColumn ? cmp(a, b) : (ratio(b) - ratio(a)) || (b.total - a.total) || name(a).localeCompare(name(b)))),
    none: rows.filter((r) => !r.total).sort((a, b) => name(a).localeCompare(name(b))),
  };
}

function RankingCard({
  T, tl, rows, cellIds, bands, minRanked, isAdmin, onEditBands, onOpen,
  sort, onSort, q, setQ, showNone, setShowNone, loading, error, onRetry, dim,
  oneUnit, plain, days,
}) {
  const g = useMemo(() => rankGroups(rows, sort, tl), [rows, sort, tl]);
  const { rankOf } = g;
  const rankedCount = rankOf.size;
  const bandCounts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0, low: 0, nl: 0, none: 0 };
    for (const r of rows) c[bandOf(r, bands)] += 1;
    return c;
  }, [rows, bands]);
  // A phone opens the list on PHONE_ROWS leaders — the cells and the trend
  // under it are not seven screens down — and a search shows every match.
  const [expanded, setExpanded] = useState(false);

  const needle = q.trim().toLowerCase();
  const match = (r) => !needle || r.leader.toLowerCase().includes(needle) || tl(r.leader).toLowerCase().includes(needle);
  const groups = [
    { key: "ranked", rows: g.ranked.filter(match) },
    { key: "low", caption: T.gLow, rows: g.low.filter(match) },
    { key: "nl", caption: T.gNotLeader, rows: g.nl.filter(match) },
    { key: "none", caption: T.gNone, rows: showNone ? g.none.filter(match) : [] },
  ];
  const noneCount = g.none.filter(match).length;
  const shown = groups.reduce((s, x) => s + x.rows.length, 0);
  const capped = !expanded && !needle;
  let budget = PHONE_ROWS;
  const phoneGroups = groups.map((x) => {
    if (!capped) return x;
    if (x.key === "none") return { ...x, rows: [] };      // revealed with the rest
    const take = x.rows.slice(0, Math.max(0, budget));
    budget -= take.length;
    return { ...x, rows: take };
  });
  const hiddenOnPhone = groups.reduce((n, x, i) => (x.key === "none" ? n
    : n + x.rows.length - phoneGroups[i].rows.length), 0);

  const brigOf = (r) => (r.brigadirs || []).map((b) => surnameInitial(tl(b))).join(", ");
  const cellsOf = (r) => (r.cells || []).join(", ");
  const sub = (r) => [oneUnit ? null : brigOf(r), cellsOf(r)].filter(Boolean).join(" · ");
  const open = (r) => onOpen(r, rankOf.get(rankKey(r)), rankedCount);
  const wideCols = oneUnit ? 6 : 7;          // columns shown from xl; 5 below it

  const foldBtn = noneCount > 0 ? (
    <button type="button" onClick={() => { setShowNone((v) => !v); setExpanded(true); }} aria-expanded={showNone}
      className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2 -mx-2 min-h-[44px] sm:min-h-[32px] transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      style={{ color: "var(--text-1)" }}>
      <ChevronDown size={14} className={`transition-transform ${showNone ? "rotate-180" : ""}`} aria-hidden style={{ color: "var(--brand-text)" }} />
      {showNone ? T.hideNone : fill(T.showNone, { n: noneCount })}
    </button>
  ) : null;
  // The admin's thresholds live in the card's header, as on /zagruzka's
  // tables — in the footer they cut the list off from its own fold.
  const bandsBtn = isAdmin ? (
    <Button size="md" variant="secondary" icon={<Settings2 size={15} />} onClick={onEditBands}
      aria-label={T.bandsEdit} title={T.bandsEdit} className="max-sm:min-h-[44px] max-sm:min-w-[44px]" />
  ) : null;
  // The colours are named where they begin — first thing under the title.
  const toolbar = (
    <div className="w-full flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {plain
          ? <p className="text-xs" style={{ color: "var(--text-2)" }}>{fill(T.hShort, { n: days })}</p>
          : <BandKey T={T} bands={bands} minRanked={minRanked} counts={bandCounts} />}
      </div>
      {rows.length > 12 && (
        <SearchInput value={q} onChange={setQ} placeholder={T.rSearch} className="w-full sm:w-72 flex-shrink-0" />
      )}
    </div>
  );
  const footer = foldBtn ? <div className="w-full">{foldBtn}</div> : null;
  // A separator keeps to the word before it (no line opens on «·»), and each
  // count keeps to its noun.
  const subtitle = (
    <>
      {T.rSub}{"\u00A0·"}{" "}
      <span className="whitespace-nowrap">{fill(T.rCount, { n: rows.length })}{"\u00A0·"}</span>{" "}
      <span className="whitespace-nowrap">{fill(T.rRanked, { k: rankedCount })}</span>
    </>
  );

  if (loading || error) {
    return (
      <Card label={T.rTitle}>
        <SectionHead icon={Trophy} title={T.rTitle} subtitle={T.rSub} />
        {error ? <SectionError T={T} title={T.errLeaders} onRetry={onRetry} /> : (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
          </div>
        )}
      </Card>
    );
  }

  // A phone row: the name, where it works, its counts — and the % alone on the
  // right, so the left keeps the width a name and its cell codes need.
  const phoneRow = (r) => {
    const rank = rankOf.get(rankKey(r));
    return (
      <li key={rankKey(r)}>
        <button type="button" onClick={() => open(r)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:bg-[var(--bg-inner)]">
          <span className="w-6 self-start pt-0.5 text-sm font-semibold tabular-nums text-right flex-shrink-0" style={{ color: "var(--text-2)" }}>
            {rank ?? "—"}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium leading-snug" style={{ color: "var(--text-1)" }}>{tl(twoWords(r.leader))}</span>
            {notLeader(r) && <span className="block mt-1"><KindTag T={T} kind={r.kind} /></span>}
            {sub(r) && <span className="block text-xs mt-0.5 break-words" style={{ color: "var(--text-2)" }}>{sub(r)}</span>}
            {r.total > 0 && (
              <span className="block text-xs mt-0.5 tabular-nums" style={{ color: "var(--text-2)" }}>
                {fillAround(r.uplifted ? T.rowTotUpOpen : T.rowTotOpen, { t: n0(r.total), u: n0(r.uplifted) }, "o", (
                  <span style={r.open ? { color: "var(--status-bad)", fontWeight: 600 } : undefined}>{n0(r.open)}</span>
                ))}
              </span>
            )}
          </span>
          <span className="flex-shrink-0"><PctChip pct={whole(r)} band={bandOf(r, bands, plain)} /></span>
        </button>
      </li>
    );
  };

  const mobile = (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {phoneGroups.map((x) => (x.rows.length ? [
          x.caption ? (
            <li key={`cap-${x.key}`} className="px-4 py-2 text-xs font-semibold" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
              {x.caption}
            </li>
          ) : null,
          ...x.rows.map(phoneRow),
        ] : null))}
        {shown === 0 && (
          <li className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-2)" }}>{T.noMatchLeaders}</li>
        )}
      </ul>
      {capped && hiddenOnPhone > 0 && (
        <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="secondary" size="lg" className="w-full min-h-[44px]" onClick={() => setExpanded(true)}>
            {fill(T.showMore, { n: hiddenOnPhone })}
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div style={{ opacity: dim ? 0.6 : 1, transition: "opacity .15s" }}>
      <TableCard icon={Trophy} title={T.rTitle} subtitle={subtitle} right={bandsBtn} toolbar={toolbar}
        pageScroll maxHeight="none" wrap fixed mobile={mobile} footer={footer}>
        <thead>
          <tr>
            <Th label={T.colRank} align="right" cls="w-12" />
            <Th label={T.colLeader} k="leader" sort={sort} onSort={onSort} />
            {!oneUnit && <Th label={T.xLabels.colBrig} cls="hidden xl:table-cell w-[22%]" />}
            <Th label={T.xLabels.colCells} cls="hidden xl:table-cell w-[16%]" />
            <Th label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" cls="w-[88px]" />
            <Th label={T.colOpen} k="open" sort={sort} onSort={onSort} align="right" cls="w-[120px]" hint={T.colOpenHint} />
            <Th label={T.colPct} k="pct" sort={sort} onSort={onSort} align="right" cls="w-[132px]" hint={T.colPctHint} />
          </tr>
        </thead>
        <tbody>
          {groups.map((x) => (x.rows.length ? [
            x.caption ? (
              <tr key={`cap-${x.key}`}>
                <SpanCell narrow={5} wide={wideCols} className="px-3 py-2 text-xs font-semibold"
                  style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                  {x.caption}
                </SpanCell>
              </tr>
            ) : null,
            ...x.rows.map((r) => {
              const rank = rankOf.get(rankKey(r));
              const brig = oneUnit ? "" : brigOf(r);
              return (
                <tr key={rankKey(r)} className="cursor-pointer" onClick={() => open(r)}>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>{rank ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }}
                      className="text-left text-sm font-medium hover:underline underline-offset-2 focus-visible:outline-none focus-visible:underline"
                      style={{ color: "var(--text-1)" }}>
                      {tl(r.leader)}
                    </button>
                    {notLeader(r) && <span className="ml-2"><KindTag T={T} kind={r.kind} /></span>}
                    {(brig || (r.cells || []).length > 0) && (
                      <div className="xl:hidden text-xs mt-0.5 break-words" style={{ color: "var(--text-2)" }}>
                        {brig}{brig && (r.cells || []).length ? " · " : ""}<CellCodes codes={r.cells} cellIds={cellIds} />
                      </div>
                    )}
                  </td>
                  {!oneUnit && (
                    <td className="px-3 py-2.5 hidden xl:table-cell text-sm truncate" style={{ color: "var(--text-2)" }}
                      title={(r.brigadirs || []).map((b) => tl(b)).join(", ")}>
                      {(r.brigadirs || []).map((b) => tl(b)).join(", ") || "—"}
                    </td>
                  )}
                  <td className="px-3 py-2.5 hidden xl:table-cell text-sm break-words" style={{ color: "var(--text-2)" }}>
                    {(r.cells || []).length ? <CellCodes codes={r.cells} cellIds={cellIds} /> : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums" style={{ color: r.total ? "var(--text-1)" : "var(--text-2)" }}>
                    {n0(r.total)}
                    {r.uplifted > 0 && (
                      <span className="flex items-center justify-end gap-0.5 text-xs mt-0.5" style={{ color: "var(--text-2)" }}
                        title={fill(T.hUpOut, { u: n0(r.uplifted) })}>
                        <ArrowUp size={12} strokeWidth={2.4} aria-hidden style={{ color: SLATE_DARK }} />
                        <span className="sr-only">{stL("uplifted")}:</span>
                        {n0(r.uplifted)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm tabular-nums"
                    style={r.open ? { color: "var(--status-bad)", fontWeight: 600 } : { color: "var(--text-2)" }}>{n0(r.open)}</td>
                  <td className="px-3 py-2.5 text-right"><PctChip pct={whole(r)} band={bandOf(r, bands, plain)} /></td>
                </tr>
              );
            }),
          ] : null))}
          {shown === 0 && (
            <tr>
              <SpanCell narrow={5} wide={wideCols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-2)" }}>
                {T.noMatchLeaders}
              </SpanCell>
            </tr>
          )}
        </tbody>
      </TableCard>
    </div>
  );
}

// ── concern rows (leader modal · a leader's own open list) ───────────────────

// The age («N kun») is how long a concern has WAITED, so only an open one
// carries it — on a resolved concern it would go on counting forever.
function ConcernRows({ T, stL, tl, rows, today, onOpen, showLeader }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((c) => {
        const age = c.d && unresolved(c) ? daysBetween(c.d, today) : null;
        return (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c)}
              className="w-full text-left py-3 px-1 -mx-1 rounded-lg transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:bg-[var(--bg-inner)]">
              <span className="flex items-center gap-2 flex-wrap">
                <ConcernStatus T={T} stL={stL} c={c} inline />
                <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                  №{c.no} · {fmtShort(c.d)}{age != null ? ` · ${age === 0 ? T.ageToday : fill(T.ageDays, { n: age })}` : ""}
                </span>
              </span>
              <span className="text-sm mt-1.5 line-clamp-2 leading-snug" style={{ color: "var(--text-1)" }}>{c.text}</span>
              {/* Two lines before a name is cut — the leader at its end is who
                  this page is about. */}
              <span className="text-xs mt-1 line-clamp-2 break-words" style={{ color: "var(--text-2)" }}>
                {whoLine(c, tl, showLeader)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LeaderModal({ T, stL, tl, row, rank, rankedCount, bands, plain, cellIds, params, today, zIndex, onClose, onOpenConcern, onSeeAll }) {
  const listParams = useMemo(() => ({
    ...params, leader_id: [row.leader_id], status: OPEN_KEYS, sort: "date_asc", page: 1, page_size: 20,
  }), [params, row.leader_id]);
  const openQ = useQuery({
    queryKey: ["wc-lm", listParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: listParams }).then((r) => r.data),
    enabled: !!row.leader_id && row.open > 0,
  });
  // Graded exactly as the ranking it was opened from — a short period grades nobody.
  const band = bandOf(row, bands, plain);
  const brig = (row.brigadirs || []).map((b) => tl(b)).join(", ");
  const standing = rank ? fill(T.lmRank, { r: rank, n: rankedCount })
    : !row.total ? T.lmNone : notLeader(row) ? T.lmNotLeader : T.lmUnranked;
  const open = openQ.data;
  return (
    <Modal open onClose={onClose} zIndex={zIndex} maxWidth="max-w-xl" icon={<UserRound size={16} />}
      title={tl(row.leader)} subtitle={brig ? `${T.mBrig}: ${brig}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className={PHONE_TAP}>{T.close}</Button>
          {row.total > 0 && row.leader_id && (
            <Button icon={<ArrowUpRight size={14} />} onClick={onSeeAll} className={PHONE_TAP}>{T.lmAll}</Button>
          )}
        </>
      }>
      <div className="flex items-center gap-3 flex-wrap">
        <PctChip pct={whole(row)} band={band} big />
        <div className="min-w-0">
          {row.total > 0 && <OfLine T={T} r={row} color="var(--text-1)" />}
          <div className="text-xs mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: "var(--text-2)" }}>
            {notLeader(row) && <KindTag T={T} kind={row.kind} />}
            {standing}
          </div>
        </div>
      </div>
      {row.total > 0 && <StatusSplit counts={row} stL={stL} upHint={T.stUpHint} />}
      {(row.cells || []).length > 0 && (
        <p className="text-xs" style={{ color: "var(--text-2)" }}>
          {T.lmCells}: <span style={{ color: "var(--text-1)" }}><CellCodes codes={row.cells} cellIds={cellIds} /></span>
        </p>
      )}
      {row.open > 0 && (
        <div className="pt-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-2)" }}>
            {T.lmOpenTitle} · <span className="normal-case tracking-normal font-normal">{T.myOpenSub}</span>
          </h3>
          {openQ.isError ? <SectionError T={T} title={T.errOpen} onRetry={() => openQ.refetch()} height="h-32" />
            : !open ? (
              <div className="space-y-2 py-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : (
              <>
                <ConcernRows T={T} stL={stL} tl={tl} rows={open.rows} today={today} onOpen={onOpenConcern} />
                {open.total > open.rows.length && (
                  <p className="text-xs pt-2" style={{ color: "var(--text-2)" }}>{fill(T.lmShowing, { n: n0(open.total), k: open.rows.length })}</p>
                )}
              </>
            )}
        </div>
      )}
    </Modal>
  );
}

// ── units · cells · trend ────────────────────────────────────────────────────

// A list that reads column-major on a wide card: ranks 1–9 down the left,
// 10–18 down the right; on a narrow one the two halves simply stack in order.
function TwoColumns({ rows, render }) {
  const cols = rows.length > 6 ? [rows.slice(0, Math.ceil(rows.length / 2)), rows.slice(Math.ceil(rows.length / 2))] : [rows];
  return (
    <div className={`grid gap-x-10 gap-y-1.5 ${cols.length > 1 ? "lg:grid-cols-2" : ""}`}>
      {cols.map((c, i) => <div key={i} className="min-w-0">{render(c)}</div>)}
    </div>
  );
}

// The bars wear the status colours the headline's split names right above;
// what this card adds is the % bands, so its key is those.
function UnitsCard({ T, tl, units, bands, minRanked, parts, onPick, plain }) {
  const rows = useMemo(() => {
    // A phone row has room for «Surname I.», the same form the ranking under it
    // prints; from sm the full name fits.
    const all = units.map((u) => ({
      key: u.manager_id ?? u.name, mid: u.manager_id,
      label: (
        <>
          <span className="sm:hidden">{softHyphenate(surnameInitial(tl(u.name)))}</span>
          <span className="hidden sm:inline">{tl(u.name)}</span>
        </>
      ),
      name: tl(u.name),
      title: `${tl(u.name)} · ${fill(T.uLeaders, { n: u.leaders ?? 0 })}`,
      total: u.total, done: u.done, doing: u.doing, todo: u.todo, uplifted: u.uplifted,
      rated: ratedOf(u), pct: u.pct, pct0: u.pct0, ranked: u.ranked ?? (ratedOf(u) >= minRanked),
    }));
    const ranked = all.filter((u) => u.ranked).sort((a, b) => (ratio(b) - ratio(a)) || (b.rated - a.rated));
    const low = all.filter((u) => !u.ranked).sort((a, b) => b.total - a.total);
    return [...ranked.map((u, i) => ({ ...u, rank: i + 1 })), ...low];
  }, [units, tl, minRanked, T]);
  return (
    <Card label={T.uTitle}>
      <SectionHead icon={UserCog} title={T.uTitle} subtitle={T.uSub} />
      <div className="px-4 pt-3 pb-3">
        {!plain && <div className="mb-3"><BandKey T={T} bands={bands} minRanked={minRanked} /></div>}
        <TwoColumns rows={rows} render={(c) => (
          <RankedList rows={c} max={1} full wrap parts={parts} unit={T.xLabels.concernsWord}
            onRowClick={(r) => r.mid && onPick(r.mid, r.name)}
            badge={(r) => (
              <span className="w-5 text-xs font-semibold tabular-nums text-right flex-shrink-0" style={{ color: "var(--text-2)" }}>{r.rank ?? "—"}</span>
            )}
            extra={(r) => <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-2)" }}>{fill(T.regCount, { n: n0(r.total) })}</span>}
            value={(r) => (
              <span className="flex items-center gap-2 flex-shrink-0">
                <PctChip pct={whole(r)} band={bandOf(r, bands, plain)} />
                {r.mid ? <ListFilter size={14} aria-hidden style={{ color: "var(--text-2)" }} /> : null}
              </span>
            )} />
        )} />
      </div>
    </Card>
  );
}

// Each row opens its cell's page (/cells/:id), and looks like it: the code
// wears the cell-link underline and the row ends in an arrow.
function CellsCard({ T, tl, cells, mine, parts, openParts, onOpenCell }) {
  const rows = useMemo(() => {
    const list = mine ? cells : cells.filter((c) => c.open > 0).slice(0, 10);
    return list.map((c) => ({
      key: c.code, cellId: c.cell_id,
      label: (
        <>
          <span className={`font-medium tabular-nums ${c.cell_id ? "cell-link" : ""}`}>{c.code}</span>
          {!mine && c.leader ? <span style={{ color: "var(--text-2)" }}> · {surnameInitial(tl(c.leader))}</span> : null}
        </>
      ),
      title: c.leader ? `${c.code} · ${tl(c.leader)}` : c.code,
      total: mine ? c.total : c.open, open: c.open,
      done: c.done || 0, doing: c.doing || 0, todo: c.todo || 0, uplifted: c.uplifted || 0,
    }));
  }, [cells, mine, tl]);
  const max = Math.max(1, ...rows.map((r) => r.total));
  const arrow = (r) => (r.cellId
    ? <ArrowUpRight size={14} aria-hidden className="flex-shrink-0" style={{ color: "var(--text-2)" }} />
    : <span className="w-3.5 flex-shrink-0" aria-hidden />);
  return (
    <Card label={mine ? T.cMine : T.cTitle}>
      <SectionHead icon={Boxes} title={mine ? T.cMine : T.cTitle} subtitle={mine ? T.cMineSub : T.cSub} />
      <div className="px-4 pt-3 pb-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--text-2)" }}>{T.cNoOpen}</p>
        ) : (
          <TwoColumns rows={rows} render={(c) => (
            <RankedList rows={c} max={max} parts={mine ? parts : openParts} unit={T.xLabels.concernsWord}
              onRowClick={(r) => r.cellId && onOpenCell(r.cellId)}
              extra={mine ? (r) => (
                <span className="text-xs tabular-nums flex-shrink-0" style={r.open ? { color: "var(--status-bad)", fontWeight: 600 } : { color: "var(--text-2)" }}>
                  {n0(r.open)} {T.cOpen}
                </span>
              ) : null}
              value={mine ? (r) => (
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                    {fill(T.cTotal, { n: n0(r.total) })}
                  </span>
                  {arrow(r)}
                </span>
              ) : (r) => (
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs whitespace-nowrap">
                    <span className="font-bold tabular-nums" style={{ color: r.open ? "var(--status-bad)" : "var(--text-1)" }}>{n0(r.open)}</span>
                    <span style={{ color: "var(--text-2)" }}> {T.cOpen}</span>
                  </span>
                  {arrow(r)}
                </span>
              )} />
          )} />
        )}
      </div>
    </Card>
  );
}

// Days → the axis buckets: one per day up to CHART_MAX_DAYS, one per week past
// it (an «all time» range is years of days, which no axis can hold).
function bucketDays(days, daily) {
  const byDay = Object.fromEntries(daily.map((d) => [d.d, d]));
  if (days.length <= CHART_MAX_DAYS) {
    return days.map((d) => ({ from: d, to: d, ...Object.fromEntries(ST_KEYS.map((k) => [k, byDay[d]?.[k] || 0])) }));
  }
  const out = [];
  for (const d of days) {
    const dow = (new Date(`${d}T00:00:00`).getDay() + 6) % 7;   // Monday = 0
    if (!out.length || dow === 0) out.push({ from: d, to: d, ...Object.fromEntries(ST_KEYS.map((k) => [k, 0])) });
    const b = out[out.length - 1];
    b.to = d;
    for (const k of ST_KEYS) b[k] += byDay[d]?.[k] || 0;
  }
  return out;
}

function DailyCard({ T, stL, parts, daily, chartFrom, dateTo, ready, isMobile }) {
  const { chartTheme, gridColor, labelColor } = useChartTheme();
  const [wrapRef, wrapW] = useElementWidth();
  // An «all time» range starts years before the first filing: the axis opens
  // on the first day anything was filed (still at least 7 days wide).
  const firstData = daily.length ? daily[0].d : null;
  const from = firstData && firstData > chartFrom ? padChartFrom(firstData, dateTo) : chartFrom;
  const buckets = useMemo(() => bucketDays(listChartDays(from, dateTo), daily), [from, dateTo, daily]);
  const weekly = buckets.length > 0 && buckets.some((b) => b.from !== b.to);
  const longSpan = daysBetween(from, dateTo) > 330;
  const labels = buckets.map((b) => (longSpan ? fmtDate(b.from).slice(0, 8) : fmtShort(b.from)));
  const present = ST_KEYS.filter((k) => buckets.some((b) => b[k] > 0));
  const series = present.map((k) => ({ name: stL(k), data: buckets.map((b) => b[k]) }));
  const labelPx = (longSpan ? 62 : 44);
  const fit = wrapW ? Math.max(2, Math.floor((wrapW - AXIS_GUTTER_PX) / labelPx)) : labels.length;
  const step = Math.max(1, Math.ceil(labels.length / fit));
  const height = isMobile ? 220 : 260;
  const options = {
    chart: {
      type: "bar", stacked: true, toolbar: { show: false }, background: "transparent", fontFamily: "inherit",
      animations: { enabled: false }, zoom: { enabled: false }, selection: { enabled: false },
    },
    theme: chartTheme,
    colors: present.map((k) => ST_FILL[k]),
    plotOptions: { bar: { columnWidth: buckets.length > 40 ? "82%" : "60%", borderRadius: 2 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    states: { hover: { filter: { type: "none" } }, active: { filter: { type: "none" } } },
    xaxis: {
      categories: labels,
      labels: {
        rotate: 0, hideOverlappingLabels: true, trim: false,
        style: { colors: labelColor, fontSize: "11px" },
        // Thinned to the measured width, counted back from the newest bucket
        // so the latest day is always named (utils/chartRange's rule).
        formatter: (v, _ts, opts) => {
          const i = opts?.i ?? labels.indexOf(v);
          return i < 0 || (labels.length - 1 - i) % step === 0 ? v : "";
        },
      },
      axisBorder: { show: false }, axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      // The bars are COUNTS on a page where every other figure is a %.
      title: { text: T.dAxis, style: { color: labelColor, fontSize: "11px", fontWeight: 400 } },
      labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => String(Math.round(v)) },
      forceNiceScale: true,
    },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 4, right: 8 } },
    tooltip: {
      theme: chartTheme.mode, shared: true, intersect: false,
      x: {
        formatter: (_v, { dataPointIndex }) => {
          const b = buckets[dataPointIndex];
          if (!b) return "";
          return weekly ? `${fmtDate(b.from)} – ${fmtDate(b.to)}` : fmtDate(b.from);
        },
      },
    },
  };
  return (
    <Card label={weekly ? T.dTitleWeek : T.dTitle}>
      <SectionHead icon={TrendingUp} title={weekly ? T.dTitleWeek : T.dTitle} subtitle={weekly ? T.dSubWeek : T.dSub} />
      <div className="px-3 pt-3 pb-2" ref={wrapRef}>
        {series.length === 0 ? <NoChart height={height} text={T.noMatch} /> : (
          <>
            <StackLegend parts={parts.filter((p) => present.includes(p.key))} className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 sm:flex sm:flex-wrap sm:items-center sm:justify-start sm:gap-x-4" />
            <Chart ready={ready && wrapW > 0} options={options} series={series} type="bar" height={height} />
          </>
        )}
      </div>
    </Card>
  );
}

// ── register ─────────────────────────────────────────────────────────────────

function RegisterCard({ T, stL, tl, list, loading, error, onRetry, q, setQ, sort, setSort, onOpen, leaderView, dim }) {
  const rows = list?.rows || [];
  const toolbar = <SearchInput value={q} onChange={setQ} placeholder={T.regSearch} className="w-full sm:w-80" />;
  const right = list ? (
    <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{fill(T.regCount, { n: n0(list.total) })}</span>
  ) : null;
  if (loading || error) {
    return (
      <Card label={T.regTitle}>
        <SectionHead icon={ClipboardList} title={T.regTitle} />
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>{toolbar}</div>
        {error ? <SectionError T={T} title={T.errList} onRetry={onRetry} /> : (
          <div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
        )}
      </Card>
    );
  }
  const today = localISO(new Date());
  const cols = leaderView ? 6 : 7;
  const mobile = rows.length === 0 ? (
    <p className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>{T.noMatch}</p>
  ) : (
    <div className="px-4"><ConcernRows T={T} stL={stL} tl={tl} rows={rows} today={today} onOpen={onOpen} showLeader={!leaderView} /></div>
  );
  // People are «Surname I.» and WRAP rather than cut: three leaders here share
  // one surname, and «Hamdamjonov …» named none of them.
  return (
    <div style={{ opacity: dim ? 0.6 : 1, transition: "opacity .15s" }}>
      <TableCard icon={ClipboardList} title={T.regTitle} right={right} toolbar={toolbar}
        pageScroll maxHeight="none" wrap fixed mobile={mobile}>
        <thead>
          <tr>
            <Th label={T.colNo} align="right" cls="w-[72px]" />
            <Th label={T.colDate} k="date" sort={{ key: "date", dir: sort === "date_asc" ? "asc" : "desc" }}
              onSort={() => setSort((s) => (s === "date_desc" ? "date_asc" : "date_desc"))} cls="w-[108px]" />
            <Th label={T.colCell} cls="w-[88px]" />
            {/* Below xl the worker and the leader ride under the text, so
                the header names them there. */}
            <Th label={(
              <>
                <span className="xl:hidden">{leaderView ? T.colTextWorker : T.colTextWho}</span>
                <span className="hidden xl:inline">{T.colText}</span>
              </>
            )} />
            <Th label={T.colWorker} cls="hidden xl:table-cell w-[15%]" />
            {!leaderView && <Th label={T.colLeader} cls="hidden xl:table-cell w-[15%]" />}
            <Th label={T.colStatus} cls="w-[136px]" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <SpanCell narrow={5} wide={cols} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>
                {T.noMatch}
              </SpanCell>
            </tr>
          ) : rows.map((r) => (
            <tr key={r.id} className="cursor-pointer align-top" onClick={() => onOpen(r)}>
              <td className="px-3 py-2.5 text-right text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{r.no}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDate(r.d)}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-2)" }}>
                {r.cell ? <CellLink id={r.cell_id}>{r.cell}</CellLink> : "—"}
              </td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                  className="w-full text-left text-sm leading-snug line-clamp-2 focus-visible:outline-none focus-visible:underline"
                  style={{ color: "var(--text-1)" }}>
                  {r.text}
                </button>
                <span className="block xl:hidden text-xs mt-1 truncate" style={{ color: "var(--text-2)" }}>
                  {whoLine({ ...r, cell: null }, tl, !leaderView)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-sm hidden xl:table-cell break-words" style={{ color: "var(--text-2)" }} title={tl(r.owner || "")}>{surnameInitial(tl(r.owner || "")) || "—"}</td>
              {!leaderView && (
                <td className="px-3 py-2.5 text-sm hidden xl:table-cell break-words" style={{ color: "var(--text-2)" }} title={r.leader ? tl(r.leader) : ""}>
                  {r.leader ? surnameInitial(tl(r.leader)) : "—"}
                </td>
              )}
              <td className="px-3 py-2.5"><ConcernStatus T={T} stL={stL} c={r} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function WorkerConcerns() {
  const { lang, t } = useLang();
  const T = TXT[lang] || TXT.ru;
  const stL = (k) => (ST_LBL[k] || ST_LBL.todo)[LI[lang] ?? LI.ru];
  const { tl } = useTranslit();
  // Bottom-centred: a toast at the top sat over the view tabs and the Excel
  // button for its whole life (the unit pick's note is read while scrolling).
  const toast = useToast({ position: "bottom" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const may = (key) => canAccessPage(auth?.role, key, access, capPages, deniedPages);
  const factorySection = useFactorySection();
  const isMobile = useIsMobile();

  const today = localISO(new Date());
  const monthStart = today.slice(0, 8) + "01";

  // ── page state (persisted, like every page) ───────────────────────────────
  const [viewSaved, setView] = usePersistentState("wc_view", "reyting");
  const view = cleanView(viewSaved);
  const [dateFrom, setDateFrom] = usePersistentState("wc_date_from", monthStart);
  const [dateTo, setDateTo] = usePersistentState("wc_date_to", today);
  const [mgrSel, setMgrSel] = usePersistentState("wc_mgr_sel", []);
  // Leaders are picked by PROFILE id since the platform became the source.
  const [leadSel, setLeadSel] = usePersistentState("wc_lead_ids", []);
  const [cellSel, setCellSel] = usePersistentState("wc_cell_sel", []);
  const [stSaved, setStSel] = usePersistentState("wc_st_sel", []);
  const stSel = useMemo(() => cleanStatuses(stSaved), [stSaved]);
  const [q, setQ] = usePersistentState("wc_q", "");
  const [page, setPage] = usePersistentState("wc_page", 1);
  const [regSort, setRegSort] = usePersistentState("wc_reg_sort", "date_desc");
  // A key of its own: the old table's saved «by total» must not override the
  // ranking's best-first default.
  const [rankSort, setRankSort] = usePersistentState("wc_rank_sort", { key: "pct", dir: "desc" });
  const [ldQ, setLdQ] = useState("");
  const [showNone, setShowNone] = useState(false);

  // ── meta (options + bands + the viewer's locks) ───────────────────────────
  const metaQ = useQuery({
    queryKey: ["wc-meta"],
    queryFn: () => api.get("/api/worker-concerns/meta").then((r) => r.data),
  });
  const meta = metaQ.data;
  const bands = meta?.bands || { green: 80, yellow: 50 };
  const minRanked = meta?.min_ranked ?? 5;
  const leaderView = !!meta?.lock_own_leader;
  // Nothing filed in this viewer's scope, ever, AND no leader to list.
  const noneYet = meta != null && (meta.total || 0) === 0 && (meta.leader_opts || []).length === 0;

  // ── request params ────────────────────────────────────────────────────────
  // `kpiParams` is the SCOPE (period, plant, brigadir, leader, cell) and every
  // figure on «Reyting» reads it. The status pick narrows the register alone:
  // applied to the KPI it redefines it (pick «Hal bo'lgan» and every leader
  // reads 100%), so the KPI never sees it.
  const baseParams = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ...(mgrSel.length ? { manager_id: mgrSel } : {}),
    ...(leadSel.length ? { leader_id: leadSel } : {}),
    ...(cellSel.length ? { cell: cellSel } : {}),
  }), [dateFrom, dateTo, mgrSel, leadSel, cellSel]);
  const kpiParams = useFactoryParams(baseParams);
  const params = useMemo(
    () => (stSel.length ? { ...kpiParams, status: stSel } : kpiParams),
    [kpiParams, stSel]
  );

  // The trend honors the 7-day minimum window; every figure keeps the exact range.
  const chartFrom = padChartFrom(dateFrom, dateTo);
  const statsParams = useMemo(
    () => (chartFrom !== dateFrom ? { ...kpiParams, chart_from: chartFrom } : kpiParams),
    [kpiParams, chartFrom, dateFrom]
  );
  const onRating = view === "reyting";
  const statsQ = useQuery({
    queryKey: ["wc-stats", statsParams],
    queryFn: () => api.get("/api/worker-concerns/stats", { params: statsParams }).then((r) => r.data),
    enabled: !!meta && !noneYet,
    placeholderData: keepPreviousData,
  });
  const leadersQ = useQuery({
    queryKey: ["wc-leaders", kpiParams],
    queryFn: () => api.get("/api/worker-concerns/leaders", { params: kpiParams }).then((r) => r.data),
    enabled: !!meta && !noneYet && onRating,
    placeholderData: keepPreviousData,
  });
  const listParams = useMemo(
    () => ({ ...params, q: q.trim() || undefined, page, page_size: PAGE_SIZE, sort: regSort }),
    [params, q, page, regSort]
  );
  const listQ = useQuery({
    queryKey: ["wc-list", listParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: listParams }).then((r) => r.data),
    enabled: !!meta && !noneYet && !onRating,
    placeholderData: keepPreviousData,
  });
  // A leader's own unresolved concerns: what they can act on first («Yangi»,
  // «Jarayonda», oldest first), then what is already with the brigadir.
  const myOpenParams = useMemo(
    // Their whole queue (a leader's open list is short) — capped at 10 it
    // silently dropped the NEWEST concern under a header counting it.
    () => ({ ...kpiParams, status: ["todo", "doing"], sort: "date_asc", page: 1, page_size: 100 }),
    [kpiParams]
  );
  const myOpenQ = useQuery({
    queryKey: ["wc-my-open", myOpenParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: myOpenParams }).then((r) => r.data),
    enabled: !!meta && !noneYet && onRating && leaderView,
    placeholderData: keepPreviousData,
  });
  const myUpParams = useMemo(
    // Still unresolved only: «uplifted» also holds what was resolved above.
    () => ({ ...kpiParams, status: ["uplifted"], open_only: true, sort: "date_asc", page: 1, page_size: 10 }),
    [kpiParams]
  );
  const myUpQ = useQuery({
    queryKey: ["wc-my-up", myUpParams],
    queryFn: () => api.get("/api/worker-concerns/list", { params: myUpParams }).then((r) => r.data),
    enabled: !!meta && !noneYet && onRating && leaderView,
    placeholderData: keepPreviousData,
  });

  // Filters changed → back to page 1 of the register.
  const filterSig = JSON.stringify([params, q, regSort]);
  const prevSig = useRef(filterSig);
  useEffect(() => {
    if (prevSig.current !== filterSig) {
      prevSig.current = filterSig;
      if (page !== 1) setPage(1);
    }
  }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── filter sections (the org chain cascades and says so) ──────────────────
  const supers = useFactorySupervisors(meta?.supervisors || [], mgrSel, (kept) => setMgrSel(kept || []), "id");
  const supName = useMemo(
    () => Object.fromEntries((meta?.supervisors || []).map((s) => [s.id, s.name])),
    [meta]
  );
  const leaderOpts = useMemo(() => meta?.leader_opts || [], [meta]);
  const leadName = useMemo(() => Object.fromEntries(leaderOpts.map((l) => [l.id, l.name])), [leaderOpts]);
  const leaderList = useMemo(
    () => (mgrSel.length ? leaderOpts.filter((l) => (l.units || []).some((u) => mgrSel.includes(u))) : leaderOpts),
    [leaderOpts, mgrSel]
  );
  const cellOpts = useMemo(() => meta?.cells || [], [meta]);
  const cellList = useMemo(() => {
    if (leadSel.length && mgrSel.length && cellOpts.some((c) => c.pairs)) {
      return cellOpts.filter((c) => (c.pairs || []).some(([l, u]) => leadSel.includes(l) && mgrSel.includes(u)));
    }
    if (leadSel.length) return cellOpts.filter((c) => (c.leaders || []).some((l) => leadSel.includes(l)));
    if (mgrSel.length) return cellOpts.filter((c) => (c.units || []).some((u) => mgrSel.includes(u)));
    return cellOpts;
  }, [cellOpts, leadSel, mgrSel]);
  // A pick its own list no longer offers (the parent above it changed, or the
  // viewer lost sight of it) must not narrow the page invisibly — drop it.
  useEffect(() => {
    if (!meta) return;
    const ids = new Set(leaderList.map((l) => l.id));
    const kept = leadSel.filter((id) => ids.has(id));
    if (kept.length !== leadSel.length) setLeadSel(kept);
  }, [meta, leaderList]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!meta) return;
    const codes = new Set(cellList.map((c) => c.code));
    const kept = cellSel.filter((c) => codes.has(c));
    if (kept.length !== cellSel.length) setCellSel(kept);
  }, [meta, cellList]); // eslint-disable-line react-hooks/exhaustive-deps

  const widen = (label, onClick) => (
    <button type="button" onClick={onClick}
      className="text-xs font-medium underline underline-offset-2" style={{ color: "var(--brand-text)" }}>
      {label}
    </button>
  );

  const sections = useMemo(() => {
    const s = [];
    if (factorySection) s.push({ ...factorySection, group: T.gWho });
    if (!meta?.lock_own_unit && !leaderView && (meta?.supervisors || []).length > 0) {
      s.push({
        key: "brig", icon: UserCog, label: T.fBrig, group: T.gWho,
        active: mgrSel.length > 0,
        display: mgrSel.length === 1 ? tl(supName[mgrSel[0]] || "") : String(mgrSel.length),
        onClear: () => setMgrSel([]),
        render: () => (
          <OptsFilter opts={supers.map((x) => x.id)} sel={mgrSel} onChange={setMgrSel}
            render={(id) => tl(supName[id] || String(id))} />
        ),
      });
    }
    if (!leaderView && leaderOpts.length > 0) {
      s.push({
        key: "leader", icon: UserRound, label: T.fLeader, group: T.gWho,
        active: leadSel.length > 0,
        display: leadSel.length === 1 ? tl(twoWords(leadName[leadSel[0]] || "")) : String(leadSel.length),
        onClear: () => setLeadSel([]),
        render: () => (
          <OptsFilter searchable opts={leaderList.map((l) => l.id)} sel={leadSel} onChange={setLeadSel}
            render={(id) => tl(leadName[id] || String(id))}
            note={mgrSel.length ? fill(T.nByBrig, { n: leaderList.length }) : null}
            empty={mgrSel.length ? widen(T.widenBrig, () => setMgrSel([])) : null} />
        ),
      });
    }
    // A cell is its CODE (utils/cellName.js) — the workshop name is never printed.
    if (cellOpts.length > 0) {
      const byLeader = leadSel.length > 0;
      const narrowed = byLeader || mgrSel.length > 0;
      s.push({
        key: "cell", icon: LayoutGrid, label: T.fCell, group: T.gWho,
        active: cellSel.length > 0,
        display: cellSel.length === 1 ? cellSel[0] : String(cellSel.length),
        onClear: () => setCellSel([]),
        render: () => (
          <OptsFilter searchable opts={cellList.map((c) => c.code)} sel={cellSel} onChange={setCellSel}
            render={(c) => c}
            note={narrowed ? fill(byLeader ? T.nByLeader : T.nByBrig, { n: cellList.length }) : null}
            empty={narrowed ? widen(byLeader ? T.widenLeader : T.widenBrig,
              () => (byLeader ? setLeadSel([]) : setMgrSel([]))) : null} />
        ),
      });
    }
    // The status narrows the register only — offered where it applies.
    if (!onRating) {
      s.push({
        key: "status", icon: CircleDot, label: T.fStatus, group: T.gWhat,
        active: stSel.length > 0,
        display: stSel.length === 1 ? stL(stSel[0]) : String(stSel.length),
        onClear: () => setStSel([]),
        render: () => (
          <OptsFilter opts={ST_KEYS} sel={stSel} onChange={setStSel} render={(k) => stL(k)} />
        ),
      });
    }
    return s;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- setters are stable; tl/stL follow `lang`
  }, [factorySection, meta, mgrSel, leadSel, cellSel, stSel, supers, supName, leaderOpts, leaderList, leadName, cellOpts, cellList, leaderView, onRating, T, lang]);

  const clearAll = () => { setMgrSel([]); setLeadSel([]); setCellSel([]); setStSel([]); };

  // Charts measure their final width once the grid has settled.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setChartsReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  const parts = useMemo(() => ST_KEYS.map((k) => ({ key: k, label: stL(k), color: ST_FILL[k], icon: ST_ICON[k], glyph: ST_GLYPH[k] })), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const openParts = useMemo(() => parts.filter((p) => OPEN_KEYS.includes(p.key)), [parts]);

  const stats = statsQ.data;
  const kpi = stats?.kpi;
  const ldRows = useMemo(() => leadersQ.data?.rows || [], [leadersQ.data]);
  const cellIds = leadersQ.data?.cell_ids;
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) + 1 : 0;

  // ── modals ────────────────────────────────────────────────────────────────
  const [detail, setDetail] = useState(null);
  const [leaderOpen, setLeaderOpen] = useState(null);   // { row, rank, rankedCount }

  const [bandsOpen, setBandsOpen] = useState(false);
  const [gEdit, setGEdit] = useState(bands.green);
  const [yEdit, setYEdit] = useState(bands.yellow);
  const bandsMut = useMutation({
    mutationFn: (body) => api.put("/api/worker-concerns/thresholds", body).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wc-meta"] });
      qc.invalidateQueries({ queryKey: ["wc-leaders"] });
      setBandsOpen(false);
      toast.success(T.bandsSaved);
    },
  });
  const bandsValid = Number(yEdit) > 0 && Number(gEdit) > Number(yEdit) && Number(gEdit) <= 100;
  const openBands = () => { setGEdit(bands.green); setYEdit(bands.yellow); bandsMut.reset(); setBandsOpen(true); };

  // ── Excel export ──────────────────────────────────────────────────────────
  // One file mirrors the page: overview + leader ranking + the register (ALL
  // matching rows). When filters make «what you see» ≠ «the period», a modal
  // asks which one the file should be; the choice is resolved HERE into a
  // plain filter set, so the backend never re-derives it.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [exporting, setExporting] = useState(false);

  // The locked viewer's static plant chip is not a choice, so not a "filter".
  // TWO scopes, named apart: the KPI's (plant · brigadir · leader · cell) is
  // what the overview and the ranking sheets are counted over; the register's
  // adds the status pick and the text search, which narrow it alone.
  const scopeChips = [];
  if (factorySection?.active && !factorySection.static) scopeChips.push(factorySection.display);
  if (mgrSel.length) scopeChips.push(`${T.fBrig}: ${mgrSel.length === 1 ? tl(supName[mgrSel[0]] || "") : mgrSel.length}`);
  if (leadSel.length) scopeChips.push(`${T.fLeader}: ${leadSel.length === 1 ? tl(twoWords(leadName[leadSel[0]] || "")) : leadSel.length}`);
  if (cellSel.length) scopeChips.push(`${T.fCell}: ${cellSel.length === 1 ? cellSel[0] : cellSel.length}`);
  const activeFilterChips = [...scopeChips];
  if (stSel.length) activeFilterChips.push(`${T.fStatus}: ${stSel.length === 1 ? stL(stSel[0]) : stSel.length}`);
  if (q.trim()) activeFilterChips.push(`${T.xSearch}: «${q.trim()}»`);
  const filtersActive = activeFilterChips.length > 0;
  const scopeFiltered = mgrSel.length + leadSel.length + cellSel.length + (onRating ? 0 : stSel.length) > 0;
  const regCount = kpi && !q.trim() ? (kpi.total ?? 0) : null;

  const buildExportBody = (scope) => {
    const period = `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    const plantValue = factorySection?.static ? factorySection.display
      : scope === "filtered" && factorySection?.active ? factorySection.display
      : T.xAllPlants;
    const generated = fmtDateTime(new Date().toISOString());
    const metaFor = (chips) => [
      { label: T.xPeriod, value: period },
      { label: T.xPlant, value: plantValue },
      { label: T.xFilters, value: scope === "all" ? T.xScopeAll : (chips.join(" · ") || "—") },
      { label: T.xGenerated, value: generated },
    ];
    return {
      filename: `${T.title} ${fmtDate(dateFrom)}–${fmtDate(dateTo)}`,
      title: T.title,
      subtitle: T.xSub,
      caption: `📊 ${T.title} · ${period}`,
      filters: scope === "all"
        ? { date_from: dateFrom || undefined, date_to: dateTo || undefined, sort: regSort }
        : { ...params, q: q.trim() || undefined, sort: regSort },
      sheets: T.xSheets,
      status_labels: Object.fromEntries(ST_KEYS.map((k) => [k, stL(k)])),
      labels: {
        ...T.xLabels,
        // The file grades nobody on a short period either, and says why.
        shortNote: plain ? fill(T.hShort, { n: days }) : "",
        bandLegend: {
          green: `≥ ${bands.green}%`,
          yellow: `${bands.yellow}–${bands.green - 1}%`,
          red: `< ${bands.yellow}%`,
          low: `${T.xLabels.kamBand} (n<${minRanked})`,
        },
      },
      meta: metaFor(scopeChips),
      register_meta: metaFor(activeFilterChips),
      // The leaders as the screen lists them — the file follows this order.
      leader_order: onRating && leadersQ.data
        ? (({ ranked, low, nl, none }) => [...ranked, ...low, ...nl, ...none].map(rankKey))(rankGroups(ldRows, rankSort, tl))
        : [],
    };
  };
  const runExport = async (scope) => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/worker-concerns/export.xlsx", {
        body: buildExportBody(scope),
        fallbackName: "worker-concerns.xlsx",
      });
      toast.success(via === "download" ? T.xDownloaded : T.xSentTg);
      setExportOpen(false);
    } catch (e) {
      // The modal (if open) stays up so the operator can retry; the error
      // toast persists until dismissed (Telegram suppresses window.alert).
      const err = await exportError(e);
      toast.error(`${T.xFailed}: ${err.code === "range_reversed" ? T.errRange : err.message}`);
    } finally {
      setExporting(false);
    }
  };
  const onExportClick = () => {
    if (filtersActive) { setExportScope("filtered"); setExportOpen(true); }
    else runExport("all");
  };

  // ── derived view pieces ───────────────────────────────────────────────────
  const facts = [];
  if (kpi) {
    facts.push({ key: "w", text: fill(T.fWorkers, { n: n0(kpi.workers) }) });
    if (!leaderView && leadersQ.data) {
      const withN = ldRows.filter((r) => r.total > 0).length;
      facts.push({ key: "l", text: fill(T.fWith, { n: n0(withN) }) });
      if (ldRows.length > withN) facts.push({ key: "n", text: fill(T.fNone, { n: n0(ldRows.length - withN) }) });
    }
    if (leadersQ.data?.unassigned) facts.push({ key: "u", warn: true, text: fill(T.fUnassigned, { n: n0(leadersQ.data.unassigned.total) }) });
    if (!leaderView && leadersQ.isError) facts.push({ key: "lf", warn: true, text: T.fLeadersFailed });
  }
  // 9 — a short period shows its figures but grades nobody (SHORT_PERIOD_DAYS)
  const plain = days > 0 && days < (meta?.short_days ?? SHORT_PERIOD_DAYS);
  const headBand = kpi ? bandOf({ ...kpi, ranked: ratedOf(kpi) >= minRanked }, bands, plain) : "none";

  // A leader's cells: every cell they own, the quiet ones too, by open concerns.
  const myCells = useMemo(() => {
    if (!leaderView || !stats) return [];
    const byCode = Object.fromEntries((stats.top_cells || []).map((c) => [c.code, c]));
    const own = new Set(ldRows.flatMap((r) => r.cells || []));
    for (const c of Object.keys(byCode)) own.add(c);
    return [...own].map((code) => byCode[code] || {
      code, cell_id: null, total: 0, open: 0, done: 0, doing: 0, todo: 0, uplifted: 0,
    }).sort((a, b) => (b.open - a.open) || (b.total - a.total) || a.code.localeCompare(b.code));
  }, [leaderView, stats, ldRows]);

  const units = stats?.by_brigadir || [];
  const showUnits = !leaderView && units.length > 1;
  // One unit in view (a brigadir, or a pick of one): its name on every
  // ranking row would only repeat the reader's own.
  // (Read off the ranking's own rows when /stats failed and the page goes on
  // without its unit list.)
  const oneUnit = !!meta?.lock_own_unit || (stats
    ? units.length <= 1
    : new Set(ldRows.flatMap((r) => r.brigadirs || [])).size <= 1);

  const exportBtn = meta && !noneYet ? (
    <Button size="lg" variant="secondary" loading={exporting}
      icon={!exporting ? <FileSpreadsheet size={15} /> : null}
      onClick={onExportClick} aria-label={T.xBtn} className="min-h-[52px] min-w-[52px] sm:min-h-[38px] sm:min-w-0 flex-shrink-0">
      <span className="hidden sm:inline">{T.xBtn}</span>
    </Button>
  ) : null;

  const periodEmpty = kpi && kpi.total === 0;
  const firstDate = meta?.first_date || null;
  const beforeData = periodEmpty && firstDate && dateTo && dateTo < firstDate;
  const emptyAction = (scopeFiltered || dateFrom > ALL_TIME_FROM) ? (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {dateFrom > ALL_TIME_FROM && (
        <Button variant="secondary" className={PHONE_TAP} onClick={() => { setDateFrom(ALL_TIME_FROM); setDateTo(today); }}>{T.showAllTime}</Button>
      )}
      {scopeFiltered && <Button variant="secondary" className={PHONE_TAP} onClick={clearAll}>{T.clearFilters}</Button>}
    </div>
  ) : null;

  const openLeader = (row, rank, rankedCount) => setLeaderOpen({ row, rank, rankedCount });
  // 6 — narrowing the page is a side effect, so it says so (the chip's × undoes it)
  const pickUnit = (mid, name) => {
    setMgrSel([mid]);
    toast.info(fill(T.uNarrowed, { name }));
  };

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <Layout title={T.title}>
      {!meta && !metaQ.isError ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-11 w-64" />
          <SkeletonBlock className="h-10 w-full max-w-xl" />
          <HeadlineSkeleton />
          <Card><div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}</div></Card>
        </div>
      ) : noneYet ? (
        <Card>
          <EmptyState icon={Megaphone} height="h-64" showUploadLink={false}
            title={T.emptyTitle} message={T.emptyNote}
            action={may("cell-concerns") ? (
              <Button variant="secondary" className={PHONE_TAP} icon={<ArrowUpRight size={14} />} onClick={() => navigate("/cell-concerns")}>
                {T.emptyGo}
              </Button>
            ) : null} />
        </Card>
      ) : (
        <>
          {/* view tabs — switching WHAT you look at, so tab semantics — with the
              page's one file beside them, the same place on every width */}
          <div className="flex items-center gap-2 mb-3">
            <SegmentedToggle asTabs ariaLabel={T.title} value={view} onChange={setView}
              size={isMobile ? "lg" : "md"} fill={isMobile} className={isMobile ? "flex-1 min-w-0" : ""}
              options={[["reyting", T.vRating], ["havotirlar", T.vList]]} />
            <div className="flex-1 hidden sm:block" />
            {exportBtn}
          </div>

          {/* the period and the filter zone — the status pick lives on the list */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              max={today} compactLabel triggerClassName="px-3 py-2 text-sm" />
            <FilterPanel sections={sections} onClearAll={clearAll} chipsWrap="always" />
          </div>

          {/* Without /meta nothing below can load — the frame above stays,
              and the failure is named where the content would be. */}
          {metaQ.isError ? (
            <Card label={T.title}><SectionError T={T} title={T.errMeta} onRetry={() => metaQ.refetch()} height="h-64" /></Card>
          ) : (<>
          {/* ══ REYTING ══ */}
          {onRating && (
            !kpi && !statsQ.isError ? (
              <div className="space-y-4"><HeadlineSkeleton />
                <Card><div className="p-4 space-y-3">{Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}</div></Card>
              </div>
            ) : beforeData ? (
              <Card>
                <EmptyState icon={Megaphone} height="h-64" showUploadLink={false}
                  title={fill(T.startTitle, { date: fmtDate(firstDate) })}
                  message={fill(T.startMsg, { date: fmtDate(firstDate) })}
                  action={(
                    <Button variant="secondary" className={PHONE_TAP} onClick={() => { setDateFrom(firstDate); setDateTo(today); }}>
                      {fill(T.startBtn, { date: fmtDate(firstDate) })}
                    </Button>
                  )} />
              </Card>
            ) : periodEmpty ? (
              <Card>
                <EmptyState icon={Megaphone} height="h-64" showUploadLink={false}
                  title={T.emptyPeriodTitle} message={scopeFiltered ? T.emptyPeriodFiltered : T.emptyPeriodMsg}
                  action={emptyAction} />
              </Card>
            ) : (
              <div className="space-y-4" style={{ opacity: statsQ.isPlaceholderData ? 0.6 : 1, transition: "opacity .15s" }}>
                {/* A failed /stats costs the blocks it feeds and no others —
                    the ranking and a leader's own list read requests of their own. */}
                {statsQ.isError
                  ? <Card label={T.hLabel}><SectionError T={T} title={T.errStats} onRetry={() => statsQ.refetch()} height="h-48" /></Card>
                  : <Headline T={T} stL={stL} kpi={kpi} prev={stats.prev} days={days} band={headBand} facts={facts} />}

                {leaderView ? (
                  <Card label={T.myOpenTitle}>
                    {/* The leader's job is on /cell-concerns, so the way there
                        heads the card — on a phone a full-width button under
                        the title, never under twenty concerns. */}
                    <SectionHead icon={ClipboardList} title={T.myOpenTitle} subtitle={T.myOpenSub}
                      right={(
                        <div className="flex items-center gap-3">
                          {myOpenQ.data && myUpQ.data && (
                            <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                              {fill(T.regCount, { n: n0(myOpenQ.data.total + myUpQ.data.total) })}
                            </span>
                          )}
                          {may("cell-concerns") && (
                            <Button variant="primary" size="md" icon={<ArrowUpRight size={14} />} className="max-sm:hidden"
                              onClick={() => navigate("/cell-concerns")}>{T.goAct}</Button>
                          )}
                        </div>
                      )} />
                    {may("cell-concerns") && (
                      <div className="sm:hidden px-4 pt-3">
                        <Button variant="primary" size="lg" icon={<ArrowUpRight size={15} />} className="w-full min-h-[44px]"
                          onClick={() => navigate("/cell-concerns")}>{T.goAct}</Button>
                      </div>
                    )}
                    {myOpenQ.isError || myUpQ.isError ? (
                      <SectionError T={T} title={T.errOpen} onRetry={() => { myOpenQ.refetch(); myUpQ.refetch(); }} />
                    ) : !myOpenQ.data || !myUpQ.data ? (
                      <div className="p-4 space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
                    ) : myOpenQ.data.rows.length + myUpQ.data.rows.length === 0 ? (
                      <p className="py-8 text-center text-sm" style={{ color: "var(--text-2)" }}>{T.myNoOpen}</p>
                    ) : (
                      <div className="px-4 pb-3">
                        {/* Two groups, each with its own count, and a group that
                            is cut says so right under itself — never a header
                            counting rows the card does not show. */}
                        {[
                          { key: "act", title: T.myActTitle, q: myOpenQ.data, st: ["todo", "doing"] },
                          { key: "up", title: T.myUpTitle, q: myUpQ.data, st: ["uplifted"], badge: "uplifted", hint: T.stUpHint },
                        ].filter((g) => g.q.rows.length > 0).map((g, i) => (
                          <div key={g.key}>
                            <h3 className={`flex items-center gap-1.5 ${i ? "pt-4" : "pt-3"} pb-1 text-xs font-semibold uppercase tracking-wider`}
                              style={{ color: "var(--text-2)" }} title={g.hint}>
                              {g.badge && <StBadge st={g.badge} size={14} />}
                              {g.title}
                              <span className="normal-case tracking-normal font-normal">· {fill(T.regCount, { n: n0(g.q.total) })}</span>
                            </h3>
                            <ConcernRows T={T} stL={stL} tl={tl} rows={g.q.rows} today={today} onOpen={setDetail} />
                            {g.q.total > g.q.rows.length && (
                              <Button variant="secondary" size="md" className={`mt-2 ${PHONE_TAP} max-sm:w-full`}
                                onClick={() => { setStSel(g.st); setView("havotirlar"); }}>
                                {fill(T.moreOf, { n: n0(g.q.total - g.q.rows.length) })}
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ) : (
                  <>
                    {showUnits && (
                      <UnitsCard T={T} tl={tl} units={units} bands={bands} minRanked={minRanked} parts={parts}
                        onPick={pickUnit} plain={plain} />
                    )}
                    <RankingCard T={T} tl={tl} rows={ldRows} cellIds={cellIds} bands={bands} minRanked={minRanked}
                      isAdmin={!!meta.is_admin} onEditBands={openBands}
                      onOpen={openLeader}
                      sort={rankSort}
                      onSort={(k) => setRankSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }))}
                      q={ldQ} setQ={setLdQ} showNone={showNone} setShowNone={setShowNone}
                      loading={leadersQ.isLoading} error={leadersQ.isError} onRetry={() => leadersQ.refetch()}
                      dim={leadersQ.isPlaceholderData} oneUnit={oneUnit} plain={plain} days={days} />
                  </>
                )}

                {!statsQ.isError && (
                  <>
                    <CellsCard T={T} tl={tl} cells={leaderView ? myCells : (stats.top_cells || [])}
                      mine={leaderView} parts={parts} openParts={openParts}
                      onOpenCell={(id) => navigate(`/cells/${id}`)} />
                    <DailyCard T={T} stL={stL} parts={parts} daily={stats.daily || []}
                      chartFrom={chartFrom} dateTo={dateTo} ready={chartsReady} isMobile={isMobile} />
                  </>
                )}
              </div>
            )
          )}

          {/* ══ HAVOTIRLAR ══ */}
          {!onRating && (
            <div className="space-y-3">
              <RegisterCard T={T} stL={stL} tl={tl} list={listQ.data} loading={listQ.isLoading}
                error={listQ.isError} onRetry={() => listQ.refetch()} q={q} setQ={setQ}
                sort={regSort} setSort={setRegSort} onOpen={setDetail} leaderView={leaderView}
                dim={listQ.isPlaceholderData} />
              {listQ.data && (
                <Pagination page={page} pageCount={Math.max(1, Math.ceil((listQ.data.total || 0) / PAGE_SIZE))}
                  total={listQ.data.total || 0} pageSize={PAGE_SIZE} onPage={setPage} />
              )}
            </div>
          )}
          </>)}
        </>
      )}

      {/* a leader's figures and what they still owe — opened from the ranking */}
      {leaderOpen && (
        <LeaderModal T={T} stL={stL} tl={tl} row={leaderOpen.row} rank={leaderOpen.rank}
          rankedCount={leaderOpen.rankedCount} bands={bands} plain={plain} cellIds={cellIds}
          params={kpiParams} today={today} zIndex={50}
          onClose={() => setLeaderOpen(null)}
          onOpenConcern={setDetail}
          onSeeAll={() => {
            setLeadSel([leaderOpen.row.leader_id]);
            setLeaderOpen(null);
            setView("havotirlar");
          }} />
      )}

      {/* one concern — the full text; the chain, the thread and every action
          live on /concerns, one tap away */}
      {detail && (
        <Modal open onClose={() => setDetail(null)} zIndex={leaderOpen ? 60 : 50}
          title={`${T.mTitle} №${detail.no}`}
          subtitle={detail.leader ? `${detail.cell || "—"} · ${tl(detail.leader)}` : (detail.cell || "—")}
          icon={<Megaphone size={16} />}
          footer={
            <>
              <Button variant="secondary" className={PHONE_TAP} onClick={() => setDetail(null)}>{T.close}</Button>
              {may("concerns") && (
                <Button icon={<ArrowUpRight size={14} />} className={PHONE_TAP} onClick={() => navigate(`/concerns?open=${detail.id}`)}>
                  {fill(T.mOpen, { page: t("nav.concerns") })}
                </Button>
              )}
            </>
          }>
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>{detail.text}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            {[
              [T.colDate, fmtDate(detail.d)],
              [T.colStatus, <ConcernStatus key="s" T={T} stL={stL} c={detail} />],
              [T.colCell, detail.cell ? <CellCodes key="c" codes={[detail.cell]} cellIds={{ [detail.cell]: detail.cell_id }} /> : "—"],
              [T.colWorker, tl(detail.owner || "") || "—"],
              [T.colLeader, detail.leader ? tl(detail.leader) : "—"],
              [T.mBrig, tl(detail.brigadir || "") || "—"],
              [T.mCategory, detail.category ? t(`concerns.category.${detail.category}`) : "—"],
              [T.mStep, t(`concerns.level.${detail.level}`)],
              ...(detail.done_on ? [[T.mDoneOn, fmtDate(detail.done_on)]] : []),
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs mb-0.5" style={{ color: "var(--text-3)" }}>{k}</dt>
                <dd className="break-words" style={{ color: "var(--text-1)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}

      {/* export scope — asked only when filters make «what you see» ≠ «the
          period»; without filters the button exports the whole range directly */}
      {exportOpen && (
        <Modal open onClose={() => { if (!exporting) setExportOpen(false); }}
          title={T.xTitle} icon={<FileSpreadsheet size={16} />} maxWidth="max-w-md"
          footer={
            <>
              <Button variant="secondary" className={PHONE_TAP} disabled={exporting} onClick={() => setExportOpen(false)}>{T.cancel}</Button>
              <Button loading={exporting} className={PHONE_TAP} icon={!exporting ? <FileSpreadsheet size={14} /> : null}
                onClick={() => runExport(exportScope)}>
                {T.xExport}
              </Button>
            </>
          }>
          <p className="text-sm mb-3" style={{ color: "var(--text-2)" }}>{T.xModalQ}</p>
          <div role="radiogroup" aria-label={T.xTitle} className="space-y-2">
            {[
              {
                v: "filtered", label: T.xOptFiltered, desc: T.xOptFilteredD,
                chips: [
                  ...(regCount != null ? [`${regCount.toLocaleString("ru-RU")} ${T.xLabels.concernsWord}`] : []),
                  ...activeFilterChips,
                ],
              },
              { v: "all", label: T.xOptAll, desc: T.xOptAllD, chips: [] },
            ].map((o) => {
              const sel = exportScope === o.v;
              return (
                <button key={o.v} type="button" role="radio" aria-checked={sel}
                  onClick={() => setExportScope(o.v)}
                  className="w-full text-left rounded-xl px-3.5 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  style={{
                    background: sel ? "var(--brand-bg)" : "var(--bg-inner)",
                    border: `1px solid ${sel ? "var(--brand)" : "var(--border)"}`,
                  }}>
                  <span className="flex items-start gap-2.5">
                    <span className="grid place-items-center w-4 h-4 rounded-full flex-shrink-0 mt-0.5"
                      style={{ border: `2px solid ${sel ? "var(--brand)" : "var(--border-md)"}` }}>
                      {sel && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-1)" }}>{o.label}</span>
                      <span className="block text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{o.desc}</span>
                      {o.chips.length > 0 && (
                        <span className="flex flex-wrap gap-1 mt-2">
                          {o.chips.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded-lg text-xs whitespace-nowrap"
                              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                              {c}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* thresholds — admin-only policy knob, validated before it can save; a
          failed save stays in the dialog with its reason */}
      {bandsOpen && (
        <Modal open onClose={() => setBandsOpen(false)} title={T.bandsTitle}
          icon={<Settings2 size={16} />} maxWidth="max-w-sm"
          footer={
            <>
              <Button variant="secondary" className={PHONE_TAP} onClick={() => setBandsOpen(false)}>{T.cancel}</Button>
              <Button loading={bandsMut.isPending} className={PHONE_TAP} disabled={!bandsValid}
                onClick={() => bandsMut.mutate({ green: Number(gEdit), yellow: Number(yEdit) })}>
                {T.save}
              </Button>
            </>
          }>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={T.bandGreenL} required>
              <input type="number" inputMode="numeric" min={2} max={100} value={gEdit}
                onChange={(e) => setGEdit(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none tabular-nums"
                style={{ background: "var(--bg-inner)", border: `1px solid ${bandsValid ? "var(--border-md)" : "var(--status-bad)"}`, color: "var(--text-1)" }} />
            </FormField>
            <FormField label={T.bandYellowL} required>
              <input type="number" inputMode="numeric" min={1} max={99} value={yEdit}
                onChange={(e) => setYEdit(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none tabular-nums"
                style={{ background: "var(--bg-inner)", border: `1px solid ${bandsValid ? "var(--border-md)" : "var(--status-bad)"}`, color: "var(--text-1)" }} />
            </FormField>
          </div>
          <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.bandsHint}</p>
          {bandsMut.isError && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--status-bad)" }} role="alert">
              <AlertTriangle size={13} aria-hidden />
              {T.bandsErr}: {bandsMut.error?.response?.data?.detail || bandsMut.error?.message || ""}
            </p>
          )}
        </Modal>
      )}
      {toast.node}
    </Layout>
  );
}
