import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock, Boxes, Timer, AlertTriangle, Pencil, X, UserCog, Users,
  Eraser, Moon, Layers, CircleSlash, Check,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { cellName } from "../../utils/cellName";
import { useFactory } from "../../context/FactoryContext";
import { useFactorySection } from "../../components/ui/FactorySelect";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useCapabilities } from "../../hooks/useCapabilities";
import { useAdminDirty } from "./AdminPanel";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FormField from "../../components/ui/FormField";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import TimeField from "../../components/ui/TimeField";
import CellLink from "../../components/ui/CellLink";
import TableCard, { SectionHead, Th } from "../../components/ui/DataTable";
import { FilterPanel, OptsFilter } from "../../components/ui/ColumnFilter";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";

/**
 * «Smena vaqtlari» — the working START and END clock of every production cell.
 *
 * This is a REGISTER and nothing else: no KPI, no scoring path and no
 * validation anywhere else in the platform reads these hours yet. The only two
 * surfaces that show them are this tab and the cell details page.
 *
 * Inheritance is the whole shape of the screen, so it is ordered by reach:
 *
 *   1. THE DEFAULTS — two values, one per shift, that every cell without its
 *      own hours follows. Editing one silently re-times dozens of cells, so it
 *      is the only edit here that goes through a confirm naming the count.
 *   2. THE SUMMARY  — how many of the rows ON SCREEN are on their own hours,
 *      inheriting, or unresolvable. Scoped to the filter, and it says so.
 *   3. THE REGISTER — one row per cell, showing the EFFECTIVE hours with the
 *      source spelled out, because a number whose origin is invisible is a
 *      number nobody dares change.
 *
 * Editing is bulk-first: one row and forty rows go through the same modal and
 * the same endpoint (PUT /api/cell-hours/bulk), because a plant re-times a
 * whole unit far more often than a single cell, and a second single-row path
 * would be a second place for the both-or-neither rule to be spelled wrong.
 */

// ── clock helpers ───────────────────────────────────────────────────────────
// Mirrors backend `services/cell_hours.duration_min`: Tashkent wall-clock
// "HH:MM" strings, and `end <= start` means the window CROSSES MIDNIGHT
// (+1440 minutes). Equal ends are not a 24-hour shift, they are invalid — the
// server rejects them and so does this page, with the same message.
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function toMin(v) {
  const m = HHMM.exec(String(v || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function durMin(start, end) {
  const a = toMin(start);
  const b = toMin(end);
  if (a == null || b == null || a === b) return null;
  return b > a ? b - a : b - a + 1440;
}

function crossesMidnight(start, end) {
  const a = toMin(start);
  const b = toMin(end);
  return a != null && b != null && b <= a;
}

// Source palette. Never colour alone: "own" carries a solid dot, "default" a
// hollow one, "none" a real icon — a red/green-blind admin must still be able
// to tell an inherited row from an unresolvable one.
const SRC_COLOR = { own: "var(--brand)", default: "var(--text-4)", none: "#eab308" };
const SRC_ORDER = { own: 0, default: 1, none: 2 };

function Dot({ color, hollow = false }) {
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{
        width: 7,
        height: 7,
        background: hollow ? "transparent" : color,
        border: `1.5px solid ${color}`,
      }}
    />
  );
}

function SourcePill({ src, t }) {
  const label =
    src === "own" ? t("admin.shiftTimes.srcOwn")
      : src === "default" ? t("admin.shiftTimes.srcDefault")
        : t("admin.shiftTimes.srcNone");
  if (src === "none") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
        style={{
          background: "color-mix(in srgb, #eab308 12%, transparent)",
          color: "#eab308",
          border: "1px solid color-mix(in srgb, #eab308 35%, transparent)",
        }}
      >
        <AlertTriangle size={10} />{label}
      </span>
    );
  }
  const own = src === "own";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
      style={{
        background: own ? "var(--brand-bg)" : "var(--bg-inner)",
        color: own ? "var(--brand-text)" : "var(--text-3)",
        border: `1px solid ${own ? "var(--brand-border)" : "var(--border)"}`,
      }}
    >
      <Dot color={own ? "var(--brand)" : "var(--text-4)"} hollow={!own} />{label}
    </span>
  );
}

// Small S1 / S2 chip, or the "no shift" caption when the cell's supervisor
// carries none (which is exactly why such a cell can inherit nothing).
function ShiftChip({ shift, t }) {
  if (!shift) {
    return (
      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
        {t("admin.shiftTimes.noShift")}
      </span>
    );
  }
  return (
    <span
      className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md tracking-wide"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      {`S${shift}`}
    </span>
  );
}

export default function ShiftTimes() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useCapabilities();
  const { factory } = useFactory();
  const factorySection = useFactorySection();

  const canEdit = can("admin.cell_hours.manage");

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["cell-hours"],
    queryFn: () => api.get("/api/cell-hours").then((r) => r.data),
  });

  const cells = useMemo(() => data?.cells || [], [data]);
  const supervisors = useMemo(() => data?.supervisors || [], [data]);
  const leaders = useMemo(() => data?.leaders || [], [data]);
  const defaults = useMemo(() => data?.defaults || {}, [data]);

  const supById = useMemo(() => new Map(supervisors.map((s) => [s.id, s])), [supervisors]);
  const leadById = useMemo(() => new Map(leaders.map((p) => [p.id, p])), [leaders]);

  const wname = (c) => cellName(c, lang);
  const supLabel = (id) => tl(supById.get(id)?.name || "") || `#${id}`;
  const leadLabel = (id) => tl(leadById.get(id)?.name || "") || `#${id}`;

  // Spelled out rather than built from a template key, so every one of the
  // three strings is greppable in translations.js.
  const srcLabel = (v) => (
    v === "own" ? t("admin.shiftTimes.srcOwn")
      : v === "default" ? t("admin.shiftTimes.srcDefault")
        : t("admin.shiftTimes.srcNone")
  );

  const fmtDur = (mins) => {
    if (mins == null) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0
      ? t("admin.shiftTimes.durFmtH").replace("{h}", String(h))
      : t("admin.shiftTimes.durFmt").replace("{h}", String(h)).replace("{m}", String(m));
  };

  const refresh = () => qc.invalidateQueries({ queryKey: ["cell-hours"] });
  const errText = (e) => e?.response?.data?.detail || e?.message || t("common.error");

  // ── defaults ──────────────────────────────────────────────────────────────
  // Drafts live in an overlay keyed by shift, never by copying the server rows
  // into state: a refetch that lands while an admin is typing must not wipe the
  // half-typed value, and a row with no draft is by definition not dirty.
  const [defDraft, setDefDraft] = useState({});   // {1|2: {start, end}}
  const [defErr, setDefErr] = useState({});       // {1|2: "message"}
  const [defConfirm, setDefConfirm] = useState(null); // {shift, start, end}
  const [defBusy, setDefBusy] = useState(false);
  const [defConfirmErr, setDefConfirmErr] = useState(null);

  const srvDef = (s) => defaults[String(s)] || {};
  const rowDef = (s) => defDraft[s] || { start: srvDef(s).start || "", end: srvDef(s).end || "" };
  const rowDirty = (s) => {
    const d = defDraft[s];
    if (!d) return false;
    return d.start !== (srvDef(s).start || "") || d.end !== (srvDef(s).end || "");
  };

  const setDefField = (s, field, v) => {
    setDefDraft((prev) => ({ ...prev, [s]: { ...rowDef(s), [field]: v } }));
    setDefErr((prev) => ({ ...prev, [s]: null }));
  };

  const askDefault = (s) => {
    const { start, end } = rowDef(s);
    // Caught here rather than in the dialog: a confirm that opens only to
    // refuse makes the operator read the count twice for nothing.
    if (!toMin(start) || !toMin(end)) {
      setDefErr((prev) => ({ ...prev, [s]: t("admin.shiftTimes.errBoth") }));
      return;
    }
    if (start === end) {
      setDefErr((prev) => ({ ...prev, [s]: t("admin.shiftTimes.errSame") }));
      return;
    }
    setDefConfirmErr(null);
    setDefConfirm({ shift: s, start, end });
  };

  const saveDefault = async () => {
    setDefBusy(true);
    setDefConfirmErr(null);
    try {
      await api.put("/api/cell-hours/defaults", {
        shift: defConfirm.shift, start: defConfirm.start, end: defConfirm.end,
      });
      setDefDraft((prev) => { const next = { ...prev }; delete next[defConfirm.shift]; return next; });
      setDefConfirm(null);
      refresh();
      toast.success(t("common.saved"));
    } catch (e) {
      setDefConfirmErr(errText(e));
    } finally {
      setDefBusy(false);
    }
  };

  // ── filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = usePersistentState("shifttimes_search", "");
  const [fShift, setFShift] = usePersistentState("shifttimes_f_shift", 0);
  const [fMgrs, setFMgrs] = usePersistentState("shifttimes_f_mgrs", []);
  const [fLeads, setFLeads] = usePersistentState("shifttimes_f_leads", []);
  const [fSrc, setFSrc] = usePersistentState("shifttimes_f_src", []);
  const [sort, setSort] = usePersistentState("shifttimes_sort", { key: "code", dir: "asc" });

  const onSort = (k) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  // The cascade: plant narrows the brigadirs, shift narrows them again, and the
  // brigadir picks narrow the leaders. The STORED selection is reconciled
  // against the live options rather than rewritten — narrowing the shift parks
  // a brigadir's tick, clearing it brings the tick back, and nothing the admin
  // chose is silently thrown away.
  const mgrOpts = useMemo(() => supervisors.filter((s) => {
    if (factory != null && s.factory_id !== factory) return false;
    if (fShift && Number(s.shift) !== fShift) return false;
    return true;
  }), [supervisors, factory, fShift]);

  const mgrSel = useMemo(() => {
    const ok = new Set(mgrOpts.map((m) => m.id));
    return (fMgrs || []).filter((id) => ok.has(id));
  }, [fMgrs, mgrOpts]);

  const leaderOpts = useMemo(() => {
    const pool = new Set(mgrSel.length ? mgrSel : mgrOpts.map((m) => m.id));
    return leaders.filter((p) => pool.has(p.manager_id));
  }, [leaders, mgrOpts, mgrSel]);

  const leadSel = useMemo(() => {
    const ok = new Set(leaderOpts.map((p) => p.id));
    return (fLeads || []).filter((id) => ok.has(id));
  }, [fLeads, leaderOpts]);

  const srcSel = fSrc || [];

  // The nearest narrowing level names itself above a shortened list — a list
  // that got short for a reason the reader cannot see looks like missing data.
  const shiftNote = fShift ? `${t("admin.shiftTimes.fShift")}: S${fShift}` : null;
  const mgrNote = useMemo(() => {
    if (!shiftNote) return null;
    return `${shiftNote} · ${mgrOpts.length}`;
  }, [shiftNote, mgrOpts.length]);
  const leadNote = useMemo(() => {
    const parent = mgrSel.length
      ? `${t("admin.shiftTimes.fBrigadir")}: ${mgrSel.length === 1 ? supLabel(mgrSel[0]) : mgrSel.length}`
      : shiftNote;
    return parent ? `${parent} · ${leaderOpts.length}` : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mgrSel, shiftNote, leaderOpts.length, lang]);

  // A level narrowed to nothing hands back the control that emptied it — the
  // only alternative is guessing which parent to reopen.
  const widenTo = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("filter.noResults")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );

  const filterSections = [
    ...(factorySection ? [{ ...factorySection, group: t("admin.shiftTimes.grpWho") }] : []),
    {
      key: "shift", icon: Clock, label: t("admin.shiftTimes.fShift"),
      group: t("admin.shiftTimes.grpWho"),
      active: fShift !== 0,
      display: fShift ? `S${fShift}` : "",
      onClear: () => setFShift(0),
      render: () => (
        <SegmentedToggle
          fill size="sm" value={fShift} onChange={setFShift}
          options={[[0, t("filter.all")], [1, "S1"], [2, "S2"]]}
          ariaLabel={t("admin.shiftTimes.fShift")}
        />
      ),
    },
    {
      key: "mgr", icon: UserCog, label: t("admin.shiftTimes.fBrigadir"),
      group: t("admin.shiftTimes.grpWho"),
      active: mgrSel.length > 0,
      display: mgrSel.length === 1 ? supLabel(mgrSel[0]) : String(mgrSel.length),
      onClear: () => setFMgrs([]),
      render: () => (
        <div>
          {mgrNote && (
            <p className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--text-3)" }}>{mgrNote}</p>
          )}
          {mgrOpts.length === 0
            ? widenTo(t("filter.all"), () => setFShift(0))
            : (
              <OptsFilter
                searchable opts={mgrOpts.map((m) => m.id)} sel={mgrSel}
                onChange={setFMgrs} render={supLabel} labelOf={supLabel}
              />
            )}
        </div>
      ),
    },
    {
      key: "lead", icon: Users, label: t("admin.shiftTimes.fLeader"),
      group: t("admin.shiftTimes.grpWho"),
      active: leadSel.length > 0,
      display: leadSel.length === 1 ? leadLabel(leadSel[0]) : String(leadSel.length),
      onClear: () => setFLeads([]),
      render: () => (
        <div>
          {leadNote && (
            <p className="text-[11px] leading-snug mb-1.5" style={{ color: "var(--text-3)" }}>{leadNote}</p>
          )}
          {leaderOpts.length === 0
            ? widenTo(t("admin.shiftTimes.fBrigadir"), () => (mgrSel.length ? setFMgrs([]) : setFShift(0)))
            : (
              <OptsFilter
                searchable opts={leaderOpts.map((p) => p.id)} sel={leadSel}
                onChange={setFLeads} render={leadLabel} labelOf={leadLabel}
                groupBy={(id) => {
                  const mid = leadById.get(id)?.manager_id;
                  return mid ? supLabel(mid) : "—";
                }}
              />
            )}
        </div>
      ),
    },
    {
      key: "src", icon: Layers, label: t("admin.shiftTimes.fSource"),
      group: t("admin.shiftTimes.grpTime"),
      active: srcSel.length > 0,
      display: srcSel.length === 1 ? srcLabel(srcSel[0]) : String(srcSel.length),
      onClear: () => setFSrc([]),
      render: () => (
        <OptsFilter
          opts={["own", "default", "none"]} sel={srcSel} onChange={setFSrc}
          render={srcLabel} labelOf={srcLabel}
        />
      ),
    },
  ];

  // ── the visible register ──────────────────────────────────────────────────
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pickM = new Set(mgrSel);
    const pickL = new Set(leadSel);
    const pickS = new Set(srcSel);
    const out = cells.filter((c) => {
      if (factory != null && c.factory_id !== factory) return false;
      if (fShift && Number(c.shift) !== fShift) return false;
      if (pickM.size && !pickM.has(c.manager_id)) return false;
      if (pickL.size && !pickL.has(c.leader_id)) return false;
      if (pickS.size && !pickS.has(c.source)) return false;
      if (q) {
        const hay = `${c.verifix_code || ""} ${c.sap_code || ""} ${wname(c) || ""} ${tl(c.supervisor) || ""} ${tl(c.leader) || ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (c) => {
      switch (sort.key) {
        case "brigadir": return tl(c.supervisor) || "";
        case "shift":    return c.shift ?? null;
        case "start":    return toMin(c.eff_start);
        case "duration": return c.minutes ?? null;
        case "source":   return SRC_ORDER[c.source] ?? 9;
        default:         return c.verifix_code || "";
      }
    };
    // Blanks sink to the bottom in BOTH directions: a column sorted to put its
    // empty rows first is a column that hides the data it was sorted for.
    return [...out].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const xe = x === null || x === undefined || x === "";
      const ye = y === null || y === undefined || y === "";
      if (xe && ye) return String(a.verifix_code || "").localeCompare(String(b.verifix_code || ""));
      if (xe) return 1;
      if (ye) return -1;
      const cmp = typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y));
      return cmp !== 0 ? cmp * dir : String(a.verifix_code || "").localeCompare(String(b.verifix_code || ""));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, search, factory, fShift, mgrSel, leadSel, srcSel, sort, lang]);

  const stats = useMemo(() => ({
    total: rows.length,
    own: rows.filter((c) => c.source === "own").length,
    inherit: rows.filter((c) => c.source === "default").length,
    none: rows.filter((c) => c.source === "none").length,
  }), [rows]);

  // How many cells FOLLOW each default — the number the confirm dialog names.
  // Counted over every cell, not the filtered ones: an edit to a default reaches
  // the whole platform whatever this screen happens to be showing.
  const inheritCount = useMemo(() => {
    const out = { 1: 0, 2: 0 };
    for (const c of cells) if (c.source === "default" && (c.shift === 1 || c.shift === 2)) out[c.shift] += 1;
    return out;
  }, [cells]);

  // ── selection (in memory only — a stale selection is a mis-targeted bulk) ──
  const [sel, setSel] = useState([]);
  const selSet = useMemo(() => new Set(sel), [sel]);
  const visibleIds = useMemo(() => rows.map((c) => c.id), [rows]);
  // A selection deliberately SURVIVES a filter change (filter to one brigadir,
  // select, filter to the next, select again — then apply once). The cost is
  // that «20 selected» can stand over 3 rows on screen, so the count of picks
  // the current filter hides is stated wherever the selection is acted on.
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const selHidden = useMemo(
    () => sel.filter((id) => !visibleIdSet.has(id)).length,
    [sel, visibleIdSet],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selSet.has(id));
  const toggleRow = (id) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // ── bulk edit / clear ─────────────────────────────────────────────────────
  const [bulk, setBulk] = useState(null);          // {ids, start, end}
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkErr, setBulkErr] = useState(null);    // SERVER failures only
  const [bulkTried, setBulkTried] = useState(false);
  const [clearIds, setClearIds] = useState(null);  // number[]
  const [clearBusy, setClearBusy] = useState(false);
  const [clearErr, setClearErr] = useState(null);

  const bulkDirty = !!bulk && (!!bulk.start || !!bulk.end);
  const anyDefDirty = rowDirty(1) || rowDirty(2);
  // The shell must warn before unmounting a destination holding a draft.
  useAdminDirty(anyDefDirty || bulkDirty);

  const openBulk = (ids) => {
    const rowsIn = cells.filter((c) => ids.includes(c.id));
    // One row seeds the form with what it already has; a multi-row edit starts
    // blank, because pre-filling from an arbitrary member states a value the
    // other rows never had.
    const seed = ids.length === 1 ? rowsIn[0] : null;
    setBulkErr(null);
    setBulkTried(false);
    setBulk({ ids, start: seed?.start || "", end: seed?.end || "" });
  };

  const bulkCells = useMemo(
    () => (bulk ? cells.filter((c) => bulk.ids.includes(c.id)) : []),
    [bulk, cells]
  );
  const bulkMgrCount = useMemo(
    () => new Set(bulkCells.map((c) => c.manager_id).filter((x) => x != null)).size,
    [bulkCells]
  );
  const bulkShifts = useMemo(
    () => new Set(bulkCells.map((c) => c.shift).filter((x) => x != null)),
    [bulkCells]
  );
  const bulkHidden = useMemo(
    () => (bulk ? bulk.ids.filter((id) => !visibleIdSet.has(id)).length : 0),
    [bulk, visibleIdSet]
  );

  // Validation lands ON the field that caused it, never in the footer: a
  // "both times required" paragraph under a two-field form makes the operator
  // work out which of the two is empty. `bulkTried` is what turns a form the
  // admin has not finished typing into one they tried to submit — before that,
  // only the half-filled pair complains.
  const bulkBlankStart = !toMin(bulk?.start);
  const bulkBlankEnd = !toMin(bulk?.end);
  const bulkStartErr = bulk && bulkBlankStart && (bulkTried || !bulkBlankEnd)
    ? t("admin.shiftTimes.errBoth") : null;
  const bulkEndErr = bulk
    ? (bulkBlankEnd && (bulkTried || !bulkBlankStart)
      ? t("admin.shiftTimes.errBoth")
      : (!bulkBlankStart && !bulkBlankEnd && bulk.start === bulk.end
        ? t("admin.shiftTimes.errSame") : null))
    : null;
  const bulkMins = bulk ? durMin(bulk.start, bulk.end) : null;

  const applyBulk = async () => {
    if (bulkBlankStart || bulkBlankEnd || bulk.start === bulk.end) { setBulkTried(true); return; }
    setBulkBusy(true);
    setBulkErr(null);
    try {
      const r = await api.put("/api/cell-hours/bulk", {
        cell_ids: bulk.ids, start: bulk.start, end: bulk.end, clear: false,
      });
      setBulk(null);
      setSel([]);
      refresh();
      toast.success(t("admin.shiftTimes.updated").replace("{n}", String(r?.data?.updated ?? bulk.ids.length)));
    } catch (e) {
      setBulkErr(errText(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const applyClear = async () => {
    setClearBusy(true);
    setClearErr(null);
    try {
      const r = await api.put("/api/cell-hours/bulk", {
        cell_ids: clearIds, start: null, end: null, clear: true,
      });
      setClearIds(null);
      setSel([]);
      refresh();
      toast.success(t("admin.shiftTimes.updated").replace("{n}", String(r?.data?.updated ?? clearIds.length)));
    } catch (e) {
      setClearErr(errText(e));
    } finally {
      setClearBusy(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-96" />
      </div>
    );
  }

  // A failed load must never render as "no cells": an empty register here is
  // indistinguishable from a healthy platform whose cells have no hours yet,
  // and that would invite an admin to set defaults on top of data they cannot see.
  if (loadError) {
    return (
      <div
        className="flex items-start gap-2.5 px-4 py-3 rounded-2xl"
        style={{
          background: "color-mix(in srgb, #ef4444 10%, transparent)",
          border: "1px solid color-mix(in srgb, #ef4444 35%, transparent)",
        }}
      >
        <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#ef4444" }} />
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          <span className="font-semibold" style={{ color: "var(--text-1)" }}>{t("common.loadFailed")}</span>
          <br />
          {errText(loadError)}
        </div>
      </div>
    );
  }

  const tile = (value, label, color, accent = false) => (
    <div
      className="rounded-2xl px-3 py-2.5"
      style={{
        background: accent ? "color-mix(in srgb, #eab308 8%, var(--bg-card))" : "var(--bg-card)",
        border: `1px solid ${accent ? "color-mix(in srgb, #eab308 35%, transparent)" : "var(--border)"}`,
      }}
    >
      <div className="text-xl font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
        {value}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <Dot color={color} hollow={color === "var(--text-4)"} />
        <span className="text-[11px] uppercase tracking-wider font-semibold truncate" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
    </div>
  );

  // Reused by the table row and the phone card: the effective window reads as
  // one phrase, with the next-day marker attached to the END it belongs to.
  const hoursWindow = (c, big = false) => (
    <span className={`inline-flex items-center gap-1 tabular-nums ${big ? "text-sm font-semibold" : ""}`}>
      <span style={{ color: c.eff_start ? "var(--text-1)" : "var(--text-4)" }}>{c.eff_start || "—"}</span>
      <span style={{ color: "var(--text-4)" }}>→</span>
      <span style={{ color: c.eff_end ? "var(--text-1)" : "var(--text-4)" }}>{c.eff_end || "—"}</span>
      {crossesMidnight(c.eff_start, c.eff_end) && (
        <span
          className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded"
          style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}
          title={t("admin.shiftTimes.crossMidnight")}
        >
          <Moon size={9} />{t("admin.shiftTimes.crossMidnight")}
        </span>
      )}
    </span>
  );

  return (
    <div className="space-y-4">
      {/* ── 1. Per-shift defaults ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead
          icon={Clock}
          title={t("admin.shiftTimes.defaultsTitle")}
          subtitle={t("admin.shiftTimes.defaultsSub")}
        />
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {[1, 2].map((s) => {
            const row = rowDef(s);
            const mins = durMin(row.start, row.end);
            const dirty = rowDirty(s);
            return (
              <div key={s} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-end gap-3 flex-wrap">
                  <span
                    className="text-[11px] font-bold px-2 py-1.5 rounded-lg flex-shrink-0 tracking-wide"
                    style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}
                  >
                    {t("admin.shiftTimes.shiftN").replace("{n}", String(s))}
                  </span>

                  <div className="w-32">
                    <FormField label={t("admin.shiftTimes.start")} alignTop>
                      <TimeField
                        id={`shifttimes-def-${s}-start`}
                        value={row.start}
                        onChange={(v) => setDefField(s, "start", v)}
                        clearable={false}
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>
                  <div className="w-32">
                    <FormField label={t("admin.shiftTimes.end")} alignTop>
                      <TimeField
                        id={`shifttimes-def-${s}-end`}
                        value={row.end}
                        onChange={(v) => setDefField(s, "end", v)}
                        clearable={false}
                        disabled={!canEdit}
                      />
                    </FormField>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>
                      {t("admin.shiftTimes.duration")}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
                      <Timer size={13} style={{ color: "var(--brand-text)" }} />
                      {fmtDur(mins)}
                      {crossesMidnight(row.start, row.end) && (
                        <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded"
                              style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                          <Moon size={9} />{t("admin.shiftTimes.crossMidnight")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* The Save button exists only while the row is dirty — an
                      always-on Save on a settings row invites a confirm dialog
                      for a value nobody changed. */}
                  {canEdit && dirty && (
                    <Button size="lg" onClick={() => askDefault(s)} icon={<Check size={14} />}>
                      {t("common.save")}
                    </Button>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                    {t("admin.shiftTimes.inheritCount").replace("{n}", String(inheritCount[s] || 0))}
                  </span>
                  {defErr[s] && (
                    <span className="text-[11px] font-medium" style={{ color: "#ef4444" }}>{defErr[s]}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. Summary of the FILTERED rows ───────────────────────────────── */}
      <div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {tile(stats.total, t("admin.shiftTimes.statCells"), "var(--text-3)")}
          {tile(stats.own, t("admin.shiftTimes.statOwn"), SRC_COLOR.own)}
          {tile(stats.inherit, t("admin.shiftTimes.statInherit"), SRC_COLOR.default)}
          {tile(stats.none, t("admin.shiftTimes.statNone"), stats.none > 0 ? SRC_COLOR.none : "var(--text-4)", stats.none > 0)}
        </div>
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-4)" }}>
          {t("admin.shiftTimes.statScope")}
        </p>
      </div>

      {/* ── 3. The register ───────────────────────────────────────────────── */}
      <TableCard
        icon={Boxes}
        title={t("admin.shiftTimes.hoursLabel")}
        right={
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {rows.length} / {cells.length}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("admin.shiftTimes.searchPh")}
              className="w-full sm:w-64"
            />
            {/* FilterPanel stays a DIRECT child of this flex row — its fit
                check measures the row's own children. */}
            <FilterPanel sections={filterSections} />
          </>
        }
        minWidth="1040px"
        mobileCards
        mobile={
          rows.length === 0 ? (
            <div className="rounded-2xl px-4 py-8 text-center text-xs"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
              {t("admin.shiftTimes.empty")}
            </div>
          ) : rows.map((c) => {
            const picked = selSet.has(c.id);
            return (
              <div
                key={c.id}
                onClick={() => canEdit && toggleRow(c.id)}
                className="rounded-2xl px-3 py-3 space-y-2 transition-colors"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${picked ? "var(--brand-border)" : "var(--border)"}`,
                  boxShadow: picked ? "inset 0 0 0 1px var(--brand-border)" : "none",
                }}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={!canEdit}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleRow(c.id)}
                    aria-label={c.verifix_code || String(c.id)}
                    style={{ accentColor: "var(--brand)" }}
                  />
                  <CellLink id={c.id} className="text-sm font-semibold">
                    {c.verifix_code || "—"}
                  </CellLink>
                  <span className="text-xs truncate min-w-0 flex-1" style={{ color: wname(c) ? "var(--text-2)" : "var(--text-4)" }}>
                    {wname(c) || "—"}
                  </span>
                  <ShiftChip shift={c.shift} t={t} />
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {hoursWindow(c, true)}
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDur(c.minutes)}</span>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[11px] truncate min-w-0" style={{ color: "var(--text-3)" }}>
                    {tl(c.supervisor) || "—"}
                    <span style={{ color: "var(--text-4)" }}> · </span>
                    {tl(c.leader) || "—"}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <SourcePill src={c.source} t={t} />
                    <Button
                      size="sm" variant="secondary" tint disabled={!canEdit}
                      title={t("admin.shiftTimes.editRow")}
                      aria-label={t("admin.shiftTimes.editRow")}
                      onClick={(e) => { e.stopPropagation(); openBulk([c.id]); }}
                      icon={<Pencil size={12} />}
                    />
                  </div>
                </div>
              </div>
            );
          })
        }
      >
        <thead>
          <tr>
            <Th
              cls="w-9"
              label={
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={!canEdit || visibleIds.length === 0}
                  onChange={(e) => setSel(e.target.checked ? visibleIds : [])}
                  aria-label={t("common.selectAll")}
                  style={{ accentColor: "var(--brand)" }}
                />
              }
            />
            <Th label={t("admin.profiles.colVerifixCode")} k="code" sort={sort} onSort={onSort} cls="w-24" />
            <Th label={t("admin.profiles.colWorkshop")} />
            <Th label={t("admin.shiftTimes.fBrigadir")} k="brigadir" sort={sort} onSort={onSort} />
            <Th label={t("admin.shiftTimes.fShift")} k="shift" sort={sort} onSort={onSort} cls="w-20" />
            <Th label={t("admin.shiftTimes.fLeader")} />
            <Th label={t("admin.shiftTimes.start")} k="start" sort={sort} onSort={onSort} cls="w-24" />
            <Th label={t("admin.shiftTimes.end")} cls="w-32" />
            <Th label={t("admin.shiftTimes.duration")} k="duration" sort={sort} onSort={onSort} align="right" cls="w-28" />
            <Th label={t("admin.shiftTimes.source")} k="source" sort={sort} onSort={onSort} cls="w-28" />
            <Th label="" cls="w-12" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={11} className="text-center py-8 text-xs" style={{ color: "var(--text-4)" }}>
                {t("admin.shiftTimes.empty")}
              </td>
            </tr>
          ) : rows.map((c) => {
            const picked = selSet.has(c.id);
            return (
              <tr
                key={c.id}
                onClick={() => canEdit && toggleRow(c.id)}
                className={canEdit ? "cursor-pointer" : ""}
                style={picked ? { background: "var(--brand-bg)" } : undefined}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={!canEdit}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleRow(c.id)}
                    aria-label={c.verifix_code || String(c.id)}
                    style={{ accentColor: "var(--brand)" }}
                  />
                </td>
                <td className="px-3 py-2 font-semibold">
                  {/* e.g. «0822» → /cells/:id */}
                  <CellLink id={c.id}>{c.verifix_code || "—"}</CellLink>
                </td>
                <td className="px-3 py-2" style={{ color: wname(c) ? "var(--text-1)" : "var(--text-4)" }}>
                  {wname(c) || "—"}
                </td>
                <td className="px-3 py-2" style={{ color: c.supervisor ? "var(--text-2)" : "var(--text-4)" }}>
                  {tl(c.supervisor) || "—"}
                </td>
                <td className="px-3 py-2"><ShiftChip shift={c.shift} t={t} /></td>
                <td className="px-3 py-2" style={{ color: c.leader ? "var(--text-2)" : "var(--text-4)" }}>
                  {tl(c.leader) || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: c.eff_start ? "var(--text-1)" : "var(--text-4)" }}>
                  {c.eff_start || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  <span className="inline-flex items-center gap-1">
                    <span style={{ color: c.eff_end ? "var(--text-1)" : "var(--text-4)" }}>{c.eff_end || "—"}</span>
                    {crossesMidnight(c.eff_start, c.eff_end) && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded"
                        style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                        title={t("admin.shiftTimes.crossMidnight")}
                      >
                        <Moon size={9} />{t("admin.shiftTimes.crossMidnight")}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: c.minutes == null ? "var(--text-4)" : "var(--text-1)" }}>
                  {fmtDur(c.minutes)}
                </td>
                <td className="px-3 py-2"><SourcePill src={c.source} t={t} /></td>
                <td className="px-3 py-2">
                  <Button
                    size="sm" variant="secondary" tint disabled={!canEdit}
                    title={t("admin.shiftTimes.editRow")}
                    aria-label={t("admin.shiftTimes.editRow")}
                    onClick={(e) => { e.stopPropagation(); openBulk([c.id]); }}
                    icon={<Pencil size={12} />}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      {/* ── 4. Bulk bar — a layer over the page, never a row inside it ────── */}
      {sel.length > 0 && (
        <div
          className="flex items-center gap-2 flex-wrap px-3 py-2.5 rounded-t-2xl"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 20,
            background: "var(--bg-card)",
            borderTop: "1px solid var(--border-md)",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.18)",
            paddingBottom: "calc(0.625rem + var(--tg-safe-bottom, 0px))",
          }}
        >
          <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {t("admin.shiftTimes.selected").replace("{n}", String(sel.length))}
          </span>
          {selHidden > 0 && (
            <span className="text-[11px] leading-snug" style={{ color: "#eab308" }}>
              {t("admin.shiftTimes.selHidden").replace("{n}", String(selHidden))}
            </span>
          )}
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <Button size="lg" variant="primary" disabled={!canEdit} icon={<Clock size={14} />}
                    onClick={() => openBulk(sel)}>
              {t("admin.shiftTimes.bulkSet")}
            </Button>
            <Button size="lg" variant="secondary" disabled={!canEdit} icon={<Eraser size={14} />}
                    onClick={() => { setClearErr(null); setClearIds(sel); }}>
              {t("admin.shiftTimes.bulkClear")}
            </Button>
            <Button size="lg" variant="ghost" onClick={() => setSel([])}
                    title={t("filter.clear")} aria-label={t("filter.clear")} icon={<X size={14} />} />
          </div>
        </div>
      )}

      {/* ── bulk modal ────────────────────────────────────────────────────── */}
      {bulk && (
        <Modal
          open
          onClose={() => setBulk(null)}
          icon={<Clock size={16} style={{ color: "var(--brand-text)" }} />}
          title={t("admin.shiftTimes.bulkTitle")}
          subtitle={t("admin.shiftTimes.bulkScope")
            .replace("{n}", String(bulk.ids.length))
            .replace("{m}", String(bulkMgrCount))}
          footer={
            <>
              <Button variant="secondary" onClick={() => setBulk(null)}>{t("common.cancel")}</Button>
              <Button onClick={applyBulk} loading={bulkBusy} disabled={!canEdit}>
                {t("admin.shiftTimes.bulkApply").replace("{n}", String(bulk.ids.length))}
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("admin.shiftTimes.start")} required error={bulkStartErr || undefined} alignTop>
              <TimeField
                id="shifttimes-bulk-start"
                value={bulk.start}
                onChange={(v) => { setBulk((b) => ({ ...b, start: v })); setBulkErr(null); }}
                disabled={!canEdit}
              />
            </FormField>
            <FormField label={t("admin.shiftTimes.end")} required error={bulkEndErr || undefined} alignTop>
              <TimeField
                id="shifttimes-bulk-end"
                value={bulk.end}
                onChange={(v) => { setBulk((b) => ({ ...b, end: v })); setBulkErr(null); }}
                disabled={!canEdit}
              />
            </FormField>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm font-semibold tabular-nums"
               style={{ color: "var(--text-1)" }}>
            <Timer size={13} style={{ color: "var(--brand-text)" }} />
            <span>{t("admin.shiftTimes.duration")}:</span>
            <span>{fmtDur(bulkMins)}</span>
            {crossesMidnight(bulk.start, bulk.end) && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                <Moon size={10} />{t("admin.shiftTimes.crossMidnight")}
              </span>
            )}
          </div>

          {/* The write scope is the SELECTION, not what is on screen — so a
              pick the current filter hides is named here too, where the value
              is actually about to be written. */}
          {bulkHidden > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                 style={{
                   background: "color-mix(in srgb, #eab308 10%, transparent)",
                   border: "1px solid color-mix(in srgb, #eab308 35%, transparent)",
                 }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
              <span className="text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
                {t("admin.shiftTimes.selHidden").replace("{n}", String(bulkHidden))}
              </span>
            </div>
          )}

          {/* Legitimate — a plant may well run both shifts to one clock — but
              worth naming, because the shifts are the reason the defaults are
              two values and not one. */}
          {bulkShifts.size > 1 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
                 style={{
                   background: "color-mix(in srgb, #eab308 10%, transparent)",
                   border: "1px solid color-mix(in srgb, #eab308 35%, transparent)",
                 }}>
              <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
              <span className="text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
                {t("admin.shiftTimes.bulkMixedShift")}
              </span>
            </div>
          )}

          {/* A failure keeps the modal standing with the reason on it — closing
              it would lose both the message and the typed times. */}
          {bulkErr && (
            <p className="text-[11px] leading-snug font-medium" style={{ color: "#ef4444" }}>{bulkErr}</p>
          )}
        </Modal>
      )}

      {/* ── clear-to-default confirm ──────────────────────────────────────── */}
      {clearIds && (
        <ConfirmDialog
          open
          onCancel={() => setClearIds(null)}
          onConfirm={applyClear}
          loading={clearBusy}
          error={clearErr}
          tone="warning"
          icon={<CircleSlash size={18} />}
          title={t("admin.shiftTimes.clearTitle")}
          message={t("admin.shiftTimes.clearMsg").replace("{n}", String(clearIds.length))}
          confirmLabel={t("admin.shiftTimes.clearConfirm").replace("{n}", String(clearIds.length))}
        />
      )}

      {/* ── default-change confirm ────────────────────────────────────────── */}
      {defConfirm && (
        <ConfirmDialog
          open
          onCancel={() => setDefConfirm(null)}
          onConfirm={saveDefault}
          loading={defBusy}
          error={defConfirmErr}
          tone="warning"
          icon={<Clock size={18} />}
          title={t("admin.shiftTimes.defaultConfirmTitle")}
          message={t("admin.shiftTimes.defaultConfirmMsg")
            .replace("{n}", String(inheritCount[defConfirm.shift] || 0))}
          confirmLabel={t("admin.shiftTimes.defaultConfirmBtn")
            .replace("{n}", String(inheritCount[defConfirm.shift] || 0))}
        />
      )}

      {toast.node}
    </div>
  );
}
