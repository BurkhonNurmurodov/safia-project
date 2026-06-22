import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Gauge, FileSpreadsheet, CalendarDays, Users, Grid3x3,
  BarChart3, LineChart, TrendingUp, TrendingDown,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import api from "../utils/api";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";

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
    brigadirsN: "brigadir", normHour: "norm-soat", min: "min", rise: "o'sish", fall: "pasayish",
    week: "hafta", noSelection: "Trend uchun brigadir va hafta kunlarini tanlang", exporting: "Yuklanmoqda…",
  },
  uz_cyrl: {
    title: "Trudoyomkost — таҳлил", kpiPeriod: "Давр Σ", kpiDaily: "Кунлик ўртача",
    kpiBusiest: "Энг банд кун", kpiDelta: "Даврлараро Δ", profile: "Ҳафта куни профили",
    matrix: "Бригадир × ҳафта куни", trend: "Ҳафта куни тренди", avgWord: "Ўртача",
    totalWord: "Жами", perBrigadir: "бригадирга ўртача", sumAll: "йиғинди", export: "Excel",
    supervisor: "Бригадир", weekday: "Ҳафта куни", avgLine: "Ўртача", noData: "Маълумот йўқ",
    brigadirsN: "бригадир", normHour: "норм-соат", min: "мин", rise: "ўсиш", fall: "пасайиш",
    week: "ҳафта", noSelection: "Тренд учун бригадир ва ҳафта кунларини танланг", exporting: "Юкланмоқда…",
  },
  ru: {
    title: "Трудоёмкость — анализ", kpiPeriod: "Σ за период", kpiDaily: "Средне в день",
    kpiBusiest: "Самый загруженный день", kpiDelta: "Δ к прошлому периоду", profile: "Профиль по дням недели",
    matrix: "Бригадир × день недели", trend: "Тренд по дню недели", avgWord: "Среднее",
    totalWord: "Сумма", perBrigadir: "в среднем на бригадира", sumAll: "сумма", export: "Excel",
    supervisor: "Бригадир", weekday: "День недели", avgLine: "Среднее", noData: "Нет данных",
    brigadirsN: "бригадиров", normHour: "норм-час", min: "мин", rise: "рост", fall: "спад",
    week: "неделя", noSelection: "Выберите бригадира и дни недели для тренда", exporting: "Загрузка…",
  },
  en: {
    title: "Trudoyomkost — analysis", kpiPeriod: "Period Σ", kpiDaily: "Daily average",
    kpiBusiest: "Busiest weekday", kpiDelta: "Δ vs previous", profile: "Weekday profile",
    matrix: "Brigadir × weekday", trend: "Weekday trend", avgWord: "Average",
    totalWord: "Total", perBrigadir: "avg per brigadir", sumAll: "total", export: "Excel",
    supervisor: "Brigadir", weekday: "Weekday", avgLine: "Average", noData: "No data",
    brigadirsN: "brigadirs", normHour: "norm-h", min: "min", rise: "up", fall: "down",
    week: "week", noSelection: "Pick a brigadir and weekdays for the trend", exporting: "Exporting…",
  },
};

// one on-brand colour per weekday for the trend's multi-line view
const WD_COLORS = ["#C8973F", "#E8A0B0", "#5DCAA5", "#7FB3E8", "#D4A95C", "#C088D8", "#E0A458"];

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

  const [wdMode, setWdMode] = useState("avg");          // avg | total — drives profile + matrix
  const [trendSup, setTrendSup] = useState(null);       // single brigadir id
  const [selWd, setSelWd] = useState(() => new Set([0, 1, 2, 3, 4])); // Mon–Fri default
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["trudoyomkost", dateFrom, dateTo, brigadirIds, shift],
    enabled: ready && !!dateFrom && !!dateTo,
    queryFn: () => api.get("/api/production/trudoyomkost", {
      params: { date_from: dateFrom, date_to: dateTo, manager_id: brigadirIds, shift },
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
    xaxis: { categories: trend.cats, labels: { style: { colors: labelColor, fontSize: "11px" } }, title: { text: T.week, style: { color: labelColor, fontSize: "10px", fontWeight: 400 } } },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" }, formatter: (v) => Math.round(v).toLocaleString("ru-RU") } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { labels: { colors: legendColor }, fontSize: "11px", markers: { width: 10, height: 10, radius: 3 } },
    tooltip: { theme: "dark", y: { formatter: (v) => (v == null ? "—" : `${v.toLocaleString("ru-RU")} ${unitLabel}`) } },
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
            <FileSpreadsheet size={14} /> {exporting ? T.exporting : T.export}
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
            <select value={trendSup ?? ""} onChange={(e) => setTrendSup(Number(e.target.value))}
              className="text-xs rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--brand-border)", color: "var(--text-1)" }}>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{tl(s.name)}</option>)}
            </select>
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
      </>)}
    </Layout>
  );
}
