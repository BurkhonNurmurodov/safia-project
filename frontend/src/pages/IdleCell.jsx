import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Info, Save, ChevronDown, RotateCcw,
  Snowflake, Wrench, Container, Warehouse, PackagePlus, Building2, Truck,
  FlaskConical, ClipboardList, Sparkles, Hourglass, Layers,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DayStepper from "../components/ui/DayStepper";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { SkeletonBlock } from "../components/ui/Skeleton";
import api from "../utils/api";
import { CATEGORY_COLORS } from "../utils/chartPalette";
import { cellName as pickCellName } from "../utils/cellName";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";

// Themed icon per category — mirrors CategoryLegendModal.jsx CAT_ICON.
const CAT_ICON = {
  A: Snowflake, B: Wrench, C: Container, D: Warehouse, D2: PackagePlus,
  D3: Building2, E: Truck, F: FlaskConical, G: ClipboardList, H: Sparkles, I: Hourglass,
};

// Ojidaniya categories, A→Z order. MUST mirror backend IDLE_CATEGORIES. `code` is
// the "downtime.cat.<code>.label"/".note" i18n suffix; `name` is what the backend
// stores. Cat H has no "not stopped" half (its 2nd source column is a headcount).
const CATS = [
  { code: "A",  name: "Cat A" },
  { code: "B",  name: "Cat B" },
  { code: "C",  name: "Cat C" },
  { code: "D",  name: "Cat D" },
  { code: "D2", name: "Cat D2" },
  { code: "D3", name: "Cat D3" },
  { code: "E",  name: "Cat E" },
  { code: "F",  name: "Cat F" },
  { code: "G",  name: "Cat G" },
  { code: "H",  name: "Cat H", noNs: true },
  { code: "I",  name: "Cat I" },
];

// md+ keeps the 4-column grid; below md each category stacks (name row / labeled
// number pair / full-width note) so the required note and Save stay on-screen.
// The number columns are sized to fit the longest header word ("To'xtamaganda"),
// which overflowed into the note column at 5rem.
const GRID_COLS = "md:grid-cols-[minmax(150px,1.5fr)_7rem_7rem_minmax(180px,1.7fr)]";
// Table chrome, mirroring DataTable.jsx: padded cells with a vertical rule between
// columns. md+ only — below md the four cells stack into rows, where a left border
// would cut across the stack.
const COL_SEP = "md:[&>*:not(:first-child)]:border-l md:[&>*]:border-[var(--border)]";
const HEAD_CELL = "px-3 py-2";
const CELL = "px-3 py-1.5 min-w-0";
// Inputs are 16px below md — iOS WebViews zoom the whole page when focusing
// anything smaller.
const INPUT_NUM = "w-full rounded-lg px-2 py-1.5 md:py-1 text-base md:text-xs text-right outline-none tabular-nums";
const INPUT_TXT = "w-full rounded-lg px-2 py-1.5 md:py-1 text-base md:text-xs outline-none";
const INPUT_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };
const MOBILE_LABEL = "md:hidden block text-[10px] font-semibold uppercase tracking-wide mb-0.5";

const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fmtMin = (v) => {
  const n = Number(v) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(1);
};
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
// Telegram's on-screen keyboard shrinks the viewport after focus; recentre the
// field once that resize settles (phones only — desktop clicks shouldn't jump).
const focusIntoView = (e) => {
  if (window.innerWidth >= 768) return;
  const el = e.currentTarget;
  setTimeout(() => el.scrollIntoView({ block: "center" }), 250);
};
// Viewer language first, then Russian — the shared registry fallback.
const cellName = (c, lang) => pickCellName(c, lang, "name_");
// Stable per-cell hue so each verifix badge is visually distinct (identity, not
// status) — solid mid-tone with white text reads in both themes.
function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// One production cell = one collapsible accordion. Owns its per-category draft
// inputs + last-saved snapshot; each category row saves independently.
function CellAccordion({ cell, date, t, lang, autoOpen }) {
  const [open, setOpen] = useState(autoOpen);
  const [infoOpen, setInfoOpen] = useState(null); // code of the category whose description is expanded
  const [confirmCode, setConfirmCode] = useState(null); // code of the category pending a reset-to-0 confirm
  const [rows, setRows] = useState(() => {
    const init = {};
    for (const cat of CATS) {
      const e = (cell.entries || []).find((x) => x.category === cat.name);
      init[cat.code] = {
        stopped: e && Number(e.stopped) ? String(e.stopped) : "",
        not_stopped: e && Number(e.not_stopped) ? String(e.not_stopped) : "",
        note: e?.note || "",
        id: e?.id ?? null,
        saved: e ? { stopped: Number(e.stopped) || 0, not_stopped: Number(e.not_stopped) || 0, note: e.note || "" } : null,
      };
    }
    return init;
  });

  // Only ever opens (never forces closed, so a manual collapse sticks); also
  // catches already-mounted cells when the cell filter narrows the list.
  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  const setField = (code, field, val) =>
    setRows((r) => ({ ...r, [code]: { ...r[code], [field]: val } }));

  // One button per cell: POST every dirty, filled-in category in parallel and
  // fold each success back into its row's saved snapshot (allSettled so a single
  // failing row doesn't discard the others' saves).
  const saveMut = useMutation({
    mutationFn: async (cats) => {
      const settled = await Promise.allSettled(
        cats.map((cat) =>
          api
            .post("/api/idle-cell", {
              cell_id: cell.cell_id,
              date,
              category: cat.name,
              stopped: num(rows[cat.code].stopped),
              not_stopped: cat.noNs ? 0 : num(rows[cat.code].not_stopped),
              note: rows[cat.code].note.trim(),
            })
            .then((r) => ({ code: cat.code, data: r.data })),
        ),
      );
      const ok = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
      if (!ok.length) throw new Error("save failed");
      return ok;
    },
    onSuccess: (ok) =>
      setRows((r) => {
        const next = { ...r };
        for (const { code, data } of ok) {
          next[code] = {
            stopped: data.stopped ? String(data.stopped) : "",
            not_stopped: data.not_stopped ? String(data.not_stopped) : "",
            note: data.note || "",
            id: data.id,
            saved: { stopped: data.stopped || 0, not_stopped: data.not_stopped || 0, note: data.note || "" },
          };
        }
        return next;
      }),
  });

  // Reset one saved category back to 0 — deletes its persisted entry (the backend
  // rejects a 0/0 save, so clearing = removing the row) and blanks the inputs.
  const delMut = useMutation({
    mutationFn: ({ id }) => api.delete(`/api/idle-cell/${id}`),
    onSuccess: (_d, { code }) => {
      setRows((r) => ({ ...r, [code]: { stopped: "", not_stopped: "", note: "", id: null, saved: null } }));
      setConfirmCode(null);
    },
  });

  // Per-category state: which rows are edited (dirty), fully filled (valid → saveable),
  // or half-filled (incomplete → blocked, needs both minutes and a reason).
  const rowStatus = useMemo(
    () =>
      CATS.map((cat) => {
        const r = rows[cat.code];
        const hasNote = r.note.trim().length > 0;
        const hasMin = num(r.stopped) > 0 || (!cat.noNs && num(r.not_stopped) > 0);
        const dirty =
          !r.saved ||
          num(r.stopped) !== r.saved.stopped ||
          (!cat.noNs && num(r.not_stopped) !== r.saved.not_stopped) ||
          r.note.trim() !== r.saved.note;
        const valid = hasNote && hasMin;
        return { cat, hasNote, hasMin, dirty, valid, incomplete: dirty && !valid && (hasNote || hasMin) };
      }),
    [rows],
  );
  const pendingCats = rowStatus.filter((s) => s.dirty && s.valid).map((s) => s.cat);
  const incompleteCount = rowStatus.filter((s) => s.incomplete).length;
  const hasDraft = pendingCats.length > 0 || incompleteCount > 0;

  const sumStopped = CATS.reduce((a, c) => a + (rows[c.code].saved?.stopped || 0), 0);
  const sumNs = CATS.reduce((a, c) => a + (rows[c.code].saved?.not_stopped || 0), 0);
  const hue = hueFromString(cell.verifix_code || "");
  const name = cellName(cell, lang);

  return (
    // overflow-clip (not hidden) — clip doesn't create a scroll container, so the
    // sticky save footer below can track the page scrollport.
    <div className="rounded-xl overflow-clip" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2.5 min-h-[44px] text-left">
        <ChevronDown
          size={16}
          style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
        <span
          className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0"
          style={{ background: `hsl(${hue},55%,42%)`, color: "#fff" }}
        >
          {cell.verifix_code}
        </span>
        <span className="truncate text-sm" style={{ color: "var(--text-1)" }}>{name || "—"}</span>
        {hasDraft && (
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: "#eab308" }}
            title={t("idleCell.incompleteHint")}
          />
        )}
        <span className="ml-auto flex items-center gap-2 sm:gap-3 flex-shrink-0 text-xs tabular-nums">
          {sumStopped + sumNs === 0 ? (
            // Backend rejects 0/0 saves, so zero sums reliably mean "no entries
            // yet" — a muted dash makes cells with real data pop out of the list.
            <span style={{ color: "var(--text-4)" }}>—</span>
          ) : (
            <>
              <span className="flex items-center gap-1" title={t("idleCell.stopped")}>
                <span className="sm:hidden w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#ef4444" }} />
                <span className="hidden sm:inline" style={{ color: "var(--text-4)" }}>{t("idleCell.stopped")}</span>
                <span style={{ color: sumStopped ? "#ef4444" : "var(--text-3)", fontWeight: 600 }}>{fmtMin(sumStopped)}</span>
              </span>
              <span className="flex items-center gap-1" title={t("idleCell.notStopped")}>
                <span className="sm:hidden w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#94a3b8" }} />
                <span className="hidden sm:inline" style={{ color: "var(--text-4)" }}>{t("idleCell.notStopped")}</span>
                <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{fmtMin(sumNs)}</span>
              </span>
            </>
          )}
        </span>
      </button>

      {open && (
        <>
          <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="md:min-w-[640px]">
              <div
                className={`hidden md:grid text-[10px] font-semibold uppercase tracking-wide ${COL_SEP} ${GRID_COLS}`}
                style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
              >
                <div className={HEAD_CELL}>{t("idleCell.category")}</div>
                <div className={`${HEAD_CELL} text-right`}>{t("idleCell.stopped")}</div>
                <div className={`${HEAD_CELL} text-right`}>{t("idleCell.notStopped")}</div>
                <div className={HEAD_CELL}>{t("idleCell.note")}</div>
              </div>
              {rowStatus.map(({ cat, incomplete, hasNote, hasMin }, i) => {
                const Icon = CAT_ICON[cat.code] || Layers;
                const catColor = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                const r = rows[cat.code];
                const showInfo = infoOpen === cat.code;
                const minErr = incomplete && !hasMin;
                const noteErr = incomplete && !hasNote;
                const minStyle = minErr ? { ...INPUT_STYLE, border: "1px solid #ef4444" } : INPUT_STYLE;
                return (
                  <div key={cat.code} style={{ borderTop: "1px solid var(--border)" }}>
                    <div className={`grid grid-cols-2 ${COL_SEP} ${GRID_COLS}`}>
                      <div className={`${CELL} col-span-2 md:col-span-1 flex items-center gap-1.5`}>
                        <Icon size={14} style={{ color: catColor, flexShrink: 0 }} />
                        <span className="text-xs truncate" style={{ color: "var(--text-1)" }}>
                          {t("idleCell.category")} {cat.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => setInfoOpen((c) => (c === cat.code ? null : cat.code))}
                          className="flex-shrink-0 inline-flex items-center justify-center rounded-md p-2 -m-1.5"
                          style={{ color: showInfo ? "var(--brand-text)" : "var(--text-3)", cursor: "pointer" }}
                          aria-label={t(`downtime.cat.${cat.code}.label`)}
                          aria-expanded={showInfo}
                        >
                          <Info size={17} />
                        </button>
                      </div>
                      {/* type=text + inputMode=decimal: the uz/ru iOS keypad types a
                          comma, which type=number silently rejects; num() normalizes
                          it. Also stops wheel/gesture scrolls from mutating values.
                          The label IS the table cell (never md:contents — a
                          display:contents box can't draw the column separator);
                          below md the caption labels the input. */}
                      <label className={`${CELL} flex flex-col justify-center`}>
                        <span className={MOBILE_LABEL} style={{ color: "var(--text-3)" }}>{t("idleCell.stopped")}</span>
                        <input
                          type="text" inputMode="decimal"
                          value={r.stopped}
                          onChange={(e) => setField(cat.code, "stopped", e.target.value)}
                          onFocus={focusIntoView}
                          className={INPUT_NUM} style={minStyle}
                        />
                      </label>
                      {cat.noNs ? (
                        <div className={`${CELL} flex flex-col justify-center`}>
                          <span className={MOBILE_LABEL} style={{ color: "var(--text-3)" }}>{t("idleCell.notStopped")}</span>
                          <div className="text-center text-xs py-1" style={{ color: "var(--text-4)" }} title={t("idleCell.noNsHint")}>—</div>
                        </div>
                      ) : (
                        <label className={`${CELL} flex flex-col justify-center`}>
                          <span className={MOBILE_LABEL} style={{ color: "var(--text-3)" }}>{t("idleCell.notStopped")}</span>
                          <input
                            type="text" inputMode="decimal"
                            value={r.not_stopped}
                            onChange={(e) => setField(cat.code, "not_stopped", e.target.value)}
                            onFocus={focusIntoView}
                            className={INPUT_NUM} style={minStyle}
                          />
                        </label>
                      )}
                      <div className={`${CELL} col-span-2 md:col-span-1 flex items-center gap-1.5`}>
                        <input
                          type="text"
                          value={r.note}
                          onChange={(e) => setField(cat.code, "note", e.target.value)}
                          onFocus={focusIntoView}
                          placeholder={t("idleCell.notePlaceholder")}
                          className={`${INPUT_TXT} flex-1 min-w-0`}
                          style={noteErr ? { ...INPUT_STYLE, border: "1px solid #ef4444" } : INPUT_STYLE}
                        />
                        {r.saved && (
                          <button
                            type="button"
                            onClick={() => setConfirmCode(cat.code)}
                            className="flex-shrink-0 inline-flex items-center justify-center rounded-md p-2 -m-1 transition-colors hover:bg-white/10"
                            style={{ color: "var(--text-3)", cursor: "pointer" }}
                            title={t("idleCell.clear")}
                            aria-label={t("idleCell.clear")}
                          >
                            <RotateCcw size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                    {showInfo && (
                      <div className="px-3 pb-2.5 pt-1 text-xs" style={{ background: "var(--bg-inner)" }}>
                        <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>
                          {t(`downtime.cat.${cat.code}.label`)}
                        </div>
                        <div style={{ color: "var(--text-3)", lineHeight: 1.5 }}>
                          {t(`downtime.cat.${cat.code}.note`)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Outside the h-scroller so it can't scroll away sideways; sticky so
              Save + the incomplete hint stay visible while editing any of the
              11 rows. Opaque bg — rows scroll underneath.
              Negative bottom = Layout's <main> padding (p-4 / md:p-6): sticky
              pins to the scrollport's CONTENT box, so bottom-0 left that padding
              strip open under the bar (rows showing through it). Pulling the bar
              down by exactly that much parks it flush with the screen edge. */}
          <div
            className="sticky -bottom-4 md:-bottom-6 z-10 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-3 pt-2 pb-3 md:pb-2"
            style={{ borderTop: "1px solid var(--border)", background: "var(--bg-card)" }}
          >
            {incompleteCount > 0 && (
              <span className="text-xs" style={{ color: "#eab308" }}>{t("idleCell.incompleteHint")}</span>
            )}
            {/* Full-width 44px thumb target on phones; compact toolbar button on md+. */}
            <Button
              size="lg"
              variant="primary"
              className="w-full md:w-auto min-h-[44px] md:min-h-0 text-base md:text-sm"
              disabled={!pendingCats.length}
              loading={saveMut.isPending}
              icon={<Save size={16} />}
              onClick={() => saveMut.mutate(pendingCats)}
            >
              {pendingCats.length ? `${t("idleCell.save")} (${pendingCats.length})` : t("idleCell.save")}
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmCode != null}
        tone="danger"
        title={t("idleCell.clearTitle")}
        message={t("idleCell.clearConfirm")}
        confirmLabel={t("idleCell.delete")}
        cancelLabel={t("idleCell.cancel")}
        loading={delMut.isPending}
        onCancel={() => setConfirmCode(null)}
        onConfirm={() => {
          const id = rows[confirmCode]?.id;
          if (id) delMut.mutate({ code: confirmCode, id });
          else setConfirmCode(null);
        }}
      />
    </div>
  );
}

export default function IdleCell() {
  const { t, lang } = useLang();
  // date deliberately NOT persisted: this is a data-entry page — a silently
  // restored stale day could direct entries to the wrong date.
  const [date, setDate] = useState(localTodayIso());
  const [shiftTab, setShiftTab] = usePersistentState("idle_cell_shift", "all"); // "all" | 1 | 2
  const [supervisorId, setSupervisorId] = usePersistentState("idle_cell_supervisor_id", null);
  const [selectedCellIds, setSelectedCellIds] = usePersistentState("idle_cell_selected_cell_ids", []); // [] = show all of the supervisor's cells

  const { data: supData } = useQuery({
    queryKey: ["idle-supervisors"],
    queryFn: () => api.get("/api/idle-cell/supervisors").then((r) => r.data),
  });
  const supervisors = supData ?? [];
  const shiftSupervisors = useMemo(
    () => supervisors.filter((s) => shiftTab === "all" || s.shift === shiftTab),
    [supervisors, shiftTab],
  );

  const { data: cellsData, isFetching } = useQuery({
    queryKey: ["idle-cells", supervisorId, date],
    queryFn: () => api.get(`/api/idle-cell/cells?supervisor_id=${supervisorId}&date=${date}`).then((r) => r.data),
    enabled: supervisorId != null,
  });
  const cells = cellsData?.cells ?? [];

  const shownCells = useMemo(() => {
    if (!selectedCellIds.length) return cells;
    const set = new Set(selectedCellIds);
    return cells.filter((c) => set.has(String(c.cell_id)));
  }, [cells, selectedCellIds]);

  // A new shift may exclude the picked supervisor — drop it if so.
  function onShift(v) {
    setShiftTab(v);
    setSupervisorId((prev) =>
      prev != null && supervisors.some((s) => s.id === prev && (v === "all" || s.shift === v)) ? prev : null,
    );
    setSelectedCellIds([]);
  }

  const cellOptions = cells.map((c) => ({
    value: String(c.cell_id),
    label: `${c.verifix_code}${cellName(c, lang) ? " · " + cellName(c, lang) : ""}`,
    title: `${c.verifix_code} ${cellName(c, lang)}`,
  }));

  // Auto-open when there is exactly one visible cell, or the user explicitly
  // narrowed to a few — a large selection stays collapsed to keep the list scannable.
  const autoOpen = shownCells.length === 1 || (selectedCellIds.length > 0 && shownCells.length <= 3);

  const emptyBox = (msg) => (
    <div
      className="rounded-2xl py-12 text-center text-sm"
      style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)", color: "var(--text-3)" }}
    >
      {msg}
    </div>
  );

  return (
    <Layout title={t("idleCell.title")}>
      <div
        className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 mb-4 flex flex-wrap items-center gap-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Date + shift share a row on phones (flex-wrap splits them in langs with
            long shift labels); the selects go full-width below md. */}
        <div className="w-full md:w-auto flex flex-wrap items-center gap-2">
          <DayStepper value={date} onChange={setDate} />
          <SegmentedToggle
            value={shiftTab}
            onChange={onShift}
            options={[["all", t("idleCell.shiftAll")], [1, t("idleCell.shift1")], [2, t("idleCell.shift2")]]}
          />
        </div>
        <StyledSelect
          value={supervisorId != null ? String(supervisorId) : ""}
          onChange={(v) => { setSupervisorId(v ? Number(v) : null); setSelectedCellIds([]); }}
          options={shiftSupervisors.map((s) => ({ value: String(s.id), label: s.name, title: s.name }))}
          placeholder={t("idleCell.pickSupervisor")}
          searchable
          searchPlaceholder={t("idleCell.searchSupervisor")}
          triggerClassName="px-3 py-2 text-sm"
          className="w-full md:w-auto md:min-w-[180px]"
        />
        {supervisorId != null && cells.length > 0 && (
          <StyledSelect
            multiple searchable
            value={selectedCellIds}
            onChange={setSelectedCellIds}
            options={cellOptions}
            allLabel={t("idleCell.allCells")}
            countLabel={(n) => `${n} ${t("idleCell.cellsWord")}`}
            searchPlaceholder={t("idleCell.searchCell")}
            triggerClassName="px-3 py-2 text-sm"
            className="w-full md:w-auto md:min-w-[160px]"
          />
        )}
        <span className="w-full md:w-auto md:ml-auto text-xs" style={{ color: "var(--text-4)" }}>{t("idleCell.testNote")}</span>
      </div>

      {supervisorId == null ? (
        emptyBox(t("idleCell.pickSupervisorHint"))
      ) : isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full rounded-xl" />)}
        </div>
      ) : shownCells.length === 0 ? (
        emptyBox(t("idleCell.noCells"))
      ) : (
        <div className="space-y-2">
          {shownCells.map((c) => (
            <CellAccordion key={`${c.cell_id}-${date}`} cell={c} date={date} t={t} lang={lang} autoOpen={autoOpen} />
          ))}
        </div>
      )}
    </Layout>
  );
}
