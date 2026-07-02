import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarRange, CalendarDays, ChevronLeft, ChevronRight, X, Sparkles,
  TrendingUp, TrendingDown, Check, AlertTriangle, History,
  Target, Award,
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
    accTitle: "Bashorat aniqligi", cardDelta: "Bashorat va haqiqiy (jami)",
    cardBiggest: "Eng katta farq · brigadir", cardOut: "Oraliqdan tashqarida",
    netW: "sof", cardOutSub: "brigadir oraliqdan tashqarida",
    pickDateHint: "Sana ustunini bosing", noCompare: "Bu kun uchun hali haqiqiy yo'q",
    allDays: "Butun hafta", pickDay: "Kun tanlash",
  },
  uz_cyrl: {
    title: "Башорат — сменага чақириш", thisWeek: "Шу ҳафта", supervisor: "Бригадир",
    workers: "ишчи", forecast: "Башорат", actual: "Ҳақиқий", band: "Оралиқ", conf: "Ишонч",
    high: "Юқори", medium: "Ўрта", low: "Паст", insufficient: "Етарли эмас",
    maNote: (w) => `${w} ҳафталик силжувчи ўртача`, basedOn: (n, w) => `${n}/${w} ҳафта бўйича`,
    history: "Ишлатилган тарих", delta: "Башоратдан фарқ", withinBand: "Оралиқда",
    outOfBand: "Оралиқдан ташқарида", noHistory: "Тарих йўқ", noData: "Маълумот йўқ",
    legend: "Ишонч", tapHint: "Тафсилот учун катакни босинг", na: "—", forecastTag: "башорат",
    accTitle: "Башорат аниқлиги", cardDelta: "Башорат ва ҳақиқий (жами)",
    cardBiggest: "Энг катта фарқ · бригадир", cardOut: "Оралиқдан ташқарида",
    netW: "соф", cardOutSub: "бригадир оралиқдан ташқарида",
    pickDateHint: "Сана устунини босинг", noCompare: "Бу кун учун ҳали ҳақиқий йўқ",
    allDays: "Бутун ҳафта", pickDay: "Кун танлаш",
  },
  ru: {
    title: "Прогноз — вызов на смену", thisWeek: "Эта неделя", supervisor: "Бригадир",
    workers: "раб.", forecast: "Прогноз", actual: "Факт", band: "Диапазон", conf: "Надёжность",
    high: "Высокая", medium: "Средняя", low: "Низкая", insufficient: "Недостаточно",
    maNote: (w) => `Скользящее среднее за ${w} нед.`, basedOn: (n, w) => `по ${n}/${w} нед.`,
    history: "Использованная история", delta: "Δ к прогнозу", withinBand: "В диапазоне",
    outOfBand: "Вне диапазона", noHistory: "Нет истории", noData: "Нет данных",
    legend: "Надёжность", tapHint: "Нажмите ячейку для деталей", na: "—", forecastTag: "прогноз",
    accTitle: "Точность прогноза", cardDelta: "Прогноз и факт (всего)",
    cardBiggest: "Макс. отклонение · бригадир", cardOut: "Вне диапазона",
    netW: "нетто", cardOutSub: "бригадиров вне диапазона",
    pickDateHint: "Нажмите столбец с датой", noCompare: "За этот день ещё нет факта",
    allDays: "Вся неделя", pickDay: "Выбрать день",
  },
  en: {
    title: "Forecast — workers to call", thisWeek: "This week", supervisor: "Brigadir",
    workers: "workers", forecast: "Forecast", actual: "Actual", band: "Range", conf: "Confidence",
    high: "High", medium: "Medium", low: "Low", insufficient: "Insufficient",
    maNote: (w) => `${w}-week moving average`, basedOn: (n, w) => `based on ${n}/${w} weeks`,
    history: "History used", delta: "Δ vs forecast", withinBand: "within range",
    outOfBand: "outside range", noHistory: "No history", noData: "No data",
    legend: "Confidence", tapHint: "Tap a cell for details", na: "—", forecastTag: "forecast",
    accTitle: "Forecast accuracy", cardDelta: "Prediction vs reality (total)",
    cardBiggest: "Biggest gap · brigadir", cardOut: "Outside range",
    netW: "net", cardOutSub: "brigadirs outside their band",
    pickDateHint: "Tap a date column", noCompare: "No actuals for this day yet",
    allDays: "Full week", pickDay: "Pick a day",
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

// ── selected-date summary card (mirrors the KPI look on the stats page) ───────
function InfoCard({ label, icon: Icon, accent, primary, value, unit, badge, badgeColor, sub, small }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{
      background: primary ? "var(--brand-bg)" : "var(--bg-card)",
      border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}`,
    }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: accent || "var(--text-4)", opacity: 0.85 }} />}
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`${small ? "text-base" : "text-2xl"} font-bold tabular-nums leading-none`}
          style={{ color: accent || "var(--text-1)" }}>
          {value}{unit && <span className="text-sm font-normal" style={{ color: "var(--text-4)" }}> {unit}</span>}
        </span>
        {badge != null && (
          <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
            style={{ color: badgeColor, background: badgeColor + "1f" }}>
            {badge}
          </span>
        )}
      </div>
      {sub && <div className="text-[11px] mt-1.5 truncate" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
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

export default function WorkerForecast({ effPct = 100 }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { brigadirIds, shift, ready } = useFilters();
  const t = T[lang] || T.uz;
  const wd = WD[lang] || WD.uz;

  const [weekStart, setWeekStart] = useState(() => mondayOfISO(todayISO()));
  const [modalCell, setModalCell] = useState(null);
  const [selWd, setSelWd] = useState(null);   // clicked date column (weekday idx); null → use default
  const [pickedDate, setPickedDate] = useState(null);   // ISO date → single-column view; null → full week
  const curWeek = mondayOfISO(todayISO());
  const today = todayISO();

  // a fresh week gets its own default selection; clearing selWd re-derives it below
  useEffect(() => { setSelWd(null); }, [weekStart]);

  // a picked date pulls in the week that contains it, so its column is loaded
  useEffect(() => {
    if (pickedDate) setWeekStart((w) => { const mon = mondayOfISO(pickedDate); return w === mon ? w : mon; });
  }, [pickedDate]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["trud-forecast", weekStart, brigadirIds, shift, effPct],
    enabled: ready && !!weekStart,
    queryFn: () => api.get("/api/production/trudoyomkost/forecast", {
      params: { week_start: weekStart, manager_id: brigadirIds, shift, capacity_pct: effPct },
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

  const hasCompare = (c) => c && c.actual != null && c.forecast != null;

  // default column = the latest weekday that already has a forecast-vs-actual
  // comparison; fall back to the latest forecast day, else Monday.
  const defaultWd = useMemo(() => {
    for (let w = 6; w >= 0; w--)
      if (supervisors.some((s) => hasCompare(bySup[s.id]?.[w]))) return w;
    for (let w = 6; w >= 0; w--)
      if (supervisors.some((s) => bySup[s.id]?.[w]?.forecast != null)) return w;
    return 0;
  }, [supervisors, bySup]);

  const activeWd = selWd ?? defaultWd;
  const activeDate = weekDates[activeWd] || addDaysISO(weekStart, activeWd);

  // aggregate the selected column across brigadirs: total gap, biggest gap-maker,
  // and how many actuals fell outside their predicted band.
  const dayStats = useMemo(() => {
    let sumF = 0, sumA = 0, sumAbs = 0, outCount = 0, bandCount = 0, count = 0, biggest = null;
    supervisors.forEach((s) => {
      const c = bySup[s.id]?.[activeWd];
      if (!hasCompare(c)) return;
      count++;
      sumF += c.forecast; sumA += c.actual;
      const d = c.actual - c.forecast;
      sumAbs += Math.abs(d);
      if (!biggest || Math.abs(d) > Math.abs(biggest.delta))
        biggest = { name: s.name, delta: d, f: c.forecast, a: c.actual };
      if (c.band_lo != null && c.band_hi != null) {
        bandCount++;
        if (c.actual < c.band_lo || c.actual > c.band_hi) outCount++;
      }
    });
    return { count, sumF, sumA, net: sumA - sumF, sumAbs, outCount, bandCount, biggest };
  }, [supervisors, bySup, activeWd]);

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

  const netColor = dayStats.net === 0 ? "var(--text-3)" : dayStats.net > 0 ? "#ef4444" : "#22c55e";
  const bigColor = dayStats.biggest == null ? "var(--text-3)" : dayStats.biggest.delta > 0 ? "#ef4444" : "#22c55e";
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

  const InfoStrip = (!isLoading && !isError && supervisors.length > 0) && (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Target size={15} style={{ color: "var(--brand-text)" }} />
        <span className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{t.accTitle}</span>
        <span className="text-xs" style={{ color: "var(--text-4)" }}>· {wd.f[activeWd]} {ddmm(activeDate)}</span>
        <span className="ml-auto text-[11px] italic" style={{ color: "var(--text-4)" }}>{t.pickDateHint}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoCard
          primary icon={Target} accent={dayStats.count ? netColor : "var(--brand-text)"} label={t.cardDelta}
          value={dayStats.count ? sign(dayStats.net) : t.na}
          unit={dayStats.count ? t.netW : null}
          badge={dayStats.count ? `${dayStats.sumAbs} |Δ|` : null} badgeColor="#C8973F"
          sub={dayStats.count ? `${t.forecast} ${dayStats.sumF} → ${t.actual} ${dayStats.sumA}` : t.noCompare}
        />
        <InfoCard
          small icon={Award} accent="#C8973F" label={t.cardBiggest}
          value={dayStats.biggest ? tl(dayStats.biggest.name) : t.na}
          badge={dayStats.biggest ? sign(dayStats.biggest.delta) : null} badgeColor={bigColor}
          sub={dayStats.biggest ? `${t.forecast} ${dayStats.biggest.f} → ${t.actual} ${dayStats.biggest.a}` : t.noCompare}
        />
        <InfoCard
          icon={AlertTriangle} label={t.cardOut}
          accent={dayStats.bandCount ? (dayStats.outCount ? "#ef4444" : "#22c55e") : undefined}
          value={dayStats.bandCount ? `${dayStats.outCount} / ${dayStats.bandCount}` : t.na}
          sub={t.cardOutSub}
        />
      </div>
    </div>
  );

  return (
    <div className="mb-4">
      {InfoStrip}
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--brand-border)" }}>
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
                    const active = i === activeWd;
                    return (
                      <th key={i} onClick={() => setSelWd(i)} title={t.pickDateHint}
                        className="px-2 py-1.5 font-semibold text-center select-none"
                        style={{ cursor: "pointer", background: active ? "rgba(255,255,255,.28)" : isToday ? "rgba(255,255,255,.16)" : undefined }}>
                        <div>{s}</div>
                        <div className="text-[9px] font-normal opacity-75 tabular-nums">{weekDates[i] ? ddmm(weekDates[i]) : ""}</div>
                        {(active || isToday) && <span style={{ display: "block", height: 2, borderRadius: 1, background: "#fff", marginTop: 3, opacity: active ? 1 : 0.7 }} />}
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
                      // actual vs predicted band → dot color: green inside, red outside,
                      // grey when there's no band to compare against.
                      const within = (isActual && c.band_lo != null && c.band_hi != null)
                        ? c.actual >= c.band_lo && c.actual <= c.band_hi : null;
                      const dotColor = within == null ? "var(--text-3)" : within ? "#22c55e" : "#ef4444";
                      const clickable = c && (c.forecast != null || c.actual != null);
                      const colActive = w === activeWd;
                      const tdStyle = {
                        textAlign: "center", padding: 0, height: 34,
                        border: "1px solid var(--border)",
                        background: fill || (isActual ? "var(--bg-card)" : "var(--bg-inner)"),
                        color: fill ? contrastText(fill) : isActual ? "var(--text-1)" : "var(--text-4)",
                        fontWeight: hasVal ? 700 : 400,
                        cursor: "pointer",
                        position: "relative",
                      };
                      if (colActive) {
                        tdStyle.borderLeft = "2px solid var(--brand)";
                        tdStyle.borderRight = "2px solid var(--brand)";
                      }
                      return (
                        <td key={w}
                          onClick={() => {
                            setSelWd(w);
                            if (clickable) setModalCell({ ...c, supName: sup.name, wdFull: (WD[lang] || WD.uz).f[w] });
                          }}
                          title={isActual ? t.actual : (hasVal ? t.forecastTag : t.noData)}
                          style={tdStyle}>
                          {hasVal ? val : <span style={{ opacity: 0.4 }}>{t.na}</span>}
                          {isActual && (
                            <span style={{ position: "absolute", top: 2, right: 3, width: 5, height: 5, borderRadius: "50%",
                              background: dotColor, opacity: within == null ? 0.85 : 1 }} />
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
            <span className="inline-flex items-center gap-1 ml-2 font-medium">{t.actual}:</span>
            <span className="inline-flex items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
              {t.withinBand}
            </span>
            <span className="inline-flex items-center gap-1">
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block" }} />
              {t.outOfBand}
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
    </div>
  );
}
