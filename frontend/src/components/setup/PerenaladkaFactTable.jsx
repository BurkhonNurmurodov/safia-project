/**
 * THE per-cell changeover («переналадка») fact table — one implementation
 * rendered by BOTH surfaces that own this data:
 *
 *   · /setup-times  «Fakt»        — the changeover page's daily tab
 *   · /idle-cell    «Perenaladka» — the idle-time page's second tab
 *
 * They are not twins, they are the same rows: one `cell_perenaladka` record per
 * (cell, date), one query key, one set of mutations. An edit made on either
 * page is the edit the other one shows — which is why this lives here and not
 * copy-pasted into two pages that would drift apart by the second change.
 *
 * Shape: Standard is READ-ONLY everywhere (it is the mean of the Setup-times
 * «Standart» register, which only an admin edits), Fact and Note are typed
 * INLINE in the row and committed with that row's own Save button. Clearing the
 * fact of an existing row and pressing Save asks for a delete confirmation —
 * blank means "not entered", and this table never stores a 0.
 *
 * Each page supplies its own already-filtered `rows` and its own `toolbar`, so
 * the platform's one-filter-zone-per-view rule is each page's business: the
 * Setup-times tab carries day/search/supervisor/shift + the sheet Refresh, the
 * Idle-cell tab reuses that page's existing filter bar.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CircleUserRound, LayoutGrid, Timer, MessageSquareText, Gauge, Save, Trash2,
} from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { SkeletonBlock } from "../ui/Skeleton";
import CellLink from "../ui/CellLink";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { cellName } from "../../utils/cellName";

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
// Lives with the component, not with either page: the two surfaces must say the
// same words about the same numbers.
const TXT = {
  uz: {
    secFact: "Kunlik fakt",
    colSupervisor: "Supervayzer", colCell: "Yacheyka",
    colStandard: "Standart (min)", colFact: "Fakt (min)", colNote: "Izoh",
    standardHint: "«Standart» ro'yxatidan olinadi — bu yerda tahrirlanmaydi",
    leader: "Lider", minSuffix: "min",
    vsStd: "Standartga nisbatan farq",
    notePh: "Ixtiyoriy",
    save: "Saqlash", del: "Tozalash", cancel: "Bekor qilish",
    saved: "Saqlandi", cleared: "Yozuv tozalandi",
    saveFail: "Saqlab bo'lmadi. Qayta urining.",
    factDelTitle: "Fakt yozuvini o'chirish",
    factDelMsg: "{cell} yacheykasining {date} sanasidagi fakt yozuvi o'chiriladi. Davom etasizmi?",
    noMatch: "Mos qator topilmadi",
    noCellsScope: "Sizning doirangizda yacheyka yo'q.",
  },
  uz_cyrl: {
    secFact: "Кунлик факт",
    colSupervisor: "Супервайзер", colCell: "Ячейка",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colNote: "Изоҳ",
    standardHint: "«Стандарт» рўйхатидан олинади — бу ерда таҳрирланмайди",
    leader: "Лидер", minSuffix: "мин",
    vsStd: "Стандартга нисбатан фарқ",
    notePh: "Ихтиёрий",
    save: "Сақлаш", del: "Тозалаш", cancel: "Бекор қилиш",
    saved: "Сақланди", cleared: "Ёзув тозаланди",
    saveFail: "Сақлаб бўлмади. Қайта уриниб кўринг.",
    factDelTitle: "Факт ёзувини ўчириш",
    factDelMsg: "{cell} ячейкасининг {date} санасидаги факт ёзуви ўчирилади. Давом этасизми?",
    noMatch: "Мос қатор топилмади",
    noCellsScope: "Сизнинг доирангизда ячейка йўқ.",
  },
  ru: {
    secFact: "Факт за день",
    colSupervisor: "Супервайзер", colCell: "Ячейка",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colNote: "Примечание",
    standardHint: "Берётся из реестра «Стандарт» — здесь не редактируется",
    leader: "Лидер", minSuffix: "мин",
    vsStd: "Отклонение от стандарта",
    notePh: "Необязательно",
    save: "Сохранить", del: "Очистить", cancel: "Отмена",
    saved: "Сохранено", cleared: "Запись очищена",
    saveFail: "Не удалось сохранить. Попробуйте ещё раз.",
    factDelTitle: "Удалить запись факта",
    factDelMsg: "Запись факта по ячейке {cell} за {date} будет удалена. Продолжить?",
    noMatch: "Совпадений нет",
    noCellsScope: "В вашей зоне нет ячеек.",
  },
  en: {
    secFact: "Daily fact",
    colSupervisor: "Supervisor", colCell: "Cell",
    colStandard: "Standard (min)", colFact: "Fact (min)", colNote: "Note",
    standardHint: "Taken from the «Standard» register — not editable here",
    leader: "Leader", minSuffix: "min",
    vsStd: "Difference from the standard",
    notePh: "Optional",
    save: "Save", del: "Clear", cancel: "Cancel",
    saved: "Saved", cleared: "Entry cleared",
    saveFail: "Could not save. Try again.",
    factDelTitle: "Delete the fact entry",
    factDelMsg: "The fact entry for cell {cell} on {date} will be deleted. Continue?",
    noMatch: "No matching rows",
    noCellsScope: "There are no cells in your scope.",
  },
};

// ── shared formatting / colour helpers ───────────────────────────────────────
// Exported because the Setup-times page's other two tabs render the same
// numbers and must colour them identically.

export const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
export const fmtMin = (v) => (v == null ? "—" : String(parseFloat(Number(v).toFixed(2))));
export const fmtDMY = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

const pad2 = (n) => String(n).padStart(2, "0");
export const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Traffic-light accent for the minutes pill: quick setups green, 3–5 amber,
// longer red; missing values grey (platform status-color convention).
export const minColor = (v) =>
  v == null ? "#94a3b8" : v < 3 ? "#22c55e" : v <= 5 ? "#eab308" : "#ef4444";
// Fact-vs-standard traffic light: at/under the standard green, up to 20% over
// amber, beyond red. No standard to compare against → the absolute scale above.
export const deltaColor = (delta, std) =>
  delta == null ? "#94a3b8"
  : delta <= 0 ? "#22c55e"
  : std > 0 && delta <= std * 0.2 ? "#eab308"
  : "#ef4444";
export const factColor = (v, std) =>
  v == null ? "#94a3b8" : std == null || std <= 0 ? minColor(v) : deltaColor(v - std, std);

// Short {uz, uz_cyrl, ru, en} keys — viewer language first, Russian next.
// SEARCH ONLY: a cell is written out as its code (utils/cellName.js), but
// typing a workshop name still has to find it.
export const pickName = (obj, lang) => cellName(obj, lang, "");

// Sortable-table state + toggle, persisted per key (asc → desc → off).
export function useSortState(storageKey, initial = { key: null, dir: "asc" }) {
  const [sort, setSort] = usePersistentState(storageKey, initial);
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" });
  return [sort, onSort];
}
export const sortCmp = (sort, val) => (a, b) => {
  const va = val(a), vb = val(b);
  const dir = sort.dir === "asc" ? 1 : -1;
  if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
};

// Code + muted LEADER — the one way a cell renders across these tabs. The
// workshop name is never printed (utils/cellName.js); the person answerable for
// the cell is the fact worth the second line. With a registry id the code is a
// CellLink to /cells/:id; free-typed cells that match no registry row (cellId
// null) stay inert text.
export function CellCol({ code, leader, cellId }) {
  return (
    <>
      <div className="font-mono tabular-nums truncate" style={{ color: "var(--text-2)" }}>
        <CellLink id={cellId}>{code}</CellLink>
      </div>
      {leader && (
        // Truncated, not wrapped: a fixed-width column must never let a long
        // name spill into the number beside it. The full name stays one hover
        // away.
        <div className="text-[11px] leading-tight mt-0.5 truncate" title={leader} style={{ color: "var(--text-4)" }}>{leader}</div>
      )}
    </>
  );
}

export function MinPill({ value, color }) {
  return (
    <span
      className="inline-block min-w-[42px] text-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: hexA(color, 0.13), color }}
    >
      {fmtMin(value)}
    </span>
  );
}

// ── data ─────────────────────────────────────────────────────────────────────

/** The day's cells + entries. ONE query key for both pages, so a save on either
 *  surface repaints the other the moment it is opened. */
export function usePerenaladkaFact(date) {
  const { data, isLoading } = useQuery({
    queryKey: ["setup-fact", date],
    queryFn: () => api.get(`/api/setup-times/fact?date=${date}`).then((r) => r.data),
    enabled: !!date,
  });
  return { cells: data?.cells ?? [], isLoading };
}

/** Normalise a fact row to the shape the Idle-cell page's filter chain reads
 *  (`verifix_code`; `leader` already matches), keeping every original field so
 *  the same object still feeds this table. The flat `name_*` keys are not
 *  carried over — nothing renders a cell's workshop name (utils/cellName.js). */
export const asIdleCell = (c) => ({ ...c, verifix_code: c.code });

// A number typed straight into a table row. `text` + inputMode=decimal, not
// type=number: the uz/ru iOS keypad types a comma, which type=number silently
// discards. text-base on phones is what stops iOS zooming the page on focus.
//
// Two rules about its chrome:
//  · The BORDER never carries the traffic light. A red-outlined field means
//    "what you typed is invalid" in every form anyone has ever filled in, and
//    a changeover that ran long is a fact about the shift, not a typo — the
//    colour belongs on the value and on the signed delta beside it.
//  · The focus ring is drawn here because `outline-none` removed the browser's
//    own. Without it, tabbing down a column of 22 identical fields left the
//    operator with no idea which one they were typing into.
function RowInput({ value, onChange, onEnter, align = "left", color, className = "", ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); } }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`w-full rounded-lg px-2 py-1.5 md:py-1 text-base md:text-xs outline-none transition-colors ${align === "right" ? "text-right tabular-nums" : ""} ${className}`}
      style={{
        background: "var(--bg-inner)",
        border: `1px solid ${focused ? "var(--brand)" : "var(--border-md)"}`,
        boxShadow: focused ? "0 0 0 3px var(--brand-ring)" : "none",
        color: color || "var(--text-1)",
        fontWeight: color ? 600 : 400,
      }}
      {...rest}
    />
  );
}

const num = (v) => Number(String(v ?? "").replace(",", "."));
const factOf = (c) => (c.entry?.minutes != null ? String(c.entry.minutes) : "");
const noteOf = (c) => c.entry?.note || "";

/**
 * @param date           ISO day the rows belong to (writes carry it)
 * @param rows           already-filtered fact cells (the page owns filtering)
 * @param totalCount     rows before filtering — tells "no match" from "no cells"
 * @param isLoading      skeleton rows while the day loads
 * @param toolbar        the page's own toolbar node (optional)
 * @param sortKey        storage key for this surface's persisted sort
 * @param showSupervisor render the supervisor column (off where the page has
 *                       already narrowed to one)
 */
export default function PerenaladkaFactTable({
  date,
  rows,
  totalCount,
  isLoading = false,
  toolbar = null,
  sortKey,
  showSupervisor = true,
  icon,
  title,
  sort,
  onSort,
}) {
  const qc = useQueryClient();
  const { lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const T = TXT[lang] || TXT.ru;

  // cell_id → { minutes, note } while a row is being typed. Dropped on save and
  // whenever the day changes: a draft carried onto another date would write the
  // number somebody typed for yesterday.
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  useEffect(() => { setDrafts({}); }, [date]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["setup-fact"] });
    qc.invalidateQueries({ queryKey: ["setup-analysis"] });
  };
  const saveMut = useMutation({
    mutationFn: (body) => api.post("/api/setup-times/fact", body).then((r) => r.data),
    onSuccess: (_d, body) => {
      setDrafts((m) => { const { [body.cell_id]: _drop, ...rest } = m; return rest; });
      setBusyId(null);
      invalidate();
      toast.success(T.saved);
    },
    onError: (e) => {
      setBusyId(null);
      toast.error(e?.response?.data?.detail || T.saveFail);
    },
  });
  const delMut = useMutation({
    mutationFn: (c) => api.delete(`/api/setup-times/fact/${c.entry.id}`),
    onSuccess: (_d, c) => {
      setDrafts((m) => { const { [c.cell_id]: _drop, ...rest } = m; return rest; });
      setConfirmDel(null);
      invalidate();
      toast.success(T.cleared);
    },
  });

  const draftOf = (c) => drafts[c.cell_id] ?? { minutes: factOf(c), note: noteOf(c) };
  const isDirty = (c) => {
    const d = drafts[c.cell_id];
    return !!d && (d.minutes !== factOf(c) || d.note !== noteOf(c));
  };
  const setField = (c, key) => (v) =>
    setDrafts((m) => ({ ...m, [c.cell_id]: { ...draftOf(c), [key]: v } }));

  const commit = (c) => {
    const d = draftOf(c);
    const minutes = num(d.minutes);
    // An emptied fact is a request to clear the day — confirm it rather than
    // POSTing a 0 the API would reject with a message nobody expects.
    if (!d.minutes.trim() || !(minutes > 0)) {
      if (c.entry) setConfirmDel(c);
      return;
    }
    setBusyId(c.cell_id);
    saveMut.mutate({ cell_id: c.cell_id, date, minutes, note: (d.note || "").trim() });
  };

  const cols = showSupervisor ? 6 : 5;
  const filled = rows.filter((c) => c.entry).length;
  const totalMin = rows.reduce((a, c) => a + (c.entry?.minutes || 0), 0);

  return (
    <>
      <TableCard
        icon={icon}
        // Column widths come from the header, not from the rows. This table is
        // typed into: the action cell is empty until a row is dirty, and under
        // the default auto layout the Save button materialising mid-edit
        // re-measured every other column — the cell, the standard, the field
        // being typed into and the note all jumped ~120px left on the first
        // keystroke, on every row, all day. A reserved action column and a
        // fixed layout mean the grid never moves under the operator's hands.
        fixed
        minWidth={showSupervisor ? 1140 : 1000}
        title={title || T.secFact}
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {isLoading ? "…" : `${filled}/${rows.length} · ${fmtMin(totalMin)} ${T.minSuffix}`}
          </span>
        }
        toolbar={toolbar}
      >
        <thead>
          <tr>
            {showSupervisor && (
              <Th icon={CircleUserRound} label={T.colSupervisor} k="supervisor" sort={sort} onSort={onSort}
                  cls="w-[15%]" />
            )}
            <Th icon={LayoutGrid} label={T.colCell} k="cell" sort={sort} onSort={onSort}
                cls={showSupervisor ? "w-[26%]" : "w-[32%]"} />
            <Th icon={Gauge} label={T.colStandard} k="standard" sort={sort} onSort={onSort}
                align="right" hint={T.standardHint} cls="w-[170px]" />
            <Th icon={Timer} label={T.colFact} k="fact" sort={sort} onSort={onSort} align="right"
                cls="w-[164px]" />
            {/* The note takes whatever is left — it is the one column that can
                use every spare pixel and the one whose width means nothing. */}
            <Th icon={MessageSquareText} label={T.colNote} k="note" sort={sort} onSort={onSort} />
            {/* Sized for its widest state (Save + Clear, longest language), so
                it holds that space even while it is empty. */}
            <Th label="" cls="w-[180px]" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: cols }).map((_, j) => (
                  <td key={j} className="px-3 py-2"><SkeletonBlock className="h-3 w-full" /></td>
                ))}
              </tr>
            ))}
          {!isLoading && rows.map((c) => {
            const d = draftOf(c);
            const dirty = isDirty(c);
            const typed = d.minutes.trim() ? num(d.minutes) : null;
            const color = factColor(Number.isFinite(typed) ? typed : null, c.standard);
            // Signed distance from the standard — the non-colour half of the
            // traffic light. "+7" says what the red actually meant, and says
            // it to the ~8% of men who cannot tell it from the green.
            const gap = Number.isFinite(typed) && c.standard != null
              ? parseFloat((typed - c.standard).toFixed(2))
              : null;
            const delta = gap == null ? "" : gap > 0 ? `+${fmtMin(gap)}` : fmtMin(gap);
            return (
              <tr key={c.cell_id}>
                {showSupervisor && (
                  <td className="px-3 py-2">
                    <div className="font-medium truncate" title={c.supervisor ? tl(c.supervisor) : undefined}
                         style={{ color: c.supervisor ? "var(--text-1)" : "var(--text-4)" }}>
                      {c.supervisor ? tl(c.supervisor) : "—"}
                    </div>
                    {c.leader && (
                      <div className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: "var(--text-4)" }}
                           title={`${T.leader}: ${tl(c.leader)}`}>
                        {tl(c.leader)}
                      </div>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <CellCol code={c.code} cellId={c.cell_id} />
                  {/* Without the supervisor column the leader is this row's only
                      other identity — it must not disappear with it. */}
                  {!showSupervisor && c.leader && (
                    <div className="text-[11px] leading-tight mt-0.5 truncate" style={{ color: "var(--text-4)" }}
                         title={`${T.leader}: ${tl(c.leader)}`}>
                      {tl(c.leader)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" title={T.standardHint}
                    style={{ color: c.standard != null ? "var(--text-3)" : "var(--text-4)" }}>
                  {fmtMin(c.standard)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <RowInput
                      value={d.minutes}
                      onChange={setField(c, "minutes")}
                      onEnter={() => dirty && commit(c)}
                      align="right"
                      color={d.minutes.trim() ? color : null}
                      inputMode="decimal"
                      aria-label={T.colFact}
                      className="flex-1 min-w-0"
                    />
                    {/* Fixed width whether or not it has something to say —
                        an empty slot that collapses is one more thing moving
                        the instant somebody types. */}
                    <span
                      className="w-[42px] shrink-0 text-right text-[11px] font-semibold tabular-nums"
                      style={{ color }}
                      title={delta ? `${T.vsStd}: ${delta} ${T.minSuffix}` : undefined}
                    >
                      {delta}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <RowInput
                    value={d.note}
                    onChange={setField(c, "note")}
                    onEnter={() => dirty && commit(c)}
                    placeholder={T.notePh}
                    aria-label={T.colNote}
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    {/* Save appears only for a row that changed — a row full of
                        idle buttons reads as unsaved work that isn't there. */}
                    {dirty && (
                      <Button
                        size="sm" tint variant="primary"
                        loading={busyId === c.cell_id}
                        icon={busyId === c.cell_id ? null : <Save size={13} />}
                        onClick={() => commit(c)}
                        title={T.save}
                      >
                        {T.save}
                      </Button>
                    )}
                    {c.entry && (
                      <Button
                        size="sm" tint variant="danger"
                        icon={<Trash2 size={13} />}
                        onClick={() => setConfirmDel(c)}
                        title={T.del}
                        aria-label={T.del}
                      />
                    )}
                  </span>
                </td>
              </tr>
            );
          })}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={cols} className="px-4 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {(totalCount ?? rows.length) === 0 ? T.noCellsScope : T.noMatch}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>

      {confirmDel && (
        <ConfirmDialog
          tone="danger"
          title={T.factDelTitle}
          message={T.factDelMsg.replace("{cell}", confirmDel.code).replace("{date}", fmtDMY(date))}
          confirmLabel={T.del}
          cancelLabel={T.cancel}
          loading={delMut.isPending}
          error={delMut.isError ? (delMut.error?.response?.data?.detail || T.saveFail) : null}
          onCancel={() => {
            // Cancelling a clear that started as an emptied field puts the
            // stored value back, so the row never lies about what is saved.
            setDrafts((m) => { const { [confirmDel.cell_id]: _drop, ...rest } = m; return rest; });
            setConfirmDel(null);
          }}
          onConfirm={() => delMut.mutate(confirmDel)}
        />
      )}
      {toast.node}
    </>
  );
}
