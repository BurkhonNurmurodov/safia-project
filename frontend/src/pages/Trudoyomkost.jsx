import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Gauge, FileSpreadsheet, CalendarDays, Users, Grid3x3,
  BarChart3, LineChart, TrendingUp, TrendingDown, Activity, Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import WorkerForecast from "../components/WorkerForecast";
import WorkerStats from "../components/WorkerStats";
import api from "../utils/api";
import { padChartFrom } from "../utils/chartRange";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { useDragSelect } from "../hooks/useDragSelect";

// ── localized copy (kept local — only nav.trudoyomkost lives in translations.js)
const WD = {
  uz:      { s: ["Du","Se","Cho","Pay","Ju","Sha","Yak"],   f: ["Dushanba","Seshanba","Chorshanba","Payshanba","Juma","Shanba","Yakshanba"] },
  uz_cyrl: { s: ["Ду","Се","Чо","Пай","Жу","Ша","Як"],       f: ["Душанба","Сешанба","Чоршанба","Пайшанба","Жума","Шанба","Якшанба"] },
  ru:      { s: ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"],        f: ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"] },
  en:      { s: ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"], f: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"] },
};

const TXT = {
  uz: {
    title: "Trudoyomkost — tahlil", kpiPeriod: "Davr Σ", kpiDaily: "Kunlik o'rtacha",
    kpiBusiest: "Eng band kun", kpiDelta: "Davrlararo Δ", profile: "Hafta kuni profili",
    matrix: "Brigadir × hafta kuni", trend: "Hafta kuni trendi", avgWord: "O'rtacha",
    totalWord: "Jami", perBrigadir: "brigadirga o'rtacha", sumAll: "yig'indi", export: "Excel",
    supervisor: "Brigadir", weekday: "Hafta kuni", avgLine: "O'rtacha", noData: "Ma'lumot yo'q",
    brigadirsN: "brigadir", normHour: "soat", min: "min", rise: "o'sish", fall: "pasayish",
    week: "hafta", noSelection: "Trend uchun brigadir va hafta kunlarini tanlang", exporting: "Yuklanmoqda…",
    planFaktTitle: "Plan va Fakt", plan: "Plan", fakt: "Fakt", fulfillment: "Bajarilish",
    filter: "Filtr", search: "Qidirish", clearAll: "Tozalash", noMatch: "Mos kelmadi",
    ma: "Siljuvchi o'rtacha", dayShort: "kun",
  },
  uz_cyrl: {
    title: "Trudoyomkost — таҳлил", kpiPeriod: "Давр Σ", kpiDaily: "Кунлик ўртача",
    kpiBusiest: "Энг банд кун", kpiDelta: "Даврлараро Δ", profile: "Ҳафта куни профили",
    matrix: "Бригадир × ҳафта куни", trend: "Ҳафта куни тренди", avgWord: "Ўртача",
    totalWord: "Жами", perBrigadir: "бригадирга ўртача", sumAll: "йиғинди", export: "Excel",
    supervisor: "Бригадир", weekday: "Ҳафта куни", avgLine: "Ўртача", noData: "Маълумот йўқ",
    brigadirsN: "бригадир", normHour: "соат", min: "мин", rise: "ўсиш", fall: "пасайиш",
    week: "ҳафта", noSelection: "Тренд учун бригадир ва ҳафта кунларини танланг", exporting: "Юкланмоқда…",
    planFaktTitle: "План ва Факт", plan: "План", fakt: "Факт", fulfillment: "Бажарилиш",
    filter: "Фильтр", search: "Қидириш", clearAll: "Тозалаш", noMatch: "Мос келмади",
    ma: "Силжувчи ўртача", dayShort: "кун",
  },
  ru: {
    title: "Трудоёмкость — анализ", kpiPeriod: "Σ за период", kpiDaily: "Средне в день",
    kpiBusiest: "Самый загруженный день", kpiDelta: "Δ к прошлому периоду", profile: "Профиль по дням недели",
    matrix: "Бригадир × день недели", trend: "Тренд по дню недели", avgWord: "Среднее",
    totalWord: "Сумма", perBrigadir: "в среднем на бригадира", sumAll: "сумма", export: "Excel",
    supervisor: "Бригадир", weekday: "День недели", avgLine: "Среднее", noData: "Нет данных",
    brigadirsN: "бригадиров", normHour: "час", min: "мин", rise: "рост", fall: "спад",
    week: "неделя", noSelection: "Выберите бригадира и дни недели для тренда", exporting: "Загрузка…",
    planFaktTitle: "План и Факт", plan: "План", fakt: "Факт", fulfillment: "Выполнение",
    filter: "Фильтр", search: "Поиск", clearAll: "Очистить", noMatch: "Нет совпадений",
    ma: "Скользящее среднее", dayShort: "дн",
  },
  en: {
    title: "Trudoyomkost — analysis", kpiPeriod: "Period Σ", kpiDaily: "Daily average",
    kpiBusiest: "Busiest weekday", kpiDelta: "Δ vs previous", profile: "Weekday profile",
    matrix: "Brigadir × weekday", trend: "Weekday trend", avgWord: "Average",
    totalWord: "Total", perBrigadir: "avg per brigadir", sumAll: "total", export: "Excel",
    supervisor: "Brigadir", weekday: "Weekday", avgLine: "Average", noData: "No data",
    brigadirsN: "brigadirs", normHour: "hrs", min: "min", rise: "up", fall: "down",
    week: "week", noSelection: "Pick a brigadir and weekdays for the trend", exporting: "Exporting…",
    planFaktTitle: "Plan vs Fakt", plan: "Plan", fakt: "Fakt", fulfillment: "Fulfillment",
    filter: "Filter", search: "Search", clearAll: "Clear all", noMatch: "No match",
    ma: "Moving average", dayShort: "d",
  },
};

// one on-brand colour per weekday for the trend's multi-line view
const WD_COLORS = ["#C8973F", "#E8A0B0", "#5DCAA5", "#7FB3E8", "#D4A95C", "#C088D8", "#E0A458"];

// stable palette for individual brigadir lines on the plan-vs-fakt chart (gold reserved for the avg)
const BRIGADIR_COLORS = ["#3b82f6", "#ef4444", "#22c55e", "#eab308", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16", "#06b6d4", "#a855f7", "#f43f5e"];
const PF_AVG_COLOR = "#C8973F";
const PF_MA_COLOR = "#94a3b8";   // neutral dashed overlay — reads as a smoothed reference
const MA_WINDOW = 7;             // trailing window (data points ≈ days) for the moving average

// trailing simple moving average over an array that may contain null gaps
const movingAvg = (arr, w) => arr.map((_, i) => {
  const slice = arr.slice(Math.max(0, i - w + 1), i + 1).filter((v) => v != null);
  return slice.length ? Math.round(slice.reduce((a, b) => a + b, 0) / slice.length) : null;
});

const pad = (n) => String(n).padStart(2, "0");
const addDaysISO = (iso, n) => {
  const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const mondayOfISO = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const wd = (d.getDay() + 6) % 7;            // Mon=0 … Sun=6
  d.setDate(d.getDate() - wd);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const ddmm = (iso) => { const [, m, d] = iso.split("-"); return `${d}.${m}`; };

// ── page-local filter cache (mirrors FilterContext's zf_ localStorage convention)
const CK = (k) => `zf_tk_${k}`;
const cacheGet = (k) => { try { return localStorage.getItem(CK(k)); } catch { return null; } };
const cacheSet = (k, v) => { try { (v == null || v === "") ? localStorage.removeItem(CK(k)) : localStorage.setItem(CK(k), v); } catch { /* ignore quota/private-mode */ } };
const initStr  = (k, fb) => { const v = cacheGet(k); return v == null ? fb : v; };
const initBool = (k, fb) => { const v = cacheGet(k); return v == null ? fb : v === "1"; };
const initNum  = (k, fb) => { const v = cacheGet(k); return v == null || v === "" ? fb : Number(v); };
const initSet  = (k, fb) => { try { const v = cacheGet(k); return v == null ? fb : new Set(JSON.parse(v)); } catch { return fb; } };

// ── small UI atoms (mirror Production.jsx idioms) ──────────────────────────────
function SectionHead({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />}
        {title}
      </div>
      {right}
    </div>
  );
}

function Toggle({ value, onChange, options }) {
  return (
    <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border-md)" }}>
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)}
          className="px-3 py-1.5 text-xs font-medium transition-colors"
          style={value === id
            ? { background: "var(--brand)", color: "#fff" }
            : { background: "var(--bg-inner)", color: "var(--text-3)" }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, accent, primary, subColor }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{
      background: primary ? "var(--brand-bg)" : "var(--bg-card)",
      border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}`,
    }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: accent || "var(--text-4)", opacity: 0.85 }} />}
      </div>
      <div className="text-2xl font-bold tabular-nums leading-none" style={{ color: accent || "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: subColor || "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
export default function Trudoyomkost() {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { dateFrom, dateTo, brigadirIds, shift, unit, setUnit, ready } = useFilters();
  const { gridColor, labelColor, legendColor } = useChartTheme();

  const T = TXT[lang] || TXT.uz;
  const wdLabels = (WD[lang] || WD.uz);
  const isHrs = unit === "hrs";
  const unitLabel = isHrs ? T.normHour : T.min;
  const conv = (m) => (isHrs ? m / 60 : m);
  const fmt = (m) => Math.round(conv(m || 0)).toLocaleString("ru-RU");

  const [wdMode, setWdMode] = useState(() => initStr("wdMode", "avg"));   // avg | total — drives profile + matrix
  const [pfMode, setPfMode] = useState(() => initStr("pfMode", "diff"));  // planned | actual | diff — plan vs fakt lens
  const [pfShowAvg, setPfShowAvg] = useState(() => initBool("pfShowAvg", true)); // average line visible on plan-vs-fakt
  const [pfMA, setPfMA] = useState(() => initBool("pfMA", false)); // moving-average overlay on plan-vs-fakt
  const [pfSel, setPfSel] = useState(() => initSet("pfSel", new Set()));  // brigadir ids shown as their own lines
  const [pfDropOpen, setPfDropOpen] = useState(false);
  const [pfSearch, setPfSearch] = useState("");
  const pfDropRef = useRef(null);
  const [trendSup, setTrendSup] = useState(() => initNum("trendSup", null)); // single brigadir id
  const [selWd, setSelWd] = useState(() => initSet("selWd", new Set([0, 1, 2, 3, 4]))); // Mon–Fri default
  const [exporting, setExporting] = useState(false);
  // shift efficiency (productive % of the 480-min shift) — shared by the worker
  // prediction/statistics and the workers-to-call forecast so both react to it.
  const [effPct, setEffPct] = useState(() => initNum("effPct", 100));

  // Persist page-local filters to cache so the view restores on reload/return.
  useEffect(() => {
    cacheSet("wdMode", wdMode);
    cacheSet("pfMode", pfMode);
    cacheSet("pfShowAvg", pfShowAvg ? "1" : "0");
    cacheSet("pfMA", pfMA ? "1" : "0");
    cacheSet("pfSel", pfSel.size ? JSON.stringify([...pfSel]) : "");
    cacheSet("trendSup", trendSup != null ? String(trendSup) : "");
    cacheSet("selWd", JSON.stringify([...selWd]));
    cacheSet("effPct", String(effPct));
  }, [wdMode, pfMode, pfShowAvg, pfMA, pfSel, trendSup, selWd, effPct]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trudoyomkost", dateFrom, dateTo, brigadirIds, shift],
    enabled: ready && !!dateFrom && !!dateTo,
    queryFn: () => api.get("/api/production/trudoyomkost", {
      params: { date_from: dateFrom, date_to: dateTo, manager_id: brigadirIds, shift },
    }).then((r) => r.data),
  });

  // План/Факт chart never spans fewer than 7 days — its own fetch is padded
  // back to end-6d (identical key = one request when no padding). Matrix,
  // KPIs and the weekday trend stay on the selected range.
  const chartFrom = padChartFrom(dateFrom, dateTo);
  const { data: pfChartData } = useQuery({
    queryKey: ["trudoyomkost", chartFrom, dateTo, brigadirIds, shift],
    enabled: ready && !!dateFrom && !!dateTo,
    queryFn: () => api.get("/api/production/trudoyomkost", {
      params: { date_from: chartFrom, date_to: dateTo, manager_id: brigadirIds, shift },
    }).then((r) => r.data),
  });

  const matrix = data?.matrix ?? [];
  const profile = data?.weekday_profile ?? [];
  const supervisors = data?.supervisors ?? [];
  const kpis = data?.kpis ?? {};

  // default the trend's brigadir to the first available once data arrives
  useEffect(() => {
    if (supervisors.length && (trendSup == null || !supervisors.some((s) => s.id === trendSup))) {
      setTrendSup(supervisors[0].id);
    }
  }, [supervisors]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxCell = useMemo(() => Math.max(1, ...matrix.flatMap((r) =>
    r.by_weekday.filter((c) => c.count > 0).map((c) => c[wdMode]))), [matrix, wdMode]);

  const cellStyle = (c) => {
    if (!c || c.count === 0) return { background: "var(--bg-inner)", color: "var(--text-4)" };
    const o = 0.15 + 0.72 * Math.min(1, c[wdMode] / maxCell);
    return { background: `rgba(200,151,63,${o.toFixed(2)})`, color: o > 0.5 ? "#1a1208" : "#f3f4f6", fontWeight: 600 };
  };

  // ── weekday profile bar (one series, peak highlighted) ───────────────────────
  const profileSeries = profile.map((p) => Math.round(conv(p[wdMode])));
  const profileMaxIdx = profileSeries.indexOf(Math.max(...profileSeries, 0));
  const profileOptions = {
    chart: { type: "bar", background: "transparent", toolbar: { show: false }, animations: { enabled: false } },
    plotOptions: { bar: { distributed: true, borderRadius: 4, columnWidth: "55%" } },
    colors: profileSeries.map((_, i) => (i === profileMaxIdx ? "#C8973F" : "rgba(200,151,63,0.55)")),
    dataLabels: { enabled: true, formatter: (v) => (v ? v.toLocaleString("ru-RU") : ""), style: { fontSize: "10px", colors: ["#1a1208"] } },
    xaxis: { categories: wdLabels.s, labels: { style: { colors: labelColor, fontSize: "11px" } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => Math.round(v).toLocaleString("ru-RU") } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { show: false },
    tooltip: { theme: "dark", y: { formatter: (v) => `${(v || 0).toLocaleString("ru-RU")} ${unitLabel}` } },
  };

  // ── plan vs fakt over time — average line + per-brigadir lines (Overview-style)
  const pfColor = (pct) => (pct >= 100 ? "#22c55e" : pct >= 85 ? "#D4A95C" : "#ef4444");
  const pfIsDiff = pfMode === "diff";

  // close the brigadir filter dropdown on an outside click
  useEffect(() => {
    function onDown(e) { if (pfDropRef.current && !pfDropRef.current.contains(e.target)) setPfDropOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const brigadirColor = (id) => {
    const idx = supervisors.findIndex((s) => s.id === id);
    return BRIGADIR_COLORS[(idx < 0 ? 0 : idx) % BRIGADIR_COLORS.length];
  };
  const nameOf = (id) => supervisors.find((s) => s.id === id)?.name ?? "";
  const toggleBrig = (id) => setPfSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const pfDragRow = useDragSelect(
    (id) => pfSel.has(Number(id)),
    (id, value) => setPfSel((prev) => {
      const n = Number(id);
      if (prev.has(n) === value) return prev;
      const next = new Set(prev);
      value ? next.add(n) : next.delete(n);
      return next;
    }),
  );

  // raw plan/fakt folded per brigadir per date (minutes) + period totals for
  // the header. The chart series fold over the padded ≥7-day window; the
  // header totals stay on the exact selected period.
  const planFakt = useMemo(() => {
    const rows = (pfChartData ?? data)?.daily ?? [];
    const dateSet = new Set();
    const byMgr = new Map();   // mid -> Map(isoDate -> {plan, fakt})
    for (const r of rows) {
      dateSet.add(r.date);
      let m = byMgr.get(r.manager_id);
      if (!m) { m = new Map(); byMgr.set(r.manager_id, m); }
      const e = m.get(r.date) || { plan: 0, fakt: 0 };
      e.plan += r.plan || 0;
      e.fakt += r.actual || 0;
      m.set(r.date, e);
    }
    let totalPlan = 0, totalFakt = 0;
    for (const r of data?.daily ?? []) {
      totalPlan += r.plan || 0;
      totalFakt += r.actual || 0;
    }
    const isoDates = [...dateSet].sort();
    return {
      isoDates, cats: isoDates.map(ddmm), byMgr,
      totalPlan, totalFakt,
      overallPct: totalPlan > 0 ? Math.round((totalFakt / totalPlan) * 100) : 0,
    };
  }, [data, pfChartData]);

  // series in the current P / A / P−A lens: the average over all brigadirs, plus one line per selected brigadir
  const pfSeries = useMemo(() => {
    const metric = (cell) => {
      if (!cell) return null;
      if (pfMode === "planned") return cell.plan;
      if (pfMode === "actual") return cell.fakt;
      return cell.plan - cell.fakt;            // P−A
    };
    // per-date average across brigadirs in the current lens — drives both the
    // avg line and the moving-average overlay (so MA works even if avg is hidden)
    const avgData = planFakt.isoDates.map((d) => {
      const vals = [];
      planFakt.byMgr.forEach((m) => { const v = metric(m.get(d)); if (v != null) vals.push(v); });
      return vals.length ? Math.round(conv(vals.reduce((a, b) => a + b, 0) / vals.length)) : null;
    });

    const out = [];
    if (pfShowAvg) out.push({ name: T.avgWord, _avg: true, data: avgData });
    [...pfSel].forEach((id) => {
      const m = planFakt.byMgr.get(id);
      out.push({
        name: tl(nameOf(id)), _id: id,
        data: planFakt.isoDates.map((d) => { const v = metric(m?.get(d)); return v == null ? null : Math.round(conv(v)); }),
      });
    });
    // moving-average overlay drawn last so its dashed line sits on top
    if (pfMA) out.push({ name: `${T.ma} · ${MA_WINDOW}${T.dayShort}`, _ma: true, data: movingAvg(avgData, MA_WINDOW) });
    return out;
  }, [planFakt, pfShowAvg, pfMA, pfSel, pfMode, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const pfColors = pfSeries.map((s) => (s._ma ? PF_MA_COLOR : s._avg ? PF_AVG_COLOR : brigadirColor(s._id)));
  const pfWidths = pfSeries.map((s) => (s._ma ? 2.5 : s._avg ? 3 : 1.75));

  const pfOptions = {
    chart: { type: "area", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false } },
    colors: pfColors,
    stroke: { curve: "smooth", width: pfWidths, dashArray: pfSeries.map((s) => (s._ma ? 5 : 0)) },
    fill: { type: "gradient", gradient: {
      shadeIntensity: 1,
      opacityFrom: pfSeries.map((s) => (s._ma ? 0 : 0.30)),
      opacityTo: pfSeries.map((s) => (s._ma ? 0 : 0.02)),
      stops: [0, 90, 100],
    } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: planFakt.cats,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => `${pfIsDiff && v > 0 ? "+" : ""}${Math.round(v).toLocaleString("ru-RU")}` } },
    annotations: { yaxis: pfIsDiff ? [{ y: 0, borderColor: "rgba(128,128,128,.45)", strokeDashArray: 4, borderWidth: 1.5, label: { text: "" } }] : [] },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { show: true, labels: { colors: legendColor }, fontSize: "11px", markers: { width: 10, height: 10, radius: 3 }, itemMargin: { horizontal: 8, vertical: 3 } },
    markers: { size: pfSeries.map((s) => (s._ma ? 0 : (planFakt.cats.length <= 14 ? 3 : 0))), hover: { size: 5 } },
    tooltip: { theme: "dark", shared: true, y: { formatter: (v) => (v == null ? "—" : `${pfIsDiff && v > 0 ? "+" : ""}${v.toLocaleString("ru-RU")} ${unitLabel}`) } },
  };

  const pfFiltered = supervisors.filter((s) =>
    !pfSearch || tl(s.name).toLowerCase().includes(pfSearch.toLowerCase()) || s.name.toLowerCase().includes(pfSearch.toLowerCase()));

  // ── trend: one line per selected weekday across weeks + flat avg reference ────
  const trend = useMemo(() => {
    const supDaily = (data?.daily ?? []).filter((d) => d.manager_id === trendSup);
    if (!supDaily.length || selWd.size === 0) return { cats: [], series: [] };
    const planByDate = new Map(supDaily.map((d) => [d.date, d.plan]));
    // x-axis = weeks (so the same weekday lines up across weeks); a column is the
    // whole week, labelled by its Mon–Sun range — never a single date, which would
    // wrongly imply one calendar day carries seven weekday values.
    const weeks = [...new Set(supDaily.map((d) => mondayOfISO(d.date)))].sort();
    const cats = weeks.map((w) => `${ddmm(w)}–${ddmm(addDaysISO(w, 6))}`);
    const wds = [...selWd].sort((a, b) => a - b);
    const series = wds.map((wd) => ({
      name: wdLabels.f[wd],
      color: WD_COLORS[wd],
      weekday: wd,
      data: weeks.map((w) => {
        const v = planByDate.get(addDaysISO(w, wd));
        return v == null ? null : Math.round(conv(v));
      }),
    }));
    const pts = series.flatMap((s) => s.data).filter((v) => v != null);
    const avg = pts.length ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0;
    series.push({
      name: `${T.avgLine} (${avg.toLocaleString("ru-RU")})`,
      color: "#9ca3af", dashed: true,
      data: weeks.map(() => avg),
    });
    return { cats, series, weeks };
  }, [data, trendSup, selWd, unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const trendOptions = {
    chart: { type: "line", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false } },
    colors: trend.series.map((s) => s.color),
    stroke: { width: trend.series.map((s) => (s.dashed ? 2 : 2.5)), dashArray: trend.series.map((s) => (s.dashed ? 6 : 0)), curve: "straight" },
    markers: { size: trend.series.map((s) => (s.dashed ? 0 : 4)), strokeWidth: 0, hover: { sizeOffset: 2 } },
    dataLabels: {
      enabled: true,
      enabledOnSeries: trend.series.map((s, i) => (s.dashed ? null : i)).filter((i) => i !== null),
      formatter: (v) => (v == null ? "" : Math.round(v).toLocaleString("ru-RU")),
      offsetY: -5, style: { fontSize: "10px", colors: ["var(--text-2)"] }, background: { enabled: false },
    },
    xaxis: {
      categories: trend.cats,
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: -30, rotateAlways: false, hideOverlappingLabels: true, trim: false },
      title: { text: T.week, style: { color: labelColor, fontSize: "10px", fontWeight: 400 } },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => Math.round(v).toLocaleString("ru-RU") } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { labels: { colors: legendColor }, fontSize: "11px", markers: { width: 10, height: 10, radius: 3 } },
    tooltip: {
      theme: "dark",
      custom: ({ dataPointIndex }) => {
        const wk = trend.weeks?.[dataPointIndex];
        if (!wk) return "";
        const header = `${ddmm(wk)} – ${ddmm(addDaysISO(wk, 6))}`;
        const rows = trend.series.map((s) => {
          const val = s.data[dataPointIndex];
          if (val == null) return "";
          const date = s.dashed ? "" : ` · ${ddmm(addDaysISO(wk, s.weekday))}`;
          return `<div style="display:flex;align-items:center;gap:6px;padding:1px 0">
            <span style="width:8px;height:8px;border-radius:2px;background:${s.color};display:inline-block;${s.dashed ? "opacity:.7" : ""}"></span>
            <span style="color:#9ca3af">${s.name}${date}</span>
            <b style="color:#f3f4f6;margin-left:auto">${val.toLocaleString("ru-RU")} ${unitLabel}</b></div>`;
        }).join("");
        return `<div style="padding:8px 10px;background:#1a1d27;border:1px solid rgba(255,255,255,.12);border-radius:8px;font-size:11px;min-width:190px">
          <div style="color:#D4A95C;font-weight:600;margin-bottom:5px">${header}</div>${rows}</div>`;
      },
    },
  };

  async function exportExcel() {
    if (!dateFrom || !dateTo) return;
    setExporting(true);
    try {
      const res = await api.get("/api/production/trudoyomkost/export.xlsx", {
        params: { date_from: dateFrom, date_to: dateTo, manager_id: brigadirIds, mode: wdMode, unit, lang, shift },
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trudoyomkost_${dateFrom}_${dateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("export failed", e);
      alert("Export failed");
    } finally {
      setExporting(false);
    }
  }

  const deltaPct = kpis.delta_pct;
  const hasData = matrix.length > 0;

  return (
    <Layout title={T.title}>
      {/* top controls: context chips + unit toggle + export */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {data?.range && (
          <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <CalendarDays size={14} style={{ color: "var(--brand-text)" }} />
            {ddmm(data.range.from)} – {ddmm(data.range.to)}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          <Users size={14} style={{ color: "var(--brand-text)" }} />
          {supervisors.length} {T.brigadirsN}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Toggle value={unit} onChange={setUnit} options={[["min", T.min], ["hrs", T.normHour]]} />
          <button onClick={exportExcel} disabled={exporting || !hasData}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: exporting || !hasData ? 0.5 : 1 }}>
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} {exporting ? T.exporting : T.export}
          </button>
        </div>
      </div>

      {isError && (
        <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || "Error"}
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl p-10 text-center text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>…</div>
      )}

      {!isLoading && !hasData && !isError && (
        <div className="rounded-2xl p-10 text-center text-sm" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
          {T.noData}
        </div>
      )}

      {hasData && (<>
        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Kpi primary label={`${T.kpiPeriod} · ${unitLabel}`} value={fmt(kpis.period_total)} icon={Gauge} accent="var(--brand-text)" />
          <Kpi label={`${T.kpiDaily} · ${unitLabel}`} value={fmt(kpis.daily_avg)} icon={CalendarDays} />
          <Kpi label={T.kpiBusiest} value={kpis.busiest_weekday != null ? wdLabels.f[kpis.busiest_weekday] : "—"}
            sub={kpis.busiest_weekday != null ? `${fmt(kpis.busiest_value)} ${unitLabel}` : undefined} icon={BarChart3} />
          <Kpi label={T.kpiDelta}
            value={deltaPct == null ? "—" : `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%`}
            accent={deltaPct == null ? undefined : deltaPct >= 0 ? "#22c55e" : "#ef4444"}
            icon={deltaPct == null ? TrendingUp : deltaPct >= 0 ? TrendingUp : TrendingDown}
            sub={deltaPct == null ? undefined : deltaPct >= 0 ? T.rise : T.fall}
            subColor={deltaPct == null ? undefined : deltaPct >= 0 ? "#22c55e" : "#ef4444"} />
        </div>

        {/* plan vs fakt over time (Σ across the filtered brigadirs) */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Activity} title={`${T.planFaktTitle} · ${unitLabel}`}
            right={
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="flex items-center gap-2.5 text-[11px] tabular-nums">
                  <span style={{ color: "#C8973F" }}>{T.plan} {fmt(planFakt.totalPlan)}</span>
                  <span style={{ color: "#5DCAA5" }}>{T.fakt} {fmt(planFakt.totalFakt)}</span>
                  {planFakt.totalPlan > 0 && (
                    <span className="font-semibold px-1.5 py-0.5 rounded-md"
                      style={{ color: pfColor(planFakt.overallPct), background: pfColor(planFakt.overallPct) + "1f" }}>
                      {planFakt.overallPct}%
                    </span>
                  )}
                </span>
                <Toggle value={pfMode} onChange={setPfMode} options={[["planned", "P"], ["actual", "A"], ["diff", "P−A"]]} />
                <button onClick={() => setPfMA((v) => !v)} title={`${T.ma} · ${MA_WINDOW} ${T.dayShort}`}
                  className="px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                  style={pfMA
                    ? { background: PF_MA_COLOR, color: "#1a1208", border: `1px solid ${PF_MA_COLOR}` }
                    : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                  MA
                </button>
              </div>
            } />

          {/* brigadir filter toolbar (mirrors the Overview fleet-trend filter) */}
          <div className="flex items-center gap-2 px-3 pt-2.5 flex-wrap">
            <div className="relative" ref={pfDropRef}>
              <button onClick={() => { setPfDropOpen((o) => !o); setPfSearch(""); }}
                className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg transition-colors"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
                {T.filter}<span style={{ opacity: 0.4, fontSize: 9 }}>▾</span>
              </button>

              {pfDropOpen && (
                <div className="absolute top-full left-0 mt-1 z-30 rounded-xl overflow-hidden"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.18)", width: 220, maxHeight: 300, display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "8px 10px 6px", borderBottom: "1px solid var(--border)" }}>
                    <input autoFocus value={pfSearch} onChange={(e) => setPfSearch(e.target.value)} placeholder={T.search}
                      className="w-full text-xs outline-none rounded-md px-2 py-1"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
                  </div>

                  {!pfSearch && (
                    <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                      style={{ fontSize: 12, color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                      <input type="checkbox" checked={pfShowAvg} onChange={() => setPfShowAvg((v) => !v)} className="accent-amber-500" style={{ width: 13, height: 13 }} />
                      <span style={{ color: PF_AVG_COLOR, fontWeight: 600 }}>{T.avgWord}</span>
                    </label>
                  )}

                  <div style={{ overflowY: "auto", flex: 1 }}>
                    {pfFiltered.map((s) => {
                      const c = brigadirColor(s.id);
                      return (
                        <label key={s.id} {...pfDragRow(s.id)}
                          className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
                          style={{ fontSize: 12, color: "var(--text-2)" }}>
                          <input type="checkbox" checked={pfSel.has(s.id)} onChange={() => toggleBrig(s.id)} style={{ width: 13, height: 13, accentColor: c }} />
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                          {tl(s.name)}
                        </label>
                      );
                    })}
                    {pfFiltered.length === 0 && <div className="px-3 py-3 text-[11px]" style={{ color: "var(--text-4)" }}>{T.noMatch}</div>}
                  </div>

                  {pfSel.size > 0 && (
                    <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border)" }}>
                      <button onClick={() => setPfSel(new Set())}
                        className="w-full text-[11px] py-1 rounded-lg font-medium transition-colors"
                        style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-3)" }}>
                        {T.clearAll}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {[...pfSel].map((id) => {
              const c = brigadirColor(id);
              return (
                <span key={id} className="flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: c + "33", color: c, border: `1px solid ${c}55` }}>
                  {tl(nameOf(id)).split(" ")[0]}
                  <button onClick={() => toggleBrig(id)} className="ml-0.5 opacity-70 hover:opacity-100" style={{ fontSize: 11, lineHeight: 1 }}>×</button>
                </span>
              );
            })}
          </div>

          <div className="px-2 py-2">
            {planFakt.cats.length > 0 && pfSeries.length > 0 ? (
              <ReactApexChart key={pfMode} type="area" series={pfSeries} options={pfOptions} height={280} />
            ) : (
              <div className="py-16 text-center text-sm" style={{ color: "var(--text-4)" }}>{T.noData}</div>
            )}
          </div>
        </div>

        {/* weekday profile */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={BarChart3} title={T.profile}
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>{wdMode === "avg" ? T.perBrigadir : T.sumAll} · {unitLabel}</span>} />
          <div className="px-2 py-2">
            <ReactApexChart type="bar" series={[{ name: T.profile, data: profileSeries }]} options={profileOptions} height={230} />
          </div>
        </div>

        {/* brigadir × weekday heatmap (display-only) */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Grid3x3} title={T.matrix}
            right={<Toggle value={wdMode} onChange={setWdMode} options={[["avg", T.avgWord], ["total", T.totalWord]]} />} />
          <div className="overflow-x-auto p-3">
            <table className="w-full text-[11px] border-collapse" style={{ minWidth: 540 }}>
              <thead>
                <tr style={{ background: "var(--brand)", color: "#fff" }}>
                  <th className="text-left px-3 py-1.5 font-semibold">{T.supervisor}</th>
                  {wdLabels.s.map((s) => <th key={s} className="px-2 py-1.5 font-semibold text-center">{s}</th>)}
                  <th className="px-3 py-1.5 font-semibold text-center" style={{ borderLeft: "2px solid rgba(255,255,255,.25)" }}>{wdMode === "avg" ? T.avgWord : T.totalWord}</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={r.manager_id}>
                    <td className="text-left px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>{tl(r.name)}</td>
                    {r.by_weekday.map((c, wd) => (
                      <td key={wd} className="text-center tabular-nums" style={{ ...cellStyle(c), border: "1px solid var(--border)" }}>
                        {c.count === 0 ? "—" : fmt(c[wdMode])}
                      </td>
                    ))}
                    <td className="text-center tabular-nums font-semibold" style={{ color: "var(--text-1)", borderLeft: "2px solid var(--border-md)", borderBottom: "1px solid var(--border)" }}>
                      {fmt(wdMode === "avg" ? r.row_avg : r.row_total)}
                    </td>
                  </tr>
                ))}
                {/* profile footer row */}
                <tr style={{ background: "var(--bg-inner)" }}>
                  <td className="text-left px-3 py-1.5 font-semibold" style={{ color: "var(--brand-text)", borderTop: "1px solid var(--border-md)" }}>
                    {wdMode === "avg" ? T.avgWord : T.totalWord}
                  </td>
                  {profile.map((p, wd) => (
                    <td key={wd} className="text-center tabular-nums font-semibold" style={{ color: p.total > 0 ? "var(--brand-text)" : "var(--text-4)", borderTop: "1px solid var(--border-md)" }}>
                      {p.total > 0 ? fmt(p[wdMode]) : "—"}
                    </td>
                  ))}
                  <td className="text-center tabular-nums font-bold" style={{ color: "var(--brand-text)", borderTop: "1px solid var(--border-md)", borderLeft: "2px solid var(--border-md)" }}>
                    {fmt(wdMode === "avg"
                      ? (profile.filter((p) => p.total > 0).reduce((a, p) => a + p.avg, 0) / Math.max(1, profile.filter((p) => p.total > 0).length))
                      : profile.reduce((a, p) => a + p.total, 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* trend — supervisor (single) + weekdays (multi) drive the chart */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--brand-border)" }}>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              <LineChart size={14} style={{ color: "var(--brand-text)" }} /> {T.trend} · {unitLabel}
            </div>
            <StyledSelect
              value={trendSup != null ? String(trendSup) : ""}
              onChange={(v) => setTrendSup(Number(v))}
              options={supervisors.map((s) => ({ value: String(s.id), label: tl(s.name) }))}
              triggerClassName="px-2.5 py-1.5 text-xs"
              className="w-48"
            />
          </div>

          {/* weekday checkboxes */}
          <div className="flex flex-wrap gap-1.5 px-4 pt-3">
            {wdLabels.f.map((label, wd) => {
              const on = selWd.has(wd);
              return (
                <button key={wd} onClick={() => setSelWd((prev) => {
                  const n = new Set(prev); n.has(wd) ? n.delete(wd) : n.add(wd); return n;
                })}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-colors"
                  style={on
                    ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--text-1)" }
                    : { background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-3)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: on ? WD_COLORS[wd] : "transparent", border: on ? "none" : "1.5px solid var(--text-4)" }} />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="px-2 py-2">
            {trend.series.length > 0 && trend.cats.length > 0 ? (
              <ReactApexChart type="line" series={trend.series.map(({ name, data }) => ({ name, data }))} options={trendOptions} height={300} />
            ) : (
              <div className="py-16 text-center text-sm" style={{ color: "var(--text-4)" }}>{T.noSelection}</div>
            )}
          </div>
        </div>

        {/* worker prediction & statistics (derived-from-plan headcount) — carries the shift-efficiency control */}
        <WorkerStats effPct={effPct} setEffPct={setEffPct} />

        {/* workers-to-call forecast — moving-average prediction per brigadir × weekday.
            Sits at the very bottom, following the shift-efficiency section; shares its efficiency %. */}
        <WorkerForecast effPct={effPct} />
      </>)}
    </Layout>
  );
}
