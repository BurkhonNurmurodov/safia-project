import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarRange, ChevronLeft, ChevronRight, X, Sparkles,
  TrendingUp, TrendingDown, Check, AlertTriangle, History,
  Target, Award, Send, CheckCircle,
} from "lucide-react";
import api from "../utils/api";
import { SkeletonBlock } from "./ui/Skeleton";
import DateRangePicker from "./ui/DateRangePicker";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import ConfirmDialog from "./ui/ConfirmDialog";
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
    callBtn: "Ertangi chaqiruv", callTitle: "Smenaga chaqirish", shiftLabel: (n) => `${n}-smena`,
    callDisclaimer: "Sonlar tarix asosida avtomatik hisoblangan taxmin — noaniq bo'lishi mumkin. Yuborishdan oldin tekshirib, kerak bo'lsa tahrirlang.",
    selectAll: "Hammasi", notRegistered: "Ro'yxatdan o'tmagan", noForecast: "Bashorat yo'q",
    sentLabel: "Yuborilgan", sendBtn: (n) => `Yuborish (${n})`, cancel: "Bekor qilish",
    resendTitle: "Qayta yuborish?", resendMsg: (n) => `${n} brigadirga ertaga uchun chaqiruv allaqachon yuborilgan. Yana yuborilsinmi?`,
    toastSent: (n) => `${n} brigadirga chaqiruv yuborildi`,
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
    callBtn: "Эртанги чақирув", callTitle: "Эртанги сменага чақириш",
    callDisclaimer: "Сонлар тарих асосида автоматик ҳисобланган тахмин — ноаниқ бўлиши мумкин. Юборишдан олдин текшириб, керак бўлса таҳрирланг.",
    selectAll: "Ҳаммаси", notRegistered: "Рўйхатдан ўтмаган", noForecast: "Башорат йўқ",
    sentLabel: "Юборилган", sendBtn: (n) => `Юбориш (${n})`, cancel: "Бекор қилиш",
    resendTitle: "Қайта юбориш?", resendMsg: (n) => `${n} бригадирга эртага учун чақирув аллақачон юборилган. Яна юборилсинми?`,
    toastSent: (n) => `${n} бригадирга чақирув юборилди`,
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
    callBtn: "Вызов на завтра", callTitle: "Вызов на смену — завтра",
    callDisclaimer: "Числа — автоматический прогноз на основе истории, они могут быть неточными. Проверьте и при необходимости отредактируйте перед отправкой.",
    selectAll: "Все", notRegistered: "Не зарегистрирован", noForecast: "Нет прогноза",
    sentLabel: "Отправлено", sendBtn: (n) => `Отправить (${n})`, cancel: "Отмена",
    resendTitle: "Отправить повторно?", resendMsg: (n) => `${n} бригадир(ам) уже отправлен вызов на завтра. Отправить ещё раз?`,
    toastSent: (n) => `Вызов отправлен: ${n} бригадир(ов)`,
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
    callBtn: "Tomorrow's call", callTitle: "Call for tomorrow's shift",
    callDisclaimer: "These numbers are an automatic forecast based on history and may be inaccurate. Review and edit them before sending.",
    selectAll: "All", notRegistered: "Not registered", noForecast: "No forecast",
    sentLabel: "Sent", sendBtn: (n) => `Send (${n})`, cancel: "Cancel",
    resendTitle: "Send again?", resendMsg: (n) => `${n} brigadir(s) were already notified for tomorrow. Send again?`,
    toastSent: (n) => `Notified ${n} brigadir(s)`,
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
      style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }} onClick={onClose}>
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

// ── call-tomorrow modal ───────────────────────────────────────────────────────
// One row per brigadir with tomorrow's forecast (all supervisors — deliberately
// ignores the brigadir/shift filters so nobody is left out), but the counts DO
// follow the page's "Smena unumi" (shift-efficiency) setting so the numbers sent
// match the forecast/stats tables. Numbers are editable one-offs: they go into
// the notification only and never overwrite the stored forecast.
function CallTomorrowModal({ t, tl, lang, effPct, onClose, onSent }) {
  const wd = WD[lang] || WD.uz;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["trud-call-tomorrow", effPct],
    queryFn: () => api.get("/api/production/trudoyomkost/call-tomorrow", {
      params: { capacity_pct: effPct },
    }).then((r) => r.data),
    staleTime: 0,
    gcTime: 0,
  });
  const rows = data?.rows ?? [];

  const [values, setValues] = useState({});    // manager_id → input string
  const [checked, setChecked] = useState({});  // manager_id → bool
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // seed once per fetch: everyone with a forecast AND a claimed profile is
  // pre-selected; edge rows (no forecast / not registered) start unchecked
  useEffect(() => {
    if (!data) return;
    const v = {}, c = {};
    data.rows.forEach((r) => {
      v[r.manager_id] = r.forecast != null ? String(r.forecast) : "";
      c[r.manager_id] = r.forecast != null && r.registered;
    });
    setValues(v);
    setChecked(c);
  }, [data]);

  const numOf = (id) => {
    const n = parseInt(values[id], 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const selectable = rows.filter((r) => numOf(r.manager_id) != null);
  const selected = selectable.filter((r) => checked[r.manager_id]);
  const allOn = selectable.length > 0 && selected.length === selectable.length;

  const setValue = (id, raw) => {
    setValues((v) => ({ ...v, [id]: raw }));
    // an emptied/invalid number can't stay selected
    const n = parseInt(raw, 10);
    if (!(Number.isFinite(n) && n >= 0)) setChecked((c) => ({ ...c, [id]: false }));
  };

  const doSend = () => {
    setSending(true);
    setError(null);
    api.post("/api/production/trudoyomkost/call-notify", {
      date: data.date,
      capacity_pct: effPct,
      items: selected.map((r) => ({
        manager_id: r.manager_id,
        workers: numOf(r.manager_id),
        max_workers: r.band_hi != null ? r.band_hi : numOf(r.manager_id),
      })),
    })
      .then((res) => { onSent(res.data.sent); onClose(); })
      .catch((e) => setError(e?.response?.data?.detail || "Failed"))
      .finally(() => setSending(false));
  };
  const trySend = () => {
    if (selected.some((r) => r.last_notice)) setConfirm(true);
    else doSend();
  };

  const dateSub = data
    ? `${wd.f[(new Date(data.date + "T00:00:00").getDay() + 6) % 7]} · ${ddmm(data.date)}`
    : "";
  const hhmm = (iso) => {
    try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  };

  return (
    <>
      <Modal
        onClose={sending ? null : onClose}
        dismissable={!sending}
        title={t.callTitle}
        subtitle={dateSub}
        icon={<Send size={16} style={{ color: "var(--brand-text)" }} />}
        maxWidth="max-w-md"
        bodyClassName="px-5 py-4 space-y-2"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={sending}>{t.cancel}</Button>
            <Button icon={<Send size={14} />} loading={sending} disabled={!selected.length} onClick={trySend}>
              {t.sendBtn(selected.length)}
            </Button>
          </>
        }
      >
        {/* the forecast is an automatic estimate — say so up front */}
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-[12px] leading-snug"
          style={{ background: "#f59e0b14", border: "1px solid #f59e0b40", color: "var(--text-2)" }}>
          <AlertTriangle size={14} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
          <span>{t.callDisclaimer}</span>
        </div>

        {isLoading ? (
          <div className="space-y-2 pt-1">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-11 w-full" />)}
          </div>
        ) : isError || !rows.length ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{t.noData}</div>
        ) : (
          <>
            <label className="flex items-center gap-2.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider select-none"
              style={{ color: "var(--text-4)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={allOn}
                onChange={(e) => {
                  const on = e.target.checked;
                  setChecked((c) => {
                    const next = { ...c };
                    selectable.forEach((r) => { next[r.manager_id] = on; });
                    return next;
                  });
                }}
                style={{ accentColor: "var(--brand)" }}
              />
              {t.selectAll}
              <span className="ml-auto normal-case font-normal tabular-nums">{selected.length}/{rows.length}</span>
            </label>

            <div className="space-y-1.5">
              {rows.map((r) => {
                const id = r.manager_id;
                const valid = numOf(id) != null;
                const on = !!checked[id] && valid;
                return (
                  <label key={id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl select-none"
                    style={{
                      background: "var(--bg-inner)",
                      border: `1px solid ${on ? "var(--brand-border)" : "var(--border)"}`,
                      cursor: valid ? "pointer" : "default",
                      opacity: valid ? 1 : 0.75,
                    }}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!valid || sending}
                      onChange={(e) => setChecked((c) => ({ ...c, [id]: e.target.checked }))}
                      style={{ accentColor: "var(--brand)", flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(r.name)}</div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-[10px]">
                        {r.forecast == null && (
                          <span className="px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
                            {t.noForecast}
                          </span>
                        )}
                        {!r.registered && (
                          <span className="px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: "#ef44441a", border: "1px solid #ef444440", color: "#ef4444" }}>
                            {t.notRegistered}
                          </span>
                        )}
                        {r.last_notice && (
                          <span className="inline-flex items-center gap-1 font-medium tabular-nums" style={{ color: "#22c55e" }}>
                            <CheckCircle size={11} />
                            {t.sentLabel} {hhmm(r.last_notice.sent_at)} · {r.last_notice.workers}
                            {r.last_notice.by ? ` · ${tl(r.last_notice.by)}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    {r.forecast != null && <Chip conf={r.confidence} t={t} />}
                    <input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={values[id] ?? ""}
                      disabled={sending}
                      onClick={(e) => e.preventDefault()}
                      onChange={(e) => setValue(id, e.target.value)}
                      className="w-16 px-2 py-1.5 rounded-lg text-sm font-bold tabular-nums text-center flex-shrink-0"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    />
                  </label>
                );
              })}
            </div>

            {error && (
              <div className="text-[12px] px-1 pt-1" style={{ color: "#ef4444" }}>{error}</div>
            )}
          </>
        )}
      </Modal>

      {confirm && (
        <ConfirmDialog
          title={t.resendTitle}
          message={t.resendMsg(selected.filter((r) => r.last_notice).length)}
          confirmLabel={t.sendBtn(selected.length)}
          cancelLabel={t.cancel}
          loading={sending}
          onCancel={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); doSend(); }}
        />
      )}
    </>
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
  const [callOpen, setCallOpen] = useState(false);      // call-tomorrow modal
  const [sentToast, setSentToast] = useState(null);     // how many brigadirs were just notified
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

  // when a single date is picked, the table collapses to just that weekday's column
  const singleWd = pickedDate ? (new Date(pickedDate + "T00:00:00").getDay() + 6) % 7 : null;
  const wdCols = singleWd != null ? [singleWd] : [0, 1, 2, 3, 4, 5, 6];
  const activeWd = singleWd ?? selWd ?? defaultWd;
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

  // when a single date is active, the arrows step day-by-day; otherwise week-by-week
  const goPrev = () => pickedDate ? setPickedDate((d) => addDaysISO(d, -1)) : setWeekStart((w) => addDaysISO(w, -7));
  const goNext = () => pickedDate ? setPickedDate((d) => addDaysISO(d, 1)) : setWeekStart((w) => addDaysISO(w, 7));

  const Header = (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <CalendarRange size={14} style={{ color: "var(--brand-text)" }} /> {t.title}
        <span className="normal-case font-normal" style={{ color: "var(--text-4)" }}>· {t.maNote(weeks)}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => setCallOpen(true)}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
          <Send size={12} /> {t.callBtn}
        </button>
        {pickedDate ? (
          <button onClick={() => setPickedDate(null)}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
            <X size={12} /> {t.allDays}
          </button>
        ) : weekStart !== curWeek ? (
          <button onClick={() => setWeekStart(curWeek)}
            className="text-[11px] font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
            {t.thisWeek}
          </button>
        ) : null}
        <button onClick={goPrev}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
          <ChevronLeft size={15} />
        </button>
        <span className="text-xs font-semibold tabular-nums px-1.5 min-w-[96px] text-center" style={{ color: "var(--text-1)" }}>
          {pickedDate
            ? `${wd.s[singleWd]} ${ddmm(pickedDate)}`
            : weekDates.length ? `${ddmm(weekDates[0])} – ${ddmm(weekDates[6])}` : `${ddmm(weekStart)} – ${ddmm(addDaysISO(weekStart, 6))}`}
        </span>
        <button onClick={goNext}
          className="p-1.5 rounded-lg transition-colors hover:bg-white/10" style={{ border: "1px solid var(--border-md)", color: "var(--text-2)" }}>
          <ChevronRight size={15} />
        </button>
        {/* single-day picker — the app's custom calendar popover (no native date
            input, which misbehaves in the Telegram webview); a picked day drives
            the single-column view. Collapse any range to its start date. */}
        <DateRangePicker
          single
          dateFrom={pickedDate || ""}
          dateTo={pickedDate || ""}
          setDateFrom={(d) => setPickedDate(d || null)}
          setDateTo={() => {}}
        />
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
            <table className={`text-[11px] border-collapse ${singleWd == null ? "w-full" : ""}`} style={{ minWidth: singleWd == null ? 640 : 320 }}>
              <thead>
                <tr style={{ background: "var(--brand)", color: "#fff" }}>
                  <th className="text-left px-3 py-1.5 font-semibold sticky left-0" style={{ background: "var(--brand)", zIndex: 1 }}>{t.supervisor}</th>
                  {wdCols.map((i) => {
                    const isToday = weekDates[i] === today;
                    const active = i === activeWd;
                    return (
                      <th key={i} onClick={() => setSelWd(i)} title={t.pickDateHint}
                        className="px-2 py-1.5 font-semibold text-center select-none"
                        style={{ cursor: "pointer", background: active ? "rgba(255,255,255,.28)" : isToday ? "rgba(255,255,255,.16)" : undefined }}>
                        <div>{wd.s[i]}</div>
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
                    {wdCols.map((w) => {
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

      {callOpen && (
        <CallTomorrowModal
          t={t} tl={tl} lang={lang} effPct={effPct}
          onClose={() => setCallOpen(false)}
          onSent={(n) => {
            setSentToast(n);
            setTimeout(() => setSentToast(null), 4000);
          }}
        />
      )}

      {/* notify success toast — fixed top-right, same look as the export toast */}
      {sentToast != null && (
        <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 320,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}>
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t.toastSent(sentToast)}</span>
        </div>
      )}
    </div>
    </div>
  );
}
