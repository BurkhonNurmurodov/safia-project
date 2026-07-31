/**
 * Per-cell attendance — the read-only sibling of the Staff (verifix) page.
 *
 * Same shape as Staff's Workers tab (KPI header → came-by-role chips → filtered
 * table), but keyed by CELL instead of supervisor, and without the HR document
 * and request workflow: this page only shows what the admin «Attendance by cell»
 * upload put into the isolated `cell_attendance` test table.
 */
import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, LayoutGrid, AlertTriangle, SlidersHorizontal, CheckCircle } from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
import TableCard, { Th } from "../components/ui/DataTable";
import StyledSelect from "../components/ui/StyledSelect";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DayStepper from "../components/ui/DayStepper";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { CheckBox } from "../components/ui/CheckboxTree";
import { ColFilter, OptsFilter, RngFilter } from "../components/ui/ColumnFilter";
import Pagination from "../components/ui/Pagination";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonTable } from "../components/ui/Skeleton";
import api from "../utils/api";
import { fmtPct, fmtNum } from "../utils/formatters";
import { cellName as pickCellName } from "../utils/cellName";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";

const PAGE_SIZE = 50;

const pad2 = (n) => String(n).padStart(2, "0");
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// Viewer language first, then Russian — the shared registry fallback.
const cellName = (c, lang) => pickCellName(c, lang, "name_");

// One identity for a cell across the catalog and the rows. Unmatched codes have
// no cell_id, so they key off the raw code instead — string-prefixed so they can
// never collide with a real numeric id.
const cellKey = (o) => String(o.cell_id ?? `x:${o.verifix_code ?? ""}`);

// «Zagruzkada hisoblanadigan» — the slice the production load actually counts:
// every flavour of konditer plus the fasovchiks, inside a cell the admin has
// TICKED on the «Sozlash» tab. Which cells belong in the load used to be
// inferred from "the cell has a brigadir"; since 2026-07-31 it is an explicit
// decision stored on the cell (`in_load`), so a cell can be left out even with
// an owner, and unmatched codes — which carry no cell record at all — still
// drop out here. Job titles arrive raw from the upload ("Konditer/Tsekh
// prigotovleniya…", "Кондитер"), so match a substring instead of an exact list.
const LOAD_ROLE_RE = /kondit|конди|fasov|фасов/i;
const countsInLoad = (r) => r.in_load === true && LOAD_ROLE_RE.test(r.job_title || "");

// Columns holding DB text: sort on the transliterated form so the order matches
// what the viewer actually reads.
const TRANSLIT_COLS = new Set(["worker_name", "job_title", "schedule", "leader_name", "manager_name"]);

// Sortable column keys. A sort restored from a previous session is checked
// against this list, so a column renamed since then can't leave the table
// sorting on a field that no longer exists.
const SORT_KEYS = new Set([
  "verifix_code", "leader_name", "manager_name", "worker_name", "job_title",
  "schedule", "day_raw", "hours_worked", "early_arrival_min", "effective_hours", "status",
]);
const DEFAULT_SORT = { key: "worker_name", dir: "asc" };

// Per-column filters that aren't already driven by a toolbar control. The three
// numeric columns take a min/max range — a checkbox list of hundreds of distinct
// floats would be unusable; every other column is a checkbox list.
const INIT_COL = {
  worker: [], schedule: [], day: [], status: [],
  hours: { min: "", max: "" },
  early: { min: "", max: "" },
  eff:   { min: "", max: "" },
};
const rngActive = (r) => r.min !== "" || r.max !== "";
const inRange = (v, r) => {
  if (r.min !== "" && (v == null || v < parseFloat(r.min))) return false;
  if (r.max !== "" && (v == null || v > parseFloat(r.max))) return false;
  return true;
};

// Worked = green, day-off / excused markers = neutral slate (traffic-light
// convention — brand gold is never a status). Mirrors the upload-tab preview.
function StatusChip({ status }) {
  const color = status === "worked" ? "#22c55e" : "#94a3b8";
  return (
    <span className="inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `${color}1f` }}>
      {status || "—"}
    </span>
  );
}

/**
 * «Sozlash» tab — which cells the загрузка counts.
 *
 * Lists the WHOLE cell registry, not the cells that happen to carry rows on the
 * open day: this is configuration, so stepping through dates must not change
 * what can be ticked. Ticks are held as a draft of real diffs and written by an
 * explicit Save, so a half-finished pass over a hundred cells is never
 * committed by accident — the parent confirms before letting the tab go.
 */
function LoadConfig({ onDirtyChange }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["cell-attendance-registry"],
    queryFn: () => api.get("/api/cell-attendance/registry").then(r => r.data),
  });
  const registry = useMemo(() => data ?? [], [data]);

  // cell_id → wanted value, holding ONLY genuine diffs: ticking a box back to
  // where it started drops the entry, so the dirty count is always truthful and
  // Save sends the minimum.
  const [draft, setDraft] = useState({});
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all"); // all | in | out
  const [savedAt, setSavedAt] = useState(0);

  const dirty = Object.keys(draft).length;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  const valueOf = (c) => (c.cell_id in draft ? draft[c.cell_id] : c.in_load === true);

  function setOne(c, next) {
    setDraft(d => {
      const { [c.cell_id]: _drop, ...rest } = d;
      return next === (c.in_load === true) ? rest : { ...rest, [c.cell_id]: next };
    });
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registry.filter(c => {
      const on = valueOf(c);
      if (tab === "in" && !on) return false;
      if (tab === "out" && on) return false;
      if (!q) return true;
      return [
        c.verifix_code, c.sap_code, cellName(c, lang),
        tl(c.leader_name), c.leader_name, tl(c.manager_name), c.manager_name,
      ].some(v => (v || "").toLowerCase().includes(q));
    });
    // `draft` drives valueOf, so the list must re-run when a tick moves a row
    // between the Belgilangan / Belgilanmagan tabs.
  }, [registry, search, tab, draft, lang, tl]);

  // The header box acts on what is ON SCREEN: all shown ticked → clear them,
  // otherwise tick the rest. Never touches rows hidden by the search.
  const shownOn = shown.filter(valueOf).length;
  const headState = shown.length === 0 || shownOn === 0 ? "off" : shownOn === shown.length ? "on" : "some";
  function toggleShown() {
    const next = headState !== "on";
    setDraft(d => {
      const out = { ...d };
      for (const c of shown) {
        if (next === (c.in_load === true)) delete out[c.cell_id];
        else out[c.cell_id] = next;
      }
      return out;
    });
  }

  const save = useMutation({
    mutationFn: () => api.put("/api/cell-attendance/registry", {
      changes: Object.entries(draft).map(([id, v]) => ({ cell_id: Number(id), in_load: v })),
    }),
    onSuccess: () => {
      setDraft({});
      setSavedAt(Date.now());
      // The day view reads in_load off the cell catalog it ships with, so it
      // has to be refetched before «Zagruzkada» reflects the new marks.
      qc.invalidateQueries({ queryKey: ["cell-attendance-registry"] });
      qc.invalidateQueries({ queryKey: ["cell-attendance"] });
    },
  });

  useEffect(() => {
    if (!savedAt) return;
    const id = setTimeout(() => setSavedAt(0), 2500);
    return () => clearTimeout(id);
  }, [savedAt]);

  const markedTotal = registry.filter(valueOf).length;

  if (isLoading) {
    return (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SkeletonTable rows={8} cols={4} />
      </div>
    );
  }
  if (registry.length === 0) {
    return <EmptyState title={t("cellAtt.cfgEmptyTitle")} message={t("cellAtt.cfgEmptyHint")} showUploadLink={false} />;
  }

  return (
    <>
      <TableCard
        icon={SlidersHorizontal}
        title={t("cellAtt.cfgTitle")}
        fixed
        minWidth={860}
        right={
          <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {t("cellAtt.cfgMarked").replace("{n}", markedTotal).replace("{total}", registry.length)}
          </span>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("cellAtt.cfgSearch")}
              className="flex-1 min-w-[180px]"
            />
            <SegmentedToggle
              value={tab}
              onChange={setTab}
              options={[
                ["all", t("cellAtt.tabAll")],
                ["in",  t("cellAtt.cfgTabIn")],
                ["out", t("cellAtt.cfgTabOut")],
              ]}
            />
            {dirty > 0 && (
              <Button variant="secondary" size="lg" onClick={() => setDraft({})} disabled={save.isPending}>
                {t("cellAtt.cfgReset")}
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => save.mutate()}
              disabled={dirty === 0}
              loading={save.isPending}
            >
              {dirty > 0 ? t("cellAtt.cfgSaveN").replace("{n}", dirty) : t("cellAtt.cfgSave")}
            </Button>
          </>
        }
      >
        <thead>
          <tr>
            <th
              onClick={toggleShown}
              className="sticky top-0 z-10 px-3 py-2.5 w-[46px] cursor-pointer select-none transition-colors hover:bg-[var(--bg-accent)]"
              style={{ background: "var(--bg-inner)" }}
              title={t("cellAtt.cfgToggleAll")}
            >
              <span className="inline-flex"><CheckBox state={headState} /></span>
            </th>
            <Th label={t("cellAtt.colCell")} cls="w-[34%]" />
            <Th label={t("cellAtt.cfgColSap")} cls="w-[12%]" />
            <Th label={t("cellAtt.colLeader")} cls="w-[24%]" />
            <Th label={t("cellAtt.colSup")} cls="w-[24%]" />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {t("cellAtt.noMatch")}
              </td>
            </tr>
          ) : shown.map(c => {
            const on = valueOf(c);
            const changed = c.cell_id in draft;
            const name = cellName(c, lang);
            return (
              <tr
                key={c.cell_id}
                onClick={() => setOne(c, !on)}
                className="cursor-pointer"
                // An unsaved row is tinted, so a long scroll still shows what
                // this Save is about to change.
                style={changed ? { background: "var(--brand-bg)" } : undefined}
              >
                <td className="px-3 py-2">
                  <span className="inline-flex"><CheckBox state={on ? "on" : "off"} /></span>
                </td>
                <td className="px-3 py-2 truncate" title={`${c.verifix_code || ""} ${name || ""}`.trim()}>
                  <span className="font-mono" style={{ color: "var(--text-1)" }}>{c.verifix_code || "—"}</span>
                  {name && <span className="ml-1.5" style={{ color: "var(--text-4)" }}>{name}</span>}
                </td>
                <td className="px-3 py-2 truncate font-mono text-[11px]" style={{ color: "var(--text-3)" }}>
                  {c.sap_code || "—"}
                </td>
                <td className="px-3 py-2 truncate" title={tl(c.leader_name) || ""} style={{ color: "var(--text-2)" }}>
                  {tl(c.leader_name) || "—"}
                </td>
                <td className="px-3 py-2 truncate" title={tl(c.manager_name) || ""} style={{ color: "var(--text-2)" }}>
                  {tl(c.manager_name) || "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      {save.isError && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] px-1" style={{ color: "#ef4444" }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
          <span>{t("cellAtt.cfgSaveError")}</span>
        </div>
      )}

      {savedAt > 0 && (
        <div
          className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
          style={{
            position: "fixed", top: 16, right: 16, zIndex: 9999,
            background: "#22c55e", color: "#fff", maxWidth: 320,
            boxShadow: "0 8px 24px rgba(34,197,94,0.35)",
          }}
        >
          <CheckCircle size={15} style={{ flexShrink: 0 }} />
          <span>{t("cellAtt.cfgSaved")}</span>
        </div>
      )}
    </>
  );
}

export default function CellAttendance() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  // Marking the cells that belong in the load is an admin decision, so the
  // third («Sozlash») tab exists for admins only — the endpoint behind it is
  // gated the same way.
  const isAdmin = auth?.role === "admin";

  // The whole filter set survives navigating away and back — leaving the page
  // to check another one and returning to a wiped toolbar meant rebuilding the
  // same picks every time. One storage key per control, so a stale shape in one
  // can't poison the rest, and each is prefixed for this page only.
  const [date, setDate] = usePersistentState("cellatt_date", todayIso());
  const [rawScope, setScope] = usePersistentState("cellatt_scope", "load"); // load | all | config
  const [cellIds, setCellIds] = usePersistentState("cellatt_cells", []);      // [] = every cell in scope
  const [leaderIds, setLeaderIds] = usePersistentState("cellatt_leaders", []); // [] = every leader
  const [supIds, setSupIds] = usePersistentState("cellatt_sups", []);          // [] = every supervisor
  const [search, setSearch] = usePersistentState("cellatt_search", "");
  const [statusTab, setStatusTab] = usePersistentState("cellatt_status", "all"); // all | worked | absent
  const [jobFilter, setJobFilter] = usePersistentState("cellatt_jobs", []);      // came-by-role chips + Lavozim column
  const [rawColF, setColF] = usePersistentState("cellatt_cols", INIT_COL);       // the column-only filters
  const [rawSort, setSort] = usePersistentState("cellatt_sort", DEFAULT_SORT);
  // Page position is deliberately NOT persisted — the day's rows may have
  // changed under it, so coming back always starts at the top.
  const [page, setPage] = useState(1);
  const setCol = (k, v) => setColF(f => ({ ...f, [k]: v }));

  // Restored values are old data: reconcile them against the CURRENT shape so a
  // column added or renamed since the visit that saved them can't crash the
  // filter predicates or strand the table on a dead sort key.
  const colF = useMemo(
    () => ({ ...INIT_COL, ...(rawColF && typeof rawColF === "object" ? rawColF : null) }),
    [rawColF],
  );
  const sort = useMemo(
    () => (rawSort && SORT_KEYS.has(rawSort.key) && (rawSort.dir === "asc" || rawSort.dir === "desc")
      ? rawSort
      : DEFAULT_SORT),
    [rawSort],
  );
  // A stored "config" from a previous (admin) visit must not strand a
  // non-admin on a tab they can't be shown — same reconciliation as the rest.
  const scope = rawScope === "config" && !isAdmin ? "load" : rawScope;

  // Unsaved ticks on the config tab: switching away would silently drop them,
  // so the switch is confirmed first. `pendingScope` holds the tab the admin
  // asked for while the dialog is open.
  const [configDirty, setConfigDirty] = useState(0);
  const [pendingScope, setPendingScope] = useState(null);
  const askScope = (next) => {
    if (scope === "config" && configDirty > 0 && next !== "config") setPendingScope(next);
    else setScope(next);
  };

  // Days that actually carry rows. The report is uploaded for the day it
  // covers (usually yesterday), so landing on an empty "today" would look like
  // the upload failed — jump to the newest day with data instead, once, so
  // stepping to a deliberately empty day afterwards still works.
  const { data: dates } = useQuery({
    queryKey: ["cell-attendance-dates"],
    queryFn: () => api.get("/api/cell-attendance/dates").then(r => r.data),
    staleTime: 120_000,
  });
  const [jumped, setJumped] = useState(false);
  useEffect(() => {
    if (jumped || !dates?.length) return;
    setJumped(true);
    if (!dates.some(d => d.date === date)) setDate(dates[0].date);
  }, [dates, date, jumped, setDate]);

  const { data, isLoading } = useQuery({
    queryKey: ["cell-attendance", date],
    queryFn: () => api.get("/api/cell-attendance", { params: { date } }).then(r => r.data),
    enabled: !!date,
  });

  const rawRows = data?.rows ?? [];
  const cells   = data?.cells ?? [];
  const cellById = useMemo(() => {
    const m = new Map();
    for (const c of cells) m.set(cellKey(c), c);
    return m;
  }, [cells]);

  // Leader and supervisor are properties of the CELL, not of the attendance
  // row. Fold them onto each row once so filtering, searching and sorting all
  // read one flat shape (and the two new columns cost no lookup per cell).
  const allRows = useMemo(() => rawRows.map(r => {
    const c = cellById.get(cellKey(r));
    return {
      ...r,
      _key:          cellKey(r),
      cell_name:     cellName(c, lang),
      leader_id:     c?.leader_id ?? null,
      leader_name:   c?.leader_name ?? null,
      manager_id:    c?.manager_id ?? null,
      manager_name:  c?.manager_name ?? null,
      in_load:       c?.in_load === true,
    };
  }), [rawRows, cellById, lang]);

  // The scope cut runs BEFORE everything else, so the KPIs, the role chips, the
  // owner pickers and the table all describe one population.
  const scopedRows = useMemo(
    () => (scope === "load" ? allRows.filter(countsInLoad) : allRows),
    [allRows, scope],
  );
  // Keep the pickers' promise that no option can filter the table down to
  // nothing: in load scope only cells that still carry a row stay listed.
  const scopedCells = useMemo(() => {
    if (scope !== "load") return cells;
    const keys = new Set(scopedRows.map(r => r._key));
    return cells.filter(c => keys.has(cellKey(c)));
  }, [cells, scopedRows, scope]);

  // A new day brings a different cell catalog — stale picks would silently
  // filter everything out. Only an actual CHANGE of the day resets them: the
  // first run is the mount, where the filters were just restored from the
  // previous visit and belong to this very date.
  const prevDate = useRef(date);
  useEffect(() => {
    if (prevDate.current === date) return;
    prevDate.current = date;
    setCellIds([]); setLeaderIds([]); setSupIds([]);
    setJobFilter([]); setColF(INIT_COL); setSearch(""); setStatusTab("all"); setPage(1);
  }, [date, setCellIds, setLeaderIds, setSupIds, setJobFilter, setColF, setSearch, setStatusTab]);

  // Switching scope changes which cells, owners and roles exist at all. Drop
  // the picks that key off those lists; search and the status tab survive —
  // they're plain predicates that a narrower population can't invalidate.
  // Mount-guarded for the same reason as the day above.
  const prevScope = useRef(scope);
  useEffect(() => {
    if (prevScope.current === scope) return;
    prevScope.current = scope;
    setCellIds([]); setLeaderIds([]); setSupIds([]); setJobFilter([]); setColF(INIT_COL); setPage(1);
  }, [scope, setCellIds, setLeaderIds, setSupIds, setJobFilter, setColF]);

  // ── KPIs over the picked cells (before search / status / role filters, so the
  // header stays a stable denominator while you drill into the table) ────────
  const scopeRows = useMemo(() => {
    if (!cellIds.length && !leaderIds.length && !supIds.length) return scopedRows;
    const cs = new Set(cellIds), ls = new Set(leaderIds), ms = new Set(supIds);
    return scopedRows.filter(r =>
      (!cs.size || cs.has(r._key)) &&
      (!ls.size || ls.has(String(r.leader_id ?? "none"))) &&
      (!ms.size || ms.has(String(r.manager_id ?? "none"))));
  }, [scopedRows, cellIds, leaderIds, supIds]);

  const workedRows  = useMemo(() => scopeRows.filter(r => r.status === "worked"), [scopeRows]);
  const totalHours  = useMemo(() => workedRows.reduce((s, r) => s + (r.hours_worked || 0), 0), [workedRows]);
  const avgHours    = workedRows.length ? totalHours / workedRows.length : null;
  const cameRatio   = scopeRows.length ? workedRows.length / scopeRows.length : null;
  const cellsShown  = useMemo(() => new Set(scopeRows.map(r => r._key)).size, [scopeRows]);

  // Came-to-work broken down by exact job title, count desc — the clickable
  // chips toggle the job filter (same interaction as the Staff page).
  const roleCounts = useMemo(() => {
    const m = new Map();
    for (const r of workedRows) {
      const title = r.job_title || "";
      if (!title) continue;
      m.set(title, (m.get(title) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [workedRows]);

  // ── Table rows ─────────────────────────────────────────────────────────────
  // Column option lists come from ALL of the day's rows, not the filtered ones,
  // so ticking a box never makes the other columns' options disappear.
  const distinct = useMemo(() => {
    const pick = (f) => [...new Set(scopedRows.map(r => r[f] || ""))].filter(Boolean).sort();
    return {
      worker:   pick("worker_name"),
      schedule: pick("schedule"),
      day:      pick("day_raw"),
      status:   pick("status"),
      job:      pick("job_title"),
    };
  }, [scopedRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopeRows.filter(r => {
      if (statusTab === "worked" && r.status !== "worked") return false;
      if (statusTab === "absent" && r.status === "worked") return false;
      if (jobFilter.length && !jobFilter.includes(r.job_title || "")) return false;
      if (colF.worker.length   && !colF.worker.includes(r.worker_name || ""))  return false;
      if (colF.schedule.length && !colF.schedule.includes(r.schedule || ""))   return false;
      if (colF.day.length      && !colF.day.includes(r.day_raw || ""))         return false;
      if (colF.status.length   && !colF.status.includes(r.status || ""))       return false;
      if (!inRange(r.hours_worked, colF.hours))      return false;
      if (!inRange(r.early_arrival_min, colF.early)) return false;
      if (!inRange(r.effective_hours, colF.eff))     return false;
      if (q) {
        const hay = `${r.worker_name || ""} ${tl(r.worker_name) || ""} ${r.verifix_code || ""} `
          + `${r.job_title || ""} ${r.cell_name || ""} `
          + `${tl(r.leader_name) || ""} ${tl(r.manager_name) || ""}`;
        if (!hay.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [scopeRows, search, statusTab, jobFilter, colF, tl]);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av = a[key], bv = b[key];
      if (TRANSLIT_COLS.has(key)) { av = av ? tl(av) : null; bv = bv ? tl(bv) : null; }
      if (av == null) return 1;          // blanks last, both directions
      if (bv == null) return -1;
      return typeof av === "number" && typeof bv === "number"
        ? (av - bv) * mul
        : String(av).localeCompare(String(bv)) * mul;
    });
  }, [rows, sort, tl]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows  = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [search, statusTab, jobFilter, colF, cellIds, leaderIds, supIds, sort]);

  // Reads the reconciled `sort`, not the stored one, so a discarded restored
  // value can't make the first click toggle a direction nobody sees.
  function onSort(k) {
    setSort(sort.key === k ? { key: k, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" });
  }
  function toggleRole(title) {
    setJobFilter(f => f.includes(title) ? f.filter(x => x !== title) : [...f, title]);
  }

  const cellOptions = scopedCells.map(c => {
    const name = cellName(c, lang);
    return {
      value: cellKey(c),
      label: `${c.verifix_code || "—"}${name ? " · " + name : ""}${c.unmatched ? " ⚠" : ""}`,
      title: `${c.verifix_code || ""} ${name}${c.manager_name ? " — " + tl(c.manager_name) : ""}`,
    };
  });

  // Owner pickers list only people who actually own a cell with rows today, so
  // no option can filter the table down to nothing. Cells with no owner collapse
  // into one explicit "not assigned" entry rather than silently disappearing.
  const ownerOptions = (idField, nameField, noneLabel) => {
    const m = new Map();
    for (const c of scopedCells) {
      const id = c[idField];
      const key = String(id ?? "none");
      if (!m.has(key)) m.set(key, id ? (tl(c[nameField]) || c[nameField] || `#${id}`) : noneLabel);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] === "none") - (b[0] === "none") || a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label, title: label }));
  };
  const leaderOptions = ownerOptions("leader_id", "leader_name", t("cellAtt.noLeader"));
  const supOptions    = ownerOptions("manager_id", "manager_name", t("cellAtt.noSupervisor"));

  // Column headers filter by the SAME id values the toolbar pickers use, so the
  // two surfaces drive one state each instead of contradicting each other —
  // ticking a leader in the header updates the leader picker above, and back.
  const cellKeys    = cellOptions.map(o => o.value);
  const leaderKeys  = leaderOptions.map(o => o.value);
  const supKeys     = supOptions.map(o => o.value);
  const labelOf     = (opts) => (v) => opts.find(o => o.value === v)?.label ?? v;

  // Load scope has no unmatched cells by construction (no cell record ⇒ no
  // brigadir), so the warning simply stops applying there.
  const unmatchedCount = scopedCells.filter(c => c.unmatched).length;
  const anyFilter =
    !!search || statusTab !== "all" || jobFilter.length > 0 ||
    cellIds.length > 0 || leaderIds.length > 0 || supIds.length > 0 ||
    colF.worker.length > 0 || colF.schedule.length > 0 || colF.day.length > 0 ||
    colF.status.length > 0 ||
    rngActive(colF.hours) || rngActive(colF.early) || rngActive(colF.eff);

  function clearFilters() {
    setSearch(""); setStatusTab("all"); setJobFilter([]); setColF(INIT_COL);
    setCellIds([]); setLeaderIds([]); setSupIds([]);
  }

  return (
    <Layout title={t("cellAtt.title")}>
      {/* Page scope — sits ABOVE the filter row because it re-bases everything
          under it, the filters' own option lists included. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedToggle
          value={scope}
          onChange={askScope}
          options={[
            { value: "load", label: t("cellAtt.scopeLoad"), title: t("cellAtt.scopeLoadHint") },
            { value: "all",  label: t("cellAtt.scopeAll"),  title: t("cellAtt.scopeAllHint") },
            // The tab that DEFINES the load slice, so it sits next to it.
            ...(isAdmin
              ? [{ value: "config", label: t("cellAtt.scopeConfig"), title: t("cellAtt.scopeConfigHint") }]
              : []),
          ]}
        />
        {scope !== "all" && (
          <span className="text-xs" style={{ color: "var(--text-4)" }}>
            {scope === "load" ? t("cellAtt.scopeNote") : t("cellAtt.cfgNote")}
          </span>
        )}
      </div>

      {scope === "config" ? (
        <LoadConfig onDirtyChange={setConfigDirty} />
      ) : (
        <>
        {/* Toolbar — one aligned row: day stepper, then the three owner/cell
            filters (leader → supervisor → cell), then the test note */}
        <div className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 mb-4 flex flex-wrap items-center gap-2"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <DayStepper value={date} onChange={setDate} />
          {scopedCells.length > 0 && (
            <>
              <StyledSelect
                multiple searchable
                value={leaderIds}
                onChange={setLeaderIds}
                options={leaderOptions}
                allLabel={t("cellAtt.allLeaders")}
                countLabel={(n) => `${n} ${t("cellAtt.leadersWord")}`}
                searchPlaceholder={t("cellAtt.searchLeader")}
                triggerClassName="px-3 py-2 text-sm"
                className="w-full md:w-auto md:min-w-[170px]"
              />
              <StyledSelect
                multiple searchable
                value={supIds}
                onChange={setSupIds}
                options={supOptions}
                allLabel={t("cellAtt.allSupervisors")}
                countLabel={(n) => `${n} ${t("cellAtt.supervisorsWord")}`}
                searchPlaceholder={t("cellAtt.searchSupervisor")}
                triggerClassName="px-3 py-2 text-sm"
                className="w-full md:w-auto md:min-w-[170px]"
              />
              <StyledSelect
                multiple searchable
                value={cellIds}
                onChange={setCellIds}
                options={cellOptions}
                allLabel={t("cellAtt.allCells")}
                countLabel={(n) => `${n} ${t("cellAtt.cellsWord")}`}
                searchPlaceholder={t("cellAtt.searchCell")}
                triggerClassName="px-3 py-2 text-sm"
                className="w-full md:w-auto md:min-w-[200px]"
              />
            </>
          )}
          <span className="w-full md:w-auto md:ml-auto flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-4)" }}>
            <FlaskConical size={12} /> {t("cellAtt.testNote")}
          </span>
        </div>

        {isLoading ? (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonTable rows={8} cols={7} />
          </div>
        ) : scopedRows.length === 0 ? (
          // The day may hold rows and still have nothing in the load slice —
          // saying "no data" there would read as a broken upload.
          <EmptyState
            title={allRows.length === 0 ? t("cellAtt.noDataTitle") : t("cellAtt.noLoadTitle")}
            message={allRows.length === 0 ? t("cellAtt.noDataHint") : t("cellAtt.noLoadHint")}
            showUploadLink={false}
          />
        ) : (
          <div className="space-y-4">
            {/* KPI header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KPICard
                label={t("cellAtt.kpiCame")}
                value={workedRows.length}
                sub={`${t("cellAtt.of")} ${scopeRows.length} · ${fmtPct(cameRatio)}`}
              />
              <KPICard
                label={t("cellAtt.kpiCells")}
                value={cellsShown}
                sub={t("cellAtt.kpiCellsSub")}
              />
              <KPICard
                label={t("cellAtt.kpiTotalHours")}
                value={workedRows.length ? `${fmtNum(totalHours, 1)} ${t("daily.hrs")}` : "—"}
                sub={t("cellAtt.kpiWorkedOnly")}
              />
              <KPICard
                label={t("cellAtt.kpiAvgHours")}
                value={avgHours !== null ? `${fmtNum(avgHours, 2)} ${t("daily.hrs")}` : "—"}
                sub={t("cellAtt.kpiWorkedOnly")}
              />
            </div>

            {/* Unmatched «Код подразделения» — those rows belong to no cell yet */}
            {unmatchedCount > 0 && (
              <div className="flex items-start gap-1.5 text-[11px] px-1" style={{ color: "#eab308" }}>
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                <span>{t("cellAtt.unmatchedNote").replace("{n}", unmatchedCount)}</span>
              </div>
            )}

            {/* Came-to-work by role — chips toggle the job filter */}
            {roleCounts.length > 0 && (
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
                  {t("cellAtt.byRole")}
                </span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {roleCounts.map(([title, count]) => {
                    const active = jobFilter.includes(title);
                    return (
                      <button
                        key={title}
                        onClick={() => toggleRole(title)}
                        title={tl(title) || title}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition-colors"
                        style={{
                          background: active ? "var(--brand-bg)" : "var(--bg-inner)",
                          border: `1px solid ${active ? "var(--brand-bg)" : "var(--border-md)"}`,
                          color: active ? "var(--brand-text)" : "var(--text-2)",
                        }}
                      >
                        <span className="truncate max-w-[160px]">{tl(title) || title}</span>
                        <span className="font-semibold tabular-nums px-1.5 rounded-md text-[11px]"
                          style={{
                            background: active ? "var(--brand-text)" : "var(--border-md)",
                            color: active ? "var(--bg-card)" : "var(--text-1)",
                          }}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <TableCard
                icon={LayoutGrid}
                title={t("cellAtt.tableTitle")}
                // Widths come from the header, not from whichever 50 rows happen
                // to be on screen — otherwise every sort/page/filter reflows the
                // columns. minWidth keeps them readable on narrow screens.
                fixed
                minWidth={1500}
                right={
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                    {sorted.length.toLocaleString("ru-RU")} / {scopeRows.length.toLocaleString("ru-RU")}
                  </span>
                }
                toolbar={
                  <>
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={t("cellAtt.searchWorker")}
                      className="flex-1 min-w-[180px]"
                    />
                    <SegmentedToggle
                      value={statusTab}
                      onChange={setStatusTab}
                      options={[
                        ["all", t("cellAtt.tabAll")],
                        ["worked", t("cellAtt.tabWorked")],
                        ["absent", t("cellAtt.tabAbsent")],
                      ]}
                    />
                    {anyFilter && (
                      <Button variant="secondary" size="lg" onClick={clearFilters}>
                        {t("staff.clearFilters")}
                      </Button>
                    )}
                  </>
                }
              >
                <thead>
                  <tr>
                    {/* Every column carries the same funnel: a checkbox list of
                        its distinct values, or min/max where the values are
                        numeric. The first three drive the toolbar pickers' state. */}
                    <Th label={t("cellAtt.colCell")} k="verifix_code" sort={sort} onSort={onSort} cls="w-[13%]"
                      filter={
                        <ColFilter active={cellIds.length > 0}>
                          <OptsFilter searchable opts={cellKeys} sel={cellIds} onChange={setCellIds} render={labelOf(cellOptions)} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colLeader")} k="leader_name" sort={sort} onSort={onSort} cls="w-[11%]"
                      filter={
                        <ColFilter active={leaderIds.length > 0}>
                          <OptsFilter searchable opts={leaderKeys} sel={leaderIds} onChange={setLeaderIds} render={labelOf(leaderOptions)} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colSup")} k="manager_name" sort={sort} onSort={onSort} cls="w-[10%]"
                      filter={
                        <ColFilter active={supIds.length > 0}>
                          <OptsFilter searchable opts={supKeys} sel={supIds} onChange={setSupIds} render={labelOf(supOptions)} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colWorker")} k="worker_name" sort={sort} onSort={onSort} cls="w-[12%]"
                      filter={
                        <ColFilter active={colF.worker.length > 0}>
                          <OptsFilter searchable opts={distinct.worker} sel={colF.worker}
                            onChange={v => setCol("worker", v)} render={o => tl(o) || o} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colRole")} k="job_title" sort={sort} onSort={onSort} cls="w-[11%]"
                      filter={
                        <ColFilter active={jobFilter.length > 0}>
                          <OptsFilter searchable opts={distinct.job} sel={jobFilter}
                            onChange={setJobFilter} render={o => tl(o) || o} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colSchedule")} k="schedule" sort={sort} onSort={onSort} cls="w-[8%]"
                      filter={
                        <ColFilter active={colF.schedule.length > 0}>
                          <OptsFilter opts={distinct.schedule} sel={colF.schedule}
                            onChange={v => setCol("schedule", v)} render={o => tl(o) || o} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colDay")} k="day_raw" sort={sort} onSort={onSort} cls="w-[9%]"
                      filter={
                        <ColFilter active={colF.day.length > 0}>
                          <OptsFilter searchable opts={distinct.day} sel={colF.day} onChange={v => setCol("day", v)} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colHours")} k="hours_worked" sort={sort} onSort={onSort} align="right" cls="w-[5%]"
                      filter={
                        <ColFilter active={rngActive(colF.hours)}>
                          <RngFilter minV={colF.hours.min} maxV={colF.hours.max}
                            onMin={v => setCol("hours", { ...colF.hours, min: v })}
                            onMax={v => setCol("hours", { ...colF.hours, max: v })} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colEarly")} k="early_arrival_min" sort={sort} onSort={onSort} align="right" cls="w-[8%]"
                      filter={
                        <ColFilter active={rngActive(colF.early)}>
                          <RngFilter minV={colF.early.min} maxV={colF.early.max}
                            onMin={v => setCol("early", { ...colF.early, min: v })}
                            onMax={v => setCol("early", { ...colF.early, max: v })} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colEffHours")} k="effective_hours" sort={sort} onSort={onSort} align="right" cls="w-[7%]"
                      filter={
                        <ColFilter active={rngActive(colF.eff)}>
                          <RngFilter minV={colF.eff.min} maxV={colF.eff.max}
                            onMin={v => setCol("eff", { ...colF.eff, min: v })}
                            onMax={v => setCol("eff", { ...colF.eff, max: v })} />
                        </ColFilter>} />
                    <Th label={t("cellAtt.colStatus")} k="status" sort={sort} onSort={onSort} align="center" cls="w-[6%]"
                      filter={
                        <ColFilter active={colF.status.length > 0}>
                          <OptsFilter opts={distinct.status} sel={colF.status} onChange={v => setCol("status", v)} />
                        </ColFilter>} />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                        {anyFilter ? t("cellAtt.noMatch") : t("cellAtt.noRows")}
                      </td>
                    </tr>
                  ) : pageRows.map(r => (
                      <tr key={r.id}>
                        {/* Fixed layout means text can't widen its column, so the
                            long ones truncate and carry the full value in a title. */}
                        <td className="px-3 py-2 truncate" title={`${r.verifix_code || ""} ${r.cell_name || ""}`.trim()}>
                          <span className="font-mono" style={{ color: "var(--text-2)" }}>{r.verifix_code || "—"}</span>
                          {r.cell_name && (
                            <span className="ml-1.5" style={{ color: "var(--text-4)" }}>{r.cell_name}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 truncate" title={tl(r.leader_name) || ""} style={{ color: "var(--text-2)" }}>{tl(r.leader_name) || "—"}</td>
                        <td className="px-3 py-2 truncate" title={tl(r.manager_name) || ""} style={{ color: "var(--text-2)" }}>{tl(r.manager_name) || "—"}</td>
                        <td className="px-3 py-2 truncate" title={tl(r.worker_name) || ""} style={{ color: "var(--text-1)" }}>{tl(r.worker_name)}</td>
                        <td className="px-3 py-2 truncate" title={tl(r.job_title) || ""} style={{ color: "var(--text-3)" }}>{tl(r.job_title) || "—"}</td>
                        <td className="px-3 py-2 truncate" title={tl(r.schedule) || ""} style={{ color: "var(--text-3)" }}>{tl(r.schedule) || "—"}</td>
                        <td className="px-3 py-2 truncate font-mono text-[11px]" title={r.day_raw || ""} style={{ color: "var(--text-3)" }}>{r.day_raw || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                          {r.hours_worked != null ? fmtNum(r.hours_worked, 2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                          {r.early_arrival_min != null ? fmtNum(r.early_arrival_min, 0) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>
                          {r.effective_hours != null ? fmtNum(r.effective_hours, 2) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center"><StatusChip status={r.status} /></td>
                      </tr>
                  ))}
                </tbody>
              </TableCard>
              <Pagination
                page={page}
                pageCount={pageCount}
                total={sorted.length}
                pageSize={PAGE_SIZE}
                onPage={setPage}
              />
              {/* Clearance for the floating row-count badge, which otherwise
                  sits on top of the pager's page buttons. */}
              <div className="h-14" aria-hidden="true" />
            </div>

            {/* Row-count badge — portaled to <body>: the .page-enter wrapper's
                animation (fill-mode both) keeps a transform, which would make it
                the containing block for position:fixed and pin the badge to the
                page. Same badge as the Verifix (Staff) table. */}
            {createPortal(
              <div
                className="fixed bottom-4 right-4 z-40 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-md)",
                  color: "var(--text-2)",
                }}
              >
                {t("staff.showingRows").replace("{n}", sorted.length)}
              </div>,
              document.body,
            )}
          </div>
        )}
        </>
      )}

      {/* Leaving the config tab with ticks that were never saved */}
      <ConfirmDialog
        open={pendingScope !== null}
        title={t("cellAtt.cfgLeaveTitle")}
        message={t("cellAtt.cfgLeaveHint").replace("{n}", configDirty)}
        confirmLabel={t("cellAtt.cfgLeaveConfirm")}
        cancelLabel={t("cellAtt.cancel")}
        onCancel={() => setPendingScope(null)}
        onConfirm={() => { setScope(pendingScope); setPendingScope(null); setConfigDirty(0); }}
      />
    </Layout>
  );
}
