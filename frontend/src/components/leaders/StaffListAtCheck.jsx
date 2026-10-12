/* «How the list looked at the check» — the button under a task-#11 verdict and
 * the modal it opens (the operator, 2026-10-12): the «Ish grafigi» list the
 * automatic check judged, AS IT STOOD AT THE CHECK and as it stands now, one
 * row per worker, drawn with the /kelish grid's own cells (components/kelish/
 * marks.jsx). A mark set AFTER the check carries the time it was set, so the
 * «12 / 13» the verdict names and the «fully filled at 08:53» beside it are
 * seen on the people themselves.
 *
 * Nothing is computed here: `GET /api/leaders/report/{uid}/staff-list`
 * (services/leader_auto.staff_list_snapshot) rebuilds both states server-side
 * with the check's own cutoff, row-scoped exactly like the day report. Shown
 * wherever the verdict's result lines print — the register's day detail, the
 * day report, the admin day detail.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, RotateCw } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import TableCard from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { Chip } from "../kelish/marks";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";

const T_ALL = {
  uz: {
    btn: "Tekshiruv paytida ro'yxat qanday edi",
    title: "«Ish grafigi» — tekshiruv paytida",
    checked: "Tekshiruv: {d}, soat {t}",
    kToday: "bugungi", kTomorrow: "ertangi",
    worker: "Xodim", colCheck: "Tekshiruv paytida", colNow: "Hozir",
    marked: "Belgilangan", absent: "ro'yxatda yo'q edi", absentNow: "hozir ro'yxatda yo'q",
    yes: "Keladi", no: "Kelmaydi", none: "belgilanmagan",
    lateNote: "Vaqti ko'rsatilgan belgilar tekshiruvdan KEYIN qo'yilgan.",
    setAt: "belgilandi: {t}", by: "kim: {who}",
    empty: "Bu kun uchun ro'yxat tekshiruvi yo'q.",
    failed: "Ro'yxatni yuklab bo'lmadi.", retry: "Qayta urinish", close: "Yopish",
  },
  uz_cyrl: {
    btn: "Текширув пайтида рўйхат қандай эди",
    title: "«Иш графиги» — текширув пайтида",
    checked: "Текширув: {d}, соат {t}",
    kToday: "бугунги", kTomorrow: "эртанги",
    worker: "Ходим", colCheck: "Текширув пайтида", colNow: "Ҳозир",
    marked: "Белгиланган", absent: "рўйхатда йўқ эди", absentNow: "ҳозир рўйхатда йўқ",
    yes: "Келади", no: "Келмайди", none: "белгиланмаган",
    lateNote: "Вақти кўрсатилган белгилар текширувдан КЕЙИН қўйилган.",
    setAt: "белгиланди: {t}", by: "ким: {who}",
    empty: "Бу кун учун рўйхат текшируви йўқ.",
    failed: "Рўйхатни юклаб бўлмади.", retry: "Қайта уриниш", close: "Ёпиш",
  },
  ru: {
    btn: "Каким был список в момент проверки",
    title: "«График работы» — в момент проверки",
    checked: "Проверка: {d}, {t}",
    kToday: "на сегодня", kTomorrow: "на завтра",
    worker: "Сотрудник", colCheck: "В момент проверки", colNow: "Сейчас",
    marked: "Отмечено", absent: "не было в списке", absentNow: "сейчас не в списке",
    yes: "Придёт", no: "Не придёт", none: "не отмечено",
    lateNote: "Отметки с указанным временем поставлены ПОСЛЕ проверки.",
    setAt: "отмечено: {t}", by: "кем: {who}",
    empty: "Для этого дня нет проверки списка.",
    failed: "Не удалось загрузить список.", retry: "Повторить", close: "Закрыть",
  },
  en: {
    btn: "How the list looked at the check",
    title: "Work schedule at the check",
    checked: "Checked: {d} at {t}",
    kToday: "today's", kTomorrow: "tomorrow's",
    worker: "Worker", colCheck: "At the check", colNow: "Now",
    marked: "Marked", absent: "was not on the list", absentNow: "not on the list now",
    yes: "Coming", no: "Not coming", none: "not marked",
    lateNote: "Marks with a time were set AFTER the check.",
    setAt: "marked: {t}", by: "by: {who}",
    empty: "No list check for this day.",
    failed: "Could not load the list.", retry: "Retry", close: "Close",
  },
};

const put = (s, p) => Object.entries(p).reduce((a, [k, v]) => a.replaceAll(`{${k}}`, v), s);
const ddmm = (iso) => { const s = String(iso || ""); return s.length >= 10 ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "—"; };
const hm = (iso) => { const s = String(iso || ""); return s.length >= 16 ? s.slice(11, 16) : ""; };
// «08:53» when the mark landed on the check's own calendar day, «11.10 08:53»
// on any other — read off the ISO text, never through the browser's clock.
const when = (iso, ref) => (iso && ref && String(iso).slice(0, 10) === String(ref).slice(0, 10) ? hm(iso) : `${ddmm(iso)} ${hm(iso)}`);

/** Does this auto-check result carry #11's lists (the only check with a list)? */
export function hasStaffList(facts) {
  return !!facts && typeof facts === "object" && Array.isArray(facts.lists) && facts.lists.length > 0;
}

export default function StaffListAtCheckButton({ uid, taskId, lang, zIndex = 70 }) {
  const [open, setOpen] = useState(false);
  const T = T_ALL[lang] || T_ALL.ru;
  return (
    <>
      <Button variant="secondary" size="sm" icon={<ClipboardList size={13} />} onClick={() => setOpen(true)}>
        {T.btn}
      </Button>
      {open && (
        <StaffListAtCheckModal uid={uid} taskId={taskId} lang={lang} zIndex={zIndex} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function Slot({ slot, absentText, T, ref, late }) {
  if (!slot) {
    return (
      <span className="inline-flex items-center gap-1.5" title={absentText}>
        <Chip off size={26} />
        <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{absentText}</span>
      </span>
    );
  }
  const word = slot.mark === "yes" ? T.yes : slot.mark === "no" ? T.no : T.none;
  const bits = [word, slot.at ? put(T.setAt, { t: when(slot.at, ref) }) : null, slot.by ? put(T.by, { who: slot.by }) : null];
  return (
    <span className="inline-flex items-center gap-1.5" title={bits.filter(Boolean).join(" · ")}>
      <Chip mark={slot.mark} size={26} />
      {late && slot.at && (
        <span className="text-[11px] font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--status-warn)" }}>
          {when(slot.at, ref)}
        </span>
      )}
    </span>
  );
}

function ListTable({ list, snap, T, tl }) {
  const kind = list.kind === "today" ? T.kToday : T.kTomorrow;
  const chk = snap.checked;
  const ref = snap.cutoff || chk;
  const filled = (c) => (c ? `${(c.yes || 0) + (c.no || 0)} / ${c.total || 0}` : "—");
  const th = "px-2 sm:px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-left";
  const thStyle = { background: "var(--bg-inner)", color: "var(--text-2)" };
  return (
    <TableCard
      title={`${list.cell} — ${ddmm(list.day)} (${kind})`}
      subtitle={chk ? put(T.checked, { d: ddmm(chk), t: hm(chk) }) : undefined}
      fixed minWidth={320} hover={false} maxHeight="60vh"
      footer={(
        <p className="text-[11px]" style={{ color: "var(--text-3)" }}>
          <Chip mark="yes" size={12} /> {T.yes} · <Chip mark="no" size={12} /> {T.no} · <Chip size={12} /> {T.none} · {T.lateNote}
        </p>
      )}
    >
      <colgroup>
        <col />
        <col style={{ width: 150 }} />
        <col style={{ width: 170 }} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={th} style={thStyle}>{T.worker}</th>
          <th scope="col" className={th} style={thStyle}>{T.colCheck}</th>
          <th scope="col" className={th} style={thStyle}>{T.colNow}</th>
        </tr>
      </thead>
      <tbody>
        {list.rows.map((r) => (
          <tr key={r.key}>
            <td className="px-2 sm:px-3 py-1.5 text-sm truncate" style={{ color: "var(--text-1)" }} title={tl(r.name)}>
              {tl(r.name)}
            </td>
            <td className="px-2 sm:px-3 py-1.5"><Slot slot={r.check} absentText={T.absent} T={T} ref={ref} /></td>
            <td className="px-2 sm:px-3 py-1.5"><Slot slot={r.now} absentText={T.absentNow} T={T} ref={ref} late={r.late} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="px-2 sm:px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ ...thStyle }}>{T.marked}</td>
          <td className="px-2 sm:px-3 py-1.5 text-sm font-bold tabular-nums" style={{ ...thStyle, color: "var(--text-1)" }}>{filled(list.check)}</td>
          <td className="px-2 sm:px-3 py-1.5 text-sm font-bold tabular-nums" style={{ ...thStyle, color: "var(--text-1)" }}>{filled(list.now)}</td>
        </tr>
      </tfoot>
    </TableCard>
  );
}

function StaffListAtCheckModal({ uid, taskId, lang, zIndex, onClose }) {
  const T = T_ALL[lang] || T_ALL.ru;
  const { tl } = useTranslit();
  const q = useQuery({
    queryKey: ["staff-list-at-check", uid, taskId || null],
    queryFn: () => api.get(`/api/leaders/report/${encodeURIComponent(uid)}/staff-list`,
      { params: taskId ? { task: taskId } : {} }).then((r) => r.data),
    retry: false,
  });
  const notFound = q.isError && q.error?.response?.status === 404;
  const snap = q.data;
  return (
    <Modal
      open onClose={onClose} title={T.title} icon={<ClipboardList size={18} />}
      maxWidth="max-w-2xl" zIndex={zIndex}
      subtitle={snap?.checked ? put(T.checked, { d: ddmm(snap.checked), t: hm(snap.checked) }) : undefined}
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}
    >
      {q.isPending && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-9 w-full" />)}
        </div>
      )}
      {notFound && <EmptyState title={T.empty} message="" showUploadLink={false} icon={ClipboardList} />}
      {q.isError && !notFound && (
        <EmptyState tone="danger" title={T.failed} message="" showUploadLink={false}
          action={<Button variant="secondary" icon={<RotateCw size={14} />} onClick={() => q.refetch()}>{T.retry}</Button>} />
      )}
      {snap && (snap.lists || []).map((l) => (
        <ListTable key={`${l.cell_id}-${l.day}`} list={l} snap={snap} T={T} tl={tl} />
      ))}
    </Modal>
  );
}
