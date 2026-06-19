import { useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, AlertTriangle, Pencil, Save } from "lucide-react";
import Layout from "../components/layout/Layout";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";

// ── helpers ────────────────────────────────────────────────────────────────
const todayISO = () => new Date().toISOString().slice(0, 10);

const fmt = (v, d = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: d });
const pct = (v) => (v === null || v === undefined || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(1)}%`);

function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Russian column labels, exactly as the ABC Excel ("Sheet1 ...")
const COLS = [
  { key: "sap_code", label: "Сап код", align: "left" },
  { key: "name", label: "Наименование", align: "left" },
  { key: "labor", label: "Труд.", align: "right", hint: "Трудоёмкость (сек/ед)" },
  { key: "wc", label: "Команда", align: "left" },
  { key: "people", label: "ЛЮДИ", align: "right" },
  { key: "vyp", label: "Вып %", align: "right" },
  { key: "fact", label: "Факт", align: "right", edit: true },
  { key: "plan", label: "ПЛАН", align: "right", edit: true },
  { key: "labor_total", label: "Общ. труд.", align: "right", hint: "Общая трудоёмкость (мин)" },
  { key: "minutes", label: "Минут", align: "right" },
  { key: "pareto", label: "Парето", align: "right" },
];

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
        className="w-16 text-right text-xs px-1 py-0.5 rounded outline-none"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--brand)", color: "var(--text-1)" }}
      />
    );
  }
  return (
    <button
      onClick={start}
      className="inline-flex items-center gap-1 group"
      title="Изменить вручную"
      style={{ color: overridden ? "var(--brand-text)" : "var(--text-1)", fontWeight: overridden ? 700 : 400 }}
    >
      {fmt(value, 0)}
      {overridden && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand)" }} />}
      <Pencil size={10} className="opacity-0 group-hover:opacity-60" />
    </button>
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
    <div className="rounded-xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
          Сколько должна на штатке
        </span>
        <button
          onClick={() => onSave(draft)}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
          style={{ background: "var(--brand)", color: "#fff", opacity: saving ? 0.6 : 1 }}
        >
          <Save size={12} /> Сохранить
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {RECON_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center justify-between gap-2 text-xs" style={{ color: "var(--text-2)" }}>
            <span>{f.label}</span>
            <input
              type="number"
              value={draft[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              className="w-16 text-right px-1.5 py-1 rounded outline-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function Kpi({ label, value, accent }) {
  return (
    <div className="rounded-xl px-4 py-3 flex-1 min-w-[120px]" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-lg font-bold" style={{ color: accent || "var(--text-1)" }}>{value}</div>
    </div>
  );
}

// ── main page ────────────────────────────────────────────────────────────────
export default function Production() {
  const { auth } = useAuth();
  const { t } = useLang();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());

  // Admins preview the pilot brigadir (manager 5) until a picker lands.
  const managerParam = auth?.role === "admin" ? { manager_id: 5 } : {};

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["production", date, managerParam.manager_id ?? "self"],
    queryFn: () => api.get("/api/production/dashboard", { params: { date, ...managerParam } }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  const override = useMutation({
    mutationFn: (body) => api.post("/api/production/override", body, { params: managerParam }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production", date] }),
  });
  const recon = useMutation({
    mutationFn: (payload) => api.post("/api/production/reconciliation", { date, data: payload }, { params: managerParam }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["production", date] }),
  });

  const rows = data?.rows ?? [];
  const wcs = data?.work_centers ?? [];
  const totals = data?.totals ?? {};
  const unknown = data?.unknown_skus ?? [];
  const missingLabor = data?.missing_labor_count ?? 0;

  const saveOverride = (row, field) => (value) =>
    override.mutate({ date, sap_code: row.sap_code, work_center: row.work_center, field, value });

  return (
    <Layout title={`Производство${data?.manager_name ? " — " + data.manager_name : ""}`} showFilters={false}>
      {/* date navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => setDate((d) => shiftDate(d, -1))} className="p-1.5 rounded-lg"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <ChevronLeft size={16} />
        </button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
        <button onClick={() => setDate((d) => shiftDate(d, 1))} className="p-1.5 rounded-lg"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <ChevronRight size={16} />
        </button>
        {date !== todayISO() && (
          <button onClick={() => setDate(todayISO())} className="px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
            Сегодня
          </button>
        )}
      </div>

      {isError && (
        <div className="rounded-xl p-4 text-sm" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || "Ошибка загрузки"}
        </div>
      )}

      {/* KPI row */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Kpi label="Вып %" value={pct(totals.completion)} accent="var(--brand-text)" />
        <Kpi label="Людей (Σ)" value={fmt(totals.total_people, 0)} />
        <Kpi label="Штатка (Σ)" value={fmt(totals.total_shtatka, 0)} />
        <Kpi label="Общ. труд. (мин)" value={fmt(totals.total_plan_labor, 0)} />
        <Kpi label="Ср. загруженность" value={pct(totals.avg_load)} />
      </div>

      {/* warnings */}
      {(missingLabor > 0 || unknown.length > 0) && (
        <div className="flex flex-col gap-2 mb-4">
          {missingLabor > 0 && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", color: "#a16207" }}>
              <AlertTriangle size={14} /> {missingLabor} позиций без трудоёмкости — строки помечены.
            </div>
          )}
          {unknown.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#b91c1c" }}>
              <AlertTriangle size={14} /> {unknown.length} SKU из загрузки нет в каталоге (admin).
            </div>
          )}
        </div>
      )}

      {/* staffing panel */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
          Команды
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: "var(--text-1)" }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {["Команда", "O. SONI", "Штатка", "Загруженность", "Общ. труд."].map((h, i) => (
                  <th key={h} className={`px-4 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wcs.map((w) => (
                <tr key={w.work_center} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-2 text-left font-semibold">{w.work_center}</td>
                  <td className="px-4 py-2 text-right">{fmt(w.people, 0)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: "var(--text-3)" }}>{fmt(w.shtatka, 0)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: w.load > 1 ? "#ef4444" : "var(--text-1)" }}>{pct(w.load)}</td>
                  <td className="px-4 py-2 text-right" style={{ color: "var(--text-3)" }}>{fmt(w.total_labor, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* main table */}
      <div className="rounded-xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs whitespace-nowrap" style={{ color: "var(--text-1)" }}>
            <thead>
              <tr style={{ color: "var(--text-3)" }}>
                {COLS.map((c) => (
                  <th key={c.key} title={c.hint} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                    style={{ borderBottom: "1px solid var(--border)" }}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={COLS.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>Загрузка…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={COLS.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>Нет данных за эту дату</td></tr>
              )}
              {rows.map((r, i) => {
                const vyp = r.total_labor ? r.actual_labor / r.total_labor : null;
                return (
                  <tr key={`${r.sap_code}-${r.work_center}-${i}`} style={{ borderTop: "1px solid var(--border)", background: !r.has_labor ? "rgba(234,179,8,0.07)" : undefined }}>
                    <td className="px-3 py-1.5 text-left" style={{ color: "var(--text-3)" }}>{r.sap_code}</td>
                    <td className="px-3 py-1.5 text-left max-w-[220px] truncate" title={r.name}>{r.name}</td>
                    <td className="px-3 py-1.5 text-right">
                      {r.has_labor ? fmt(r.labor_time, 2)
                        : <span className="inline-flex items-center gap-1" style={{ color: "#a16207" }}><AlertTriangle size={11} />—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-left" style={{ color: "var(--text-3)" }}>{r.work_center}</td>
                    <td className="px-3 py-1.5 text-right">{fmt(r.people, 0)}</td>
                    <td className="px-3 py-1.5 text-right">{pct(vyp)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <QtyCell value={r.actual_qty} overridden={r.actual_overridden} onSave={saveOverride(r, "actual")} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <QtyCell value={r.plan_qty} overridden={r.plan_overridden} onSave={saveOverride(r, "plan")} />
                    </td>
                    <td className="px-3 py-1.5 text-right">{fmt(r.total_labor, 1)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: "var(--text-3)" }}>{fmt(r.minutes, 1)}</td>
                    <td className="px-3 py-1.5 text-right" style={{ color: "var(--text-3)" }}>{pct(r.pareto)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* reconciliation */}
      <ReconciliationCard data={data?.reconciliation ?? {}} onSave={(d) => recon.mutate(d)} saving={recon.isPending} />
    </Layout>
  );
}
