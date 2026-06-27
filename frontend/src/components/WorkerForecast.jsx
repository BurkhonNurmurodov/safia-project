import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarRange, ChevronLeft, ChevronRight, X, Sparkles,
  TrendingUp, TrendingDown, Check, AlertTriangle, History,
} from "lucide-react";
import api from "../utils/api";
import { SkeletonBlock } from "./ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

// ── localized copy (kept local, mirroring WorkerStats.jsx / Trudoyomkost.jsx) ──
const WD = {
  uz:      { s: ["Du","Se","Cho","Pay","Ju","Sha","Yak"],   f: ["Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba","Yakshanba"] },
  uz_cyrl: { s: ["Ду","Се","Чо","Пай","Жу","Ша","Як"],       f: ["Душанба","Сешанба","Чоршанба","Пайшанба","Жума","Шанба","Якшанба"] },
  ru:      { s: ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"],        f: ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"] },
  en:      { s: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], f: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
};

const T = {
  uz: {
    title: "Bashorat — smenaga chaqirish", thisWeek: "Shu hafta", supervisor: "Brigadir",
    workers: "ishchi", forecast: "Bashorat", actual: "Haqiqiy", band: "Oraliq", conf: "Ishonch",
    high: "Yuqori", medium: "O'rta", low: "Past", insufficient: "Yetarli emas",
    maNote: (w) => `${w} haftalik siljuvchi o'rtacha`, basedOn: (n, w) => `${n}/${w} hafta bo'yicha`,
    history: "Ishlatilgan tarix", delta: "Bashoratdan farq", withinBand: "Oraliqda",
    outOfBand: "Oraliqdan tashqarida", noHistory: "Tarix yo'q", noData: "Ma'lumot yo'q",
    legend: "Ishonch", tapHint: "Tafsilot uchun katakni bosing", na: "—", forecastTag: "bashorat",
  },
  uz_cyrl: {
    title: "Башорат — сменага чақириш", thisWeek: "Шу ҳафта", supervisor: "Бригадир",
    workers: "ишчи", forecast: "Башорат", actual: "Ҳақиқий", band: "Оралиқ", conf: "Ишонч",
    high: "Юқори", medium: "Ўрта", low: "Паст", insufficient: "Етарли эмас",
    maNote: (w) => `${w} ҳафталик силжувчи ўртача`, basedOn: (n, w) => `${n}/${w} ҳафта бўйича`,
    history: "Ишлатилган тарих", delta: "Башоратдан фарқ", withinBand: "Оралиқда",
    outOfBand: "Оралиқдан ташқарида", noHistory: "Тарих йўқ", noData: "Маълумот йўқ",
    legend: "Ишонч", tapHint: "Тафсилот учун катакни босинг", na: "—", forecastTag: "башорат",
  },
  ru: {
    title: "Прогноз — вызов на смену", thisWeek: "Эта неделя", supervisor: "Бригадир",
    workers: "раб.", forecast: "Прогноз", actual: "Факт", band: "Диапазон", conf: "Надёжность",
    high: "Высокая", medium: "Средняя", low: "Низкая", insufficient: "Недостаточно",
    maNote: (w) => `Скользящее среднее за ${w} нед.`, basedOn: (n, w) => `по ${n}/${w} нед.`,
    history: "Использованная история", delta: "Δ к прогнозу", withinBand: "В диапазоне",
    outOfBand: "Вне диапазона", noHistory: "Нет истории", noData: "Нет данных",
    legend: "Надёжность", tapHint: "Нажмите ячейку для деталей", na: "—", forecastTag: "прогноз",
  },
  en: {
    title: "Forecast — workers to call", thisWeek: "This week", supervisor: "Brigadir",
    workers: "workers", forecast: "Forecast", actual: "Actual", band: "Range", conf: "Confidence",
    high: "High", medium: "Medium", low: "Low", insufficient: "Insufficient",
    maNote: (w) => `${w}-week moving average`, basedOn: (n, w) => `based on ${n}/${w} weeks`,
    history: "History used", delta: "Δ vs forecast", withinBand: "within range",
    outOfBand: "outside range", noHistory: "No history", noData: "No data",
    legend: "Confidence", tapHint: "Tap a cell for details", na: "—", forecastTag: "forecast",
  },
};

// confidence → solid fill (mirrors the fleet heatmap: saturated bg + auto-contrast text)
// traffic-light red/yellow/green — deliberately NOT the brand gold
const CONF_BG = { high: "#22c55e", medium: "#eab308", low: "#ef4444" };

/** Pick black or white text so it's legible on any solid hex background. */
function contrastText(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.52 ? "#111827" : "#ffffff";
}

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const mondayOfISO = (iso) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // Mon=0 … Sun=6
  return isoOf(d);
};
const addDaysISO = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
const ddmm = (iso) => { const [, m, d] = iso.split("-"); return `${d}.${m}`; };

function Chip({ conf, t }) {
  const c = CONF_BG[conf] || "var(--text-4)";
  const label = { high: t.high, medium: t.medium, low: t.low, insufficient: t.insufficient }[conf] || conf;
  const solid = typeof c === "string" && c.startsWith("#");
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: solid ? c + "22" : "var(--bg-inner)", color: c, border: `1px solid ${solid ? c + "55" : "var(--border)"}` }}>
      {label}
    </span>
  );
}

// ── prediction-vs-actual modal ────────────────────────────────────────────────
function CellModal({ cell, supName, wdFull, t, tl, weeks, onClose }) {
  const f = cell.forecast;
  const a = cell.actual;
  const delta = (a != null && f != null) ? a - f : null;
  const within = (a != null && cell.band_lo != null && cell.band_hi != null)
    ? a >= cell.band_lo && a <= cell.band_hi : null;
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }} onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm shadow-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>
              {tl(supName)} · {wdFull} · {ddmm(cell.date)}
            </div>
            <div className="font-bold text-sm flex items-center gap-1.5" style={{ color: "var(--text-1)" }}>
              <Sparkles size={14} style={{ color: "var(--brand-text)" }} /> {t.title}
            </div>
          </div>
          <button onClick={onClose} className="p-1 mt-0.5 rounded-lg transition-colors hover:bg-white/10" style={{ color: "var(--text-3)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* forecast block */}
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t.forecast}</div>
              <div className="text-3xl font-bold tabular-nums leading-none mt-0.5" style={{ color: "var(--brand-text)" }}>
                {f != null ? f : t.na}<span className="text-sm font-normal" style={{ color: "var(--text-4)" }}> {t.workers}</span>
              </div>
            </div>
            <Chip conf={cell.confidence} t={t} />
          </div>
          <div className="flex items-center justify-between text-[12px]" style={{ color: "var(--text-3)" }}>
            <span>{t.band}: <b style={{ color: "var(--text-2)" }}>{cell.band_lo != null ? `${cell.band_lo}–${cell.band_hi}` : t.na}</b></span>
            <span>{t.basedOn(cell.n, weeks)}</span>
          </div>

          {/* actual comparison, when the day is already loaded */}
          {a != null && (
            <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t.actual}</div>
                  <div className="text-xl font-bold tabular-nums leading-none mt-0.5" style={{ color: "var(--text-1)" }}>
                    {a}<span className="text-xs font-normal" style={{ color: "var(--text-4)" }}> {t.workers}</span>
                  </div>
                </div>
                {delta != null && (
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t.delta}</div>
                    <div className="text-sm font-bold tabular-nums flex items-center gap-1 justify-end"
                      style={{ color: delta === 0 ? "var(--text-2)" : delta > 0 ? "#ef4444" : "#22c55e" }}>
                      {delta > 0 ? <TrendingUp size={14} /> : delta < 0 ? <TrendingDown size={14} /> : null}
                      {delta > 0 ? "+" : ""}{delta}
                    </div>
                  </div>
                )}
              </div>
              {within != null && (
                <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded"
                  style={{ color: within ? "#22c55e" : "#ef4444", background: (within ? "#22c55e" : "#ef4444") + "1f" }}>
                  {within ? <Check size={12} /> : <AlertTriangle size={12} />}
                  {within ? t.withinBand : t.outOfBand}
                </div>
              )}
            </div>
          )}

          {/* history that fed the moving average */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold mb-1 flex items-center gap-1" style={{ color: "var(--text-4)" }}>
              <History size={12} /> {t.history}
            </div>
            {cell.samples?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {cell.samples.map((s) => (
                  <span key={s.date} className="text-[11px] tabular-nums px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                    {ddmm(s.date)}: <b>{s.workers}</b>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{t.noHistory}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkerForecast() {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { brigadirIds, shift, ready } = useFilters();
  const t = T[lang] || T.uz;
  const wd = WD[lang] || WD.uz;

  const [weekStart, setWeekStart] = useState(() => mondayOfISO(todayISO()));
  const [modalCell, setModalCell] = useState(null);
  const curWeek = mondayOfISO(todayISO());
  const today = todayISO();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["trud-forecast", weekStart, brigadirIds, shift],
    enabled: ready && !!weekStart,
    queryFn: () => api.get("/api/production/trudoyomkost/forecast", {
      params: { week_start: weekStart, manager_id: brigadirIds, shift },
    }).then((r) => r.data),
  });

  const supervisors = data?.supervisors ?? [];
  const weeks = data?.weeks ?? 3;
  const weekDates = data?.week?.dates ?? [];

  // index cells by manager_id → weekday
  const bySup = useMemo(() => {
    const m = {};
    (data?.cells ?? []).forEach((c) => { (m[c.manager_id] ||= {})[c.weekday] = c; });
    return m;
  }, [data]);

  if (!ready) return null;

  const Header = (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <CalendarRange size={14} style={{ color: "var(--brand-text)" }} /> {t.title}
        <span className="normal-case font-normal" style={{ color: "var(--text-4)" }}>· {t.maNote(weeks)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {weekStart !== curWeek && (
          <button onClick={() => setWeekStart(curWeek)}
            className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
            {t.thisWeek}
          </button>
        )}
        <button onClick={() => setWeekStart((w) => addDaysISO(w, -7))}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs font-semibold tabular-nums px-1.5 min-w-[96px] text-center" style={{ color: "var(--text-1)" }}>
          {weekDates.length ? `${ddmm(weekDates[0])} – ${ddmm(weekDates[6])}` : `${ddmm(weekStart)} – ${ddmm(addDaysISO(weekStart, 6))}`}
        </span>
        <button onClick={() => setWeekStart((w) => addDaysISO(w, 7))}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--brand-border)" }}>
      {Header}

      {isLoading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full" />)}
        </div>
      ) : isError || !supervisors.length ? (
        <div className="p-10 text-center text-sm" style={{ color: "var(--text-4)" }}>{t.noData}</div>
      ) : (
        <>
          <div className="overflow-x-auto p-3">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: 640 }}>
              <thead>
                <tr style={{ background: "var(--brand)", color: "#fff" }}>
                  <th className="text-left px-3 py-1.5 font-semibold sticky left-0" style={{ background: "var(--brand)", zIndex: 1 }}>{t.supervisor}</th>
                  {wd.s.map((s, i) => {
                    const isToday = weekDates[i] === today;
                    return (
                      <th key={i} className="px-2 py-1.5 font-semibold text-center" style={isToday ? { background: "rgba(255,255,255,.16)" } : undefined}>
                        <div>{s}</div>
                        <div className="text-[9px] font-normal opacity-75 tabular-nums">{weekDates[i] ? ddmm(weekDates[i]) : ""}</div>
                        {isToday && <span style={{ display: "block", height: 2, borderRadius: 1, background: "#fff", marginTop: 3 }} />}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {supervisors.map((sup) => (
                  <tr key={sup.id}>
                    <td className="text-left px-3 py-1.5 whitespace-nowrap sticky left-0" style={{ color: "var(--text-2)", background: "var(--bg-card)", borderBottom: "1px solid var(--border)", borderRight: "2px solid var(--border-md)" }}>
                      {tl(sup.name)}
                    </td>
                    {Array.from({ length: 7 }, (_, w) => {
                      const c = bySup[sup.id]?.[w];
                      const val = c ? (c.actual != null ? c.actual : c.forecast) : null;
                      const conf = c?.confidence;
                      const hasVal = val != null;
                      const isActual = c?.actual != null;
                      // Only forecast cells carry the confidence fill — loaded/actual
                      // days stay neutral (the value is known, not a prediction).
                      const fill = isActual ? null : CONF_BG[conf];
                      const clickable = c && (c.forecast != null || c.actual != null);
                      const isToday = weekDates[w] === today;
                      return (
                        <td key={w} onClick={() => clickable && setModalCell({ ...c, supName: sup.name, wdFull: (WD[lang] || WD.uz).f[w] })}
                          title={isActual ? t.actual : (hasVal ? t.forecastTag : t.noData)}
                          style={{
                            textAlign: "center", padding: 0, height: 34,
                            border: "1px solid var(--border)",
                            background: fill || (isActual ? "var(--bg-card)" : "var(--bg-inner)"),
                            color: fill ? contrastText(fill) : isActual ? "var(--text-1)" : "var(--text-4)",
                            fontWeight: hasVal ? 700 : 400,
                            cursor: clickable ? "pointer" : "default",
                            position: "relative",
                          }}>
                          {hasVal ? val : <span style={{ opacity: 0.4 }}>{t.na}</span>}
                          {isActual && (
                            <span style={{ position: "absolute", top: 2, right: 3, width: 5, height: 5, borderRadius: "50%",
                              background: "var(--text-3)", opacity: 0.85 }} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* legend + actual marker hint */}
          <div className="flex items-center gap-3 px-4 py-2.5 flex-wrap text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-4)" }}>
            <span className="font-semibold uppercase tracking-wider">{t.legend}:</span>
            {["high", "medium", "low"].map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span style={{ width: 11, height: 11, borderRadius: 3, background: CONF_BG[k], display: "inline-block" }} />
                {t[k]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <span style={{ width: 11, height: 11, borderRadius: 3, background: "var(--bg-inner)", border: "1px solid var(--border)", display: "inline-block" }} />
              {t.insufficient}
            </span>
            <span className="inline-flex items-center gap-1 ml-2">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)", display: "inline-block" }} />
              {t.actual}
            </span>
            <span className="ml-auto italic">{t.tapHint}</span>
          </div>
        </>
      )}

      {modalCell && (
        <CellModal cell={modalCell} supName={modalCell.supName} wdFull={modalCell.wdFull}
          t={t} tl={tl} weeks={weeks} onClose={() => setModalCell(null)} />
      )}
    </div>
  );
}
