import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, CalendarDays, UsersRound, ChevronDown, Ban, PencilLine,
  CircleSlash, MinusCircle, ClipboardList,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import ErrorScreen from "../components/ui/ErrorScreen";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import DayReportView, { scoreColor, hexA, fill, Pill } from "../components/leaders/DayReportView";
import { VERIFY } from "../components/leaders/verifyState";
import api from "../utils/api";

/**
 * One brigadir's whole day — `/leaders/unit-report/:mid/:date`.
 *
 * Where the brigadir's day digest DM lands (services/leader_unit_report.py): the
 * rows the message tabled, and under each filed row that leader's own day
 * report, opened in place — the evidence without leaving the unit.
 *
 *  - AUTH-ONLY like `/leaders/report/:uid`, for the same reason: the brigadir
 *    the digest went to is often somebody nobody granted `/leaders` to. The
 *    backend scopes the unit, and refuses it to a leader.
 *  - The page computes nothing. The rows, their order, their states and the
 *    unit's result come from the payload the DM was built from, so the chat and
 *    the page cannot disagree about a row.
 *  - Worst first, and failures OPEN: rows with rejected tasks start expanded —
 *    the day report's own default, one level up.
 */

const T_ALL = {
  uz: {
    title: "Liderlar hisoboti", back: "Orqaga", shift: "smena",
    unit: "Brigada natijasi", filed: "Topshirildi",
    unitRule: "Cheklist topshirishi kerak bo'lgan barcha liderlarning o'rtachasi — topshirmagan lider 0% bo'lib kiradi.",
    checkingNote: "{n} ta hisobot hali tekshirilmoqda — natija o'zgarishi mumkin.",
    notAuto: "Bu kun avtomatik tekshiruvga kirmaydi — belgilar faqat ma'lumot uchun.",
    g_rejected: "Qabul qilinmagan vazifalar bor", g_missing: "Topshirilmagan",
    g_open: "Boshlangan, lekin yopilmagan", g_error: "Tekshirib bo'lmadi",
    g_checking: "Tekshirilmoqda", g_noproof: "Dalil yuborilmagan",
    g_verified: "Tasdiqlangan", g_excluded: "Hisobga olinmaydi",
    s_rejected: "{n} ta vazifa qabul qilinmadi", s_verified: "{n} ta dalil qabul qilindi",
    s_missing: "Bu kun uchun cheklist topshirilmagan", s_open: "Cheklist boshlangan, lekin yopilmagan",
    s_error: "Dalillarni tekshirib bo'lmadi — baho pasaytirilmadi", s_checking: "AI hali tekshirmoqda",
    s_noproof: "Tekshiriladigan dalil yuborilmagan", s_excluded: "Bu kun natijalarga kirmaydi",
    p_rejected: "{n} ta rad etilgan", p_missing: "{n} ta topshirilmagan", p_open: "{n} ta yopilmagan",
    p_error: "{n} ta xatolik", p_checking: "{n} ta tekshirilmoqda", p_noproof: "{n} ta dalilsiz",
    p_verified: "{n} ta tasdiqlangan", p_excluded: "{n} ta hisobga olinmaydi",
    nf: "Hisobot topilmadi", nfBody: "Bu brigada va kun uchun hisobot yo'q.",
    toLeaders: "Lider nazoratiga o'tish",
    empty: "Hali hech narsa yo'q", emptyBody: "Bu kun uchun birorta cheklist topshirilmagan va hech kim kutilmaydi.",
  },
  uz_cyrl: {
    title: "Лидерлар ҳисоботи", back: "Орқага", shift: "смена",
    unit: "Бригада натижаси", filed: "Топширилди",
    unitRule: "Чеклист топшириши керак бўлган барча лидерларнинг ўртачаси — топширмаган лидер 0% бўлиб киради.",
    checkingNote: "{n} та ҳисобот ҳали текширилмоқда — натижа ўзгариши мумкин.",
    notAuto: "Бу кун автоматик текширувга кирмайди — белгилар фақат маълумот учун.",
    g_rejected: "Қабул қилинмаган вазифалар бор", g_missing: "Топширилмаган",
    g_open: "Бошланган, лекин ёпилмаган", g_error: "Текшириб бўлмади",
    g_checking: "Текширилмоқда", g_noproof: "Далил юборилмаган",
    g_verified: "Тасдиқланган", g_excluded: "Ҳисобга олинмайди",
    s_rejected: "{n} та вазифа қабул қилинмади", s_verified: "{n} та далил қабул қилинди",
    s_missing: "Бу кун учун чеклист топширилмаган", s_open: "Чеклист бошланган, лекин ёпилмаган",
    s_error: "Далилларни текшириб бўлмади — баҳо пасайтирилмади", s_checking: "AI ҳали текширмоқда",
    s_noproof: "Текшириладиган далил юборилмаган", s_excluded: "Бу кун натижаларга кирмайди",
    p_rejected: "{n} та рад этилган", p_missing: "{n} та топширилмаган", p_open: "{n} та ёпилмаган",
    p_error: "{n} та хатолик", p_checking: "{n} та текширилмоқда", p_noproof: "{n} та далилсиз",
    p_verified: "{n} та тасдиқланган", p_excluded: "{n} та ҳисобга олинмайди",
    nf: "Ҳисобот топилмади", nfBody: "Бу бригада ва кун учун ҳисобот йўқ.",
    toLeaders: "Лидер назоратига ўтиш",
    empty: "Ҳали ҳеч нарса йўқ", emptyBody: "Бу кун учун бирорта чеклист топширилмаган ва ҳеч ким кутилмайди.",
  },
  ru: {
    title: "Отчёт лидеров", back: "Назад", shift: "смена",
    unit: "Итог бригады", filed: "Сдано",
    unitRule: "Среднее по всем лидерам, которые должны были сдать чек-лист; несданный чек-лист считается как 0%.",
    checkingNote: "Ещё на проверке: {n} — итог может измениться.",
    notAuto: "Этот день не входит в автоматическую проверку — отметки справочные.",
    g_rejected: "Есть непринятые задачи", g_missing: "Не сдано",
    g_open: "Начато, но не закрыто", g_error: "Не удалось проверить",
    g_checking: "На проверке", g_noproof: "Без фото",
    g_verified: "Принято", g_excluded: "Не учитывается",
    s_rejected: "Не принято задач: {n}", s_verified: "Принято подтверждений: {n}",
    s_missing: "Чек-лист за этот день не сдан", s_open: "Чек-лист начат, но не закрыт",
    s_error: "Фото не удалось проверить — оценка не снижена", s_checking: "ИИ ещё проверяет",
    s_noproof: "Нет фото для проверки", s_excluded: "Этот день не входит в результаты",
    p_rejected: "не принято: {n}", p_missing: "не сдано: {n}", p_open: "не закрыто: {n}",
    p_error: "ошибок: {n}", p_checking: "на проверке: {n}", p_noproof: "без фото: {n}",
    p_verified: "принято: {n}", p_excluded: "не учитывается: {n}",
    nf: "Отчёт не найден", nfBody: "Для этой бригады и даты отчёта нет.",
    toLeaders: "К мониторингу лидеров",
    empty: "Пока ничего нет", emptyBody: "За этот день не сдано ни одного чек-листа, и никто не должен был сдавать.",
  },
  en: {
    title: "Leaders' report", back: "Back", shift: "shift",
    unit: "Unit result", filed: "Filed",
    unitRule: "The mean over every leader who owed a checklist — a checklist nobody filed counts as 0%.",
    checkingNote: "{n} report(s) still in review — the result may change.",
    notAuto: "This day is not in automatic verification — the marks are informational.",
    g_rejected: "With rejected tasks", g_missing: "Not filed",
    g_open: "Started, not closed", g_error: "Could not be checked",
    g_checking: "In review", g_noproof: "No proofs",
    g_verified: "Accepted", g_excluded: "Not counted",
    s_rejected: "{n} task(s) not accepted", s_verified: "{n} proof(s) accepted",
    s_missing: "No checklist filed for this day", s_open: "Checklist started but never closed",
    s_error: "Proofs could not be checked — nothing deducted", s_checking: "The AI is still checking",
    s_noproof: "No proofs to check", s_excluded: "This day is out of the results",
    p_rejected: "{n} rejected", p_missing: "{n} not filed", p_open: "{n} not closed",
    p_error: "{n} errors", p_checking: "{n} in review", p_noproof: "{n} without proofs",
    p_verified: "{n} accepted", p_excluded: "{n} not counted",
    nf: "Report not found", nfBody: "There is no report for this unit and date.",
    toLeaders: "Go to leader monitoring",
    empty: "Nothing here yet", emptyBody: "No checklist was filed for this day, and none was owed.",
  },
};

const C_BAD = "#ef4444", C_MID = "#eab308", C_GREY = "#94a3b8";

// One look per row state. The four verification states borrow `VERIFY`, so a
// shield means the same thing here as on the register and the day report; the
// other four are facts about FILING, which verification never touched.
const STATE = {
  rejected: { color: VERIFY.rejected.color, Icon: VERIFY.rejected.Icon },
  missing: { color: C_BAD, Icon: Ban },
  open: { color: C_MID, Icon: PencilLine },
  error: { color: VERIFY.error.color, Icon: VERIFY.error.Icon },
  checking: { color: VERIFY.checking.color, Icon: VERIFY.checking.Icon },
  noproof: { color: C_GREY, Icon: CircleSlash },
  verified: { color: VERIFY.verified.color, Icon: VERIFY.verified.Icon },
  excluded: { color: C_GREY, Icon: MinusCircle },
};

// States whose score is not a verdict — the backend's `NO_SCORE`, and exactly
// the rows the digest prints «—» for.
const NO_SCORE = new Set(["missing", "open", "excluded", "checking"]);

/* ── one checklist ─────────────────────────────────────────────────────────
 * A row names the leader, the cell where the unit files per cell, what the day
 * came to and why, and the score. A filed row opens onto that leader's report;
 * a checklist nobody filed has nothing behind it and is not a button. */
function LeaderRow({ r, T, open, onToggle }) {
  const st = STATE[r.state] || STATE.noproof;
  const StateIcon = st.Icon;
  const hasReport = !!r.uid;
  const scored = r.score != null && !NO_SCORE.has(r.state);
  const bad = r.state === "rejected" || r.state === "missing";
  const nums = (r.rejectedTasks || []).map((t) => `№${t.id}`).join(", ");
  const detail = r.state === "rejected"
    ? `${fill(T.s_rejected, { n: r.counts?.rejected ?? (r.rejectedTasks || []).length })}${nums ? ` · ${nums}` : ""}`
    : r.state === "verified"
      ? fill(T.s_verified, { n: r.counts?.checked ?? 0 })
      : T[`s_${r.state}`] || "";

  const head = (
    <>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: hexA(st.color, 0.14), color: st.color }}>
        <StateIcon size={16} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-[13px] font-semibold leading-snug truncate"
            style={{ color: "var(--text-1)" }}>{r.leader}</span>
          {/* WHICH cell's checklist — a leader on a per-cell unit has one row
              per cell. The verifix code, never the workshop name. */}
          {r.cell && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums flex-shrink-0"
              style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6",
                       border: "1px solid rgba(59,130,246,0.30)" }}>
              {r.cell}
            </span>
          )}
        </span>
        <span className="block text-[11px] leading-snug mt-0.5" style={{ color: "var(--text-3)" }}>
          {detail}
        </span>
      </span>
      <span className="text-lg font-extrabold tabular-nums flex-shrink-0"
        style={{ color: scored ? scoreColor(r.score) : "var(--text-4)" }}>
        {scored ? `${r.score}%` : "—"}
      </span>
      {hasReport && (
        <ChevronDown size={15} className="flex-shrink-0 transition-transform"
          style={{ color: "var(--text-4)", transform: open ? "rotate(180deg)" : "none" }} />
      )}
    </>
  );

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)",
               border: `1px solid ${bad ? hexA(C_BAD, 0.35) : "var(--border)"}` }}>
      {hasReport ? (
        <button type="button" onClick={onToggle} aria-expanded={open}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-2.5 px-3 py-2.5">{head}</div>
      )}
      {/* The leader's own report, fetched only when opened: a unit of eight
          would otherwise load eight reports of photos nobody asked to see. */}
      {hasReport && open && (
        <div className="px-3 pb-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <DayReportView uid={r.uid} embedded />
        </div>
      )}
    </div>
  );
}

export default function LeaderUnitReport() {
  const { mid, date } = useParams();
  const nav = useNavigate();
  const { lang } = useLang();
  const T = T_ALL[lang] || T_ALL.ru;
  // null = "use the default" (failures open), held until the reader touches a
  // row so a refetch never folds a report shut under their finger.
  const [openKeys, setOpenKeys] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderUnitReport", mid, date],
    queryFn: () => api
      .get(`/api/leaders/unit-report/${encodeURIComponent(mid)}/${encodeURIComponent(date)}`)
      .then((r) => r.data),
    retry: false,
  });

  // Grouped in the order the SERVER sorted the rows — worst first — so the page
  // never invents an ordering the digest did not print.
  const groups = useMemo(() => {
    const out = [];
    const at = new Map();
    for (const r of data?.rows || []) {
      if (!at.has(r.state)) { at.set(r.state, out.length); out.push({ state: r.state, rows: [] }); }
      out[at.get(r.state)].rows.push(r);
    }
    return out;
  }, [data]);

  const isOpen = (r) => (openKeys ? openKeys.has(r.key) : r.state === "rejected");
  const toggle = (r) => setOpenKeys((prev) => {
    const next = new Set(prev ?? (data?.rows || [])
      .filter((x) => x.state === "rejected").map((x) => x.key));
    if (next.has(r.key)) next.delete(r.key); else next.add(r.key);
    return next;
  });

  if (isLoading) {
    return (
      <Layout title={T.title}>
        <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
          <SkeletonBlock className="w-full" style={{ height: 84 }} />
          <SkeletonBlock className="w-full" style={{ height: 150 }} />
          {[0, 1, 2, 3].map((i) => (
            <SkeletonBlock key={i} className="w-full" style={{ height: 58 }} />
          ))}
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout title={T.title}>
        <ErrorScreen inline tone="neutral" code="404" title={T.nf} message={T.nfBody}
          action={{ label: T.toLeaders, onClick: () => nav("/leaders") }}
          secondary={{ label: T.back, onClick: () => nav(-1) }} />
      </Layout>
    );
  }

  const c = data.counts || {};
  const unitTone = data.unitScore == null ? "var(--text-4)" : scoreColor(data.unitScore);

  return (
    <Layout title={T.title}>
      <div className="space-y-3 mx-auto" style={{ maxWidth: 760 }}>
        {/* ── whose unit, which day ─────────────────────────────────────── */}
        <div className="rounded-2xl px-4 py-3.5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <button type="button" onClick={() => nav(-1)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold mb-2"
            style={{ color: "var(--text-4)" }}>
            <ArrowLeft size={13} /> {T.back}
          </button>
          <h1 className="text-lg font-bold leading-tight flex items-center gap-2"
            style={{ color: "var(--text-1)" }}>
            <UsersRound size={18} style={{ color: "var(--brand)" }} />{data.supervisor || "—"}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px]"
            style={{ color: "var(--text-3)" }}>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays size={12} style={{ color: "var(--text-4)" }} />{data.date}
            </span>
            {data.shift != null && (
              <span className="px-1.5 py-0.5 rounded font-semibold"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)",
                         border: "1px solid var(--border)" }}>
                {data.shift}-{T.shift}
              </span>
            )}
          </div>
        </div>

        {/* ── the unit's result, and what it is made of ─────────────────── */}
        <div className="rounded-2xl px-4 py-4"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-4)" }}>{T.unit}</p>
              <span className="block text-4xl font-extrabold tabular-nums leading-none mt-1"
                style={{ color: unitTone }}>
                {data.unitScore != null ? `${data.unitScore}%` : "—"}
              </span>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-4)" }}>{T.filed}</p>
              <span className="block text-2xl font-bold tabular-nums leading-none mt-1"
                style={{ color: "var(--text-1)" }}>
                {data.submitted}
                <span className="text-base font-semibold" style={{ color: "var(--text-4)" }}>
                  {" "}/ {data.owed}
                </span>
              </span>
            </div>
          </div>

          {groups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {groups.map((g) => (
                <Pill key={g.state} color={(STATE[g.state] || STATE.noproof).color}
                  text={fill(T[`p_${g.state}`] || "{n}", { n: g.rows.length })} />
              ))}
            </div>
          )}

          {/* What the big number IS. A mean that counts an unfiled checklist as
              0% is not guessable from the number, and without this line a unit
              of all-green rows reading 80% looks like a bug. */}
          <p className="text-[11px] leading-snug mt-2.5" style={{ color: "var(--text-3)" }}>
            {T.unitRule}
          </p>
          {/* An unfinished check must never look like a final answer. */}
          {!data.unitFinal && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: hexA(C_MID, 0.1), color: "var(--text-2)" }}>
              {fill(T.checkingNote, { n: c.checking || 0 })}
            </p>
          )}
          {!data.auto && (
            <p className="text-[11px] leading-snug mt-2.5 rounded-lg px-2.5 py-2"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
              {T.notAuto}
            </p>
          )}
        </div>

        {/* ── the leaders, worst first ─────────────────────────────────── */}
        {groups.length === 0 ? (
          <div className="rounded-2xl"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState title={T.empty} message={T.emptyBody} icon={ClipboardList}
              showUploadLink={false} />
          </div>
        ) : groups.map((g) => (
          <div key={g.state} className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider px-1 pt-1"
              style={{ color: "var(--text-4)" }}>
              {T[`g_${g.state}`] || g.state} · {g.rows.length}
            </p>
            {g.rows.map((r) => (
              <LeaderRow key={r.key} r={r} T={T} open={isOpen(r)} onToggle={() => toggle(r)} />
            ))}
          </div>
        ))}
      </div>
    </Layout>
  );
}
