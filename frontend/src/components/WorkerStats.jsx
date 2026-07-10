import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users, Award, CalendarDays, Compass, Gauge, ListChecks,
  TableProperties, CalendarRange, Sparkles,
} from "lucide-react";
import api from "../utils/api";
import { SkeletonBlock } from "./ui/Skeleton";
import StyledSelect from "./ui/StyledSelect";
import { useFilters } from "../context/FilterContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

// ── localized copy (kept local, mirroring Trudoyomkost.jsx) ──────────────────
const WD = {
  uz:      ["Du", "Se", "Cho", "Pay", "Ju", "Sha", "Yak"],
  uz_cyrl: ["Ду", "Се", "Чо", "Пай", "Жу", "Ша", "Як"],
  ru:      ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  en:      ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

// full weekday names — used where the layout has room (KPI cards) so the value
// doesn't read like a truncated stub ("Cho"); tables keep the compact WD above.
const WD_FULL = {
  uz:      ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"],
  uz_cyrl: ["Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба", "Якшанба"],
  ru:      ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"],
  en:      ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const T = {
  uz: {
    title: "Ishchilar bashorati va statistikasi", workers: "ishchi",
    kpiMean: "Kunlik o'rtacha (jami)", kpiTopSup: "Eng bashoratli brigadir",
    kpiTopWd: "Eng bashoratli kun", kpiDriver: "Asosiy omil",
    secConf: "Ishonchlilik hisoboti", secPerSup: "Brigadir bo'yicha statistika",
    secPhase: "Oy fazasi tahlili", secPredict: "Smenaga chaqirish (bashorat)",
    byWd: "Hafta kuni bo'yicha", bySup: "Brigadir bo'yicha", predWds: "Bashoratli kunlar",
    weekday: "Kun", supervisor: "Brigadir", mean: "O'rtacha", cv: "O'zgaruvchanlik (CV)",
    conf: "Ishonch", predSup: "Bashoratli",
    n: "n", min: "Min", max: "Maks", range: "Farq", mode: "Moda", median: "Mediana",
    meanS: "O'rtacha", std: "St.chetlanish", varS: "Dispersiya", recommend: "Chaqirish",
    high: "Yuqori", medium: "O'rta", low: "Past", insuf: "Yetarli emas",
    phaseEarly: "Oy boshi (1–10)", phaseMid: "Oy o'rtasi (11–20)", phaseLate: "Oy oxiri (21–31)",
    driverWd: "Hafta kuni", driverPhase: "Oy fazasi",
    verdict: (w, ew, ep) => `Kunlik ishchilar soni ${w === "month_phase" ? "oy fazasi" : "hafta kuni"} bilan ko'proq tushuntiriladi (η²: faza ${ep ?? "—"} vs kun ${ew ?? "—"}).`,
    nextLabel: "Keyingi", callWord: "chaqiring", noData: "Ma'lumot yo'q",
    capNote: (m) => `1 ishchi ≈ ${m} daqiqa quvvat`, na: "—",
    effLabel: "Smena unumi", apply: "Qo'llash",
  },
  uz_cyrl: {
    title: "Ишчилар башорати ва статистикаси", workers: "ишчи",
    kpiMean: "Кунлик ўртача (жами)", kpiTopSup: "Энг башоратли бригадир",
    kpiTopWd: "Энг башоратли кун", kpiDriver: "Асосий омил",
    secConf: "Ишончлилик ҳисоботи", secPerSup: "Бригадир бўйича статистика",
    secPhase: "Ой фазаси таҳлили", secPredict: "Сменага чақириш (башорат)",
    byWd: "Ҳафта куни бўйича", bySup: "Бригадир бўйича", predWds: "Башоратли кунлар",
    weekday: "Кун", supervisor: "Бригадир", mean: "Ўртача", cv: "Ўзгарувчанлик (CV)",
    conf: "Ишонч", predSup: "Башоратли",
    n: "n", min: "Мин", max: "Макс", range: "Фарқ", mode: "Мода", median: "Медиана",
    meanS: "Ўртача", std: "Ст.четланиш", varS: "Дисперсия", recommend: "Чақириш",
    high: "Юқори", medium: "Ўрта", low: "Паст", insuf: "Етарли эмас",
    phaseEarly: "Ой боши (1–10)", phaseMid: "Ой ўртаси (11–20)", phaseLate: "Ой охири (21–31)",
    driverWd: "Ҳафта куни", driverPhase: "Ой фазаси",
    verdict: (w, ew, ep) => `Кунлик ишчилар сони ${w === "month_phase" ? "ой фазаси" : "ҳафта куни"} билан кўпроқ тушунтирилади (η²: фаза ${ep ?? "—"} vs кун ${ew ?? "—"}).`,
    nextLabel: "Кейинги", callWord: "чақиринг", noData: "Маълумот йўқ",
    capNote: (m) => `1 ишчи ≈ ${m} дақиқа қувват`, na: "—",
    effLabel: "Смена унуми", apply: "Қўллаш",
  },
  ru: {
    title: "Прогноз и статистика по рабочим", workers: "раб.",
    kpiMean: "Среднее в день (всего)", kpiTopSup: "Самый предсказуемый бригадир",
    kpiTopWd: "Самый предсказуемый день", kpiDriver: "Главный фактор",
    secConf: "Отчёт о надёжности", secPerSup: "Статистика по бригадиру",
    secPhase: "Анализ по фазе месяца", secPredict: "Вызов на смену (прогноз)",
    byWd: "По дням недели", bySup: "По бригадирам", predWds: "Предсказуемые дни",
    weekday: "День", supervisor: "Бригадир", mean: "Среднее", cv: "Изменчивость (CV)",
    conf: "Надёжность", predSup: "Предсказуемо",
    n: "n", min: "Мин", max: "Макс", range: "Разброс", mode: "Мода", median: "Медиана",
    meanS: "Среднее", std: "Ст.откл.", varS: "Дисперсия", recommend: "Вызвать",
    high: "Высокая", medium: "Средняя", low: "Низкая", insuf: "Недостаточно",
    phaseEarly: "Начало (1–10)", phaseMid: "Середина (11–20)", phaseLate: "Конец (21–31)",
    driverWd: "День недели", driverPhase: "Фаза месяца",
    verdict: (w, ew, ep) => `Число рабочих в день лучше объясняется ${w === "month_phase" ? "фазой месяца" : "днём недели"} (η²: фаза ${ep ?? "—"} vs день ${ew ?? "—"}).`,
    nextLabel: "Следующий", callWord: "вызвать", noData: "Нет данных",
    capNote: (m) => `1 рабочий ≈ ${m} мин мощности`, na: "—",
    effLabel: "КПД смены", apply: "Применить",
  },
  en: {
    title: "Worker prediction & statistics", workers: "workers",
    kpiMean: "Daily average (total)", kpiTopSup: "Most predictable brigadir",
    kpiTopWd: "Most predictable weekday", kpiDriver: "Main driver",
    secConf: "Confidence report", secPerSup: "Statistics per brigadir",
    secPhase: "Month-phase analysis", secPredict: "Workers to call (prediction)",
    byWd: "By weekday", bySup: "By brigadir", predWds: "Predictable days",
    weekday: "Day", supervisor: "Brigadir", mean: "Mean", cv: "Variability (CV)",
    conf: "Confidence", predSup: "Predictable",
    n: "n", min: "Min", max: "Max", range: "Range", mode: "Mode", median: "Median",
    meanS: "Mean", std: "Std dev", varS: "Variance", recommend: "Call",
    high: "High", medium: "Medium", low: "Low", insuf: "Insufficient",
    phaseEarly: "Early (1–10)", phaseMid: "Mid (11–20)", phaseLate: "Late (21–31)",
    driverWd: "Weekday", driverPhase: "Month-phase",
    verdict: (w, ew, ep) => `Daily worker count is better explained by ${w === "month_phase" ? "month-phase" : "weekday"} (η²: phase ${ep ?? "—"} vs weekday ${ew ?? "—"}).`,
    nextLabel: "Next", callWord: "call", noData: "No data",
    capNote: (m) => `1 worker ≈ ${m} min capacity`, na: "—",
    effLabel: "Shift efficiency", apply: "Apply",
  },
};

const CONF_COLOR = { high: "#22c55e", medium: "#eab308", low: "#ef4444", insufficient: "var(--text-4)" };
const fmtCV = (cv) => (cv == null ? "—" : `${(cv * 100).toFixed(1)}%`);
const intl = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));

function Card({ children, accent }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: `1px solid ${accent ? "var(--brand-border)" : "var(--border)"}` }}>
      {children}
    </div>
  );
}
function Head({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />} {title}
      </div>
      {right}
    </div>
  );
}
function Kpi({ label, value, sub, icon: Icon, accent, primary }) {
  return (
    <div className="rounded-2xl px-4 py-3.5" style={{ background: primary ? "var(--brand-bg)" : "var(--bg-card)", border: `1px solid ${primary ? "var(--brand-border)" : "var(--border)"}` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{label}</span>
        {Icon && <Icon size={15} style={{ color: accent || "var(--text-4)", opacity: 0.85 }} />}
      </div>
      <div className="text-xl font-bold tabular-nums leading-tight break-words" style={{ color: accent || "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}
function Chip({ conf, t }) {
  const c = CONF_COLOR[conf] || "var(--text-4)";
  const label = { high: t.high, medium: t.medium, low: t.low, insufficient: t.insuf }[conf] || conf;
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ background: `${typeof c === "string" && c.startsWith("#") ? c + "22" : "var(--bg-inner)"}`, color: c, border: `1px solid ${typeof c === "string" && c.startsWith("#") ? c + "55" : "var(--border)"}` }}>
      {label}
    </span>
  );
}

export default function WorkerStats({ effPct = 100, setEffPct }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const { dateFrom, dateTo, brigadirIds, shift, ready } = useFilters();
  const t = T[lang] || T.uz;
  const wd = WD[lang] || WD.uz;
  const wdFull = WD_FULL[lang] || WD_FULL.uz;
  const [selSup, setSelSup] = useState(null);
  // applied productive % is owned by the parent (Trudoyomkost) so the forecast
  // table shares it; the draft is committed to it on Apply / Enter.
  const [effDraft, setEffDraft] = useState(String(effPct));

  const applyEff = () => {
    const v = Math.max(1, Math.min(100, Math.round(Number(effDraft) || 0)));
    setEffDraft(String(v));
    setEffPct(v);
  };
  const effDirty = Number(effDraft) !== effPct;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["trud-worker-stats", dateFrom, dateTo, brigadirIds, shift, effPct],
    enabled: ready && !!dateFrom && !!dateTo,
    queryFn: () => api.get("/api/production/trudoyomkost/worker-stats", {
      params: { date_from: dateFrom, date_to: dateTo, manager_id: brigadirIds, shift, capacity_pct: effPct },
    }).then((r) => r.data),
  });

  const supervisors = data?.supervisors ?? [];
  const cells = data?.cells ?? [];
  const bySup = data?.by_supervisor ?? [];
  const byWd = data?.by_weekday ?? [];
  const overall = data?.overall ?? {};
  const phase = data?.month_phase ?? {};
  const cap = 480 * effPct / 100;   // 100% → 480, 50% → 240; computed locally for instant feedback

  useEffect(() => {
    if (supervisors.length && (selSup == null || !supervisors.some((s) => s.id === selSup))) {
      setSelSup(supervisors[0].id);
    }
  }, [supervisors]); // eslint-disable-line react-hooks/exhaustive-deps

  // per-supervisor cells keyed by weekday
  const supCells = useMemo(() => {
    const map = {};
    cells.filter((c) => c.manager_id === selSup).forEach((c) => { map[c.weekday] = c; });
    return map;
  }, [cells, selSup]);

  const supName = supervisors.find((s) => s.id === selSup)?.name;
  const bySupSorted = useMemo(
    () => [...bySup].sort((a, b) => (a.mean_cv == null) - (b.mean_cv == null) || (a.mean_cv ?? 9) - (b.mean_cv ?? 9)),
    [bySup]
  );
  const tomorrowWd = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + 1); return (d.getDay() + 6) % 7; }, []);

  if (!ready) return null;
  if (isLoading) return (
    <div className="rounded-2xl p-5 mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SkeletonBlock className="h-4 w-48 mb-4" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonBlock key={i} className="h-16 w-full" />)}
      </div>
      <SkeletonBlock className="h-32 w-full" />
    </div>
  );
  if (isError || !supervisors.length) return null;

  const driver = phase.explained || {};
  const phaseLabels = { early: t.phaseEarly, mid: t.phaseMid, late: t.phaseLate };
  const phaseMax = Math.max(1, ...(phase.phases ?? []).map((p) => p.mean || 0));

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-3 mt-2 flex-wrap">
        <Sparkles size={16} style={{ color: "var(--brand-text)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{t.title}</h3>
        <div className="ml-auto flex items-center gap-2 flex-wrap justify-end">
          <label className="text-[11px] font-medium whitespace-nowrap" style={{ color: "var(--text-3)" }}>{t.effLabel}</label>
          <div className="inline-flex items-center rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--border-md)" }}>
            <input
              type="number" min={1} max={100} step={5} value={effDraft}
              onChange={(e) => setEffDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyEff(); }}
              onBlur={() => { if (effDraft === "") setEffDraft(String(effPct)); }}
              className="w-14 text-xs px-2 py-1.5 outline-none tabular-nums text-right"
              style={{ background: "var(--bg-inner)", color: "var(--text-1)" }}
            />
            <span className="text-xs px-1.5 py-1.5" style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>%</span>
          </div>
          <button
            type="button" onClick={applyEff} disabled={!effDirty}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-opacity shrink-0 whitespace-nowrap"
            style={{
              background: effDirty ? "var(--brand)" : "var(--bg-inner)",
              color: effDirty ? "var(--brand-contrast, #fff)" : "var(--text-4)",
              border: "1px solid var(--border-md)",
              cursor: effDirty ? "pointer" : "default", opacity: effDirty ? 1 : 0.6,
            }}
          >{t.apply}</button>
          {cap != null && <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-4)" }}>{t.capNote(Math.round(cap))}</span>}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi primary label={t.kpiMean} value={`${intl(overall.mean_daily_total_workers)}`} sub={t.workers} icon={Gauge} accent="var(--brand-text)" />
        <Kpi label={t.kpiTopSup} value={overall.most_predictable_supervisor ? tl(overall.most_predictable_supervisor) : "—"}
          sub={bySupSorted[0]?.mean_cv != null ? `CV ${fmtCV(bySupSorted[0].mean_cv)}` : undefined} icon={Award} accent="#22c55e" />
        <Kpi label={t.kpiTopWd} value={overall.most_predictable_weekday != null ? wdFull[overall.most_predictable_weekday] : "—"} icon={CalendarDays} />
        <Kpi label={t.kpiDriver}
          value={driver.winner === "month_phase" ? t.driverPhase : t.driverWd}
          sub={`η² ${driver.winner === "month_phase" ? (driver.month_phase ?? "—") : (driver.weekday ?? "—")}`}
          icon={Compass} accent="#7FB3E8" />
      </div>

      {/* confidence report: by weekday + by supervisor */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <Head icon={ListChecks} title={`${t.secConf} · ${t.byWd}`} />
          <div className="p-3 overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ color: "var(--text-4)" }}>
                  <th className="text-left px-2 py-1 font-semibold">{t.weekday}</th>
                  <th className="text-right px-2 py-1 font-semibold">{t.mean}</th>
                  <th className="text-right px-2 py-1 font-semibold">CV</th>
                  <th className="text-center px-2 py-1 font-semibold">{t.conf}</th>
                  <th className="text-right px-2 py-1 font-semibold">{t.predSup}</th>
                </tr>
              </thead>
              <tbody>
                {byWd.map((w) => (
                  <tr key={w.weekday} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="text-left px-2 py-1.5" style={{ color: "var(--text-2)" }}>{wd[w.weekday]}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums" style={{ color: "var(--text-1)" }}>{intl(w.mean_workers)}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{fmtCV(w.mean_cv)}</td>
                    <td className="text-center px-2 py-1.5"><Chip conf={w.confidence} t={t} /></td>
                    <td className="text-right px-2 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{w.predictable_supervisors}/{w.total_supervisors}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <Head icon={Users} title={`${t.secConf} · ${t.bySup}`} />
          <div className="p-3 overflow-x-auto" style={{ maxHeight: 320, overflowY: "auto" }}>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr style={{ color: "var(--text-4)" }}>
                  <th className="text-left px-2 py-1 font-semibold">{t.supervisor}</th>
                  <th className="text-right px-2 py-1 font-semibold">{t.mean}</th>
                  <th className="text-right px-2 py-1 font-semibold">CV</th>
                  <th className="text-center px-2 py-1 font-semibold">{t.conf}</th>
                </tr>
              </thead>
              <tbody>
                {bySupSorted.map((s) => (
                  <tr key={s.manager_id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="text-left px-2 py-1.5 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{tl(s.name)}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums" style={{ color: "var(--text-1)" }}>{intl(s.mean_workers)}</td>
                    <td className="text-right px-2 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{fmtCV(s.mean_cv)}</td>
                    <td className="text-center px-2 py-1.5"><Chip conf={s.confidence} t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* month-phase analysis */}
      <Card accent>
        <Head icon={CalendarRange} title={t.secPhase} />
        <div className="p-4">
          <div className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--text-2)" }}>
            <Sparkles size={12} className="inline mr-1" style={{ color: "var(--brand-text)" }} />
            {t.verdict(driver.winner, driver.weekday, driver.month_phase)}
          </div>
          <div className="space-y-2">
            {(phase.phases ?? []).map((p) => (
              <div key={p.phase} className="flex items-center gap-3">
                <span className="text-[11px] w-28 shrink-0" style={{ color: "var(--text-3)" }}>{phaseLabels[p.phase]}</span>
                <div className="flex-1 rounded-full h-5 overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                  <div className="h-full rounded-full flex items-center justify-end pr-2 text-[10px] font-semibold"
                    style={{ width: `${Math.max(6, (p.mean / phaseMax) * 100)}%`, background: "var(--brand)", color: "#fff" }}>
                    {intl(p.mean)}
                  </div>
                </div>
                <span className="text-[10px] w-32 shrink-0 text-right tabular-nums" style={{ color: "var(--text-4)" }}>
                  {t.min} {p.min} · {t.max} {p.max} · CV {fmtCV(p.cv)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* per-supervisor statistics + prediction */}
      <Card>
        <Head icon={TableProperties} title={t.secPerSup}
          right={
            <StyledSelect
              value={selSup != null ? String(selSup) : ""}
              onChange={(v) => setSelSup(Number(v))}
              options={supervisors.map((s) => ({ value: String(s.id), label: tl(s.name) }))}
              triggerClassName="px-2.5 py-1.5 text-xs"
              className="w-48"
            />
          } />
        <div className="p-3 overflow-x-auto">
          <table className="w-full text-[11px] border-collapse" style={{ minWidth: 720 }}>
            <thead>
              <tr style={{ background: "var(--brand)", color: "#fff" }}>
                {[t.weekday, t.n, t.min, t.max, t.range, t.mode, t.median, t.meanS, t.std, t.varS, "CV", t.conf, t.recommend].map((h, i) => (
                  <th key={i} className={`px-2 py-1.5 font-semibold ${i === 0 ? "text-left" : "text-center"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 7 }, (_, w) => {
                const c = supCells[w];
                const isTomorrow = w === tomorrowWd;
                return (
                  <tr key={w} style={{ borderBottom: "1px solid var(--border)", background: isTomorrow ? "var(--brand-bg)" : undefined }}>
                    <td className="text-left px-2 py-1.5 font-semibold" style={{ color: isTomorrow ? "var(--brand-text)" : "var(--text-2)" }}>
                      {wd[w]}{isTomorrow ? ` · ${t.nextLabel}` : ""}
                    </td>
                    {!c || c.n === 0 ? (
                      <td colSpan={12} className="text-center px-2 py-1.5" style={{ color: "var(--text-4)" }}>{t.na}</td>
                    ) : (
                      <>
                        <td className="text-center px-2 py-1.5 tabular-nums" style={{ color: "var(--text-4)" }}>{c.n}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.min}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.max}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.range}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.mode}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.median}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.mean}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.std}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums">{c.variance}</td>
                        <td className="text-center px-2 py-1.5 tabular-nums" style={{ color: "var(--text-3)" }}>{fmtCV(c.cv)}</td>
                        <td className="text-center px-2 py-1.5"><Chip conf={c.confidence} t={t} /></td>
                        <td className="text-center px-2 py-1.5 tabular-nums font-bold" style={{ color: "var(--brand-text)" }}>
                          {c.recommend}<span className="font-normal" style={{ color: "var(--text-4)" }}> ({c.band_lo}–{c.band_hi})</span>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {supName && supCells[tomorrowWd]?.n > 0 && (
          <div className="px-4 py-3 text-sm flex items-center gap-2 flex-wrap" style={{ borderTop: "1px solid var(--border)", background: "var(--brand-bg)" }}>
            <Sparkles size={15} style={{ color: "var(--brand-text)" }} />
            <span style={{ color: "var(--text-2)" }}>
              {t.secPredict}: <b style={{ color: "var(--text-1)" }}>{tl(supName)}</b> · {wd[tomorrowWd]} ({t.nextLabel}) →
              <b style={{ color: "var(--brand-text)" }}> {supCells[tomorrowWd].recommend} {t.workers}</b>
              <span style={{ color: "var(--text-4)" }}> ({supCells[tomorrowWd].band_lo}–{supCells[tomorrowWd].band_hi})</span>
            </span>
            <Chip conf={supCells[tomorrowWd].confidence} t={t} />
          </div>
        )}
      </Card>
    </div>
  );
}
