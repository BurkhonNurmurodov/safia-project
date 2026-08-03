import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Plus, Pencil, Trash2, SearchCheck, Clock, CheckCircle2, CircleDot, Hourglass,
  TrendingUp, PieChart, Timer, Gauge, CalendarClock, Layers, Flag, FileSpreadsheet,
  Loader2, AlertTriangle, Repeat, Grid3x3, UserRound, LayoutGrid, Sunrise, CalendarDays,
  Wrench, Boxes, Warehouse, Refrigerator, ShoppingCart, Truck, MonitorCog,
  Droplets, CalendarRange, Users, FlaskConical, Wheat, ChevronDown,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import TimeWheelPicker from "../components/ui/TimeWheelPicker";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Field from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import TableCard, { Th, SectionHead } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import SeasonalityHeatmap from "../components/charts/SeasonalityHeatmap";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { usePersistentState } from "../hooks/usePersistentState";
import { CATEGORY_COLORS, FOLD_COLOR } from "../utils/chartPalette";
import { cellName as pickCellName } from "../utils/cellName";
import { padChartFrom } from "../utils/chartRange";

// ── departments ──────────────────────────────────────────────────────────────
// The SAME whitelist, hues and icons as the Concerns page, so a department chip
// carries one meaning across the platform. Keep in sync with DEPARTMENTS in
// backend/app/routers/hansey.py; labels render via concerns.category.<key>.
const DEPARTMENTS = [
  "ars", "inventory", "warehouse", "fridge", "procurement", "logistics",
  "it", "washing", "plan", "hr", "technologist", "raw_material",
];

const DEPT_COLOR = {
  ars: "#ef4444", inventory: "#22c55e", warehouse: "#3b82f6", fridge: "#eab308",
  procurement: "#f97316", logistics: "#a855f7", it: "#14b8a6", washing: "#ec4899",
  plan: "#6366f1", hr: "#84cc16", technologist: "#06b6d4", raw_material: "#d946ef",
};

const DEPT_ICON = {
  ars: Wrench, inventory: Boxes, warehouse: Warehouse, fridge: Refrigerator,
  procurement: ShoppingCart, logistics: Truck, it: MonitorCog, washing: Droplets,
  plan: CalendarRange, hr: Users, technologist: FlaskConical, raw_material: Wheat,
};

// Traffic-light status: an unresolved problem is still costing time (red), a
// closed one is done (green). Brand gold is never a status.
const C_OPEN = "#ef4444";
const C_CLOSED = "#22c55e";
const C_NEUTRAL = "#94a3b8";
const BRAND = "#C8973F";

// Resolution-time buckets — the source register's four, which map cleanly onto
// how a shift reads time: within the hour, within half a shift, within a day,
// and "this rolled over to another day".
const BUCKETS = [
  { key: "bucketLt1h", min: 0, max: 60, color: "#22c55e" },
  { key: "bucket1_4h", min: 60, max: 240, color: "#eab308" },
  { key: "bucket4_24h", min: 240, max: 1440, color: "#f97316" },
  { key: "bucketGt24h", min: 1440, max: null, color: "#ef4444" },
];

const WEEKDAYS = {
  uz: ["Du", "Se", "Cho", "Pay", "Ju", "Sha", "Yak"],
  uz_cyrl: ["Ду", "Се", "Чо", "Пай", "Жу", "Ша", "Як"],
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz: ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// ── date / time helpers ──────────────────────────────────────────────────────
// String math over ISO dates — Date-based range arithmetic drifts across the
// UTC/local midnight boundary and would move problems between days.
const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const localNowHHMM = () => {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};
const isoMinusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const dayIndex = (iso) => Math.floor(new Date(`${iso}T00:00:00`).getTime() / 86400000);
const addDaysIso = (iso, n) => isoMinusDays(iso, -n);

const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  return lang === "uz" || lang === "uz_cyrl" ? `${d}-${mn}, ${y}` : `${d} ${mn} ${y}`;
};
const fmtShortDate = (iso) => {
  if (!iso) return "";
  const [, m, d] = String(iso).split(/[T ]/)[0].split("-");
  return `${d}.${m}`;
};
// "2026-08-03T14:30" → { date: "2026-08-03", time: "14:30" }
const splitDT = (v) => {
  if (!v) return { date: "", time: "" };
  const [d, t = ""] = String(v).split("T");
  return { date: d, time: t.slice(0, 5) };
};
const joinDT = (date, time) => (date && time ? `${date}T${time}` : "");
const dtMinutes = (v) => {
  if (!v) return null;
  const { date, time } = splitDT(v);
  if (!date || !time) return null;
  const [h, m] = time.split(":").map(Number);
  return dayIndex(date) * 1440 + h * 60 + m;
};

// "2 k 3 soat 15 daq" — the register's own duration vocabulary, days first so a
// problem that ran overnight reads as such at a glance.
function fmtDuration(minutes, t, dash = "—") {
  if (minutes == null) return dash;
  if (minutes <= 0) return `0 ${t("hansey.mShort")}`;
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  const parts = [];
  if (d > 0) parts.push(`${d} ${t("hansey.dShort")}`);
  if (h > 0) parts.push(`${h} ${t("hansey.hShort")}`);
  if (m > 0 || !parts.length) parts.push(`${m} ${t("hansey.mShort")}`);
  return parts.join(" ");
}
// Compact hours for axes and dense cells, where the verbose form would wrap.
const fmtHours = (minutes) => (minutes == null ? "—" : `${(minutes / 60).toFixed(1)}`);

// Minutes an open problem has been running, as of now.
const openAge = (row) => {
  const started = dtMinutes(row.started_at);
  if (started == null) return null;
  const now = dayIndex(localTodayIso()) * 1440 + new Date().getHours() * 60 + new Date().getMinutes();
  return Math.max(0, now - started);
};

const median = (sorted) => {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const cellLabel = (row, lang) =>
  pickCellName({
    name_workshop_uz: row.cell_name_uz,
    name_workshop_uz_cyrl: row.cell_name_uz_cyrl,
    name_workshop_ru: row.cell_name_ru,
    name_workshop_en: row.cell_name_en,
  }, lang);

// Stable per-cell hue so a verifix badge is recognisable at a glance. Identity,
// not status — a solid mid-tone with white text reads in both themes.
function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) % 360;
  return h;
}

// ── small presentational pieces ──────────────────────────────────────────────

function DeptChip({ dept, t, size = "sm" }) {
  const color = DEPT_COLOR[dept] || C_NEUTRAL;
  const Icon = DEPT_ICON[dept] || Layers;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ background: `${color}1f`, color, border: `1px solid ${color}38` }}
    >
      <Icon size={size === "sm" ? 11 : 13} className="flex-shrink-0" />
      {t(`concerns.category.${dept}`)}
    </span>
  );
}

function CellBadge({ code, name, className = "" }) {
  const hue = hueFromString(code || "");
  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      <span
        className="text-[11px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
        style={{ background: `hsl(${hue},55%,42%)`, color: "#fff" }}
      >
        {code || "—"}
      </span>
      {name && <span className="truncate" style={{ color: "var(--text-2)" }}>{name}</span>}
    </span>
  );
}

function StatusPill({ closed, t }) {
  const color = closed ? C_CLOSED : C_OPEN;
  const Icon = closed ? CheckCircle2 : CircleDot;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `${color}1f`, color }}
    >
      <Icon size={11} className="flex-shrink-0" />
      {t(closed ? "hansey.statusClosed" : "hansey.statusOpen")}
    </span>
  );
}

// ── KPI + chart card primitives (shared with the Concerns board's language) ──

function InsightCard({ icon: Icon, tint, label, children }) {
  return (
    <div className="relative rounded-2xl p-4 flex flex-col overflow-hidden" style={cardStyle}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(140px 140px at calc(100% - 8px) -8px, ${tint}29, transparent 70%)` }}
      />
      <div className="flex items-center gap-2.5 relative">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] flex-shrink-0"
          style={{ background: `${tint}1f`, color: tint }}
        >
          <Icon size={16} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold leading-tight" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      <div className="relative flex flex-col gap-1 mt-4 grow justify-end min-h-[56px]">{children}</div>
    </div>
  );
}

function Metric({ value, unit, color, suffix }) {
  return (
    <div className="flex items-baseline gap-1 leading-none flex-wrap">
      <span className="text-base font-bold tabular-nums" style={{ color }}>{value}</span>
      {unit && <span className="text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>{unit}</span>}
      {suffix && <span className="text-[10px] font-medium" style={{ color: "var(--text-4)" }}>· {suffix}</span>}
    </div>
  );
}

function Subject({ text, title }) {
  return (
    <div className="text-lg font-bold leading-snug truncate" style={{ color: "var(--text-1)" }} title={title || text}>
      {text}
    </div>
  );
}

// A plain number KPI — the counted half of the board (total / open / closed).
function StatCard({ icon: Icon, tint, label, value, sub }) {
  return (
    <div className="rounded-2xl p-4 flex items-center gap-3" style={cardStyle}>
      <span
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
        style={{ background: `${tint}1f`, color: tint }}
      >
        <Icon size={18} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.08em] font-semibold truncate" style={{ color: "var(--text-3)" }}>
          {label}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold tabular-nums leading-tight" style={{ color: "var(--text-1)" }}>{value}</span>
          {sub && <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{sub}</span>}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ icon, title, subtitle, right, className = "", children }) {
  return (
    <div className={`rounded-2xl overflow-hidden flex flex-col ${className}`} style={cardStyle}>
      <SectionHead icon={icon} title={title} subtitle={subtitle} right={right} />
      {children}
    </div>
  );
}

// Mount guard: hold a fixed-height slot until the grid cell settles, so
// ApexCharts measures its final width exactly once.
function Chart({ ready, height, ...rest }) {
  return ready ? <ReactApexChart height={height} {...rest} /> : <div style={{ height }} />;
}

function NoChart({ height, text }) {
  return (
    <div className="grid place-items-center text-xs flex-1 p-4" style={{ color: "var(--text-4)", minHeight: height }}>
      {text}
    </div>
  );
}

function Empty({ icon: Icon, color, text }) {
  return (
    <div className="flex items-center gap-2 my-auto">
      <Icon size={18} className="flex-shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>{text}</span>
    </div>
  );
}

// A compact ranked list — the "top offenders" bodies under several cards.
function RankList({ items, empty }) {
  if (!items.length) return <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>{empty}</div>;
  return (
    <div>
      {items.map((it, i) => (
        <div
          key={it.key}
          className="flex items-center gap-3 px-4 py-2.5"
          style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
        >
          <span
            className="w-5 h-5 rounded-md grid place-items-center text-[10px] font-bold flex-shrink-0 tabular-nums"
            style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
          >
            {i + 1}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }} title={it.title || it.label}>
              {it.label}
            </div>
            {it.sub && <div className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-4)" }}>{it.sub}</div>}
          </div>
          <span className="text-xs font-bold tabular-nums whitespace-nowrap flex-shrink-0" style={{ color: it.color || "var(--text-1)" }}>
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── date + time control ──────────────────────────────────────────────────────
// Never a native datetime-local: the platform's own single-date picker plus the
// wheel time picker, which is what a phone user can actually hit.
function DateTimeField({ date, time, onDate, onTime, t, max = null }) {
  const [wheelOpen, setWheelOpen] = useState(false);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DateRangePicker
        single
        dateFrom={date}
        setDateFrom={onDate}
        max={max}
        triggerClassName="px-3 py-2 text-sm"
      />
      <button
        type="button"
        onClick={() => setWheelOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium tabular-nums transition-colors"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: time ? "var(--text-1)" : "var(--text-4)" }}
      >
        <Clock size={14} style={{ color: "var(--text-3)" }} />
        {time || "--:--"}
      </button>
      <TimeWheelPicker
        open={wheelOpen}
        lo={0}
        hi={1439}
        value={time}
        onConfirm={(v) => { onTime(v); setWheelOpen(false); }}
        onClose={() => setWheelOpen(false)}
      />
    </div>
  );
}

const emptyForm = () => ({
  id: null,
  cell_id: "",
  department: "",
  problem: "",
  comment: "",
  answers: "",
  countermeasure: "",
  start_date: localTodayIso(),
  start_time: localNowHHMM(),
  close_date: "",
  close_time: "",
  closed: false,
});

// ── the problem form ─────────────────────────────────────────────────────────
function ProblemModal({ open, form, setForm, cells, lang, t, tl, onClose, onSave, saving, error }) {
  const cellOptions = useMemo(
    () =>
      cells.map((c) => {
        const nm = pickCellName(c, lang);
        return {
          value: String(c.cell_id),
          label: `${c.verifix_code}${nm ? " · " + nm : ""}`,
          title: `${c.verifix_code} ${nm}${c.leader ? " — " + tl(c.leader) : ""}`,
        };
      }),
    [cells, lang, tl],
  );

  const picked = cells.find((c) => String(c.cell_id) === String(form.cell_id));
  const startISO = joinDT(form.start_date, form.start_time);
  const closeISO = form.closed ? joinDT(form.close_date, form.close_time) : "";
  const startM = dtMinutes(startISO);
  const closeM = dtMinutes(closeISO);
  const liveDuration = startM != null && closeM != null ? closeM - startM : null;
  const negative = liveDuration != null && liveDuration < 0;

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const setText = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const textArea = (key, rows = 3) => (
    <textarea
      value={form[key]}
      onChange={setText(key)}
      rows={rows}
      placeholder={t(`hansey.ph${key.charAt(0).toUpperCase()}${key.slice(1)}`)}
      // 16px below sm: iOS WebViews zoom the page when focusing anything smaller.
      className="w-full rounded-xl px-3 py-2 text-base sm:text-sm outline-none resize-y"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
    />
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<SearchCheck size={18} />}
      title={t(form.id ? "hansey.editTitle" : "hansey.newTitle")}
      subtitle={picked ? `${picked.verifix_code} · ${pickCellName(picked, lang)}` : undefined}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("hansey.cancel")}</Button>
          <Button variant="primary" onClick={onSave} loading={saving} disabled={negative}>
            {t("hansey.save")}
          </Button>
        </>
      }
    >
      {error && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
          style={{ background: "#ef444414", border: "1px solid #ef444440", color: "#ef4444" }}
        >
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <Field label={t("hansey.fCell")} required>
        <StyledSelect
          value={form.cell_id ? String(form.cell_id) : ""}
          onChange={set("cell_id")}
          options={cellOptions}
          placeholder={t("hansey.pickCell")}
          searchable
          searchPlaceholder={t("hansey.searchCell")}
          triggerClassName="px-3 py-2 text-sm"
        />
        {picked && (
          <div className="flex items-center gap-1.5 mt-1.5 text-[11px]">
            <Flag size={11} style={{ color: "var(--text-4)" }} />
            <span style={{ color: picked.leader ? "var(--text-3)" : "var(--text-4)" }}>
              {picked.leader ? tl(picked.leader) : t("hansey.noLeader")}
            </span>
          </div>
        )}
      </Field>

      {/* Department as a chip grid, not a dropdown: 12 fixed options that each
          carry a colour and an icon read faster when they are all on screen. */}
      <Field label={t("hansey.fDepartment")} required>
        <div className="flex flex-wrap gap-1.5">
          {DEPARTMENTS.map((d) => {
            const active = form.department === d;
            const color = DEPT_COLOR[d];
            const Icon = DEPT_ICON[d] || Layers;
            return (
              <button
                key={d}
                type="button"
                onClick={() => set("department")(d)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? color : "var(--bg-inner)",
                  color: active ? "#fff" : "var(--text-2)",
                  border: `1px solid ${active ? color : "var(--border-md)"}`,
                }}
              >
                <Icon size={13} className="flex-shrink-0" />
                {t(`concerns.category.${d}`)}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label={t("hansey.fProblem")} required>{textArea("problem")}</Field>

      <Field label={t("hansey.fStart")} required>
        <DateTimeField
          date={form.start_date}
          time={form.start_time}
          onDate={set("start_date")}
          onTime={set("start_time")}
          t={t}
        />
      </Field>

      {/* Closing is a deliberate act, not a pair of blank fields: the toggle
          says in words whether the clock is still running. */}
      <Field label={t("hansey.fClose")}>
        <SegmentedToggle
          value={form.closed}
          onChange={(v) =>
            setForm((f) => ({
              ...f,
              closed: v,
              close_date: v ? (f.close_date || localTodayIso()) : "",
              close_time: v ? (f.close_time || localNowHHMM()) : "",
            }))
          }
          options={[[false, t("hansey.stillOpen")], [true, t("hansey.statusClosed")]]}
        />
        {form.closed && (
          <div className="mt-2">
            <DateTimeField
              date={form.close_date}
              time={form.close_time}
              onDate={set("close_date")}
              onTime={set("close_time")}
              t={t}
            />
          </div>
        )}
        {/* Live duration: the number the whole page is built on, shown before
            saving so a mistyped time is caught here and not in the analytics. */}
        {liveDuration != null && (
          <div
            className="mt-2 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            style={{
              background: negative ? "#ef444414" : "var(--bg-inner)",
              color: negative ? "#ef4444" : "var(--text-1)",
              border: `1px solid ${negative ? "#ef444440" : "var(--border)"}`,
            }}
          >
            <Timer size={13} />
            {negative ? t("hansey.errCloseBefore") : fmtDuration(liveDuration, t)}
          </div>
        )}
        {!form.closed && (
          <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>{t("hansey.closeHint")}</p>
        )}
      </Field>

      <Field label={t("hansey.fComment")} required>{textArea("comment")}</Field>
      <Field label={t("hansey.fAnswers")} required>{textArea("answers")}</Field>
      <Field label={t("hansey.fCountermeasure")} required>{textArea("countermeasure")}</Field>
    </Modal>
  );
}

export default function Hansey() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const chartTheme = useChartTheme();

  const [view, setView] = usePersistentState("hansey_view", "list");
  const [dateTo, setDateTo] = usePersistentState("hansey_date_to", localTodayIso());
  const [dateFrom, setDateFrom] = usePersistentState("hansey_date_from", isoMinusDays(localTodayIso(), 29));
  const [search, setSearch] = usePersistentState("hansey_search", "");
  const [fStatus, setFStatus] = usePersistentState("hansey_f_status", []);
  const [fDepts, setFDepts] = usePersistentState("hansey_f_depts", []);
  const [fCells, setFCells] = usePersistentState("hansey_f_cells", []);
  const [fLeader, setFLeader] = usePersistentState("hansey_f_leader", "");
  const [fSup, setFSup] = usePersistentState("hansey_f_sup", "");
  const [sort, setSort] = usePersistentState("hansey_sort", { key: "date", dir: "desc" });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [confirmRow, setConfirmRow] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportDone, setExportDone] = useState(false);

  const { data: resp, isLoading } = useQuery({
    queryKey: ["hansey", dateFrom, dateTo],
    queryFn: () =>
      api.get("/api/hansey", { params: { date_from: dateFrom, date_to: dateTo } }).then((r) => r.data),
  });
  const rows = resp?.data ?? [];
  const canCreate = !!resp?.can_create;
  // Leaders get the personal board; every other role the unit-wide one with the
  // by-leader / by-cell comparisons that only make sense across a unit.
  const unitBoard = resp?.analytics !== "leader";

  const { data: cells = [] } = useQuery({
    queryKey: ["hansey-cells"],
    queryFn: () => api.get("/api/hansey/cells").then((r) => r.data),
  });

  // ── filters (client-side over the one payload, so every board reshapes live) ─
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const statusSet = new Set(fStatus);
    const deptSet = new Set(fDepts);
    const cellSet = new Set(fCells);
    return rows.filter((r) => {
      if (statusSet.size && !statusSet.has(r.closed_at ? "closed" : "open")) return false;
      if (deptSet.size && !deptSet.has(r.department)) return false;
      if (cellSet.size && !cellSet.has(r.cell_code)) return false;
      if (fLeader) {
        if (fLeader === "none" ? r.leader_id : String(r.leader_id) !== fLeader) return false;
      }
      if (fSup && String(r.manager_id) !== fSup) return false;
      if (q) {
        const hay = `${r.problem} ${r.comment} ${r.answers} ${r.countermeasure} ${r.cell_code} ${r.leader_name || ""} ${r.owner_name || ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, fStatus, fDepts, fCells, fLeader, fSup]);

  // ── filter option lists, derived from what the viewer actually has ──────────
  const leaderOptions = useMemo(() => {
    const byId = new Map();
    let anyNone = false;
    for (const c of cells) {
      if (c.leader_id) byId.set(String(c.leader_id), tl(c.leader) || String(c.leader_id));
      else anyNone = true;
    }
    return [
      { value: "", label: t("hansey.allLeaders") },
      ...(anyNone ? [{ value: "none", label: t("hansey.noLeader") }] : []),
      ...[...byId.entries()].map(([value, label]) => ({ value, label, title: label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, lang]);

  const supOptions = useMemo(() => {
    const byId = new Map();
    for (const c of cells) if (c.manager_id) byId.set(String(c.manager_id), tl(c.supervisor) || String(c.manager_id));
    return [
      { value: "", label: t("hansey.allSupervisors") },
      ...[...byId.entries()].map(([value, label]) => ({ value, label, title: label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, lang]);

  // A leader owns ~1–2 cells and one supervisor: those pickers would be
  // single-option noise, so they only appear once there is a real choice.
  const showLeaderFilter = leaderOptions.length > 2;
  const showSupFilter = supOptions.length > 2;

  // Cell codes are the filter's option values (verifix_code is unique), so the
  // selection survives a cells refetch without depending on row ids.
  const cellCodes = useMemo(
    () => [...new Set(cells.map((c) => c.verifix_code).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [cells],
  );
  const cellNameByCode = useMemo(() => {
    const m = new Map();
    for (const c of cells) m.set(c.verifix_code, pickCellName(c, lang));
    return m;
  }, [cells, lang]);

  const filterSections = [
    {
      key: "status", icon: CircleDot, label: t("hansey.fltStatus"),
      active: fStatus.length > 0,
      display: `${fStatus.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter
          opts={["open", "closed"]}
          sel={fStatus}
          onChange={setFStatus}
          render={(s) => <StatusPill closed={s === "closed"} t={t} />}
        />
      ),
    },
    {
      key: "dept", icon: Layers, label: t("hansey.fltDepartment"),
      active: fDepts.length > 0,
      display: `${fDepts.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter opts={DEPARTMENTS} sel={fDepts} onChange={setFDepts} render={(d) => <DeptChip dept={d} t={t} />} />
      ),
    },
    {
      key: "cell", icon: LayoutGrid, label: t("hansey.fltCell"),
      active: fCells.length > 0,
      display: `${fCells.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter
          opts={cellCodes}
          sel={fCells}
          onChange={setFCells}
          searchable={cellCodes.length > 8}
          render={(c) => <CellBadge code={c} name={cellNameByCode.get(c)} />}
        />
      ),
    },
  ];
  const filterActiveCount = (fStatus.length ? 1 : 0) + (fDepts.length ? 1 : 0) + (fCells.length ? 1 : 0);
  const clearAllFilters = () => { setFStatus([]); setFDepts([]); setFCells([]); };

  // ── sorting ────────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    const { key: k, dir } = sort || {};
    if (!k) return filtered;
    const mul = dir === "asc" ? 1 : -1;
    const val = (r) => {
      switch (k) {
        case "date": return `${r.date} ${r.started_at || ""}`;
        case "cell": return (r.cell_code || "").toLowerCase();
        case "dept": return t(`concerns.category.${r.department}`).toLowerCase();
        case "leader": return (r.leader_name || "").toLowerCase();
        // Open problems sort by how long they have been running, so the worst
        // offenders surface next to the longest closed ones instead of at the end.
        case "duration": return r.closed_at ? (r.duration_minutes ?? 0) : (openAge(r) ?? 0);
        case "status": return r.closed_at ? 1 : 0;
        default: return "";
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * mul;
    });
  }, [filtered, sort, lang, t]);

  // asc → desc → off, the canonical three-state header toggle.
  const onSort = (key) =>
    setSort((s) =>
      s?.key === key
        ? (s.dir === "desc" ? { key, dir: "asc" } : { key: null, dir: "desc" })
        : { key, dir: "desc" });

  // ── mutations ──────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["hansey"] });

  const saveMut = useMutation({
    mutationFn: (payload) =>
      payload.id
        ? api.put(`/api/hansey/${payload.id}`, payload.body).then((r) => r.data)
        : api.post("/api/hansey", payload.body).then((r) => r.data),
    onSuccess: () => { setModalOpen(false); setFormError(""); invalidate(); },
    onError: (e) => setFormError(e?.response?.data?.detail || t("hansey.saveFailed")),
  });

  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/api/hansey/${id}`),
    onSuccess: () => { setConfirmRow(null); invalidate(); },
    onError: (e) => { setConfirmRow(null); alert(e?.response?.data?.detail || t("hansey.saveFailed")); },
  });

  function openNew() {
    setFormError("");
    // One cell to choose from = no choice at all: preselect it so a leader's
    // form opens on the department chips, one tap from done.
    setForm({ ...emptyForm(), cell_id: cells.length === 1 ? String(cells[0].cell_id) : "" });
    setModalOpen(true);
  }

  function openEdit(row) {
    setFormError("");
    const s = splitDT(row.started_at);
    const c = splitDT(row.closed_at);
    setForm({
      id: row.id,
      cell_id: String(row.cell_id),
      department: row.department,
      problem: row.problem || "",
      comment: row.comment || "",
      answers: row.answers || "",
      countermeasure: row.countermeasure || "",
      start_date: s.date,
      start_time: s.time,
      close_date: c.date,
      close_time: c.time,
      closed: !!row.closed_at,
    });
    setModalOpen(true);
  }

  function submit() {
    const required = ["problem", "comment", "answers", "countermeasure"];
    if (!form.cell_id) return setFormError(t("hansey.pickCell"));
    if (!form.department) return setFormError(t("hansey.pickDept"));
    if (required.some((k) => !form[k].trim())) return setFormError(t("hansey.errRequired"));
    const started = joinDT(form.start_date, form.start_time);
    if (!started) return setFormError(t("hansey.errRequired"));
    const closed = form.closed ? joinDT(form.close_date, form.close_time) : null;
    if (form.closed && !closed) return setFormError(t("hansey.errRequired"));
    if (closed && dtMinutes(closed) < dtMinutes(started)) return setFormError(t("hansey.errCloseBefore"));
    setFormError("");
    saveMut.mutate({
      id: form.id,
      body: {
        cell_id: Number(form.cell_id),
        department: form.department,
        problem: form.problem.trim(),
        comment: form.comment.trim(),
        answers: form.answers.trim(),
        countermeasure: form.countermeasure.trim(),
        started_at: started,
        closed_at: closed,
      },
    });
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await api.get("/api/hansey/export.xlsx", {
        params: { date_from: dateFrom, date_to: dateTo, lang, send: 1 },
      });
      setExportDone(true);
      setTimeout(() => setExportDone(false), 4000);
    } catch (e) {
      alert(e?.response?.data?.detail || "Export failed");
    } finally {
      setExporting(false);
    }
  }

  // ── register rendering ─────────────────────────────────────────────────────
  const durationCell = (r) => {
    if (r.closed_at) {
      return <span className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{fmtDuration(r.duration_minutes, t)}</span>;
    }
    const age = openAge(r);
    return (
      <span className="tabular-nums font-semibold" style={{ color: C_OPEN }} title={t("hansey.ongoing")}>
        {fmtDuration(age, t)}
        <span className="ml-1 text-[10px] font-normal" style={{ color: "var(--text-4)" }}>· {t("hansey.ongoing")}</span>
      </span>
    );
  };

  const rowActions = (r) => (
    <div className="flex items-center justify-end gap-1">
      {r.can_edit && (
        <button
          onClick={() => openEdit(r)}
          className="p-1.5 rounded-md transition-colors hover:bg-[var(--bg-inner)]"
          style={{ color: "var(--text-3)" }}
          title={t("hansey.edit")}
        >
          <Pencil size={14} />
        </button>
      )}
      {r.can_delete && (
        <button
          onClick={() => setConfirmRow(r)}
          className="p-1.5 rounded-md transition-colors hover:bg-[#ef444414]"
          style={{ color: "#ef4444" }}
          title={t("hansey.delete")}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );

  // Phones get cards, not a 9-column table squeezed sideways.
  const mobileList = (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {sorted.map((r) => (
        <div key={r.id} className="p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <CellBadge code={r.cell_code} name={cellLabel(r, lang)} className="text-[11px]" />
              <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
                {tl(r.problem)}
              </div>
            </div>
            <StatusPill closed={!!r.closed_at} t={t} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <DeptChip dept={r.department} t={t} />
            {unitBoard && r.leader_name && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-3)" }}>
                <Flag size={10} /> {tl(r.leader_name)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <div className="flex justify-between gap-2">
              <span style={{ color: "var(--text-4)" }}>{t("hansey.colDate")}</span>
              <span style={{ color: "var(--text-2)" }}>{fmtShortDate(r.date)} {splitDT(r.started_at).time}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span style={{ color: "var(--text-4)" }}>{t("hansey.colDuration")}</span>
              {durationCell(r)}
            </div>
          </div>

          {(r.can_edit || r.can_delete) && <div className="pt-0.5">{rowActions(r)}</div>}
        </div>
      ))}
    </div>
  );

  const emptyState = (
    <div className="px-4 py-14 text-center">
      <SearchCheck size={28} className="mx-auto mb-3" style={{ color: "var(--text-4)" }} />
      <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-2)" }}>
        {rows.length ? t("hansey.noMatch") : t("hansey.empty")}
      </div>
      {!rows.length && (
        <div className="text-xs max-w-xs mx-auto" style={{ color: "var(--text-4)" }}>{t("hansey.emptyHint")}</div>
      )}
    </div>
  );

  const addButton = canCreate && (
    <Button
      size="lg"
      variant="primary"
      icon={<Plus size={15} />}
      onClick={openNew}
      disabled={!cells.length}
      title={!cells.length ? t("hansey.noCells") : undefined}
    >
      <span className="hidden sm:inline">{t("hansey.add")}</span>
      <span className="sm:hidden">{t("hansey.addShort")}</span>
    </Button>
  );

  const exportButton = (
    <Button
      size="lg"
      variant="secondary"
      icon={exporting ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
      onClick={exportExcel}
      disabled={exporting || !filtered.length}
    >
      {exporting ? t("hansey.exporting") : t("hansey.export")}
    </Button>
  );

  return (
    <Layout title={t("hansey.title")}>
      {exportDone && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 320,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
          <span>{t("hansey.exportToast")}</span>
        </div>
      )}

      {/* Filter row — period always, then the scope narrowers a viewer actually
          has a choice about. One row, wrapping on phones. */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mb-3">
        <div className="sm:w-72">
          <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>
            {t("hansey.period")}
          </label>
          <DateRangePicker
            dateFrom={dateFrom}
            dateTo={dateTo}
            setDateFrom={setDateFrom}
            setDateTo={setDateTo}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>
        {showSupFilter && (
          <div className="sm:w-56 min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>
              {t("hansey.colSupervisor")}
            </label>
            <StyledSelect
              value={fSup}
              onChange={(v) => { setFSup(v); setFLeader(""); setFCells([]); }}
              options={supOptions}
              searchable
              searchPlaceholder={t("hansey.searchSupervisor")}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </div>
        )}
        {showLeaderFilter && (
          <div className="sm:w-56 min-w-0">
            <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>
              {t("hansey.fltLeader")}
            </label>
            <StyledSelect
              value={fLeader}
              onChange={(v) => { setFLeader(v); setFCells([]); }}
              options={leaderOptions}
              searchable
              searchPlaceholder={t("hansey.searchLeader")}
              triggerClassName="w-full px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      {/* View tabs. On the analytics board the search + Filtrlar controls move up
          here, so the filters that reshape the charts are never hidden state.
          FilterPanel stays a DIRECT child of this row — its fit check measures
          the row's own children. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[["list", t("hansey.viewList")], ["analytics", t("hansey.viewAnalytics")]]}
        />
        {view === "analytics" && (
          <>
            <div className="flex-1" />
            <SearchInput value={search} onChange={setSearch} placeholder={t("hansey.search")} className="w-full sm:w-44" />
            <FilterPanel
              sections={filterSections}
              activeCount={filterActiveCount}
              anyActive={filterActiveCount > 0}
              onClearAll={clearAllFilters}
            />
            {exportButton}
          </>
        )}
      </div>

      {view === "analytics" ? (
        <HanseyAnalytics
          rows={filtered}
          allRows={rows}
          isLoading={isLoading}
          unitBoard={unitBoard}
          dateFrom={dateFrom}
          dateTo={dateTo}
          t={t}
          tl={tl}
          lang={lang}
          chartTheme={chartTheme}
        />
      ) : (
        <TableCard
          className="mb-8"
          icon={SearchCheck}
          title={t("hansey.listTitle")}
          subtitle={unitBoard ? t("hansey.subUnit") : t("hansey.subOwn")}
          wrap
          mobile={mobileList}
          mobileCards
          right={
            <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
              {filtered.length}
            </span>
          }
          toolbar={
            <>
              <SearchInput value={search} onChange={setSearch} placeholder={t("hansey.search")} className="w-full sm:w-52" />
              <FilterPanel
                sections={filterSections}
                activeCount={filterActiveCount}
                anyActive={filterActiveCount > 0}
                onClearAll={clearAllFilters}
              />
              <div className="flex-1" />
              {exportButton}
              {addButton}
            </>
          }
        >
          <thead>
            <tr>
              <Th label={t("hansey.colDate")} k="date" sort={sort} onSort={onSort} />
              <Th label={t("hansey.colCell")} k="cell" sort={sort} onSort={onSort} />
              <Th label={t("hansey.colDepartment")} k="dept" sort={sort} onSort={onSort} />
              <Th label={t("hansey.colProblem")} />
              {unitBoard && <Th label={t("hansey.colLeader")} k="leader" sort={sort} onSort={onSort} />}
              <Th label={t("hansey.colStarted")} align="right" />
              <Th label={t("hansey.colDuration")} k="duration" sort={sort} onSort={onSort} align="right" />
              <Th label={t("hansey.colStatus")} k="status" sort={sort} onSort={onSort} />
              <Th label={t("hansey.colOwner")} />
              <Th label="" align="right" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={unitBoard ? 10 : 9} className="px-3 py-2">
                    <SkeletonBlock className="h-5 w-full rounded" />
                  </td>
                </tr>
              ))
            ) : !sorted.length ? (
              <tr>
                <td colSpan={unitBoard ? 10 : 9}>{emptyState}</td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{fmtDate(r.date, lang)}</td>
                  <td className="px-3 py-2"><CellBadge code={r.cell_code} name={cellLabel(r, lang)} /></td>
                  <td className="px-3 py-2"><DeptChip dept={r.department} t={t} /></td>
                  <td className="px-3 py-2 max-w-md">
                    <span className="line-clamp-2" style={{ color: "var(--text-1)" }} title={r.problem}>{tl(r.problem)}</span>
                  </td>
                  {unitBoard && (
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: r.leader_name ? "var(--text-2)" : "var(--text-4)" }}>
                      {r.leader_name ? tl(r.leader_name) : t("hansey.noLeader")}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
                    {splitDT(r.started_at).time}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{durationCell(r)}</td>
                  <td className="px-3 py-2"><StatusPill closed={!!r.closed_at} t={t} /></td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)" }}>{tl(r.owner_name || "")}</td>
                  <td className="px-3 py-2">{rowActions(r)}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableCard>
      )}

      {modalOpen && (
        <ProblemModal
          open={modalOpen}
          form={form}
          setForm={setForm}
          cells={cells}
          lang={lang}
          t={t}
          tl={tl}
          saving={saveMut.isPending}
          error={formError}
          onClose={() => { setModalOpen(false); setFormError(""); }}
          onSave={submit}
        />
      )}

      <ConfirmDialog
        open={confirmRow != null}
        tone="danger"
        title={t("hansey.deleteTitle")}
        message={t("hansey.deleteConfirm")}
        confirmLabel={t("hansey.delete")}
        cancelLabel={t("hansey.cancel")}
        loading={delMut.isPending}
        onCancel={() => setConfirmRow(null)}
        onConfirm={() => confirmRow && delMut.mutate(confirmRow.id)}
      />
    </Layout>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Analytics
//
// Two boards over the same numbers, because the two audiences ask different
// questions of them:
//
//   leader  — "what is eating MY cells' time, and what is still running?"
//             A personal board: no by-leader ranking (they are the only leader
//             in it) and no cross-cell comparison (they own one or two cells).
//   unit    — the supervisor's board: everything above, plus the comparisons
//             that only exist across a unit — leader against leader, cell
//             against cell, and which department blocks which cell.
//
// Every board is computed from the ALREADY FILTERED rows, so period, cell,
// leader, department, status and search reshape all of them live.
// ═══════════════════════════════════════════════════════════════════════════

const TOP_N = 8;
const stackHeight = (n) => Math.max(200, 56 + n * 30);

function HanseyAnalytics({ rows, allRows, isLoading, unitBoard, dateFrom, dateTo, t, tl, lang, chartTheme }) {
  const [gran, setGran] = usePersistentState("hansey_gran", "day");
  const [deptMode, setDeptMode] = usePersistentState("hansey_dept_mode", "count");
  const [cellMode, setCellMode] = usePersistentState("hansey_cell_mode", "time");

  // ApexCharts measures its container once on mount; a chart mounted in the same
  // frame as the grid reads a pre-layout width and renders squashed.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setChartsReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const deptLabel = (d) => t(`concerns.category.${d}`);
  const weekdays = WEEKDAYS[lang] || WEEKDAYS.uz;

  // ── headline numbers ───────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const closed = rows.filter((r) => r.closed_at);
    const open = rows.filter((r) => !r.closed_at);
    const durations = closed
      .map((r) => r.duration_minutes)
      .filter((m) => m != null)
      .sort((a, b) => a - b);
    const lost = durations.reduce((a, b) => a + b, 0);
    // Time already burnt by problems that are STILL running — the number a
    // supervisor is actually losing right now, which "closed total" hides.
    const openLost = open.reduce((a, r) => a + (openAge(r) || 0), 0);
    return {
      total: rows.length,
      open: open.length,
      closed: closed.length,
      closedRate: rows.length ? Math.round((closed.length / rows.length) * 1000) / 10 : 0,
      avg: durations.length ? Math.round(lost / durations.length) : null,
      median: median(durations),
      longest: durations.length ? durations[durations.length - 1] : null,
      lost,
      openLost,
    };
  }, [rows]);

  // ── insight cards: the single worst offender in each dimension ─────────────
  const insights = useMemo(() => {
    const openRows = rows.filter((r) => !r.closed_at);
    let longestOpen = null;
    for (const r of openRows) {
      const age = openAge(r);
      if (age == null) continue;
      if (!longestOpen || age > longestOpen.age) longestOpen = { row: r, age };
    }

    // Department that cost the most minutes (closed time + time still running).
    const byDept = new Map();
    for (const r of rows) {
      const e = byDept.get(r.department) || { count: 0, lost: 0 };
      e.count += 1;
      e.lost += r.closed_at ? (r.duration_minutes || 0) : (openAge(r) || 0);
      byDept.set(r.department, e);
    }
    let worstDept = null;
    for (const [d, e] of byDept) if (!worstDept || e.lost > worstDept.lost) worstDept = { dept: d, ...e };

    // Hour of day that starts the most problems — a shift-pattern tell (a spike
    // at handover or at the start of a shift is a process problem, not luck).
    const hours = new Array(24).fill(0);
    for (const r of rows) {
      const { time } = splitDT(r.started_at);
      if (!time) continue;
      hours[Number(time.slice(0, 2))] += 1;
    }
    const peakCount = Math.max(...hours);
    const peakHour = peakCount > 0 ? hours.indexOf(peakCount) : null;

    // The cell+department pair that keeps coming back: a recurring pair is a
    // countermeasure that did not work, which is the whole point of the page.
    const pairs = new Map();
    for (const r of rows) {
      const k = `${r.cell_code}||${r.department}`;
      const e = pairs.get(k) || { count: 0, lost: 0, cell: r.cell_code, dept: r.department };
      e.count += 1;
      e.lost += r.closed_at ? (r.duration_minutes || 0) : (openAge(r) || 0);
      pairs.set(k, e);
    }
    const repeats = [...pairs.values()].filter((p) => p.count > 1).sort((a, b) => b.count - a.count);

    return { longestOpen, worstDept, peakHour, peakCount, repeats };
  }, [rows]);

  // ── trend: opened vs closed vs time lost, over a padded window ─────────────
  // Closed is keyed on the CLOSING day, not the problem's own date: the two
  // series then read as inflow against outflow instead of the same day twice.
  const trend = useMemo(() => {
    const from = padChartFrom(dateFrom, dateTo);
    if (!from || !dateTo) return { labels: [], opened: [], closed: [], lost: [] };
    const keyOf = (iso) => {
      if (gran === "day") return iso;
      if (gran === "month") return iso.slice(0, 7);
      // Week buckets are keyed by their Monday so the axis stays chronological.
      const d = new Date(`${iso}T00:00:00`);
      const back = (d.getDay() + 6) % 7;
      return isoMinusDays(iso, back);
    };

    const buckets = new Map();
    // Seed every period in the window so a quiet day is a real zero, not a gap.
    let cursor = from;
    let guard = 0;
    while (cursor <= dateTo && guard++ < 800) {
      const k = keyOf(cursor);
      if (!buckets.has(k)) buckets.set(k, { opened: 0, closed: 0, lost: 0 });
      cursor = addDaysIso(cursor, 1);
    }

    for (const r of rows) {
      const ok = keyOf(r.date);
      const b = buckets.get(ok);
      if (b) { b.opened += 1; b.lost += r.closed_at ? (r.duration_minutes || 0) : 0; }
      if (r.closed_at) {
        const ck = keyOf(splitDT(r.closed_at).date);
        const cb = buckets.get(ck);
        if (cb) cb.closed += 1;
      }
    }

    const keys = [...buckets.keys()].sort();
    const label = (k) => {
      if (gran === "month") {
        const [y, m] = k.split("-").map(Number);
        return `${(MONTHS[lang] || MONTHS.uz)[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
      }
      return fmtShortDate(k);
    };
    return {
      labels: keys.map(label),
      opened: keys.map((k) => buckets.get(k).opened),
      closed: keys.map((k) => buckets.get(k).closed),
      lost: keys.map((k) => Math.round((buckets.get(k).lost / 60) * 10) / 10),
    };
  }, [rows, dateFrom, dateTo, gran, lang]);

  // ── by department ──────────────────────────────────────────────────────────
  const depts = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      const e = m.get(r.department) || { key: r.department, count: 0, open: 0, closed: 0, lost: 0, durations: [] };
      e.count += 1;
      if (r.closed_at) {
        e.closed += 1;
        e.lost += r.duration_minutes || 0;
        if (r.duration_minutes != null) e.durations.push(r.duration_minutes);
      } else {
        e.open += 1;
        e.lost += openAge(r) || 0;
      }
      m.set(r.department, e);
    }
    const total = rows.length || 1;
    const totalLost = [...m.values()].reduce((a, e) => a + e.lost, 0) || 1;
    return [...m.values()]
      .map((e) => ({
        ...e,
        avg: e.durations.length ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.durations.length) : null,
        share: Math.round((e.count / total) * 1000) / 10,
        lostShare: Math.round((e.lost / totalLost) * 1000) / 10,
      }))
      .sort((a, b) => (deptMode === "time" ? b.lost - a.lost : b.count - a.count));
  }, [rows, deptMode]);

  // ── resolution-time spread ─────────────────────────────────────────────────
  const buckets = useMemo(() => {
    const closed = rows.filter((r) => r.closed_at && r.duration_minutes != null);
    return BUCKETS.map((b) => {
      const n = closed.filter((r) => r.duration_minutes >= b.min && (b.max == null || r.duration_minutes < b.max)).length;
      return { ...b, n, share: closed.length ? Math.round((n / closed.length) * 1000) / 10 : 0 };
    });
  }, [rows]);

  // ── time-of-day and weekday patterns ───────────────────────────────────────
  const hourly = useMemo(() => {
    const counts = new Array(24).fill(0);
    for (const r of rows) {
      const { time } = splitDT(r.started_at);
      if (time) counts[Number(time.slice(0, 2))] += 1;
    }
    return counts;
  }, [rows]);

  const weekly = useMemo(() => {
    const counts = new Array(7).fill(0);
    const mins = new Array(7).fill(0);
    const closedN = new Array(7).fill(0);
    for (const r of rows) {
      if (!r.date) continue;
      const wd = (new Date(`${r.date}T00:00:00`).getDay() + 6) % 7; // Mon = 0
      counts[wd] += 1;
      if (r.closed_at && r.duration_minutes != null) { mins[wd] += r.duration_minutes; closedN[wd] += 1; }
    }
    return {
      counts,
      avgHours: mins.map((m, i) => (closedN[i] ? Math.round((m / closedN[i] / 60) * 10) / 10 : 0)),
    };
  }, [rows]);

  // ── lists: what is running now, what took longest ─────────────────────────
  const longestOpenList = useMemo(
    () =>
      rows
        .filter((r) => !r.closed_at)
        .map((r) => ({ r, age: openAge(r) ?? 0 }))
        .sort((a, b) => b.age - a.age)
        .slice(0, TOP_N)
        .map(({ r, age }) => ({
          key: r.id,
          label: tl(r.problem),
          title: r.problem,
          sub: `${r.cell_code} · ${deptLabel(r.department)}`,
          value: fmtDuration(age, t),
          color: C_OPEN,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, lang],
  );

  const slowestList = useMemo(
    () =>
      rows
        .filter((r) => r.closed_at && r.duration_minutes != null)
        .sort((a, b) => b.duration_minutes - a.duration_minutes)
        .slice(0, TOP_N)
        .map((r) => ({
          key: r.id,
          label: tl(r.problem),
          title: r.problem,
          sub: `${r.cell_code} · ${deptLabel(r.department)} · ${fmtShortDate(r.date)}`,
          value: fmtDuration(r.duration_minutes, t),
          color: "var(--text-1)",
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, lang],
  );

  // ── unit-only aggregates ───────────────────────────────────────────────────
  const leaders = useMemo(() => {
    if (!unitBoard) return [];
    const m = new Map();
    for (const r of rows) {
      const key = r.leader_id ? String(r.leader_id) : "none";
      const e = m.get(key) || {
        key, name: r.leader_name ? tl(r.leader_name) : t("hansey.noLeader"),
        count: 0, open: 0, closed: 0, lost: 0, durations: [],
      };
      e.count += 1;
      if (r.closed_at) {
        e.closed += 1;
        e.lost += r.duration_minutes || 0;
        if (r.duration_minutes != null) e.durations.push(r.duration_minutes);
      } else {
        e.open += 1;
        e.lost += openAge(r) || 0;
      }
      m.set(key, e);
    }
    return [...m.values()]
      .map((e) => ({
        ...e,
        avg: e.durations.length ? Math.round(e.durations.reduce((a, b) => a + b, 0) / e.durations.length) : null,
        rate: e.count ? Math.round((e.closed / e.count) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, unitBoard, lang]);

  const cellStats = useMemo(() => {
    if (!unitBoard) return [];
    const m = new Map();
    for (const r of rows) {
      const e = m.get(r.cell_code) || { key: r.cell_code, name: cellLabel(r, lang), count: 0, open: 0, lost: 0 };
      e.count += 1;
      if (!r.closed_at) e.open += 1;
      e.lost += r.closed_at ? (r.duration_minutes || 0) : (openAge(r) || 0);
      m.set(r.cell_code, e);
    }
    return [...m.values()].sort((a, b) => (cellMode === "count" ? b.count - a.count : b.lost - a.lost));
  }, [rows, unitBoard, cellMode, lang]);

  // Cell × department: for each of the busiest cells, how its lost time splits
  // across the departments. Row-normalised, so a row reads "what blocks THIS
  // cell" rather than being drowned out by the unit's biggest cell.
  const matrix = useMemo(() => {
    if (!unitBoard) return null;
    const topCells = cellStats.slice(0, 12);
    if (!topCells.length) return null;
    const activeDepts = depts.map((d) => d.key);
    if (!activeDepts.length) return null;
    const lostBy = new Map();
    for (const r of rows) {
      const k = `${r.cell_code}||${r.department}`;
      lostBy.set(k, (lostBy.get(k) || 0) + (r.closed_at ? (r.duration_minutes || 0) : (openAge(r) || 0)));
    }
    return {
      labels: activeDepts.map(deptLabel),
      colTotals: activeDepts.map((d) => depts.find((x) => x.key === d)?.count || 0),
      rows: topCells.map((c) => ({
        key: c.key,
        label: c.key,
        title: `${c.key} ${c.name || ""}`.trim(),
        data: activeDepts.map((d) => {
          const v = lostBy.get(`${c.key}||${d}`) || 0;
          return c.lost ? Math.round((v / c.lost) * 1000) / 10 : 0;
        }),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cellStats, depts, unitBoard, lang]);

  // ── chart options ──────────────────────────────────────────────────────────
  const baseOpts = {
    chart: { toolbar: { show: false }, zoom: { enabled: false }, background: "transparent", fontFamily: "inherit" },
    theme: chartTheme.chartTheme,
    grid: { borderColor: chartTheme.gridColor, strokeDashArray: 3, padding: { left: 8, right: 12 } },
    dataLabels: { enabled: false },
    legend: { labels: { colors: chartTheme.legendColor }, fontSize: "11px", markers: { radius: 3 } },
    tooltip: { theme: chartTheme.tooltipTheme },
  };
  const axisLabel = { style: { colors: chartTheme.labelColor, fontSize: "10px" } };

  const trendOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "area", stacked: false },
    colors: [C_OPEN, C_CLOSED],
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.28, opacityTo: 0.02, shadeIntensity: 1 } },
    xaxis: { categories: trend.labels, labels: { ...axisLabel, rotate: 0, hideOverlappingLabels: true }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { ...axisLabel, formatter: (v) => Math.round(v) }, min: 0, forceNiceScale: true },
  };
  const trendSeries = [
    { name: t("hansey.opened"), data: trend.opened },
    { name: t("hansey.closedWord"), data: trend.closed },
  ];

  const lostOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: [BRAND],
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: trend.labels, labels: { ...axisLabel, hideOverlappingLabels: true }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { ...axisLabel, formatter: (v) => `${Math.round(v)}` }, min: 0, forceNiceScale: true },
    tooltip: { theme: chartTheme.tooltipTheme, y: { formatter: (v) => `${v} ${t("hansey.hShort")}` } },
    legend: { show: false },
  };
  const lostSeries = [{ name: t("hansey.lostWord"), data: trend.lost }];

  const deptRows = depts.slice(0, 12);
  const deptOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: deptRows.map((d) => DEPT_COLOR[d.key] || C_NEUTRAL),
    plotOptions: { bar: { horizontal: true, distributed: true, barHeight: "62%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: deptRows.map((d) => deptLabel(d.key)), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: chartTheme.labelColor, fontSize: "11px" } } },
    legend: { show: false },
    tooltip: {
      theme: chartTheme.tooltipTheme,
      y: {
        formatter: (v) => (deptMode === "time" ? fmtDuration(Math.round(v * 60), t) : `${v} ${t("hansey.problemsWord")}`),
      },
    },
  };
  const deptSeries = [{
    name: deptMode === "time" ? t("hansey.lostWord") : t("hansey.problemsWord"),
    data: deptRows.map((d) => (deptMode === "time" ? Math.round((d.lost / 60) * 10) / 10 : d.count)),
  }];

  const bucketOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: buckets.map((b) => b.color),
    plotOptions: { bar: { distributed: true, columnWidth: "48%", borderRadius: 4, borderRadiusApplication: "end" } },
    xaxis: { categories: buckets.map((b) => t(`hansey.${b.key}`)), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { ...axisLabel, formatter: (v) => Math.round(v) }, min: 0, forceNiceScale: true },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      formatter: (v, { dataPointIndex }) => (v ? `${buckets[dataPointIndex].share}%` : ""),
      style: { fontSize: "10px", fontWeight: 600, colors: [chartTheme.legendColor] },
      offsetY: -18,
    },
  };
  const bucketSeries = [{ name: t("hansey.problemsWord"), data: buckets.map((b) => b.n) }];

  const hourOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: [BRAND],
    plotOptions: { bar: { columnWidth: "62%", borderRadius: 2, borderRadiusApplication: "end" } },
    xaxis: {
      categories: hourly.map((_, i) => `${pad2(i)}`),
      labels: { ...axisLabel, hideOverlappingLabels: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { ...axisLabel, formatter: (v) => Math.round(v) }, min: 0, forceNiceScale: true },
    legend: { show: false },
    tooltip: { theme: chartTheme.tooltipTheme, x: { formatter: (v) => `${v}:00` } },
  };
  const hourSeries = [{ name: t("hansey.problemsWord"), data: hourly }];

  const weekOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "line", stacked: false },
    colors: [CATEGORY_COLORS[2], BRAND],
    stroke: { width: [0, 2.5], curve: "smooth" },
    plotOptions: { bar: { columnWidth: "50%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: weekdays, labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: [
      { labels: { ...axisLabel, formatter: (v) => Math.round(v) }, min: 0, forceNiceScale: true },
      { opposite: true, labels: { ...axisLabel, formatter: (v) => `${v}${t("hansey.hShort")}` }, min: 0, forceNiceScale: true },
    ],
  };
  const weekSeries = [
    { name: t("hansey.problemsWord"), type: "column", data: weekly.counts },
    { name: t("hansey.kpiAvg"), type: "line", data: weekly.avgHours },
  ];

  // Top leaders/cells fold into a slate «Other» bucket rather than growing the
  // axis until the labels are unreadable.
  const foldTop = (list, n, mapper) => {
    if (list.length <= n) return list.map(mapper);
    const head = list.slice(0, n).map(mapper);
    const tail = list.slice(n);
    return [...head, {
      key: "__other__",
      label: `${t("hansey.other")} (${tail.length})`,
      open: tail.reduce((a, e) => a + e.open, 0),
      closed: tail.reduce((a, e) => a + (e.closed || 0), 0),
      count: tail.reduce((a, e) => a + e.count, 0),
      lost: tail.reduce((a, e) => a + e.lost, 0),
      fold: true,
    }];
  };

  const leaderRows = foldTop(leaders, TOP_N, (e) => ({ ...e, label: e.name }));
  const leaderOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar", stacked: true },
    colors: [C_OPEN, C_CLOSED],
    plotOptions: { bar: { horizontal: true, barHeight: "60%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: leaderRows.map((e) => e.label), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: chartTheme.labelColor, fontSize: "11px" }, maxWidth: 150 } },
  };
  const leaderSeries = [
    { name: t("hansey.statusOpen"), data: leaderRows.map((e) => e.open) },
    { name: t("hansey.statusClosed"), data: leaderRows.map((e) => e.closed) },
  ];

  const cellRows = foldTop(cellStats, 10, (e) => ({ ...e, label: e.key }));
  const cellOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: cellRows.map((e, i) => (e.fold ? FOLD_COLOR : CATEGORY_COLORS[i % CATEGORY_COLORS.length])),
    plotOptions: { bar: { horizontal: true, distributed: true, barHeight: "62%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: cellRows.map((e) => e.label), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: chartTheme.labelColor, fontSize: "11px" } } },
    legend: { show: false },
    tooltip: {
      theme: chartTheme.tooltipTheme,
      y: { formatter: (v) => (cellMode === "count" ? `${v} ${t("hansey.problemsWord")}` : fmtDuration(Math.round(v * 60), t)) },
    },
  };
  const cellSeries = [{
    name: cellMode === "count" ? t("hansey.problemsWord") : t("hansey.lostWord"),
    data: cellRows.map((e) => (cellMode === "count" ? e.count : Math.round((e.lost / 60) * 10) / 10)),
  }];

  // Resolution speed per leader — only leaders who actually closed something,
  // because an average over zero closed problems is not a speed.
  const speedRows = leaders.filter((e) => e.avg != null).sort((a, b) => b.avg - a.avg).slice(0, TOP_N);
  const speedOpts = {
    ...baseOpts,
    chart: { ...baseOpts.chart, type: "bar" },
    colors: [CATEGORY_COLORS[4]],
    plotOptions: { bar: { horizontal: true, barHeight: "58%", borderRadius: 3, borderRadiusApplication: "end" } },
    xaxis: { categories: speedRows.map((e) => e.name), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: chartTheme.labelColor, fontSize: "11px" }, maxWidth: 150 } },
    legend: { show: false },
    tooltip: { theme: chartTheme.tooltipTheme, y: { formatter: (v) => fmtDuration(Math.round(v * 60), t) } },
  };
  const speedSeries = [{ name: t("hansey.kpiAvg"), data: speedRows.map((e) => Math.round((e.avg / 60) * 10) / 10) }];

  const skeleton = (h) => <div className="p-4"><SkeletonChart className={h} /></div>;
  const hasRows = rows.length > 0;

  if (!isLoading && !allRows.length) {
    return (
      <div className="rounded-2xl py-16 text-center" style={{ ...cardStyle, borderStyle: "dashed" }}>
        <SearchCheck size={30} className="mx-auto mb-3" style={{ color: "var(--text-4)" }} />
        <div className="text-sm font-semibold mb-1" style={{ color: "var(--text-2)" }}>{t("hansey.empty")}</div>
        <div className="text-xs max-w-xs mx-auto" style={{ color: "var(--text-4)" }}>{t("hansey.emptyHint")}</div>
      </div>
    );
  }

  return (
    <div className="pb-8 space-y-3">
      {/* ── counted KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Layers} tint={BRAND} label={t("hansey.kpiTotal")} value={stats.total} />
        <StatCard
          icon={CircleDot} tint={C_OPEN} label={t("hansey.kpiOpen")} value={stats.open}
          sub={stats.openLost ? `· ${fmtDuration(stats.openLost, t)}` : undefined}
        />
        <StatCard
          icon={CheckCircle2} tint={C_CLOSED} label={t("hansey.kpiClosed")} value={stats.closed}
          sub={`· ${stats.closedRate}%`}
        />
        <StatCard icon={Hourglass} tint={CATEGORY_COLORS[5]} label={t("hansey.kpiLost")} value={fmtDuration(stats.lost, t, "0")} />
      </div>

      {/* ── measured KPIs: how long things take ──────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Timer} tint={CATEGORY_COLORS[2]} label={t("hansey.kpiAvg")} value={fmtDuration(stats.avg, t)} />
        <StatCard icon={Gauge} tint={CATEGORY_COLORS[6]} label={t("hansey.kpiMedian")} value={fmtDuration(stats.median, t)} />
        <StatCard icon={AlertTriangle} tint="#f97316" label={t("hansey.kpiLongest")} value={fmtDuration(stats.longest, t)} />
        <StatCard icon={CheckCircle2} tint={C_CLOSED} label={t("hansey.kpiClosedRate")} value={`${stats.closedRate}%`} />
      </div>

      {/* ── the four "who is the worst offender" insight cards ───────────── */}
      <div className={`grid grid-cols-1 gap-3 ${unitBoard ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-3"}`}>
        <InsightCard icon={Hourglass} tint={C_OPEN} label={t("hansey.kpiLongestOpen")}>
          {insights.longestOpen ? (
            <>
              <Subject text={tl(insights.longestOpen.row.problem)} title={insights.longestOpen.row.problem} />
              <Metric
                value={fmtDuration(insights.longestOpen.age, t)}
                color="var(--kpi-red, #ef4444)"
                suffix={insights.longestOpen.row.cell_code}
              />
            </>
          ) : (
            <Empty icon={CheckCircle2} color={C_CLOSED} text={t("hansey.allClear")} />
          )}
        </InsightCard>

        <InsightCard icon={Layers} tint="#f59e0b" label={t("hansey.kpiWorstDept")}>
          {insights.worstDept ? (
            <>
              <Subject text={deptLabel(insights.worstDept.dept)} />
              <Metric
                value={fmtDuration(insights.worstDept.lost, t)}
                color="var(--kpi-amber, #eab308)"
                suffix={`${insights.worstDept.count} ${t("hansey.problemsWord")}`}
              />
            </>
          ) : (
            <Empty icon={Layers} color="var(--text-4)" text={t("hansey.noData")} />
          )}
        </InsightCard>

        <InsightCard icon={Sunrise} tint={CATEGORY_COLORS[2]} label={t("hansey.kpiPeakHour")}>
          {insights.peakHour != null ? (
            <>
              <Subject text={`${pad2(insights.peakHour)}:00`} />
              <Metric value={insights.peakCount} unit={t("hansey.problemsWord")} color="var(--kpi-blue, #3b82f6)" />
            </>
          ) : (
            <Empty icon={Sunrise} color="var(--text-4)" text={t("hansey.noData")} />
          )}
        </InsightCard>

        {/* Unit board only: a recurring cell+department pair means a
            countermeasure that did not hold — the supervisor's cue to escalate. */}
        {unitBoard && (
          <InsightCard icon={Repeat} tint={CATEGORY_COLORS[5]} label={t("hansey.kpiRepeat")}>
            {insights.repeats.length ? (
              <>
                <Subject
                  text={`${insights.repeats[0].cell} · ${deptLabel(insights.repeats[0].dept)}`}
                  title={`${insights.repeats[0].cell} — ${deptLabel(insights.repeats[0].dept)}`}
                />
                <Metric
                  value={insights.repeats[0].count}
                  unit={t("hansey.timesWord")}
                  color="var(--kpi-purple, #a855f7)"
                  suffix={fmtDuration(insights.repeats[0].lost, t)}
                />
              </>
            ) : (
              <Empty icon={CheckCircle2} color={C_CLOSED} text={t("hansey.noData")} />
            )}
          </InsightCard>
        )}
      </div>

      {/* ── flow: opened vs closed, and the time it cost ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard
          className="lg:col-span-2"
          icon={TrendingUp}
          title={t("hansey.chartTrend")}
          subtitle={t("hansey.chartTrendSub")}
          right={
            <SegmentedToggle
              size="sm"
              value={gran}
              onChange={setGran}
              options={[["day", t("hansey.granDay")], ["week", t("hansey.granWeek")], ["month", t("hansey.granMonth")]]}
            />
          }
        >
          {isLoading ? skeleton("h-56") : trend.labels.length ? (
            <div className="px-1 pt-1"><Chart ready={chartsReady} height={250} options={trendOpts} series={trendSeries} type="area" /></div>
          ) : <NoChart height={250} text={t("hansey.noData")} />}
        </ChartCard>

        <ChartCard icon={PieChart} title={t("hansey.chartBuckets")} subtitle={t("hansey.chartBucketsSub")}>
          {isLoading ? skeleton("h-56") : stats.closed ? (
            <>
              <div className="px-1 pt-1"><Chart ready={chartsReady} height={200} options={bucketOpts} series={bucketSeries} type="bar" /></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 pb-4 mt-auto">
                {buckets.map((b) => (
                  <div key={b.key} className="flex items-center gap-1.5 text-[11px]">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: b.color }} />
                    <span className="truncate" style={{ color: "var(--text-3)" }}>{t(`hansey.${b.key}`)}</span>
                    <span className="ml-auto font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{b.n}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <NoChart height={200} text={t("hansey.noData")} />}
        </ChartCard>
      </div>

      {/* ── time lost per period ─────────────────────────────────────────── */}
      <ChartCard icon={Hourglass} title={t("hansey.chartLost")} subtitle={`${t("hansey.chartLostSub")} · ${t("hansey.hShort")}`}>
        {isLoading ? skeleton("h-44") : trend.labels.length ? (
          <div className="px-1 pt-1 pb-1"><Chart ready={chartsReady} height={200} options={lostOpts} series={lostSeries} type="bar" /></div>
        ) : <NoChart height={200} text={t("hansey.noData")} />}
      </ChartCard>

      {/* ── departments: the causes, ranked ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <ChartCard
          className="lg:col-span-3"
          icon={Layers}
          title={t("hansey.chartDept")}
          subtitle={t("hansey.chartDeptSub")}
          right={
            <SegmentedToggle
              size="sm"
              value={deptMode}
              onChange={setDeptMode}
              options={[["count", t("hansey.byCount")], ["time", t("hansey.byTime")]]}
            />
          }
        >
          {isLoading ? skeleton("h-64") : deptRows.length ? (
            <div className="px-1 pt-1 pb-1">
              <Chart ready={chartsReady} height={stackHeight(deptRows.length)} options={deptOpts} series={deptSeries} type="bar" />
            </div>
          ) : <NoChart height={220} text={t("hansey.noData")} />}
        </ChartCard>

        <div className="lg:col-span-2 rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <SectionHead icon={Grid3x3} title={t("hansey.tblDepts")} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ color: "var(--text-1)" }}>
              <thead>
                <tr>
                  <Th label={t("hansey.colDepartment")} />
                  <Th label={t("hansey.colCount")} align="right" />
                  <Th label={t("hansey.colShare")} align="right" />
                  <Th label={t("hansey.colTotalTime")} align="right" />
                </tr>
              </thead>
              <tbody>
                {depts.length ? depts.map((d) => (
                  <tr key={d.key} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2"><DeptChip dept={d.key} t={t} /></td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{d.count}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className="hidden sm:block h-1.5 w-12 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.min(100, d.share)}%`, background: DEPT_COLOR[d.key] }} />
                        </span>
                        <span className="tabular-nums" style={{ color: "var(--text-3)" }}>{d.share}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                      {fmtDuration(d.lost, t, "—")}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>{t("hansey.noData")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── rhythm: when problems start, and how the week behaves ────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard icon={Sunrise} title={t("hansey.chartHours")} subtitle={t("hansey.chartHoursSub")}>
          {isLoading ? skeleton("h-52") : hasRows ? (
            <div className="px-1 pt-1 pb-1"><Chart ready={chartsReady} height={220} options={hourOpts} series={hourSeries} type="bar" /></div>
          ) : <NoChart height={220} text={t("hansey.noData")} />}
        </ChartCard>

        <ChartCard icon={CalendarDays} title={t("hansey.chartWeekday")} subtitle={t("hansey.chartWeekdaySub")}>
          {isLoading ? skeleton("h-52") : hasRows ? (
            <div className="px-1 pt-1 pb-1"><Chart ready={chartsReady} height={220} options={weekOpts} series={weekSeries} type="line" /></div>
          ) : <NoChart height={220} text={t("hansey.noData")} />}
        </ChartCard>
      </div>

      {/* ── unit-only comparison boards ──────────────────────────────────── */}
      {unitBoard && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard icon={UserRound} title={t("hansey.chartByLeader")} subtitle={t("hansey.chartByLeaderSub")}>
              {isLoading ? skeleton("h-56") : leaderRows.length ? (
                <div className="px-1 pt-1 pb-1">
                  <Chart ready={chartsReady} height={stackHeight(leaderRows.length)} options={leaderOpts} series={leaderSeries} type="bar" />
                </div>
              ) : <NoChart height={220} text={t("hansey.noData")} />}
            </ChartCard>

            <ChartCard
              icon={LayoutGrid}
              title={t("hansey.chartByCell")}
              subtitle={t("hansey.chartByCellSub")}
              right={
                <SegmentedToggle
                  size="sm"
                  value={cellMode}
                  onChange={setCellMode}
                  options={[["count", t("hansey.byCount")], ["time", t("hansey.byTime")]]}
                />
              }
            >
              {isLoading ? skeleton("h-56") : cellRows.length ? (
                <div className="px-1 pt-1 pb-1">
                  <Chart ready={chartsReady} height={stackHeight(cellRows.length)} options={cellOpts} series={cellSeries} type="bar" />
                </div>
              ) : <NoChart height={220} text={t("hansey.noData")} />}
            </ChartCard>
          </div>

          <ChartCard icon={Gauge} title={t("hansey.chartSpeed")} subtitle={t("hansey.chartSpeedSub")}>
            {isLoading ? skeleton("h-52") : speedRows.length ? (
              <div className="px-1 pt-1 pb-1">
                <Chart ready={chartsReady} height={stackHeight(speedRows.length)} options={speedOpts} series={speedSeries} type="bar" />
              </div>
            ) : <NoChart height={200} text={t("hansey.noData")} />}
          </ChartCard>

          {/* Cell × department share grid — the shared matrix template. Each row
              is one cell's lost time split across departments, so a row reads
              "what blocks this cell" independent of the cell's size. */}
          {matrix && (
            <div className="rounded-2xl overflow-hidden" style={cardStyle}>
              <SectionHead icon={Grid3x3} title={t("hansey.chartMatrix")} subtitle={t("hansey.chartMatrixSub")} />
              <div className="p-3">
                <SeasonalityHeatmap
                  labels={matrix.labels}
                  colTotals={matrix.colTotals}
                  rows={matrix.rows}
                  firstColLabel={t("hansey.colCell")}
                  colWidth={86}
                  firstColWidth={112}
                />
              </div>
            </div>
          )}

          {/* Leader league table — the numbers behind the two charts above. */}
          <div className="rounded-2xl overflow-hidden" style={cardStyle}>
            <SectionHead
              icon={UserRound}
              title={t("hansey.tblLeaders")}
              right={<span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>{leaders.length}</span>}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                <thead>
                  <tr>
                    <Th label={t("hansey.colLeader")} />
                    <Th label={t("hansey.colCount")} align="right" />
                    <Th label={t("hansey.statusOpen")} align="right" />
                    <Th label={t("hansey.statusClosed")} align="right" />
                    <Th label={t("hansey.colRate")} align="right" />
                    <Th label={t("hansey.colAvg")} align="right" />
                    <Th label={t("hansey.colTotalTime")} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {leaders.length ? leaders.map((e) => (
                    <tr key={e.key} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5">
                          <Flag size={11} style={{ color: "var(--text-4)" }} />
                          <span style={{ color: e.key === "none" ? "var(--text-4)" : "var(--text-1)" }}>{e.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{e.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: e.open ? C_OPEN : "var(--text-4)" }}>{e.open}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: e.closed ? C_CLOSED : "var(--text-4)" }}>{e.closed}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{e.rate}%</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDuration(e.avg, t)}</td>
                      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDuration(e.lost, t, "—")}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>{t("hansey.noData")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── the two lists that name actual problems ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard icon={CircleDot} title={t("hansey.chartOpenList")}>
          {isLoading ? skeleton("h-40") : <RankList items={longestOpenList} empty={t("hansey.allClear")} />}
        </ChartCard>
        <ChartCard icon={Timer} title={t("hansey.chartSlowest")}>
          {isLoading ? skeleton("h-40") : <RankList items={slowestList} empty={t("hansey.noData")} />}
        </ChartCard>
      </div>

      {/* Recurrence list — unit board only; a leader sees the same signal in
          their own department mix without a cross-cell ranking. */}
      {unitBoard && insights.repeats.length > 0 && (
        <ChartCard icon={Repeat} title={t("hansey.chartRepeat")} subtitle={t("hansey.chartRepeatSub")}>
          <RankList
            items={insights.repeats.slice(0, TOP_N).map((p) => ({
              key: `${p.cell}-${p.dept}`,
              label: `${p.cell} · ${deptLabel(p.dept)}`,
              sub: fmtDuration(p.lost, t),
              value: `${p.count} ${t("hansey.timesWord")}`,
              color: DEPT_COLOR[p.dept],
            }))}
            empty={t("hansey.noData")}
          />
        </ChartCard>
      )}
    </div>
  );
}
