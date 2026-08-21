import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle, ShieldAlert, Hourglass, Camera } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Pagination from "../ui/Pagination";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import ScopeNotice from "./ScopeNotice";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import api from "../../utils/api";

/**
 * «Ma'lumotlarni tozalash» — the admin-only second view of the Shift 2 leader
 * monitoring page. Deletes bot-filed checklist days permanently: test runs,
 * a day answered for the wrong date, a leader who filed under someone else.
 *
 * Design rules this leans on:
 *  - the operator deletes what they can SEE. The effective selection is always
 *    the intersection with the current filter, so narrowing the filter can
 *    never leave an invisible row armed for deletion.
 *  - the confirm dialog prints the exact cost (days / answers / photos / who /
 *    which dates) instead of a generic "are you sure", and a delete that would
 *    empty the whole register demands a typed challenge.
 *  - a failed delete leaves the dialog standing with the reason on it — this is
 *    a Telegram WebView, where window.alert() is silently swallowed.
 */

const CHALLENGE = "CLEAR";
const PAGE_SIZE = 20;

const TXT = {
  uz: {
    title: "Bot orqali yuborilgan kunlar", sub: "Faqat yopilgan kunlar",
    warn: "O'chirilgan ma'lumot qaytarilmaydi. Google Form (jadval) tarixi, vazifalar sozlamasi va kanaldagi rasmlar saqlanib qoladi.",
    searchPh: "Lider yoki brigadir…", allSups: "Barcha brigadirlar", allLeaders: "Barcha liderlar",
    thDate: "Sana", thLeader: "Lider", thSup: "Brigadir", thShift: "Smena",
    thTasks: "Vazifalar", thMedia: "Rasm", thScore: "Natija", thClosed: "Yopilgan",
    del: "O'chirish", delN: "O'chirish ({n})", selected: "{n} ta kun tanlandi",
    rows: "{n} ta kun", clearSel: "Bekor qilish",
    confirmTitle: "{n} ta kun butunlay o'chirilsinmi?",
    cDays: "Kunlar", cTasks: "Vazifa javoblari", cMedia: "Rasmlar",
    cLeaders: "Liderlar", cRange: "Sana oralig'i",
    confirmAll: "Bu — bazadagi BARCHA bot ma'lumotlari.",
    challengeLabel: "Tasdiqlash uchun «CLEAR» deb yozing",
    deleted: "{n} ta kun o'chirildi", failed: "O'chirib bo'lmadi",
    emptyTitle: "Bot ma'lumotlari yo'q",
    emptyMsg: "Liderlar hali botda birorta kunni yopmagan.",
    noMatch: "Filtrga mos kun topilmadi",
  },
  uz_cyrl: {
    title: "Бот орқали юборилган кунлар", sub: "Фақат ёпилган кунлар",
    warn: "Ўчирилган маълумот қайтарилмайди. Google Форма (жадвал) тарихи, вазифалар созламаси ва каналдаги расмлар сақланиб қолади.",
    searchPh: "Лидер ёки бригадир…", allSups: "Барча бригадирлар", allLeaders: "Барча лидерлар",
    thDate: "Сана", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thTasks: "Вазифалар", thMedia: "Расм", thScore: "Натижа", thClosed: "Ёпилган",
    del: "Ўчириш", delN: "Ўчириш ({n})", selected: "{n} та кун танланди",
    rows: "{n} та кун", clearSel: "Бекор қилиш",
    confirmTitle: "{n} та кун бутунлай ўчирилсинми?",
    cDays: "Кунлар", cTasks: "Вазифа жавоблари", cMedia: "Расмлар",
    cLeaders: "Лидерлар", cRange: "Сана оралиғи",
    confirmAll: "Бу — базадаги БАРЧА бот маълумотлари.",
    challengeLabel: "Тасдиқлаш учун «CLEAR» деб ёзинг",
    deleted: "{n} та кун ўчирилди", failed: "Ўчириб бўлмади",
    emptyTitle: "Бот маълумотлари йўқ",
    emptyMsg: "Лидерлар ҳали ботда биронта кунни ёпмаган.",
    noMatch: "Филтрга мос кун топилмади",
  },
  ru: {
    title: "Дни, заполненные в боте", sub: "Только закрытые дни",
    warn: "Удалённые данные не восстанавливаются. История Google Формы, настройки задач и фото в канале остаются на месте.",
    searchPh: "Лидер или бригадир…", allSups: "Все бригадиры", allLeaders: "Все лидеры",
    thDate: "Дата", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thTasks: "Задачи", thMedia: "Фото", thScore: "Результат", thClosed: "Закрыт",
    del: "Удалить", delN: "Удалить ({n})", selected: "Выбрано дней: {n}",
    rows: "{n} дн.", clearSel: "Сбросить",
    confirmTitle: "Удалить {n} дн. безвозвратно?",
    cDays: "Дней", cTasks: "Ответов по задачам", cMedia: "Фото",
    cLeaders: "Лидеров", cRange: "Период",
    confirmAll: "Это ВСЕ данные бота в базе.",
    challengeLabel: "Введите «CLEAR» для подтверждения",
    deleted: "Удалено дней: {n}", failed: "Не удалось удалить",
    emptyTitle: "Данных бота нет",
    emptyMsg: "Лидеры ещё не закрыли ни одного дня в боте.",
    noMatch: "По фильтру ничего не найдено",
  },
  en: {
    title: "Days filed in the bot", sub: "Closed days only",
    warn: "Deleted data cannot be restored. The Google Form (sheet) history, the task config and the photos in the archive channel all stay.",
    searchPh: "Leader or supervisor…", allSups: "All supervisors", allLeaders: "All leaders",
    thDate: "Date", thLeader: "Leader", thSup: "Supervisor", thShift: "Shift",
    thTasks: "Tasks", thMedia: "Photos", thScore: "Score", thClosed: "Closed",
    del: "Delete", delN: "Delete ({n})", selected: "{n} days selected",
    rows: "{n} days", clearSel: "Clear",
    confirmTitle: "Delete {n} days permanently?",
    cDays: "Days", cTasks: "Task answers", cMedia: "Photos",
    cLeaders: "Leaders", cRange: "Date range",
    confirmAll: "That is EVERY bot submission in the database.",
    challengeLabel: "Type «CLEAR» to confirm",
    deleted: "{n} days deleted", failed: "Could not delete",
    emptyTitle: "No bot data",
    emptyMsg: "No leader has closed a day in the bot yet.",
    noMatch: "Nothing matches the filter",
  },
};

const ddmm = (iso) => (iso ? iso.split("-").reverse().join(".") : "—");
const hhmm = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Normalised name compare — this register, the dashboard and the late queue
 *  all print the same person from the same profile row; only casing and stray
 *  spacing ever differ between them. */
const same = (a, b) =>
  String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/** Does this submitted day survive the PAGE scope bar? Same (leader, day)
 *  universe as every other tab, so the page's period / shift / supervisor /
 *  leader mean exactly what they mean there. */
const inScope = (r, s) => {
  if (!s) return true;
  const d = String(r.date || "").slice(0, 10);
  if (s.from && d < s.from) return false;
  if (s.to && d > s.to) return false;
  if (s.shift != null && r.shift !== s.shift) return false;
  if (s.supervisor && !same(r.supervisor, s.supervisor)) return false;
  if (s.leader && !same(r.leader, s.leader)) return false;
  return true;
};

/**
 * The «yakunlanmagan» view's own words. Kept as a second map rather than folded
 * into TXT above: those strings live under a red delete banner and this view
 * deletes nothing — it explains why a day the leader filled is not on the
 * register. Merged per-language at render, so a missing key still falls back to
 * Uzbek exactly like the rest of the tab.
 */
const OPEN_TXT = {
  uz: {
    tabClosed: "Yuborilgan", tabOpen: "Yakunlanmagan",
    openTitle: "Yakunlanmagan kunlar", openSub: "Lider hali yubormagan",
    openWarn:
      "Bu kunlar bazada bor, lekin lider ularni botda YOPMAGAN — shuning uchun ular hisobot ro'yxatida ham, AI navbatida ham ko'rinmaydi. " +
      "Kun faqat barcha vazifalarga javob berilgandan keyin yopiladi: kamerali vazifada kerakli rasm soni to'lmasa, javob yozilmaydi va «Kunni yopish» ishlamaydi.",
    thProgress: "Javob", thRoll: "Kutayotgan rasm", thState: "Holat", thOpened: "Sana",
    stStuck: "Muddati o'tgan", stActive: "Davom etmoqda",
    stStuckHint: "Lider botni keyingi marta ochganda avtomatik yopiladi",
    stActiveHint: "Kun hali davom etmoqda",
    missingN: "{n} ta vazifa javobsiz", missingNone: "Hammasi javoblangan",
    perTaskChip: "1×1",
    openEmptyTitle: "Yakunlanmagan kun yo'q",
    openEmptyMsg: "Har bir boshlangan checklist yopilgan.",
    rollHint: "Serverda javobsiz vazifalar uchun saqlangan rasmlar",
  },
  uz_cyrl: {
    tabClosed: "Юборилган", tabOpen: "Якунланмаган",
    openTitle: "Якунланмаган кунлар", openSub: "Лидер ҳали юбормаган",
    openWarn:
      "Бу кунлар базада бор, лекин лидер уларни ботда ЁПМАГАН — шунинг учун улар ҳисобот рўйхатида ҳам, AI навбатида ҳам кўринмайди. " +
      "Кун фақат барча вазифаларга жавоб берилгандан кейин ёпилади: камерали вазифада керакли расм сони тўлмаса, жавоб ёзилмайди ва «Кунни ёпиш» ишламайди.",
    thProgress: "Жавоб", thRoll: "Кутаётган расм", thState: "Ҳолат", thOpened: "Сана",
    stStuck: "Муддати ўтган", stActive: "Давом этмоқда",
    stStuckHint: "Лидер ботни кейинги марта очганда автоматик ёпилади",
    stActiveHint: "Кун ҳали давом этмоқда",
    missingN: "{n} та вазифа жавобсиз", missingNone: "Ҳаммаси жавобланган",
    perTaskChip: "1×1",
    openEmptyTitle: "Якунланмаган кун йўқ",
    openEmptyMsg: "Ҳар бир бошланган чеклист ёпилган.",
    rollHint: "Серверда жавобсиз вазифалар учун сақланган расмлар",
  },
  ru: {
    tabClosed: "Отправленные", tabOpen: "Незавершённые",
    openTitle: "Незавершённые дни", openSub: "Лидер ещё не отправил",
    openWarn:
      "Эти дни есть в базе, но лидер НЕ ЗАКРЫЛ их в боте — поэтому их нет ни в списке отчётов, ни в очереди AI. " +
      "День закрывается только после ответа на все задачи: если в задаче с камерой не набрано нужное число фото, ответ не записывается и «Закрыть день» не срабатывает.",
    thProgress: "Ответы", thRoll: "Фото в ожидании", thState: "Статус", thOpened: "Дата",
    stStuck: "Срок истёк", stActive: "В процессе",
    stStuckHint: "Закроется автоматически, когда лидер снова откроет бота",
    stActiveHint: "День ещё идёт",
    missingN: "{n} задач без ответа", missingNone: "Все задачи отвечены",
    perTaskChip: "1×1",
    openEmptyTitle: "Незавершённых дней нет",
    openEmptyMsg: "Каждый начатый чек-лист закрыт.",
    rollHint: "Фото, уже лежащие на сервере для задач без ответа",
  },
  en: {
    tabClosed: "Submitted", tabOpen: "Unfinished",
    openTitle: "Unfinished days", openSub: "The leader has not submitted yet",
    openWarn:
      "These days exist in the database, but the leader never CLOSED them in the bot — which is why they appear neither in the report register nor in the AI queue. " +
      "A day closes only once every task is answered: a camera task short of its required photo count writes no answer, so «Close the day» refuses.",
    thProgress: "Answered", thRoll: "Photos waiting", thState: "State", thOpened: "Date",
    stStuck: "Past its window", stActive: "In progress",
    stStuckHint: "Closes automatically the next time the leader opens the bot",
    stActiveHint: "The day is still running",
    missingN: "{n} tasks unanswered", missingNone: "All tasks answered",
    perTaskChip: "1×1",
    openEmptyTitle: "No unfinished days",
    openEmptyMsg: "Every checklist that was started has been closed.",
    rollHint: "Photos already on the server for tasks with no answer",
  },
};

/**
 * The three marks an unfinished row carries. Small on purpose: the row already
 * prints the numbers, and these say what the numbers MEAN.
 *
 * Colours follow the platform status palette — a day past its filing window and
 * still unsubmitted is overdue (red), one still inside it is simply not started
 * yet (slate), and photos the server is holding for an unanswered task are the
 * thing worth looking at (amber). Brand gold never appears here: it is an
 * accent, never a status.
 */
function Chip({ color, icon, label, title }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ background: `${color}1F`, border: `1px solid ${color}59`, color }}
    >
      {icon}
      {label}
    </span>
  );
}

function StateChip({ r, T }) {
  return r.expired ? (
    <Chip color="#ef4444" icon={<Hourglass size={11} />} label={T.stStuck} title={T.stStuckHint} />
  ) : (
    <Chip color="#94a3b8" icon={<Hourglass size={11} />} label={T.stActive} title={T.stActiveHint} />
  );
}

// The unit closes each task on its own, so "answered N of M" is a submission
// count here rather than a draft count — worth marking, because the same row
// means something different in the two modes.
function PerTaskChip({ T }) {
  return <Chip color="#94a3b8" label={T.perTaskChip} />;
}

// Shots already on the server for a task that has NO answer — the number that
// separates "never filed" from "filed, and the platform is sitting on it".
function RollChip({ n, T }) {
  return <Chip color="#eab308" icon={<Camera size={11} />} label={n} title={T.rollHint} />;
}


export default function BotDataClear({ scope, onClearScope }) {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = { ...(TXT[lang] || TXT.uz), ...(OPEN_TXT[lang] || OPEN_TXT.uz) };
  const toast = useToast({ position: "bottom" });
  const qc = useQueryClient();

  // Period / supervisor / leader are the PAGE's now — the same three controls
  // used to sit in this toolbar with their own memory, so an admin who had
  // narrowed the dashboard to one brigadir opened this tab onto a register
  // still scoped to whatever they picked here weeks ago. What a delete would
  // take is exactly what is listed, and what is listed must be explained by a
  // control on screen; the bar above the tabs is that control, and everything
  // it holds back is counted in the notice below.
  // Which of the two registers this tab is showing. Persisted like every
  // other view state on the platform, and it is a VIEW switch rather than a
  // filter: the submitted list is a delete tool and the unfinished one deletes
  // nothing, so the two carry different columns, a different banner and
  // different authority.
  const [view, setView] = usePersistentState("ltclear_view", "closed");
  const [q, setQ] = usePersistentState("ltclear_q", "");
  const [sort, setSort] = usePersistentState("ltclear_sort", { key: "date", dir: "desc" });
  const [page, setPage] = usePersistentState("ltclear_page", 1);
  // Selection is deliberately NOT persisted: coming back to the tab must never
  // find a delete pre-armed from a previous visit.
  const [sel, setSel] = useState(() => new Set());
  const [confirm, setConfirm] = useState(null); // { ids } — null = dialog closed

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["leader-bot-submissions"],
    queryFn: () => api.get("/admin/leader-tasks/submissions").then((r) => r.data),
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);

  // Scoped first, searched second — the notice counts what the PAGE hid, not
  // what the operator's own search term hid, and conflating the two would put
  // an amber "12 hidden" line under every half-typed name.
  // The two registers are disjoint halves of one payload: a day is either
  // submitted or it is not. Split FIRST, so the scope notice below counts the
  // rows the page hid from THIS view — counting across both would tell an
  // operator looking at three unfinished days that forty are hidden.
  const openRows = useMemo(() => rows.filter((r) => r.open), [rows]);
  const closedRows = useMemo(() => rows.filter((r) => !r.open), [rows]);
  const viewRows = view === "open" ? openRows : closedRows;
  const scoped = useMemo(() => viewRows.filter((r) => inScope(r, scope)), [viewRows, scope]);
  const hidden = viewRows.length - scoped.length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = scoped.filter((r) =>
      (!needle ||
        tl(r.leader).toLowerCase().includes(needle) ||
        tl(r.supervisor).toLowerCase().includes(needle))
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => {
      const k = sort.key;
      const av = k === "completion" || k === "tasks" || k === "media" ? Number(a[k] || 0) : String(a[k] ?? "");
      const bv = k === "completion" || k === "tasks" || k === "media" ? Number(b[k] || 0) : String(b[k] ?? "");
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return String(a.leader).localeCompare(String(b.leader));
    });
  }, [scoped, q, sort, tl]);

  // What a delete would actually take. Rows outside the current filter stay
  // out of it even if they were ticked before the filter narrowed.
  const armed = useMemo(() => filtered.filter((r) => sel.has(r.id)), [filtered, sel]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // Switching view drops the selection (a delete must never stay armed across a
  // tab the operator only looked at) and rewinds a sort key the destination has
  // no column for — «closed_at» carried into the unfinished list would sort a
  // table by a value none of its rows can have.
  const OPEN_SORTS = ["date", "leader", "supervisor", "media"];
  const switchView = (v) => {
    setView(v);
    setSel(new Set());
    setPage(1);
    if (v === "open") {
      setSort((so) => (OPEN_SORTS.includes(so.key) ? so : { key: "date", dir: "desc" }));
    }
  };

  const onSort = (k) =>
    setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  const toggle = (id) =>
    setSel((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSel((s) => {
      const next = new Set(s);
      const all = filtered.every((r) => next.has(r.id));
      for (const r of filtered) (all ? next.delete(r.id) : next.add(r.id));
      return next;
    });

  const delMut = useMutation({
    mutationFn: (ids) =>
      api.post("/admin/leader-tasks/submissions/delete", { ids }).then((r) => r.data),
    onSuccess: (d) => {
      // Both the register behind this tab and the dashboard next to it are now
      // stale — the deleted days were feeding the monitoring rows.
      qc.invalidateQueries({ queryKey: ["leader-bot-submissions"] });
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setSel(new Set());
      setConfirm(null);
      toast.success(T.deleted.replace("{n}", d.days));
    },
  });

  // The cost of the pending delete, printed in the dialog instead of a bare
  // "are you sure" — an operator can't audit a number they were never shown.
  const cost = useMemo(() => {
    if (!confirm) return null;
    const ids = new Set(confirm.ids);
    const picked = rows.filter((r) => ids.has(r.id));
    const dates = picked.map((r) => r.date).sort();
    return {
      days: picked.length,
      tasks: picked.reduce((n, r) => n + (r.tasks || 0), 0),
      media: picked.reduce((n, r) => n + (r.media || 0), 0),
      leaders: new Set(picked.map((r) => r.leader_id)).size,
      first: dates[0],
      last: dates[dates.length - 1],
      // Against the submitted register only: unfinished days are not
      // deletable, so a delete that empties every closed day really is
      // "all of it" even while open ones remain in the payload.
      everything: picked.length > 0 && picked.length === closedRows.length,
    };
  }, [confirm, rows, closedRows]);

  const openConfirm = (ids) => { delMut.reset(); setConfirm({ ids }); };

  const isOpenView = view === "open";

  // The unfinished view carries no delete controls at all rather than disabled
  // ones: nothing it lists can be deleted (the endpoint re-filters closed days
  // itself), and a greyed-out «O'chirish» reads as "not yet", not as "never".
  const toolbar = (
    <>
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={T.searchPh} />
      {!isOpenView && (
        <div className="ml-auto flex items-center gap-2">
          {armed.length > 0 && (
            <>
              <span className="text-xs tabular-nums hidden sm:inline" style={{ color: "var(--text-3)" }}>
                {T.selected.replace("{n}", armed.length)}
              </span>
              <Button variant="ghost" size="lg" onClick={() => setSel(new Set())}>{T.clearSel}</Button>
            </>
          )}
          <Button
            variant="danger" size="lg" icon={<Trash2 size={14} />}
            disabled={armed.length === 0}
            onClick={() => openConfirm(armed.map((r) => r.id))}
          >
            {armed.length ? T.delN.replace("{n}", armed.length) : T.del}
          </Button>
        </div>
      )}
    </>
  );

  const allTicked = filtered.length > 0 && armed.length === filtered.length;

  return (
    <>
      {/* Which register — a VIEW switch, so it sits above the banner that
          describes the view rather than inside the table's own toolbar. */}
      <div className="mb-3">
        <SegmentedToggle
          asTabs
          value={view}
          onChange={switchView}
          ariaLabel={T.title}
          options={[
            { value: "closed", label: T.tabClosed },
            {
              value: "open",
              label: openRows.length
                ? `${T.tabOpen} · ${openRows.length}`
                : T.tabOpen,
            },
          ]}
        />
      </div>

      {/* What this view does — stated before the first row, not after the
          damage. Red where rows can be destroyed, amber where they cannot. */}
      {isOpenView ? (
        <div className="rounded-2xl p-3 mb-3 flex items-start gap-2.5"
          style={{ background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)" }}>
          <span className="rounded-lg p-1.5 flex-shrink-0" style={{ background: "rgba(234,179,8,0.15)" }}>
            <Hourglass size={16} color="#eab308" />
          </span>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>{T.openWarn}</p>
        </div>
      ) : (
        <div className="rounded-2xl p-3 mb-3 flex items-start gap-2.5"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
          <span className="rounded-lg p-1.5 flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)" }}>
            <ShieldAlert size={16} color="#ef4444" />
          </span>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>{T.warn}</p>
        </div>
      )}

      {/* On a delete surface this line is not a nicety: the day worth deleting
          is usually the one filed on a date nobody expected, so a period
          picked for the dashboard is exactly what would hide it. */}
      {!isLoading && <ScopeNotice hidden={hidden} onClear={onClearScope} />}

      {isError && (
        <div className="rounded-2xl p-3 text-xs mb-3"
          style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || String(error)}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => <SkeletonBlock key={i} className="h-10 rounded-xl" />)}
        </div>
      ) : viewRows.length === 0 ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState
            title={isOpenView ? T.openEmptyTitle : T.emptyTitle}
            message={isOpenView ? T.openEmptyMsg : T.emptyMsg}
            showUploadLink={false}
          />
        </div>
      ) : (
        <>
          <TableCard
            icon={isOpenView ? Hourglass : Trash2}
            title={isOpenView ? T.openTitle : T.title}
            subtitle={isOpenView ? T.openSub : T.sub}
            right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
              {T.rows.replace("{n}", filtered.length)}
            </span>}
            toolbar={toolbar}
            minWidth={820}
            mobile={
              <div className="p-3 space-y-2">
                {pageRows.length === 0 && (
                  <p className="text-xs text-center py-6" style={{ color: "var(--text-4)" }}>{T.noMatch}</p>
                )}
                {pageRows.map((r) => (isOpenView ? (
                  <div key={r.id} className="rounded-xl p-3"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{tl(r.leader)}</span>
                      <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>{ddmm(r.date)}</span>
                    </div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{tl(r.supervisor)}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <StateChip r={r} T={T} />
                      {r.per_task && <PerTaskChip T={T} />}
                      {r.pending_media > 0 && <RollChip n={r.pending_media} T={T} />}
                    </div>
                    <div className="text-[11px] mt-1.5 tabular-nums" style={{ color: "var(--text-4)" }}>
                      {T.thProgress}: {r.answered}/{r.enabled} · {T.thMedia}: {r.media}
                      {r.missing?.length > 0 && ` · ${T.missingN.replace("{n}", r.missing.length)}`}
                    </div>
                  </div>
                ) : (
                  <label key={r.id} className="flex items-start gap-2.5 rounded-xl p-3 cursor-pointer"
                    style={{ background: "var(--bg-inner)", border: `1px solid ${sel.has(r.id) ? "rgba(239,68,68,0.45)" : "var(--border)"}` }}>
                    <input type="checkbox" className="cb-danger mt-0.5"
                      checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{tl(r.leader)}</span>
                        <span className="text-xs tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>{ddmm(r.date)}</span>
                      </span>
                      <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{tl(r.supervisor)}</span>
                      <span className="block text-[11px] mt-1 tabular-nums" style={{ color: "var(--text-4)" }}>
                        {T.thTasks}: {r.done}/{r.tasks} · {T.thMedia}: {r.media} · {Math.round(r.completion)}% · {hhmm(r.closed_at)}
                      </span>
                    </span>
                  </label>
                )))}
              </div>
            }
          >
            <thead>
              {isOpenView ? (
                <tr>
                  <Th label={T.thOpened} k="date" sort={sort} onSort={onSort} />
                  <Th label={T.thLeader} k="leader" sort={sort} onSort={onSort} />
                  <Th label={T.thSup} k="supervisor" sort={sort} onSort={onSort} />
                  <Th label={T.thShift} align="center" />
                  <Th label={T.thProgress} align="center" />
                  <Th label={T.thMedia} k="media" sort={sort} onSort={onSort} align="center" />
                  <Th label={T.thRoll} align="center" />
                  <Th label={T.thState} />
                </tr>
              ) : (
                <tr>
                  <th className="sticky top-0 z-10 px-3 py-2.5 w-10" style={{ background: "var(--bg-inner)" }}>
                    <input type="checkbox" className="cb-danger" aria-label={T.selected.replace("{n}", filtered.length)}
                      checked={allTicked}
                      ref={(el) => { if (el) el.indeterminate = armed.length > 0 && !allTicked; }}
                      onChange={toggleAll} />
                  </th>
                  <Th label={T.thDate} k="date" sort={sort} onSort={onSort} />
                  <Th label={T.thLeader} k="leader" sort={sort} onSort={onSort} />
                  <Th label={T.thSup} k="supervisor" sort={sort} onSort={onSort} />
                  <Th label={T.thShift} align="center" />
                  <Th label={T.thTasks} k="tasks" sort={sort} onSort={onSort} align="center" />
                  <Th label={T.thMedia} k="media" sort={sort} onSort={onSort} align="center" />
                  <Th label={T.thScore} k="completion" sort={sort} onSort={onSort} align="right" />
                  <Th label={T.thClosed} k="closed_at" sort={sort} onSort={onSort} align="right" />
                  <th className="sticky top-0 z-10 px-3 py-2.5 w-12" style={{ background: "var(--bg-inner)" }} />
                </tr>
              )}
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={isOpenView ? 8 : 10} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>
                    {T.noMatch}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (isOpenView ? (
                <tr key={r.id}>
                  <td className="px-3 py-2 tabular-nums">{ddmm(r.date)}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1.5">
                      {tl(r.leader)}
                      {r.per_task && <PerTaskChip T={T} />}
                    </span>
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(r.supervisor)}</td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{r.shift ?? "—"}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    <span style={{ color: r.missing?.length ? "#eab308" : "var(--text-1)" }}>
                      {r.answered}/{r.enabled}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.media}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {r.pending_media > 0 ? <RollChip n={r.pending_media} T={T} /> : <span style={{ color: "var(--text-4)" }}>—</span>}
                  </td>
                  <td className="px-3 py-2"><StateChip r={r} T={T} /></td>
                </tr>
              ) : (
                <tr key={r.id} style={sel.has(r.id) ? { background: "rgba(239,68,68,0.07)" } : undefined}>
                  <td className="px-3 py-2">
                    <input type="checkbox" className="cb-danger"
                      checked={sel.has(r.id)} onChange={() => toggle(r.id)}
                      aria-label={`${tl(r.leader)} ${ddmm(r.date)}`} />
                  </td>
                  <td className="px-3 py-2 tabular-nums">{ddmm(r.date)}</td>
                  <td className="px-3 py-2">{tl(r.leader)}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>{tl(r.supervisor)}</td>
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>{r.shift ?? "—"}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.done}/{r.tasks}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.media}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.completion)}%</td>
                  <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>{hhmm(r.closed_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="danger" size="sm" tint icon={<Trash2 size={13} />}
                      aria-label={T.del} title={T.del}
                      onClick={() => openConfirm([r.id])} />
                  </td>
                </tr>
              )))}
            </tbody>
          </TableCard>

          <Pagination page={pageSafe} pageCount={pageCount} total={filtered.length}
            pageSize={PAGE_SIZE} onPage={setPage} />
        </>
      )}

      {confirm && cost && (
        <ConfirmDialog
          tone="danger"
          icon={<AlertTriangle size={18} color="#ef4444" />}
          title={T.confirmTitle.replace("{n}", cost.days)}
          message={
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums">
                <span>{T.cDays}</span><span style={{ color: "var(--text-1)" }}>{cost.days}</span>
                <span>{T.cTasks}</span><span style={{ color: "var(--text-1)" }}>{cost.tasks}</span>
                <span>{T.cMedia}</span><span style={{ color: "var(--text-1)" }}>{cost.media}</span>
                <span>{T.cLeaders}</span><span style={{ color: "var(--text-1)" }}>{cost.leaders}</span>
                <span>{T.cRange}</span>
                <span style={{ color: "var(--text-1)" }}>
                  {cost.first === cost.last ? ddmm(cost.first) : `${ddmm(cost.first)} – ${ddmm(cost.last)}`}
                </span>
              </div>
              {cost.everything && (
                <p className="mt-3 font-semibold" style={{ color: "#ef4444" }}>{T.confirmAll}</p>
              )}
            </>
          }
          confirmLabel={T.del}
          challenge={cost.everything ? CHALLENGE : null}
          challengeLabel={cost.everything ? T.challengeLabel : null}
          loading={delMut.isPending}
          error={delMut.isError
            ? (delMut.error?.response?.data?.detail || T.failed)
            : null}
          onCancel={() => { delMut.reset(); setConfirm(null); }}
          onConfirm={() => delMut.mutate(confirm.ids)}
        />
      )}

      {toast.node}
    </>
  );
}
