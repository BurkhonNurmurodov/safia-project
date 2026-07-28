import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Timer, Info, Save, ChevronDown,
  Snowflake, Wrench, Container, Warehouse, PackagePlus, Building2, Truck,
  FlaskConical, ClipboardList, Sparkles, Hourglass, Layers,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import Button from "../components/ui/Button";
import { SkeletonBlock } from "../components/ui/Skeleton";
import api from "../utils/api";
import { CATEGORY_COLORS } from "../utils/chartPalette";
import { useLang } from "../context/LangContext";

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

const GRID = "minmax(140px,1.5fr) 5rem 5rem minmax(160px,1.7fr)";
const INPUT_NUM = "w-full rounded-lg px-2 py-1 text-xs text-right outline-none tabular-nums";
const INPUT_TXT = "w-full rounded-lg px-2 py-1 text-xs outline-none";
const INPUT_STYLE = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };

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
function cellName(c, lang) {
  const byLang = { uz: c.name_uz, uz_cyrl: c.name_uz_cyrl, ru: c.name_ru, en: c.name_en }[lang];
  return byLang || c.name_ru || c.name_uz || c.name_en || c.name_uz_cyrl || "";
}
// Stable per-cell hue so each verifix badge is visually distinct (identity, not
// status) — solid mid-tone with white text reads in both themes.
function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// One production cell = one collapsible accordion. Owns its per-category draft
// inputs + last-saved snapshot; each category row saves independently.
function CellAccordion({ cell, date, t, lang }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(null); // code of the category whose description is expanded
  const [rows, setRows] = useState(() => {
    const init = {};
    for (const cat of CATS) {
      const e = (cell.entries || []).find((x) => x.category === cat.name);
      init[cat.code] = {
        stopped: e && Number(e.stopped) ? String(e.stopped) : "",
        not_stopped: e && Number(e.not_stopped) ? String(e.not_stopped) : "",
        note: e?.note || "",
        saved: e ? { stopped: Number(e.stopped) || 0, not_stopped: Number(e.not_stopped) || 0, note: e.note || "" } : null,
      };
    }
    return init;
  });

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
            saved: { stopped: data.stopped || 0, not_stopped: data.not_stopped || 0, note: data.note || "" },
          };
        }
        return next;
      }),
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

  const sumStopped = CATS.reduce((a, c) => a + (rows[c.code].saved?.stopped || 0), 0);
  const sumNs = CATS.reduce((a, c) => a + (rows[c.code].saved?.not_stopped || 0), 0);
  const hue = hueFromString(cell.verifix_code || "");
  const name = cellName(cell, lang);

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
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
        <span className="ml-auto flex items-center gap-3 flex-shrink-0 text-xs tabular-nums">
          <span>
            <span className="mr-1" style={{ color: "var(--text-4)" }}>{t("idleCell.stopped")}</span>
            <span style={{ color: sumStopped ? "#ef4444" : "var(--text-3)", fontWeight: 600 }}>{fmtMin(sumStopped)}</span>
          </span>
          <span>
            <span className="mr-1" style={{ color: "var(--text-4)" }}>{t("idleCell.notStopped")}</span>
            <span style={{ color: "var(--text-2)", fontWeight: 600 }}>{fmtMin(sumNs)}</span>
          </span>
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
          <div style={{ minWidth: 600 }}>
            <div
              className="grid gap-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide"
              style={{ gridTemplateColumns: GRID, background: "var(--bg-inner)", color: "var(--text-3)" }}
            >
              <div>{t("idleCell.category")}</div>
              <div className="text-right">{t("idleCell.stopped")}</div>
              <div className="text-right">{t("idleCell.notStopped")}</div>
              <div>{t("idleCell.note")}</div>
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
                  <div className="grid gap-2 items-center px-3 py-1.5" style={{ gridTemplateColumns: GRID }}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Icon size={14} style={{ color: "var(--brand-text)", flexShrink: 0 }} />
                      <span className="text-xs truncate" style={{ color: "var(--text-1)" }}>
                        {t("idleCell.category")} {cat.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => setInfoOpen((c) => (c === cat.code ? null : cat.code))}
                        className="flex-shrink-0 inline-flex items-center justify-center rounded-md p-0.5 -m-0.5"
                        style={{ color: showInfo ? "var(--brand-text)" : "var(--text-3)", cursor: "pointer" }}
                        aria-label={t(`downtime.cat.${cat.code}.label`)}
                        aria-expanded={showInfo}
                      >
                        <Info size={17} />
                      </button>
                    </div>
                    <input
                      type="number" min="0" step="any" inputMode="decimal"
                      value={r.stopped}
                      onChange={(e) => setField(cat.code, "stopped", e.target.value)}
                      className={INPUT_NUM} style={minStyle}
                    />
                    {cat.noNs ? (
                      <div className="text-center text-xs" style={{ color: "var(--text-4)" }} title={t("idleCell.noNsHint")}>—</div>
                    ) : (
                      <input
                        type="number" min="0" step="any" inputMode="decimal"
                        value={r.not_stopped}
                        onChange={(e) => setField(cat.code, "not_stopped", e.target.value)}
                        className={INPUT_NUM} style={minStyle}
                      />
                    )}
                    <input
                      type="text"
                      value={r.note}
                      onChange={(e) => setField(cat.code, "note", e.target.value)}
                      placeholder={t("idleCell.notePlaceholder")}
                      className={INPUT_TXT}
                      style={noteErr ? { ...INPUT_STYLE, border: "1px solid #ef4444" } : INPUT_STYLE}
                    />
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
            <div className="flex items-center justify-end gap-3 px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
              {incompleteCount > 0 && (
                <span className="text-xs" style={{ color: "#eab308" }}>{t("idleCell.incompleteHint")}</span>
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={!pendingCats.length}
                loading={saveMut.isPending}
                icon={<Save size={14} />}
                onClick={() => saveMut.mutate(pendingCats)}
              >
                {pendingCats.length ? `${t("idleCell.save")} (${pendingCats.length})` : t("idleCell.save")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IdleCell() {
  const { t, lang } = useLang();
  const [date, setDate] = useState(localTodayIso());
  const [shiftTab, setShiftTab] = useState("all"); // "all" | 1 | 2
  const [supervisorId, setSupervisorId] = useState(null);
  const [selectedCellIds, setSelectedCellIds] = useState([]); // [] = show all of the supervisor's cells

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
        className="rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <DateRangePicker
          single weekday
          dateFrom={date} dateTo={date}
          setDateFrom={(iso) => iso && setDate(iso)}
          setDateTo={() => {}}
          triggerClassName="px-3 py-2 text-sm"
        />
        <SegmentedToggle
          value={shiftTab}
          onChange={onShift}
          options={[["all", t("idleCell.shiftAll")], [1, t("idleCell.shift1")], [2, t("idleCell.shift2")]]}
        />
        <StyledSelect
          value={supervisorId != null ? String(supervisorId) : ""}
          onChange={(v) => { setSupervisorId(v ? Number(v) : null); setSelectedCellIds([]); }}
          options={shiftSupervisors.map((s) => ({ value: String(s.id), label: s.name, title: s.name }))}
          placeholder={t("idleCell.pickSupervisor")}
          searchable
          searchPlaceholder={t("idleCell.searchSupervisor")}
          triggerClassName="px-3 py-2 text-sm"
          className="min-w-[180px]"
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
            className="min-w-[160px]"
          />
        )}
        <span className="ml-auto text-xs" style={{ color: "var(--text-4)" }}>{t("idleCell.testNote")}</span>
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
            <CellAccordion key={`${c.cell_id}-${date}`} cell={c} date={date} t={t} lang={lang} />
          ))}
        </div>
      )}
    </Layout>
  );
}
