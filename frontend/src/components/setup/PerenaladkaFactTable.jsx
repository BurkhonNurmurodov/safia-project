/**
 * THE per-cell changeover («переналадка») fact table — one implementation
 * rendered by BOTH surfaces that own this data:
 *
 *   · /setup-times  «Fakt»        — the changeover page's daily tab
 *   · /idle-cell    «Perenaladka» — the idle-time page's third tab
 *
 * They are not twins, they are the same rows: one `cell_perenaladka` record per
 * (cell, date), one query key, one set of writes. An edit made on either page
 * is the edit the other one shows — which is why this lives here and not
 * copy-pasted into two pages that would drift apart by the second change.
 *
 * Shape (rebuilt 2026-09-23, after the operator's «I can't even count the
 * problems»):
 *   · A row SAVES ITSELF when it is committed — Enter, or leaving the field.
 *     There is no Save button. The old one appeared only on the row being
 *     typed, in a column with no header, so five rows typed meant five buttons
 *     to find, and a draft left behind was summarised nowhere. Enter walks down
 *     the Fakt column the way a spreadsheet does; Escape puts the stored value
 *     back. Writes to ONE row run one after another (a per-row queue), so a
 *     fact and the note committed a beat later can never land out of order.
 *   · Rows sit under their BRIGADIR whenever more than one is on screen. The
 *     Idle-cell tab dropped the supervisor column and listed 158 cells with
 *     nothing saying whose they were.
 *   · Standard · Fakt · Farq read left to right: the reference, the entry, the
 *     verdict. Only the difference is coloured — a fact is data, the gap is the
 *     judgement, and a cell with no standard has no judgement to colour.
 *   · The note exists once a row has a fact (the API refuses a note on its own)
 *     and at rest it is plain text — not a box saying «optional» on every row.
 *   · The header counts what is entered and filters to what is missing.
 *   · Phones get a two-line list instead of a 1000px table to scroll sideways.
 *
 * Standard is READ-ONLY everywhere (it is the mean of the Setup-times
 * «Standart» register, which only an admin edits). Emptying the fact of a
 * stored row asks before clearing it — blank means "not entered", and this
 * table never stores a 0.
 *
 * Each page supplies its own already-filtered, already-sorted `rows` and its
 * own `toolbar`; grouping, the status filter and the counts happen here.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import SegmentedToggle from "../ui/SegmentedToggle";
import { useToast } from "../ui/Toast";
import { SkeletonBlock } from "../ui/Skeleton";
import CellLink from "../ui/CellLink";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { cellName } from "../../utils/cellName";
import { shortPerson } from "../../utils/personName";

// ── i18n copy, 4 platform languages ──────────────────────────────────────────
// Lives with the component, not with either page: the two surfaces must say the
// same words about the same numbers.
const TXT = {
  uz: {
    secFact: "Kunlik fakt",
    autosave: "Daqiqani yozing — Enter bosilganda yoki maydondan chiqqanda o'zi saqlanadi",
    colCell: "Yacheyka",
    colStandard: "Standart (min)", colFact: "Fakt (min)", colDelta: "Farq (min)", colNote: "Izoh",
    standardHint: "«Standart» ro'yxatidan olinadi — bu yerda tahrirlanmaydi",
    leader: "Lider", minSuffix: "min", stdShort: "Standart",
    vsStd: "Standartga nisbatan farq",
    notePh: "Izoh qo'shish…",
    fAll: "Hammasi", fTodo: "Kiritilmagan", fDone: "Kiritilgan",
    total: "Jami",
    shiftN: "{n}-smena",
    noSupervisor: "Brigadirsiz",
    del: "Tozalash", cancel: "Bekor qilish",
    saving: "Saqlanmoqda…", saved: "Saqlandi", retry: "Qayta urinish",
    cleared: "Yozuv tozalandi",
    saveFail: "Saqlab bo'lmadi. Qayta urining.",
    factDelTitle: "Fakt yozuvini o'chirish",
    factDelMsg: "{cell} yacheykasining {date} sanasidagi fakt yozuvi o'chiriladi. Davom etasizmi?",
    noMatch: "Mos qator topilmadi",
    noCellsScope: "Sizning doirangizda yacheyka yo'q.",
    allDone: "Barcha yacheykalar kiritilgan",
    noneDone: "Hali hech narsa kiritilmagan",
  },
  uz_cyrl: {
    secFact: "Кунлик факт",
    autosave: "Дақиқани ёзинг — Enter босилганда ёки майдондан чиққанда ўзи сақланади",
    colCell: "Ячейка",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colDelta: "Фарқ (мин)", colNote: "Изоҳ",
    standardHint: "«Стандарт» рўйхатидан олинади — бу ерда таҳрирланмайди",
    leader: "Лидер", minSuffix: "мин", stdShort: "Стандарт",
    vsStd: "Стандартга нисбатан фарқ",
    notePh: "Изоҳ қўшиш…",
    fAll: "Ҳаммаси", fTodo: "Киритилмаган", fDone: "Киритилган",
    total: "Жами",
    shiftN: "{n}-смена",
    noSupervisor: "Бригадирсиз",
    del: "Тозалаш", cancel: "Бекор қилиш",
    saving: "Сақланмоқда…", saved: "Сақланди", retry: "Қайта уриниш",
    cleared: "Ёзув тозаланди",
    saveFail: "Сақлаб бўлмади. Қайта уриниб кўринг.",
    factDelTitle: "Факт ёзувини ўчириш",
    factDelMsg: "{cell} ячейкасининг {date} санасидаги факт ёзуви ўчирилади. Давом этасизми?",
    noMatch: "Мос қатор топилмади",
    noCellsScope: "Сизнинг доирангизда ячейка йўқ.",
    allDone: "Барча ячейкалар киритилган",
    noneDone: "Ҳали ҳеч нарса киритилмаган",
  },
  ru: {
    secFact: "Факт за день",
    autosave: "Введите минуты — сохраняется само по Enter или при выходе из поля",
    colCell: "Ячейка",
    colStandard: "Стандарт (мин)", colFact: "Факт (мин)", colDelta: "Разница (мин)", colNote: "Примечание",
    standardHint: "Берётся из реестра «Стандарт» — здесь не редактируется",
    leader: "Лидер", minSuffix: "мин", stdShort: "Стандарт",
    vsStd: "Отклонение от стандарта",
    notePh: "Добавить примечание…",
    fAll: "Все", fTodo: "Не внесено", fDone: "Внесено",
    total: "Итого",
    shiftN: "{n} смена",
    noSupervisor: "Без бригадира",
    del: "Очистить", cancel: "Отмена",
    saving: "Сохранение…", saved: "Сохранено", retry: "Повторить",
    cleared: "Запись очищена",
    saveFail: "Не удалось сохранить. Попробуйте ещё раз.",
    factDelTitle: "Удалить запись факта",
    factDelMsg: "Запись факта по ячейке {cell} за {date} будет удалена. Продолжить?",
    noMatch: "Совпадений нет",
    noCellsScope: "В вашей зоне нет ячеек.",
    allDone: "Все ячейки заполнены",
    noneDone: "Пока ничего не внесено",
  },
  en: {
    secFact: "Daily fact",
    autosave: "Type the minutes — saved automatically on Enter or when you leave the field",
    colCell: "Cell",
    colStandard: "Standard (min)", colFact: "Fact (min)", colDelta: "Diff (min)", colNote: "Note",
    standardHint: "Taken from the «Standard» register — not editable here",
    leader: "Leader", minSuffix: "min", stdShort: "Standard",
    vsStd: "Difference from the standard",
    notePh: "Add a note…",
    fAll: "All", fTodo: "Missing", fDone: "Entered",
    total: "Total",
    shiftN: "Shift {n}",
    noSupervisor: "No supervisor",
    del: "Clear", cancel: "Cancel",
    saving: "Saving…", saved: "Saved", retry: "Retry",
    cleared: "Entry cleared",
    saveFail: "Could not save. Try again.",
    factDelTitle: "Delete the fact entry",
    factDelMsg: "The fact entry for cell {cell} on {date} will be deleted. Continue?",
    noMatch: "No matching rows",
    noCellsScope: "There are no cells in your scope.",
    allDone: "Every cell has its fact",
    noneDone: "Nothing entered yet",
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

// ── row helpers ──────────────────────────────────────────────────────────────

const COLS = 6;
const num = (v) => Number(String(v ?? "").replace(",", "."));
const factOf = (c) => (c.entry?.minutes != null ? String(c.entry.minutes) : "");
const noteOf = (c) => c.entry?.note || "";
const omit = (m, id) => {
  if (!(id in m)) return m;
  const { [id]: _drop, ...rest } = m;
  return rest;
};
// Digits and ONE decimal separator, a comma included — that is what the uz/ru
// iOS keypad types, and `type=number` would silently throw it away.
const cleanMinutes = (v) => {
  const s = String(v).replace(/[^\d.,]/g, "");
  const i = s.search(/[.,]/);
  return (i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/[.,]/g, "")).slice(0, 7);
};
// A signed gap reads as a verdict without its colour — "+7" is what the red
// meant, said to the ~8% of men who cannot tell it from the green.
const signed = (gap) => (gap > 0 ? `+${fmtMin(gap)}` : gap < 0 ? `−${fmtMin(-gap)}` : "0");

// Rows under their brigadir: groups in name order, the unassigned last, and
// inside a group the page's own order (its sort) exactly as it came.
function groupRows(rows, tl, T) {
  const byKey = new Map();
  for (const c of rows) {
    const key = String(c.manager_id ?? (c.supervisor ? `n:${c.supervisor}` : "none"));
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: c.supervisor ? tl(c.supervisor) : T.noSupervisor,
        none: !c.supervisor,
        shift: c.shift ?? null,
        rows: [],
      });
    }
    byKey.get(key).rows.push(c);
  }
  return [...byKey.values()].sort((a, b) => (a.none - b.none) || a.label.localeCompare(b.label));
}

// ── small pieces ─────────────────────────────────────────────────────────────

// The one field this table exists for. `text` + inputMode=decimal, not
// type=number (see cleanMinutes); text-base below md is what stops iOS zooming
// the page on focus. The border never carries the traffic light: a red outline
// means "what you typed is invalid" in every form anyone has filled in, and a
// changeover that ran long is a fact about the shift, not a typo.
function FactInput({ inputRef, value, onChange, onBlur, onKeyDown, label, suffix }) {
  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        inputMode="decimal"
        enterKeyHint="next"
        autoComplete="off"
        aria-label={label}
        className="w-full rounded-lg pl-2 pr-9 py-1.5 md:py-1 text-base md:text-xs text-right tabular-nums outline-none border border-[var(--border-md)] bg-[var(--bg-inner)] transition-[border-color,box-shadow] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-ring)]"
        style={{ color: "var(--text-1)", fontWeight: value ? 600 : 400 }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px]"
        style={{ color: "var(--text-4)" }}
      >
        {suffix}
      </span>
    </div>
  );
}

// Optional text. On the desktop table it is a GHOST field — plain text at rest,
// a box on row hover and on focus — so 158 rows do not print 158 empty boxes.
// A phone has no hover, so there it keeps a light outline.
function NoteInput({ ghost, value, onChange, onBlur, onKeyDown, label, placeholder }) {
  const skin = ghost
    ? "border-transparent bg-transparent placeholder:text-transparent group-hover:border-[var(--border-md)] group-hover:placeholder:text-[var(--text-4)] focus:placeholder:text-[var(--text-4)]"
    : "border-[var(--border)] bg-transparent placeholder:text-[var(--text-4)]";
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      enterKeyHint="next"
      autoComplete="off"
      aria-label={label}
      className={`w-full min-w-0 rounded-lg px-2 py-1.5 md:py-1 text-base md:text-xs outline-none border transition-[border-color,box-shadow,background-color] focus:border-[var(--brand)] focus:bg-[var(--bg-inner)] focus:shadow-[0_0_0_3px_var(--brand-ring)] ${skin}`}
      style={{ color: "var(--text-2)" }}
    />
  );
}

function DeltaPill({ gap, color, title }) {
  if (gap == null) return <span style={{ color: "var(--text-4)" }}>—</span>;
  return (
    <span
      title={title}
      className="inline-block min-w-[40px] text-center px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: hexA(color, 0.13), color }}
    >
      {signed(gap)}
    </span>
  );
}

// The row's last word: saving → saved ✓ → back to the quiet clear button; a
// failed write stays as a red mark that retries on press, with the typed value
// still in the field.
function RowState({ state, canClear, onClear, onRetry, T }) {
  if (state === "saving") {
    return <Loader2 size={14} className="animate-spin inline-block" style={{ color: "var(--text-4)" }} aria-label={T.saving} />;
  }
  if (state === "saved") {
    return <Check size={15} className="inline-block" style={{ color: "#22c55e" }} aria-label={T.saved} />;
  }
  if (state?.error) {
    return (
      <Button
        size="sm" variant="ghost" onClick={onRetry}
        title={`${state.error} · ${T.retry}`} aria-label={T.retry}
        icon={<AlertCircle size={14} style={{ color: "#ef4444" }} />}
      />
    );
  }
  if (!canClear) return null;
  // Quiet until the row is hovered — a column of red bins down a filled day is
  // noise — but never invisible: a phone has no hover to reveal it with.
  return (
    <span className="inline-flex opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <Button size="sm" variant="ghost" onClick={onClear} title={T.del} aria-label={T.del} icon={<Trash2 size={13} />} />
    </span>
  );
}

function GroupHead({ g, T }) {
  const done = g.total > 0 && g.filled === g.total;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-xs font-semibold truncate" title={g.label} style={{ color: "var(--text-1)" }}>{g.label}</span>
      {g.shift != null && (
        <span
          className="shrink-0 text-[10px] font-medium px-1.5 py-px rounded-md"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-3)" }}
        >
          {T.shiftN.replace("{n}", g.shift)}
        </span>
      )}
      <span
        className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums"
        style={{ color: done ? "#22c55e" : "var(--text-3)" }}
      >
        {done && <Check size={12} />}
        {g.filled}/{g.total}
      </span>
    </div>
  );
}

const Seg = ({ label, n }) => (
  <span className="inline-flex items-center gap-1.5">
    {label}
    {n != null && <span className="tabular-nums opacity-70">{n}</span>}
  </span>
);

/**
 * @param date       ISO day the rows belong to (writes carry it)
 * @param rows       already-filtered, already-sorted fact cells (the page owns both)
 * @param totalCount rows before filtering — tells "no match" from "no cells"
 * @param isLoading  skeleton rows while the day loads
 * @param toolbar    the page's own toolbar node (optional)
 * @param icon/title the card header
 * @param sort/onSort the page's sort state (sorted keys: cell · standard · fact · note)
 */
export default function PerenaladkaFactTable({
  date,
  rows,
  totalCount,
  isLoading = false,
  toolbar = null,
  icon,
  title,
  sort,
  onSort,
}) {
  const qc = useQueryClient();
  const { lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast({ position: "bottom" });
  const T = TXT[lang] || TXT.ru;

  // cell_id → { minutes, note } while a row is being typed. A ref mirrors the
  // state so a blur can read the draft it is committing synchronously — Escape
  // drops the draft and then blurs, and the blur must see it already gone.
  const [drafts, setDrafts] = useState({});
  const draftsRef = useRef({});
  const writeDrafts = (fn) => { draftsRef.current = fn(draftsRef.current); setDrafts(draftsRef.current); };
  // cell_id → "saving" | "saved" | { error }
  const [status, setStatus] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);
  const [view, setView] = useState("all");        // all · todo · done
  const queues = useRef({});                       // cell_id → the row's last write
  const timers = useRef({});
  const inputs = useRef({});                       // "t:<id>" / "m:<id>" → the Fakt field
  const dateRef = useRef(date);

  // A draft carried onto another date would write yesterday's number into
  // today — the day changing drops every draft and every row mark.
  useEffect(() => {
    dateRef.current = date;
    draftsRef.current = {};
    setDrafts({});
    setStatus({});
  }, [date]);
  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), []);

  const setRowState = (id, v) => setStatus((s) => (v == null ? omit(s, id) : { ...s, [id]: v }));
  const flashSaved = (id) => {
    setRowState(id, "saved");
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(
      () => setStatus((s) => (s[id] === "saved" ? omit(s, id) : s)),
      1600,
    );
  };

  // The server's answer goes straight into the shared cache, so the row shows
  // what was stored the instant it is stored — no refetch of 158 rows per
  // Enter, and no flash of the old value in between. The list is only marked
  // stale; it reloads on the next visit or focus.
  const patchEntry = (day, id, entry) => {
    qc.setQueryData(["setup-fact", day], (old) =>
      old?.cells ? { ...old, cells: old.cells.map((x) => (x.cell_id === id ? { ...x, entry } : x)) } : old);
    qc.invalidateQueries({ queryKey: ["setup-fact"], refetchType: "none" });
    qc.invalidateQueries({ queryKey: ["setup-analysis"] });
  };
  const errMsg = (e) => {
    const d = e?.response?.data?.detail;
    return typeof d === "string" && d ? d : T.saveFail;
  };

  const save = async (c, d, day, minutes) => {
    const id = c.cell_id;
    if (dateRef.current === day) setRowState(id, "saving");
    try {
      const entry = await api.post("/api/setup-times/fact", {
        cell_id: id, date: day, minutes, note: (d.note || "").trim(),
      }).then((r) => r.data);
      patchEntry(day, id, entry);
      if (dateRef.current !== day) return;
      // Only the draft this write carried goes — anything typed meanwhile stays.
      writeDrafts((m) => (m[id] === d ? omit(m, id) : m));
      flashSaved(id);
    } catch (e) {
      if (dateRef.current !== day) return;
      const msg = errMsg(e);
      setRowState(id, { error: msg });
      toast.error(`${c.code} — ${msg}`);
    }
  };

  // One row's writes run in the order they were committed.
  const enqueue = (id, job) => {
    const next = (queues.current[id] || Promise.resolve()).then(job);
    queues.current[id] = next.catch(() => {});
  };

  const commit = (c) => {
    const id = c.cell_id;
    const d = draftsRef.current[id];
    if (!d) return;
    const typed = d.minutes.trim();
    if (typed === factOf(c) && d.note === noteOf(c)) { writeDrafts((m) => omit(m, id)); return; }
    const minutes = num(typed);
    if (!typed || !(minutes > 0)) {
      // Blank (or 0) is "not entered". On a stored row that is a request to
      // clear it — asked, never assumed; on an empty one there is nothing to clear.
      if (c.entry) setConfirmDel(c);
      else writeDrafts((m) => omit(m, id));
      return;
    }
    enqueue(id, () => save(c, d, date, minutes));
  };

  const setField = (c, key) => (raw) => {
    const v = key === "minutes" ? cleanMinutes(raw) : raw;
    writeDrafts((m) => ({
      ...m,
      [c.cell_id]: { ...(m[c.cell_id] ?? { minutes: factOf(c), note: noteOf(c) }), [key]: v },
    }));
    if (status[c.cell_id]?.error) setRowState(c.cell_id, null);
  };

  const delMut = useMutation({
    mutationFn: ({ c }) => api.delete(`/api/setup-times/fact/${c.entry.id}`),
    onSuccess: (_d, { c, day }) => {
      patchEntry(day, c.cell_id, null);
      writeDrafts((m) => omit(m, c.cell_id));
      setRowState(c.cell_id, null);
      setConfirmDel(null);
      toast.success(T.cleared);
    },
  });

  // ── what is on screen ──────────────────────────────────────────────────────
  const filled = rows.filter((c) => c.entry).length;
  const todo = rows.length - filled;
  const totalMin = rows.reduce((a, c) => a + (c.entry?.minutes || 0), 0);
  // A row being worked on keeps its place until its ✓ has been seen: under
  // «Kiritilmagan» a row saved from its fact field would otherwise vanish with
  // the cursor still in its note field, taking the half-typed note with it.
  const inView = (c) =>
    view === "all" || !!drafts[c.cell_id] || !!status[c.cell_id]
    || (view === "todo" ? !c.entry : !!c.entry);

  const groupsAll = groupRows(rows, tl, T);
  const showGroups = groupsAll.length > 1;
  const groups = groupsAll
    .map((g) => ({ ...g, total: g.rows.length, filled: g.rows.filter((c) => c.entry).length, shown: g.rows.filter(inView) }))
    .filter((g) => g.shown.length > 0);
  const order = groups.flatMap((g) => g.shown.map((c) => c.cell_id));

  // Enter walks DOWN the Fakt column — the order on screen, groups flattened;
  // on the last row it simply commits.
  const refFor = (layout, id) => (el) => {
    const k = `${layout}:${id}`;
    if (el) inputs.current[k] = el; else delete inputs.current[k];
  };
  const focusNext = (layout, id) => {
    for (let j = order.indexOf(id) + 1; j < order.length; j++) {
      const el = inputs.current[`${layout}:${order[j]}`];
      if (el) { el.focus(); el.select(); return true; }
    }
    return false;
  };
  const onFieldKey = (layout, c) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (!focusNext(layout, c.cell_id)) e.currentTarget.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      writeDrafts((m) => omit(m, c.cell_id));
      e.currentTarget.blur();
    }
  };

  const model = (c) => {
    const d = drafts[c.cell_id];
    const minutes = d ? d.minutes : factOf(c);
    const typed = minutes.trim() ? num(minutes) : null;
    const gap = Number.isFinite(typed) && typed > 0 && c.standard != null
      ? parseFloat((typed - c.standard).toFixed(2))
      : null;
    return {
      minutes,
      note: d ? d.note : noteOf(c),
      hasFact: !!minutes.trim(),
      gap,
      gapColor: gap == null ? null : deltaColor(gap, c.standard),
      state: status[c.cell_id],
      leader: c.leader ? tl(c.leader) : "",
    };
  };

  const empty = isLoading ? null
    : rows.length === 0 ? { text: (totalCount ?? rows.length) === 0 ? T.noCellsScope : T.noMatch }
    : groups.length === 0 ? (view === "todo" ? { text: T.allDone, done: true } : { text: T.noneDone })
    : null;
  const emptyNode = empty && (
    <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm"
         style={{ color: empty.done ? "#22c55e" : "var(--text-4)" }}>
      {empty.done && <CheckCircle2 size={16} />}
      {empty.text}
    </div>
  );

  const stateCell = (c, m) => (
    <RowState
      state={m.state}
      canClear={!!c.entry}
      onClear={() => setConfirmDel(c)}
      onRetry={() => commit(c)}
      T={T}
    />
  );

  // ── phones: two lines per cell, nothing to scroll sideways ────────────────
  const mobile = isLoading ? (
    <div className="p-4 space-y-3">
      {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full rounded-lg" />)}
    </div>
  ) : emptyNode || (
    <div>
      {groups.map((g, gi) => (
        <Fragment key={g.key}>
          {showGroups && (
            <div className="px-4 py-1.5" style={{ background: "var(--bg-inner)", borderTop: gi ? "1px solid var(--border)" : "none" }}>
              <GroupHead g={g} T={T} />
            </div>
          )}
          {g.shown.map((c, ri) => {
            const m = model(c);
            return (
              <div
                key={c.cell_id}
                className="px-4 py-2.5"
                style={{
                  borderTop: showGroups || gi || ri ? "1px solid var(--border)" : "none",
                  boxShadow: m.state?.error ? "inset 3px 0 0 #ef4444" : undefined,
                }}
              >
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono tabular-nums text-sm font-semibold shrink-0" style={{ color: "var(--text-1)" }}>
                    <CellLink id={c.cell_id}>{c.code}</CellLink>
                  </span>
                  {m.leader && (
                    <span className="text-xs truncate" title={m.leader} style={{ color: "var(--text-3)" }}>
                      {shortPerson(m.leader)}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs tabular-nums" title={T.standardHint} style={{ color: "var(--text-4)" }}>
                    {T.stdShort}{" "}
                    <span style={{ color: c.standard != null ? "var(--text-2)" : undefined }}>{fmtMin(c.standard)}</span>
                    {c.standard != null && ` ${T.minSuffix}`}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="w-[108px] shrink-0">
                    <FactInput
                      inputRef={refFor("m", c.cell_id)}
                      value={m.minutes}
                      onChange={setField(c, "minutes")}
                      onBlur={() => commit(c)}
                      onKeyDown={onFieldKey("m", c)}
                      label={`${T.colFact} — ${c.code}`}
                      suffix={T.minSuffix}
                    />
                  </div>
                  <div className="w-12 shrink-0 text-center text-xs">
                    <DeltaPill gap={m.gap} color={m.gapColor} title={T.vsStd} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {m.hasFact && (
                      <NoteInput
                        value={m.note}
                        onChange={setField(c, "note")}
                        onBlur={() => commit(c)}
                        onKeyDown={onFieldKey("m", c)}
                        label={`${T.colNote} — ${c.code}`}
                        placeholder={T.notePh}
                      />
                    )}
                  </div>
                  <div className="w-9 shrink-0 flex justify-center">{stateCell(c, m)}</div>
                </div>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );

  return (
    <>
      <TableCard
        icon={icon}
        title={title || T.secFact}
        subtitle={T.autosave}
        right={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {!isLoading && rows.length > 0 && (
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                {T.total}{" "}
                <span className="font-semibold" style={{ color: "var(--text-2)" }}>{fmtMin(totalMin)}</span>{" "}
                {T.minSuffix}
              </span>
            )}
            <SegmentedToggle
              size="sm"
              value={view}
              onChange={setView}
              ariaLabel={title || T.secFact}
              options={[
                { value: "all",  label: <Seg label={T.fAll}  n={isLoading ? null : rows.length} />, title: T.fAll },
                { value: "todo", label: <Seg label={T.fTodo} n={isLoading ? null : todo} />,        title: T.fTodo },
                { value: "done", label: <Seg label={T.fDone} n={isLoading ? null : filled} />,      title: T.fDone },
              ]}
            />
          </div>
        }
        toolbar={toolbar}
        // Column widths come from the header, not the rows: the grid must
        // never move under the operator's hands while a row is being typed.
        fixed
        minWidth={760}
        mobile={mobile}
      >
        <thead>
          <tr>
            {/* The numeric columns are sized for their longest header
                («Стандарт (мин)» + its sort chevron), not their values. */}
            <Th label={T.colCell} k="cell" sort={sort} onSort={onSort} cls="w-[28%]" />
            <Th label={T.colStandard} k="standard" sort={sort} onSort={onSort} align="right"
                hint={T.standardHint} cls="w-[150px]" />
            <Th label={T.colFact} k="fact" sort={sort} onSort={onSort} align="right" cls="w-[140px]" />
            <Th label={T.colDelta} align="right" hint={T.vsStd} cls="w-[132px]" />
            {/* The note takes whatever is left — the one column that can use
                every spare pixel and the one whose width means nothing. */}
            <Th label={T.colNote} k="note" sort={sort} onSort={onSort} />
            <Th label="" cls="w-[52px]" />
          </tr>
        </thead>
        <tbody>
          {isLoading &&
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: COLS }).map((_, j) => (
                  <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-3 w-full" /></td>
                ))}
              </tr>
            ))}
          {emptyNode && (
            <tr><td colSpan={COLS}>{emptyNode}</td></tr>
          )}
          {!isLoading && groups.map((g) => (
            <Fragment key={g.key}>
              {showGroups && (
                <tr>
                  <td colSpan={COLS} className="px-3 py-1.5" style={{ background: "var(--bg-inner)" }}>
                    <GroupHead g={g} T={T} />
                  </td>
                </tr>
              )}
              {g.shown.map((c) => {
                const m = model(c);
                return (
                  <tr key={c.cell_id} className="group">
                    <td className="px-3 py-1.5" style={m.state?.error ? { boxShadow: "inset 3px 0 0 #ef4444" } : undefined}>
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-mono tabular-nums text-[13px] font-semibold shrink-0" style={{ color: "var(--text-1)" }}>
                          <CellLink id={c.cell_id}>{c.code}</CellLink>
                        </span>
                        {m.leader && (
                          <span className="truncate" title={`${T.leader}: ${m.leader}`} style={{ color: "var(--text-3)" }}>
                            {m.leader}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums"
                        style={{ color: c.standard != null ? "var(--text-2)" : "var(--text-4)" }}>
                      {fmtMin(c.standard)}
                    </td>
                    <td className="px-2 py-1.5">
                      <FactInput
                        inputRef={refFor("t", c.cell_id)}
                        value={m.minutes}
                        onChange={setField(c, "minutes")}
                        onBlur={() => commit(c)}
                        onKeyDown={onFieldKey("t", c)}
                        label={`${T.colFact} — ${c.code}`}
                        suffix={T.minSuffix}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <DeltaPill gap={m.gap} color={m.gapColor} title={T.vsStd} />
                    </td>
                    <td className="px-2 py-1.5">
                      {m.hasFact && (
                        <NoteInput
                          ghost
                          value={m.note}
                          onChange={setField(c, "note")}
                          onBlur={() => commit(c)}
                          onKeyDown={onFieldKey("t", c)}
                          label={`${T.colNote} — ${c.code}`}
                          placeholder={T.notePh}
                        />
                      )}
                    </td>
                    <td className="px-1 py-1.5 text-center">{stateCell(c, m)}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
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
          error={delMut.isError ? errMsg(delMut.error) : null}
          onCancel={() => {
            // Cancelling a clear that started as an emptied field puts the
            // stored value back, so the row never lies about what is saved.
            writeDrafts((m) => omit(m, confirmDel.cell_id));
            delMut.reset();
            setConfirmDel(null);
          }}
          onConfirm={() => delMut.mutate({ c: confirmDel, day: date })}
        />
      )}
      {toast.node}
    </>
  );
}
