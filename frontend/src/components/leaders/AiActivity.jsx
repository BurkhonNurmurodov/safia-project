import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles, CheckCircle2, AlertTriangle, XCircle, CalendarRange, Clock, User,
} from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/* ══ what the AI has actually been doing ══════════════════════════════════════
 *
 * The progress strip is arithmetic: a percentage, a remainder, an ETA. None of
 * it answers the question anybody has while metered quota is being spent —
 * *whose reports is it judging, and what is it deciding about them?* «1 129 of
 * 1 174» is equally consistent with a healthy run and with one that has flagged
 * every photo of one unit because their board was moved.
 *
 * So the strip is now a button, and this is behind it. Three readings of the
 * same set, in the order the question is asked:
 *
 *   1. the run itself — is it alive, whose slice, how far, how long.
 *   2. WHO — one row per leader, so "has this unit been covered" is a glance
 *      rather than a scroll.
 *   3. WHAT — the newest verdicts in order, the only view in which a run gone
 *      wrong (every row flagged, every row errored) is obvious at a look.
 *
 * Admin-only, like every other AI surface: the endpoint behind it tests the JWT
 * role itself, and the strip that opens it never renders for anyone else.
 */

const BRAND = "#C8973F";
const GOOD = "#22c55e";
const BAD = "#ef4444";
const WARN = "#eab308";
const FLAT = "#94a3b8";

const FLAGS = ["off_topic", "not_proven", "date_mismatch", "no_date", "unreadable"];
const FLAG_TONE = {
  off_topic: BAD, not_proven: BAD,
  date_mismatch: BRAND, no_date: BRAND, unreadable: FLAT,
};

const TXT = {
  uz: {
    title: "AI tekshiruvi — tafsilotlar",
    subLive: "Hozir nima tekshirilmoqda",
    subIdle: "Oxirgi tekshiruvlar",
    close: "Yopish",
    winRun: "Shu tekshiruv boshidan",
    win24: "Oxirgi 24 soat",
    floor: "AI tekshiruvi {t} dan boshlanadi",
    by: "boshlagan: {t}", byAuto: "o'zi boshladi",
    scope: { unchecked: "Tekshirilmaganlar", flagged: "Shubhalilar", clean: "Tozalar", all: "Hammasi" },
    stChecked: "Tekshirildi", stClean: "Toza", stFlagged: "Shubhali", stErr: "Xatolik",
    tabWho: "Kimlar", tabWhat: "Xulosalar",
    thLeader: "Lider", thSup: "Brigadir", thShift: "Smena", thDays: "Kun",
    thRows: "Tekshirildi", thClean: "Toza", thFlag: "Shubhali", thLast: "Oxirgi",
    emptyTitle: "Hali hech narsa tekshirilmagan",
    emptyBody: "Bu oraliqda AI hech qanday xulosa yozmagan. Hisobotlar kelganda tekshiruv o'zi boshlanadi.",
    capped: "Faqat oxirgi {n} ta xulosa ko'rsatilyapti.",
    okOne: "Toza", flagOne: "Shubhali", errOne: "Xatolik",
    ruled: "hukm chiqarilgan",
    sheet: "Forma", bot: "Bot",
    f_off_topic: "Rasm boshqa narsa haqida", f_not_proven: "Bajarilgani ko'rinmaydi",
    f_date_mismatch: "Sana oynadan tashqarida", f_no_date: "Rasmda sana yo'q",
    f_unreadable: "Rasm o'qilmadi",
  },
  uz_cyrl: {
    title: "AI текшируви — тафсилотлар",
    subLive: "Ҳозир нима текширилмоқда",
    subIdle: "Охирги текширувлар",
    close: "Ёпиш",
    winRun: "Шу текширув бошидан",
    win24: "Охирги 24 соат",
    floor: "AI текшируви {t} дан бошланади",
    by: "бошлаган: {t}", byAuto: "ўзи бошлади",
    scope: { unchecked: "Текширилмаганлар", flagged: "Шубҳалилар", clean: "Тозалар", all: "Ҳаммаси" },
    stChecked: "Текширилди", stClean: "Тоза", stFlagged: "Шубҳали", stErr: "Хатолик",
    tabWho: "Кимлар", tabWhat: "Хулосалар",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена", thDays: "Кун",
    thRows: "Текширилди", thClean: "Тоза", thFlag: "Шубҳали", thLast: "Охирги",
    emptyTitle: "Ҳали ҳеч нарса текширилмаган",
    emptyBody: "Бу оралиқда AI ҳеч қандай хулоса ёзмаган. Ҳисоботлар келганда текширув ўзи бошланади.",
    capped: "Фақат охирги {n} та хулоса кўрсатиляпти.",
    okOne: "Тоза", flagOne: "Шубҳали", errOne: "Хатолик",
    ruled: "ҳукм чиқарилган",
    sheet: "Форма", bot: "Бот",
    f_off_topic: "Расм бошқа нарса ҳақида", f_not_proven: "Бажарилгани кўринмайди",
    f_date_mismatch: "Сана ойнадан ташқарида", f_no_date: "Расмда сана йўқ",
    f_unreadable: "Расм ўқилмади",
  },
  ru: {
    title: "Проверка ИИ — подробности",
    subLive: "Что проверяется сейчас",
    subIdle: "Последние проверки",
    close: "Закрыть",
    winRun: "С начала этой проверки",
    win24: "За последние 24 часа",
    floor: "Проверка ИИ начинается с {t}",
    by: "запустил: {t}", byAuto: "запустилась сама",
    scope: { unchecked: "Непроверенные", flagged: "Сомнительные", clean: "Чистые", all: "Все" },
    stChecked: "Проверено", stClean: "Чисто", stFlagged: "Сомнительно", stErr: "Ошибки",
    tabWho: "Кого проверили", tabWhat: "Заключения",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена", thDays: "Дней",
    thRows: "Проверено", thClean: "Чисто", thFlag: "Сомнительно", thLast: "Последняя",
    emptyTitle: "Пока ничего не проверено",
    emptyBody: "За этот период ИИ не записал ни одного заключения. Проверка запускается сама, когда приходят отчёты.",
    capped: "Показаны только последние {n} заключений.",
    okOne: "Чисто", flagOne: "Сомнительно", errOne: "Ошибка",
    ruled: "есть решение",
    sheet: "Форма", bot: "Бот",
    f_off_topic: "Фото не о том", f_not_proven: "Выполнение не видно",
    f_date_mismatch: "Дата вне окна", f_no_date: "На фото нет даты",
    f_unreadable: "Фото не прочиталось",
  },
  en: {
    title: "AI review — details",
    subLive: "What is being checked right now",
    subIdle: "Recent checks",
    close: "Close",
    winRun: "Since this run started",
    win24: "Last 24 hours",
    floor: "AI review starts from {t}",
    by: "started by {t}", byAuto: "started itself",
    scope: { unchecked: "Unchecked", flagged: "Flagged", clean: "Clean", all: "All" },
    stChecked: "Checked", stClean: "Clean", stFlagged: "Flagged", stErr: "Errors",
    tabWho: "Who was checked", tabWhat: "Verdicts",
    thLeader: "Leader", thSup: "Supervisor", thShift: "Shift", thDays: "Days",
    thRows: "Checked", thClean: "Clean", thFlag: "Flagged", thLast: "Last",
    emptyTitle: "Nothing checked yet",
    emptyBody: "The AI has written no verdicts in this window. Review starts by itself as reports arrive.",
    capped: "Only the latest {n} verdicts are shown.",
    okOne: "Clean", flagOne: "Flagged", errOne: "Error",
    ruled: "ruled on",
    sheet: "Form", bot: "Bot",
    f_off_topic: "Photo is about something else", f_not_proven: "Completion not visible",
    f_date_mismatch: "Date outside the window", f_no_date: "No date on the photo",
    f_unreadable: "Photo unreadable",
  },
};

const fmt = (s, v) => String(s).replace(/\{[nt]\}/g, v);
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "—");
const hhmm = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—"
    : `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** One number and what it means. Four of these are the whole answer to "how did
 *  this window go", and they sit above the tables because that is the order the
 *  question is asked: the shape first, the rows only if the shape is wrong. */
const Tile = ({ icon: Icon, label, value, tone }) => (
  <div className="rounded-xl px-3 py-2.5 min-w-0"
    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
    <div className="flex items-center gap-1.5 mb-1">
      <Icon size={12} className="flex-shrink-0" style={{ color: tone }} />
      <span className="text-[10px] font-bold uppercase tracking-wider truncate"
        style={{ color: "var(--text-4)" }}>{label}</span>
    </div>
    <span className="text-lg font-bold tabular-nums leading-none" style={{ color: tone }}>
      {value.toLocaleString()}
    </span>
  </div>
);

/** Verdict as a word plus a colour, never a colour alone. */
const StatusChip = ({ status, T }) => {
  const [tone, label] = status === "flagged" ? [BAD, T.flagOne]
    : status === "error" ? [WARN, T.errOne] : [GOOD, T.okOne];
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
      style={{ background: `${tone}1F`, color: tone, border: `1px solid ${tone}55` }}>
      <i className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone }} />
      {label}
    </span>
  );
};

export default function AiActivity({ open, onClose, progress }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const [tab, setTab] = useState("who");

  const live = !!progress?.active;

  const { data, isLoading } = useQuery({
    queryKey: ["leader-ai-activity"],
    queryFn: () => api.get("/api/leader-ai/activity", { params: { limit: 60 } })
      .then((r) => r.data),
    enabled: open,
    // Follows the run: a live drain writes a verdict every few seconds and a
    // feed that does not move looks broken. Idle, the window is the last 24
    // hours and nothing in it changes without a run.
    refetchInterval: open && live ? 5000 : false,
  });

  if (!open) return null;

  const totals = data?.totals || {};
  const people = data?.people || [];
  const recent = data?.recent || [];
  const nothing = !isLoading && !recent.length;

  const p = progress;
  const pct = live && p?.total
    ? Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100)) : null;

  return (
    <Modal open onClose={onClose} maxWidth="max-w-3xl"
      title={T.title} subtitle={live ? T.subLive : T.subIdle}
      icon={<Sparkles size={16} />}
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}>

      {/* ── the run, spelled out ──────────────────────────────────────────────
          The strip that opened this had room for a percentage and little else.
          Here the same run says which slice it covers, who started it and how
          far it has got — the three things that make a number believable. */}
      <div className="rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0${live ? " animate-pulse" : ""}`}
            style={{ background: live ? BRAND : FLAT }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {data?.scoped ? T.winRun : T.win24}
          </span>
          {pct != null && (
            <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
              {p.done.toLocaleString()} / {p.total.toLocaleString()} · {pct}%
            </span>
          )}
        </div>

        {pct != null && (
          <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: "var(--bg-inner)" }}
            role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.done}>
            <div className="h-full rounded-full transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%`, background: BRAND }} />
          </div>
        )}

        <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap text-[11px]"
          style={{ color: "var(--text-4)" }}>
          {/* WHOSE rows, in words. A run narrowed to one brigadir is otherwise
              indistinguishable from one over the whole plant. */}
          {live && p?.scope && (
            <span>{T.scope[p.scope] || p.scope}
              {p.from || p.to ? ` · ${(p.from || "…").slice(5)}–${(p.to || "…").slice(5)}` : ""}
              {p.narrow?.length ? ` · ${p.narrow.join(" · ")}` : ""}</span>
          )}
          {live && <><span>·</span><span>{p?.by ? fmt(T.by, p.by) : T.byAuto}</span></>}
          {/* The floor. Every "why was this old day never checked" question ends
              here, and it used to be a settings row nobody could read. */}
          {data?.floor && (
            <span className="inline-flex items-center gap-1 ml-auto">
              <CalendarRange size={11} />{fmt(T.floor, ddmm(data.floor))}
            </span>
          )}
        </div>
      </div>

      {/* What the window came to. Errors only when there are some — a standing
          «0 errors» makes a clean run look like it has a problem to read. */}
      <div className={`grid gap-2 ${totals.errors ? "grid-cols-4" : "grid-cols-3"}`}>
        <Tile icon={Sparkles} label={T.stChecked} value={totals.judged || 0} tone="var(--text-1)" />
        <Tile icon={CheckCircle2} label={T.stClean} value={totals.clean || 0} tone={GOOD} />
        <Tile icon={AlertTriangle} label={T.stFlagged} value={totals.flagged || 0} tone={BAD} />
        {!!totals.errors && (
          <Tile icon={XCircle} label={T.stErr} value={totals.errors} tone={WARN} />
        )}
      </div>

      {isLoading && <SkeletonBlock className="h-64 rounded-2xl" />}

      {nothing && (
        <EmptyState icon={Sparkles} title={T.emptyTitle} message={T.emptyBody}
          showUploadLink={false} />
      )}

      {!isLoading && !nothing && (
        <>
          <div>
            <SegmentedToggle asTabs ariaLabel={T.title} value={tab} onChange={setTab}
              options={[
                { value: "who", label: `${T.tabWho} · ${people.length}` },
                { value: "what", label: `${T.tabWhat} · ${recent.length}` },
              ]} />
          </div>

          {/* ── WHO ────────────────────────────────────────────────────────────
              The literal answer to "whose data has been reviewed". Sorted by
              flags then volume, server-side: the unit worth opening is the one
              with decisions behind it, and ninety leaders in alphabetical order
              bury it. */}
          {tab === "who" && (
            <TableCard maxHeight="46vh">
              <thead>
                <tr>
                  <Th label={T.thLeader} icon={User} />
                  <Th label={T.thSup} cls="hidden sm:table-cell" />
                  <Th label={T.thShift} align="center" />
                  <Th label={T.thDays} align="center" cls="hidden sm:table-cell" />
                  <Th label={T.thRows} align="right" />
                  <Th label={T.thClean} align="right" cls="hidden sm:table-cell" />
                  <Th label={T.thFlag} align="right" />
                  <Th label={T.thLast} align="right" cls="hidden sm:table-cell" />
                </tr>
              </thead>
              <tbody>
                {people.map((r) => (
                  <tr key={`${r.leaderId || "x"}-${r.leader}`}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{r.leader}</td>
                    <td className="px-3 py-2 hidden sm:table-cell" style={{ color: "var(--text-3)" }}>{r.supervisor}</td>
                    <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                      {r.shift ? `S${r.shift}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums hidden sm:table-cell"
                      style={{ color: "var(--text-3)" }}>{r.days}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: "var(--text-1)" }}>{r.rows}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                      style={{ color: r.clean ? GOOD : "var(--text-4)" }}>{r.clean}</td>
                    {/* Zero flags stay muted — the point of the column is the
                        rows that are NOT zero. */}
                    <td className="px-3 py-2 text-right tabular-nums font-semibold"
                      style={{ color: r.flagged ? BAD : "var(--text-4)" }}>{r.flagged}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell"
                      style={{ color: "var(--text-4)" }}>{hhmm(r.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableCard>
          )}

          {/* ── WHAT ───────────────────────────────────────────────────────────
              Newest first, with the flags in words. This is the view where a run
              that has gone wrong announces itself: forty rows, every one
              flagged with the same reason, is a criteria bug and not forty
              careless leaders. */}
          {tab === "what" && (
            <div className="rounded-2xl overflow-hidden overflow-y-auto"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", maxHeight: "46vh" }}>
              {recent.map((it, i) => (
                <div key={it.ref} className="px-3 py-2.5 flex items-start gap-2.5"
                  style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                  <span className="text-[11px] tabular-nums pt-0.5 flex-shrink-0 inline-flex items-center gap-1"
                    style={{ color: "var(--text-4)" }}>
                    <Clock size={10} />{hhmm(it.reviewedAt)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
                        {it.leader}
                      </span>
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                        {ddmm(it.date)}{it.shift ? ` · S${it.shift}` : ""} · {it.source === "bot" ? T.bot : T.sheet}
                      </span>
                      <StatusChip status={it.status} T={T} />
                      {/* A flag a human has already ruled on is not an open
                          question — say so rather than showing it as one. */}
                      {it.resolution && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md"
                          style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>
                          {T.ruled}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                      {it.taskLabel}
                    </p>
                    {!!it.flags?.length && (
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {it.flags.filter((f) => FLAGS.includes(f)).map((f) => (
                          <span key={f} className="inline-flex items-center gap-1 text-[10px]"
                            style={{ color: FLAG_TONE[f] || FLAT }}>
                            <i className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: FLAG_TONE[f] || FLAT }} />
                            {T[`f_${f}`] || f}
                          </span>
                        ))}
                      </div>
                    )}
                    {it.status === "error" && it.error && (
                      <p className="text-[11px] mt-1 break-words" style={{ color: WARN }}>{it.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Said out loud rather than silently truncated. */}
          {data?.capped && (
            <p className="text-[11px] mt-2" style={{ color: "var(--text-4)" }}>
              {fmt(T.capped, recent.length)}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
