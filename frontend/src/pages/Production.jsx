import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, Pencil, Save,
  Target, Users, ClipboardList, Clock, Gauge, Boxes, CalendarDays, Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";

// ── helpers ────────────────────────────────────────────────────────────────
// Timezone-safe: build/shift dates from calendar parts, never via toISOString()
// (which converts through UTC and drops a day east of Greenwich, e.g. Tashkent).
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: d });
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(0)}%`);
const ddmmyyyy = (iso) => { const [y, m, d] = iso.split("-"); return `${d}.${m}.${y}`; };

function shiftDate(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

// status colours (theme-agnostic, work on both dark & light)
const GREEN = "#22c55e", AMBER = "#eab308", RED = "#ef4444";
// completion: ≥95% good, ≥70% partial, below = behind
const vypColor = (v) => (v == null ? "var(--text-4)" : v >= 0.95 ? GREEN : v >= 0.7 ? AMBER : RED);
// load (Загруженность): >100% over-capacity, ≥80% well-loaded, else under-loaded
const loadColor = (v) => (v == null ? "var(--text-4)" : v > 1.001 ? RED : v >= 0.8 ? GREEN : "var(--brand-text)");

// per-команда identity colour — stable for a given work-center code (hash → palette),
// so the same team keeps its colour across the cards and the table regardless of order.
const WC_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899",
  "#8b5cf6", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7",
];
const wcColor = (wc) => {
  const s = String(wc ?? "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return WC_PALETTE[h % WC_PALETTE.length];
};
const hexToRgba = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

// Russian column labels, exactly as the ABC Excel ("Sheet1 ...")
const COLS = [
  { key: "sap_code", label: "Сап код", align: "left" },
  { key: "name", label: "Наименование", align: "left" },
  { key: "labor", label: "Труд.", align: "center", hint: "Трудоёмкость (сек/ед)" },
  { key: "wc", label: "Команда", align: "center" },
  { key: "people", label: "ЛЮДИ", align: "center" },
  { key: "vyp", label: "Вып %", align: "center", hint: "Факт ÷ План" },
  { key: "fact", label: "Факт", align: "center", edit: true, hint: "Поставлено (Excel «План пост»)" },
  { key: "plan", label: "ПЛАН", align: "center", edit: true, hint: "Кол-во операции" },
  { key: "actual_labor", label: "Факт труд.", align: "center", hint: "Факт × Труд. (мин) — фактическая трудоёмкость" },
  { key: "labor_total", label: "Общ. труд.", align: "center", hint: "Общая трудоёмкость (мин)" },
  { key: "minutes", label: "Минут", align: "center" },
  { key: "pareto", label: "Парето", align: "center", hint: "Доля в общей трудоёмкости" },
];

// ── thin progress bar ────────────────────────────────────────────────────────
function Bar({ value, color, height = 6, track = "var(--bg-inner)" }) {
  const w = Math.max(0, Math.min(1, value ?? 0)) * 100;
  return (
    <div className="rounded-full overflow-hidden w-full" style={{ height, background: track }}>
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color, transition: "width .35s ease" }} />
    </div>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ label, value, icon: Icon, accent, bar, barColor, primary }) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex-1 min-w-[150px]"
      style={{
        background: primary ? "var(--brand-bg)" : "var(--bg-card)",
        border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: accent || "var(--text-4)", opacity: 0.85 }} />}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent || "var(--text-1)" }}>{value}</div>
      {bar !== undefined && <div className="mt-2.5"><Bar value={bar} color={barColor || accent || "var(--brand)"} height={5} /></div>}
    </div>
  );
}

// ── completion cell (Вып %) — bar + colour ───────────────────────────────────
function VypCell({ value }) {
  if (value == null) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const c = vypColor(value);
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-10 hidden sm:block"><Bar value={value} color={c} height={4} /></div>
      <span className="tabular-nums font-semibold" style={{ color: c, minWidth: 46, textAlign: "right" }}>{pct(value)}</span>
    </div>
  );
}

// ── editable qty cell (Факт / ПЛАН) ─────────────────────────────────────────
function QtyCell({ value, overridden, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const start = () => { setDraft(value === null || value === undefined ? "" : String(value)); setEditing(true); };
  const commit = () => {
    setEditing(false);
    const raw = draft.trim();
    const num = raw === "" ? null : Number(raw.replace(",", "."));
    if (raw !== "" && Number.isNaN(num)) return;
    if (num !== (value ?? null)) onSave(num);
  };
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-16 text-right text-xs px-1.5 py-0.5 rounded-md outline-none tabular-nums"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--brand)", color: "var(--text-1)" }}
      />
    );
  }
  return (
    <button
      onClick={start}
      className="inline-flex items-center gap-1 group tabular-nums"
      title="Изменить вручную"
      style={{ color: overridden ? "var(--brand-text)" : "var(--text-1)", fontWeight: overridden ? 700 : 400 }}
    >
      {fmt(value, 0)}
      {overridden && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
      <Pencil size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ── section header strip ─────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />}
        {title}
      </div>
      {right}
    </div>
  );
}

// ── reconciliation panel (manual) ───────────────────────────────────────────
const RECON_FIELDS = [
  { key: "po_shtatke_fact", label: "По штатке Факт" },
  { key: "brigadir", label: "Бригадир" },
  { key: "lider", label: "Лидер" },
  { key: "mitsu", label: "Мицу" },
  { key: "otdihaet", label: "Отдихает" },
];

function ReconciliationCard({ data, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({ ...data }));
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v === "" ? null : Number(v) }));
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          Сколько должна на штатке
        </span>
        <button
          onClick={() => onSave(draft)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity"
          style={{ background: "var(--brand)", color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          <Save size={12} /> Сохранить
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {RECON_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 rounded-lg"
            style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            <span>{f.label}</span>
            <input
              type="number"
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-14 text-right px-1.5 py-1 rounded-md outline-none tabular-nums"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── raw SAP file view (Фаза / Заголовок) ─────────────────────────────────────
function RawView({ fileType, date, managerParam }) {
  const { data, isLoading } = useQuery({
    queryKey: ["production-raw", fileType, date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/raw", { params: { file_type: fileType, date, ...managerParam } }).then((r) => r.data),
  });
  if (isLoading) return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonTable rows={8} cols={6} />
    </div>
  );
  if (!data?.present) {
    return (
      <div className="rounded-2xl p-8 text-center text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
        Файл «{fileType === "faza" ? "фаза" : "заголовок"}» не загружен за эту дату.
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
        <span className="font-semibold truncate" style={{ color: "var(--text-2)" }}>{data.filename || "—"}</span>
        <span className="flex-shrink-0">{data.row_count} строк{data.uploaded_at ? " · " + new Date(data.uploaded_at).toLocaleString("ru-RU") : ""}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs whitespace-nowrap" style={{ color: "var(--text-1)" }}>
          <thead>
            <tr style={{ color: "var(--text-3)", background: "var(--bg-inner)" }}>
              {data.columns.map((c, i) => (
                <th key={i} className="px-3 py-2 font-medium text-left">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r, ri) => (
              <tr key={ri} className="transition-colors hover:bg-[var(--bg-inner)]" style={{ borderTop: "1px solid var(--border)" }}>
                {r.map((cell, ci) => {
                  const num = typeof cell === "number";
                  return (
                    <td key={ci} className={`px-3 py-1.5 ${num ? "text-right tabular-nums" : "text-left"}`} style={ci === 0 ? { color: "var(--text-3)" } : undefined}>
                      {cell === null || cell === undefined || cell === "" ? "—" : String(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Production() {
  const { auth } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [view, setView] = useState("zagruzka"); // zagruzka | faza | zaga
  const [unknownOpen, setUnknownOpen] = useState(false);

  // Admins preview the pilot brigadir (manager 5) until a picker lands.
  const managerParam = auth?.role === "admin" ? { manager_id: 5 } : {};

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["production", date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dashboard", { params: { date, ...managerParam } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const override = useMutation({
    mutationFn: (body) => api.post("/api/production/override", body, { params: managerParam }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["production", date] });
      qc.invalidateQueries({ queryKey: ["production-dates"] });
    },
  });
  const recon = useMutation({
    mutationFn: (payload) => api.post("/api/production/reconciliation", { date, data: payload }, { params: managerParam }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production", date] }),
  });

  // Dates that actually have an uploaded snapshot — drives the switcher.
  const { data: datesData } = useQuery({
    queryKey: ["production-dates", managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dates", { params: managerParam }).then((r) => r.data),
  });
  const availableDates = datesData?.dates ?? [];

  const rows = data?.rows ?? [];
  const wcs = data?.work_centers ?? [];
  const totals = data?.totals ?? {};
  const unknown = data?.unknown_skus ?? [];
  const missingLabor = data?.missing_labor_count ?? 0;
  // Catalog SKU → work centers it's configured on. Lets us tell a true
  // "missing SKU" apart from a work-center mismatch (same SKU, different участок).
  const catalogWcsBySku = rows.reduce((m, r) => {
    (m[r.sap_code] ||= []).push(r.work_center);
    return m;
  }, {});
  const maxPareto = Math.max(0.0001, ...rows.map((r) => r.pareto || 0));
  // Catalog is present but no SAP «фаза» upload exists for this date → all zeros.
  const noSapData = !isLoading && rows.length > 0 &&
    (totals.total_plan_labor || 0) === 0 && (totals.total_actual_labor || 0) === 0;

  const saveOverride = (row, field) => (value) =>
    override.mutate({ date, sap_code: row.sap_code, work_center: row.work_center, field, value });

  const isToday = date === todayISO();

  return (
    <Layout title={`Производство${data?.manager_name ? " — " + data.manager_name : ""}`} showFilters={false}>
      {/* date navigation */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="inline-flex items-center rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <button onClick={() => setDate((d) => shiftDate(d, -1))} className="p-2 transition-colors hover:bg-[var(--bg-inner)]"
            style={{ background: "var(--bg-card)", color: "var(--text-2)" }} aria-label="Предыдущий день">
            <ChevronLeft size={16} />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-sm tabular-nums outline-none"
            style={{ background: "var(--bg-card)", color: "var(--text-1)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)" }} />
          <button onClick={() => setDate((d) => shiftDate(d, 1))} className="p-2 transition-colors hover:bg-[var(--bg-inner)]"
            style={{ background: "var(--bg-card)", color: "var(--text-2)" }} aria-label="Следующий день">
            <ChevronRight size={16} />
          </button>
        </div>
        {!isToday && (
          <button onClick={() => setDate(todayISO())} className="px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-[var(--bg-accent)]"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            Сегодня
          </button>
        )}

        {/* switcher — jump to a date that has uploaded data */}
        {availableDates.length > 0 && (
          <div className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <CalendarDays size={14} style={{ color: "var(--brand-text)" }} />
            <select
              value={availableDates.includes(date) ? date : ""}
              onChange={(e) => { if (e.target.value) setDate(e.target.value); }}
              className="text-sm bg-transparent outline-none cursor-pointer"
              style={{ color: availableDates.includes(date) ? "var(--text-1)" : "var(--text-3)" }}
              title="Даты с загруженными данными"
            >
              <option value="">Загруженные даты ({availableDates.length})</option>
              {availableDates.map((d) => (
                <option key={d} value={d}>{ddmmyyyy(d)}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* view switcher: computed dashboard / raw фаза / raw заголовок */}
      <div className="flex gap-1 mb-4 p-1 rounded-xl w-fit" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        {[["zagruzka", "Загрузка"], ["faza", "Фаза"], ["zaga", "Заголовок"]].map(([id, label]) => (
          <button key={id} onClick={() => setView(id)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={view === id ? { background: "var(--brand)", color: "#fff" } : { background: "transparent", color: "var(--text-3)" }}>
            {label}
          </button>
        ))}
      </div>

      {view !== "zagruzka" && (
        <RawView fileType={view} date={date} managerParam={managerParam} />
      )}

      {view === "zagruzka" && (<>
      {isError && (
        <div className="rounded-2xl p-4 text-sm" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || "Ошибка загрузки"}
        </div>
      )}

      {noSapData && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 mb-4 text-xs"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
          <AlertTriangle size={14} />
          За эту дату нет загрузки SAP «фаза». Загрузите файл через Админ → Производство, затем выберите ту же дату.
        </div>
      )}

      {/* KPI row */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Kpi label="Вып %" value={pct(totals.completion)} icon={Target} accent={vypColor(totals.completion)}
          bar={totals.completion} barColor={vypColor(totals.completion)} primary />
        <Kpi label="Людей (Σ)" value={fmt(totals.total_people, 0)} icon={Users} />
        <Kpi label="Общ. труд. (мин)" value={fmt(totals.total_plan_labor, 0)} icon={Clock} />
        <Kpi label="Общ. труд. Факт (мин)" value={fmt(totals.total_actual_labor, 0)} icon={ClipboardList} />
        <Kpi label="Ср. загруженность" value={pct(totals.avg_load)} icon={Gauge} accent={loadColor(totals.avg_load)}
          bar={totals.avg_load} barColor={loadColor(totals.avg_load)} />
      </div>

      {/* warnings */}
      {(missingLabor > 0 || unknown.length > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          {missingLabor > 0 && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#a16207" }}>
              <AlertTriangle size={14} /> {missingLabor} позиций без трудоёмкости — строки помечены.
            </div>
          )}
          {unknown.length > 0 && (
            <div className="rounded-xl px-3 py-2 text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#b91c1c" }}>
              <button type="button" onClick={() => setUnknownOpen((o) => !o)}
                className="flex items-center gap-2 font-medium w-full text-left">
                <AlertTriangle size={14} />
                <span>{unknown.length} SKU из загрузки нет в каталоге (admin)</span>
                {unknownOpen ? <ChevronDown size={14} className="ml-auto opacity-70" />
                  : <ChevronRight size={14} className="ml-auto opacity-70" />}
              </button>
              {unknownOpen && (
              <div className="flex flex-col gap-1 mt-2">
                {unknown.map((u) => {
                  const otherWcs = (catalogWcsBySku[u.sap_code] || []).filter((w) => w !== u.work_center);
                  return (
                    <div key={`${u.sap_code}-${u.work_center}`} className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>{u.sap_code}</span>
                      <span style={{ opacity: 0.7 }}>участок</span>
                      <span className="font-mono px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}>{u.work_center}</span>
                      {otherWcs.length > 0 ? (
                        <span style={{ opacity: 0.85 }}>— в каталоге есть на участке {otherWcs.join(", ")} (не совпадает участок)</span>
                      ) : (
                        <span style={{ opacity: 0.85 }}>— этого SKU нет в каталоге</span>
                      )}
                    </div>
                  );
                })}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* staffing panel — work-center cards with load bars */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Users} title="Команды" right={
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{wcs.length} участк.</span>
        } />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3">
          {wcs.map((w) => {
            const c = loadColor(w.load);
            const wc = wcColor(w.work_center);
            return (
              <div key={w.work_center} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", borderLeft: `4px solid ${wc}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-bold px-2 py-0.5 rounded-md" style={{ background: hexToRgba(wc, 0.16), color: wc, border: `1px solid ${hexToRgba(wc, 0.3)}` }}>{w.work_center}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: c }}>{pct(w.load)}</span>
                </div>
                <Bar value={w.load} color={c} height={6} track="var(--bg-card)" />
                <div className="flex items-center justify-between mt-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span>O.SONI <b style={{ color: "var(--text-2)" }}>{fmt(w.people, 0)}</b> · Штатка <b style={{ color: "var(--text-2)" }}>{fmt(w.shtatka, 0)}</b></span>
                  <span className="tabular-nums">{fmt(w.total_labor, 0)} мин</span>
                </div>
              </div>
            );
          })}
          {wcs.length === 0 && (
            <div className="col-span-full text-center py-6 text-sm" style={{ color: "var(--text-4)" }}>Нет участков</div>
          )}
        </div>
      </div>

      {/* main table */}
      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Boxes} title="Позиции" right={
          <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{rows.length} SKU</span>
        } />
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs whitespace-nowrap [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)]" style={{ color: "var(--text-1)" }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {COLS.map((c) => (
                  <th key={c.key} title={c.hint}
                    className={`sticky top-0 z-10 px-3 py-2.5 font-semibold ${c.align === "center" ? "text-center" : c.align === "right" ? "text-right" : "text-left"}`}
                    style={{ background: "var(--bg-inner)" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                  {COLS.map((c, j) => (
                    <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={COLS.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>Нет данных за эту дату</td></tr>
              )}
              {rows.map((r, i) => {
                const vyp = r.total_labor ? r.actual_labor / r.total_labor : null;
                const wc = wcColor(r.work_center);
                return (
                  <tr key={`${r.sap_code}-${r.work_center}-${i}`}
                    className="transition-colors hover:bg-[var(--bg-inner)]"
                    style={{ borderTop: "1px solid var(--border)", borderLeft: `2px solid ${r.has_labor ? "transparent" : AMBER}` }}>
                    <td className="px-3 py-2 text-left font-mono" style={{ color: "var(--text-3)" }}>{r.sap_code}</td>
                    <td className="px-3 py-2 text-left max-w-[220px] truncate" title={r.name}>{r.name}</td>
                    <td className="px-3 py-2 text-center tabular-nums">
                      {r.has_labor ? fmt(r.labor_time, 2)
                        : <span className="inline-flex items-center gap-1" style={{ color: "#a16207" }}><AlertTriangle size={11} />—</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded" style={{ background: hexToRgba(wc, 0.14), color: wc, border: `1px solid ${hexToRgba(wc, 0.28)}` }}>{r.work_center}</span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.people, 0)}</td>
                    <td className="px-3 py-2 text-center"><VypCell value={vyp} /></td>
                    <td className="px-3 py-2 text-center">
                      <QtyCell value={r.actual_qty} overridden={r.actual_overridden} onSave={saveOverride(r, "actual")} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <QtyCell value={r.plan_qty} overridden={r.plan_overridden} onSave={saveOverride(r, "plan")} />
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums">{fmt(r.actual_labor, 1)}</td>
                    <td className="px-3 py-2 text-center tabular-nums font-medium">{fmt(r.total_labor, 1)}</td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{fmt(r.minutes, 1)}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-8 hidden sm:block"><Bar value={(r.pareto || 0) / maxPareto} color="var(--brand)" height={4} /></div>
                        <span className="tabular-nums" style={{ color: "var(--text-3)", minWidth: 34, textAlign: "right" }}>{pct(r.pareto)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* reconciliation */}
      <ReconciliationCard data={data?.reconciliation ?? {}} onSave={(d) => recon.mutate(d)} saving={recon.isPending} />
      </>)}
    </Layout>
  );
}
