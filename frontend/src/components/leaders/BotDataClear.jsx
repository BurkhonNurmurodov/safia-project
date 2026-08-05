import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker from "../ui/DateRangePicker";
import SearchInput from "../ui/SearchInput";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Pagination from "../ui/Pagination";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
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

export default function BotDataClear() {
  const { lang } = useLang();
  const { tl } = useTranslit();
  const T = TXT[lang] || TXT.uz;
  const toast = useToast({ position: "bottom" });
  const qc = useQueryClient();

  const [from, setFrom] = usePersistentState("ltclear_from", "");
  const [to, setTo] = usePersistentState("ltclear_to", "");
  const [fSup, setFSup] = usePersistentState("ltclear_sup", "All");
  const [fLeader, setFLeader] = usePersistentState("ltclear_leader", "All");
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
  const rows = data?.rows ?? [];
  const sups = data?.supervisors ?? [];

  // The leader picker follows the supervisor picker, so it can never offer a
  // leader whose days are already filtered out.
  const leaderOpts = useMemo(() => {
    const ids = new Set(
      rows
        .filter((r) => fSup === "All" || String(r.manager_id) === String(fSup))
        .map((r) => r.leader_id)
    );
    return (data?.leaders ?? []).filter((l) => ids.has(l.id));
  }, [rows, data, fSup]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) =>
      (!from || r.date >= from) &&
      (!to || r.date <= to) &&
      (fSup === "All" || String(r.manager_id) === String(fSup)) &&
      (fLeader === "All" || String(r.leader_id) === String(fLeader)) &&
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
  }, [rows, from, to, fSup, fLeader, q, sort, tl]);

  // What a delete would actually take. Rows outside the current filter stay
  // out of it even if they were ticked before the filter narrowed.
  const armed = useMemo(() => filtered.filter((r) => sel.has(r.id)), [filtered, sel]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, pageCount);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

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
      everything: picked.length > 0 && picked.length === rows.length,
    };
  }, [confirm, rows]);

  const openConfirm = (ids) => { delMut.reset(); setConfirm({ ids }); };

  const toolbar = (
    <>
      <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={T.searchPh} />
      <DateRangePicker
        dateFrom={from} dateTo={to}
        setDateFrom={(v) => { setFrom(v); setPage(1); }}
        setDateTo={(v) => { setTo(v); setPage(1); }}
        triggerClassName="px-3 py-2 text-sm"
      />
      <StyledSelect
        value={fSup}
        onChange={(v) => { setFSup(v); setFLeader("All"); setPage(1); }}
        options={[{ value: "All", label: T.allSups },
                  ...sups.map((s) => ({ value: String(s.id), label: tl(s.name) }))]}
        triggerClassName="px-3 py-2 text-sm"
      />
      <StyledSelect
        value={fLeader}
        onChange={(v) => { setFLeader(v); setPage(1); }}
        options={[{ value: "All", label: T.allLeaders },
                  ...leaderOpts.map((l) => ({ value: String(l.id), label: tl(l.name) }))]}
        triggerClassName="px-3 py-2 text-sm"
      />
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
    </>
  );

  const allTicked = filtered.length > 0 && armed.length === filtered.length;

  return (
    <>
      {/* What this tab does — stated before the first row, not after the damage */}
      <div className="rounded-2xl p-3 mb-3 flex items-start gap-2.5"
        style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}>
        <span className="rounded-lg p-1.5 flex-shrink-0" style={{ background: "rgba(239,68,68,0.15)" }}>
          <ShieldAlert size={16} color="#ef4444" />
        </span>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>{T.warn}</p>
      </div>

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
      ) : rows.length === 0 ? (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.emptyTitle} message={T.emptyMsg} showUploadLink={false} />
        </div>
      ) : (
        <>
          <TableCard
            icon={Trash2} title={T.title} subtitle={T.sub}
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
                {pageRows.map((r) => (
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
                ))}
              </div>
            }
          >
            <thead>
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
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-xs" style={{ color: "var(--text-4)" }}>
                    {T.noMatch}
                  </td>
                </tr>
              )}
              {pageRows.map((r) => (
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
                    <Button variant="danger" size="sm" tint icon={Trash2}
                      aria-label={T.del} title={T.del}
                      onClick={() => openConfirm([r.id])} />
                  </td>
                </tr>
              ))}
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
