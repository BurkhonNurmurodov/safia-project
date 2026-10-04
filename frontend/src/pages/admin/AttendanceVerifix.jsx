/**
 * «Davomat (Verifix)» — the «Davomat» tab's TEST twin (2026-10-04).
 *
 * The same day, in the same supervisor → cell → worker layout, with ONE button
 * where the upload was: «Verifix'dan olish» opens a plant → shift → brigadir →
 * cell tree of the cells counted in the загрузка («Zagruzkada hisoblanadi» on
 * /cells; `VerifixCellPicker.jsx`), reads the ticked ones from Verifix's API
 * and stores them apart — replacing those cells only, so one cell can be read
 * again without the plant (backend `services/verifix_attendance.py`). Nothing else on the platform
 * reads what is stored here — real attendance, the загрузка and every figure
 * stay the uploaded file's — so the page has no ticks, no moves, no edits and
 * no Save. Beside each person it shows what the uploaded Excel said for them
 * that day, so a past day can be checked against the file — and «Farqlar»
 * lists every person the two disagree on, with what differs and the platform's
 * own changes to that person's day (exchange, role change, edit request).
 */
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, CloudDownload, FlaskConical, RefreshCw, TriangleAlert,
} from "lucide-react";
import TableCard, { Th } from "../../components/ui/DataTable";

import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import DayStepper from "../../components/ui/DayStepper";
import SearchInput from "../../components/ui/SearchInput";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { Chip, Section, Stat } from "./AttendanceUpload";
import VerifixCellPicker from "./VerifixCellPicker";
import { codeKey } from "../../components/verifix/vfx";

const QK = "attendance-verifix";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtNum(v, digits = 1) {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

const fill = (s, vars) => String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));

// When the day was read, on the plant's wall clock (never the browser's).
const fmtAt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month} ${p.hour}:${p.minute}`;
};

// A refused read → one sentence the admin can act on. utils/api.js flattens a
// dict detail to its `message` and keeps the object as `detail_raw`.
function fetchError(e, t) {
  const res = e?.response?.data;
  const code = res?.detail_raw?.code;
  if (code === "not_configured") return t("attVfx.notConfigured");
  if (code === "slow" || code === "timeout") return t("attVfx.errSlow");
  if (code === "future") return t("attVfx.errFuture");
  if (code === "no_cells") return t("attVfx.errNoCells");
  const msg = typeof res?.detail === "string" ? res.detail : (e?.message || "—");
  return fill(t("attVfx.errVerifix"), { msg });
}

// What the uploaded Excel said about one person, in the row's «Excel» column.
function ExcelValue({ r, t }) {
  if (r.file_only) {
    return (
      <span className="tabular-nums" title={fill(t("attVfx.fileTip"), { clock: r.clock || "—" })}
            style={{ color: "#eab308" }}>
        {r.hours != null ? fmtNum(r.hours, 2) : (r.status || "—")}
      </span>
    );
  }
  if (!r.file) {
    return <span style={{ color: "var(--text-4)" }}>{t("attVfx.notInExcel")}</span>;
  }
  const v = r.file.hours != null ? fmtNum(r.file.hours, 2) : (r.file.status || "—");
  const tip = fill(t("attVfx.fileTip"), { clock: r.file.clock || "—" });
  if (r.same) {
    return (
      <span className="inline-flex items-center gap-1 tabular-nums" title={tip} style={{ color: "var(--text-3)" }}>
        <CheckCircle2 size={11} style={{ color: "#22c55e" }} />{v}
      </span>
    );
  }
  return <span className="tabular-nums font-semibold" title={tip} style={{ color: "#eab308" }}>{v}</span>;
}

// The worker table of one cell: the Verifix rows, then the people only the
// Excel has. The «Excel» column exists only on a day with an uploaded file.
function VfxWorkerTable({ cell, excel, t, tl, tx }) {
  const cols = [
    t("attUp.colWorker"), t("attUp.colJob"), t("attUp.colSchedule"),
    t("attUp.colClock"), t("attUp.colHours"), t("attUp.colEarly"),
    t("attUp.colEffective"), ...(excel ? [t("attVfx.colExcel")] : []),
  ];
  const rows = [...cell.rows, ...(excel ? cell.file_rows : [])];
  const td = "px-3 py-2 whitespace-nowrap";
  const sep = { borderRight: "1px solid var(--border)" };
  return (
    <div style={{ background: "var(--bg-base)", borderTop: "1px solid var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: excel ? 800 : 720 }}>
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {cols.map((c, i) => (
                <th key={i}
                    className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
                    style={{ color: "var(--text-4)", borderRight: i < cols.length - 1 ? "1px solid var(--border)" : "none" }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-6 text-center" style={{ color: "var(--text-4)" }}>
                  {t("attUp.noWorkers")}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const fileOnly = !!r.file_only;
              const counted = !!r.counted;
              return (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border)", opacity: fileOnly ? 0.75 : 1 }}>
                  <td className="px-3 py-2" style={sep}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="truncate" style={{ color: "var(--text-1)" }}>{tl(r.worker_name)}</span>
                      {fileOnly && <Chip tone="warn">{t("attVfx.onlyExcel")}</Chip>}
                      {r.file?.cell && (
                        <Chip tone="warn" title={t("attVfx.excelCellTip")}>
                          {fill(t("attVfx.excelCell"), { code: r.file.cell })}
                        </Chip>
                      )}
                    </div>
                  </td>
                  <td className={td} style={{ ...sep, color: "var(--text-3)" }}>{tx(r.job_title) || "—"}</td>
                  <td className={td} style={{ ...sep, color: "var(--text-3)" }}>{r.schedule || "—"}</td>
                  <td className={`${td} font-mono text-[11px]`} style={{ ...sep, color: "var(--text-2)" }}>
                    {fileOnly ? "—" : (r.clock_in_out || "—")}
                  </td>
                  <td className={`${td} tabular-nums font-semibold`}
                      style={{ ...sep, color: counted ? "var(--text-1)" : "var(--text-4)" }}>
                    {fileOnly || r.hours_worked == null ? "—" : fmtNum(r.hours_worked, 2)}
                  </td>
                  <td className={`${td} tabular-nums`} style={{ ...sep, color: "var(--text-3)" }}>
                    {!fileOnly && r.early_arrival_min ? `${fmtNum(r.early_arrival_min, 0)}′` : "—"}
                  </td>
                  <td className={`${td} tabular-nums`}
                      style={{ ...(excel ? sep : {}), color: "var(--text-3)" }}>
                    {fileOnly || r.effective_hours == null ? "—" : fmtNum(r.effective_hours, 2)}
                  </td>
                  {excel && <td className={td}><ExcelValue r={r} t={t} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// One side of a difference: the day cell and the hours.
function Side({ s, t }) {
  if (!s) return <span style={{ color: "var(--text-4)" }}>—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono text-[11px]" style={{ color: "var(--text-2)" }}>{s.clock || "—"}</span>
      {s.hours != null && (
        <span className="tabular-nums font-semibold ml-1.5" style={{ color: "var(--text-1)" }}>
          {fmtNum(s.hours, 2)} {t("attUp.hoursShort")}
        </span>
      )}
    </span>
  );
}

// Reasons that say the RECORD differs (amber) against those that only say a
// person is on one side (neutral).
const DATA_REASONS = new Set(["moved", "edited", "manual", "mark", "came", "filled", "unfilled", "clock", "hours", "unknown"]);

// A reason's value: a cell code, «О → —» (Excel → Verifix) or an ISO date.
const whyValue = (v) => {
  if (v == null || v === "") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v);
};

function ReasonChip({ why, t }) {
  const [code, v] = why;
  const val = whyValue(v);
  return (
    <Chip tone={DATA_REASONS.has(code) ? "warn" : "neutral"} title={code === "mark" ? t("attVfx.markTip") : undefined}>
      {t(`attVfx.why.${code}`)}{val ? ` · ${val}` : ""}
    </Chip>
  );
}

function EventChip({ ev, t, tl }) {
  if (ev.kind === "exchange") {
    const label = fill(t(ev.task ? "attVfx.ev.exchangeTask" : "attVfx.ev.exchange"),
                       { to: ev.task ? (ev.to || "—") : tl(ev.to || "—") });
    return (
      <Chip tone="brand" title={`#${ev.doc}${ev.from ? ` · ${tl(ev.from)}` : ""}`}>
        {label}{ev.time ? ` · ${ev.time}` : ""}
      </Chip>
    );
  }
  if (ev.kind === "role") {
    return <Chip tone="brand" title={`#${ev.doc}${ev.old ? ` · ${ev.old}` : ""}`}>{fill(t("attVfx.ev.role"), { role: ev.role || "—" })}</Chip>;
  }
  return <Chip tone="brand" title={(ev.fields || []).join(", ")}>{t("attVfx.ev.edit")}</Chip>;
}

// Every person the two sides disagree on — the list a check is read from.
function DiffTable({ diffs, t, tl }) {
  const counts = useMemo(() => {
    const c = new Map();
    for (const d of diffs) for (const [code] of d.why) c.set(code, (c.get(code) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [diffs]);
  const withEvents = diffs.filter((d) => d.events.length).length;
  return (
    <TableCard
      icon={AlertTriangle}
      title={fill(t("attVfx.diffTitle"), { n: diffs.length })}
      wrap
      minWidth={960}
      maxHeight="60vh"
      toolbar={
        <div className="w-full space-y-2">
          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("attVfx.diffNote")}</div>
          <div className="flex flex-wrap gap-1.5">
            {counts.map(([code, n]) => (
              <span key={code} className="inline-flex items-center gap-1">
                <ReasonChip why={[code, null]} t={t} />
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{n}</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
              <Chip tone="brand">{t("attVfx.colEvents")}</Chip>
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{withEvents}</span>
            </span>
          </div>
        </div>
      }
    >
      <thead>
        <tr>
          <Th label={t("attUp.colWorker")} />
          <Th label={t("attVfx.colCell")} />
          <Th label="Verifix" />
          <Th label={t("attVfx.colExcel")} />
          <Th label={t("attVfx.colWhy")} />
          <Th label={t("attVfx.colEvents")} />
        </tr>
      </thead>
      <tbody>
        {diffs.map((d) => (
          <tr key={d.id}>
            <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{tl(d.worker_name)}</td>
            <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--brand-text)" }}>{d.code || "—"}</td>
            <td className="px-3 py-2"><Side s={d.vfx} t={t} /></td>
            <td className="px-3 py-2"><Side s={d.excel} t={t} /></td>
            <td className="px-3 py-2">
              <div className="flex flex-wrap gap-1">{d.why.map((w, i) => <ReasonChip key={i} why={w} t={t} />)}</div>
            </td>
            <td className="px-3 py-2">
              {d.events.length
                ? <div className="flex flex-wrap gap-1">{d.events.map((ev, i) => <EventChip key={i} ev={ev} t={t} tl={tl} />)}</div>
                : <span style={{ color: "var(--text-4)" }}>—</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
}

export default function AttendanceVerifix() {
  const { t, lang } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast({ position: "bottom" });

  const [date, setDate] = usePersistentState("attvfx_date", todayISO());
  const [expandedCells, setExpandedCells] = usePersistentState("attvfx_expanded", []);
  const [search, setSearch] = useState("");
  // The cell picker: null = closed, else the codes it opens with ticked.
  const [pickInit, setPickInit] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [QK, date],
    queryFn: () => api.get("/api/attendance-verifix", { params: { date } }).then((r) => r.data),
    retry: 1,
  });

  const fetchMut = useMutation({
    mutationFn: ({ day, codes }) =>
      api.post("/api/attendance-verifix/fetch", { date: day, codes }).then((r) => r.data),
    onSuccess: (payload, { day }) => {
      qc.setQueryData([QK, day], payload);
      // What THIS read did — the page's totals cover every cell of the day.
      const read = payload?.read;
      const missed = (read?.partial_cells ?? 0) + (read?.unread_cells ?? 0);
      if (read?.partial && missed) toast.warning(fill(t("attVfx.partialToast"), { n: missed }));
      else toast.success(fill(t("attVfx.fetchedToast"), { cells: read?.cells ?? 0, n: read?.rows ?? 0 }));
    },
    onError: (e) => toast.error(fetchError(e, t)),
  });

  const status = data?.status ?? "none";
  const fetched = status === "fetched" || status === "partial";
  const excel = !!data?.excel;
  const totals = data?.totals;

  // Every cell the picker offers, and the ones whose last read ran out of time
  // (by code key: the register's spelling of a code may have changed since).
  const pickCodes = useMemo(() => (data?.pick?.cells || []).map((c) => c.code), [data]);
  const partialPick = useMemo(() => {
    const want = new Set((data?.partial_codes || []).map(codeKey));
    return pickCodes.filter((c) => want.has(codeKey(c)));
  }, [data, pickCodes]);

  const filtered = useMemo(() => {
    if (!fetched) return { sections: [], unassigned: [] };
    const q = search.trim().toLowerCase();
    if (!q) return { sections: data.sections, unassigned: data.unassigned };
    const hit = (r) => (r.worker_name || "").toLowerCase().includes(q) || tl(r.worker_name || "").toLowerCase().includes(q);
    const matchCell = (c) =>
      (c.verifix_code || "").toLowerCase().includes(q) || c.rows.some(hit) || c.file_rows.some(hit);
    return {
      sections: data.sections
        .map((s) => ({ ...s, cells: s.cells.filter(matchCell) }))
        .filter((s) => s.cells.length || tl(s.manager_name || "").toLowerCase().includes(q)),
      unassigned: data.unassigned.filter(matchCell),
    };
  }, [data, fetched, search, tl]);

  const toggleExpand = useCallback((code) => {
    setExpandedCells((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, [setExpandedCells]);

  // The cell row's chips: a read that ran out of time, then the Excel verdict —
  // how many of its people differ from the file.
  const cellExtra = useCallback((cell) => {
    const part = cell.read?.partial
      ? <Chip tone="warn" icon={RefreshCw} title={t("attVfx.partialCellTip")}>{t("attVfx.partialCell")}</Chip>
      : null;
    let verdict = null;
    if (excel && cell.excel) {
      const tip = fill(t("attVfx.excelTip"), {
        present: cell.excel.present, workers: cell.excel.workers, hours: fmtNum(cell.excel.hours, 1),
      });
      if (cell.excel.workers === 0) verdict = <Chip tone="neutral" title={tip}>{t("attVfx.notInExcel")}</Chip>;
      else verdict = cell.differ
        ? <Chip tone="warn" icon={AlertTriangle} title={tip}>{fill(t("attVfx.diffCell"), { n: cell.differ })}</Chip>
        : <Chip tone="ok" icon={CheckCircle2} title={tip}>{t("attVfx.sameCell")}</Chip>;
    }
    if (!part && !verdict) return null;
    return <>{part}{verdict}</>;
  }, [excel, t]);

  const noop = useCallback(() => {}, []);
  const none = useCallback(() => [], []);
  const renderWorkers = useCallback(
    (cell) => <VfxWorkerTable cell={cell} excel={excel} t={t} tl={tl} tx={tx} />,
    [excel, t, tl, tx],
  );
  const sectionProps = {
    locked: true, bare: true, t, tl, expandedCells, dragCode: null, dropTarget: null,
    sectionRef: noop, onToggleExpand: toggleExpand, onToggleTick: noop, onDragStart: noop,
    cellMenuItems: none, sectionMenuItems: none, renderWorkers, cellExtra,
  };

  const busy = fetchMut.isPending;
  const rule = data?.hours_rule;

  return (
    <div className="space-y-4">
      {/* What this page is — always on screen, so nothing above the sections moves. */}
      <div className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
           style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <FlaskConical size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{t("attVfx.testTitle")}</div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
            {fill(t("attVfx.testMsg"), { n: data?.cells_counted ?? "—" })}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <DayStepper value={date} onChange={setDate} />
        {busy ? (
          <Chip tone="brand" icon={RefreshCw}>{t("attVfx.fetching")}</Chip>
        ) : fetched ? (
          <Chip tone={status === "partial" ? "warn" : "ok"} icon={status === "partial" ? AlertTriangle : CheckCircle2}
                title={fill(t("attVfx.fetchedTip"), { by: data.fetched_by ? tl(data.fetched_by) : "—", n: data.cells_asked ?? 0 })}>
            {status === "partial" ? t("attVfx.partial") : fill(t("attVfx.fetched"), { at: fmtAt(data.fetched_at) })}
          </Chip>
        ) : (
          <Chip tone="neutral">{t("attVfx.notFetched")}</Chip>
        )}

        <div className="flex-1 min-w-[140px]">
          <SearchInput value={search} onChange={setSearch} placeholder={t("attUp.search")} />
        </div>

        <Button
          size="lg"
          icon={fetched ? <RefreshCw size={14} /> : <CloudDownload size={14} />}
          onClick={() => setPickInit(pickCodes)}
          loading={busy}
          disabled={!data || data.configured === false || data.cells_counted === 0 || !pickCodes.length}
          className="whitespace-nowrap"
        >
          {fetched ? t("attVfx.refetch") : t("attVfx.fetch")}
        </Button>
      </div>

      {data && data.configured === false && (
        <div className="text-[11px] px-1" style={{ color: "#eab308" }}>{t("attVfx.notConfigured")}</div>
      )}
      {data && data.configured !== false && data.cells_counted === 0 && (
        <div className="text-[11px] px-1" style={{ color: "#eab308" }}>{t("attVfx.noCells")}</div>
      )}

      {status === "partial" && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl px-3.5 py-3"
             style={{ background: "color-mix(in srgb, #eab308 12%, transparent)", border: "1px solid color-mix(in srgb, #eab308 35%, transparent)" }}>
          <AlertTriangle size={15} className="flex-shrink-0" style={{ color: "#eab308" }} />
          <div className="text-[11px] flex-1 min-w-[200px]" style={{ color: "var(--text-2)" }}>
            {fill(t("attVfx.partialMsg"), { n: (data.partial_codes || []).length })}
          </div>
          {partialPick.length > 0 && (
            <Button size="sm" variant="secondary" icon={<RefreshCw size={12} />}
                    disabled={busy} onClick={() => setPickInit(partialPick)}>
              {t("attVfx.pick.rereadPartial")}
            </Button>
          )}
        </div>
      )}

      {fetched && (
        <div className="text-[11px] px-1 space-y-0.5" style={{ color: "var(--text-4)" }}>
          {rule?.names?.length > 0 && <div>{fill(t("attVfx.hoursRule"), { kinds: rule.names.join(" + ") })}</div>}
          {!excel && <div style={{ color: "#eab308" }}>{t("attVfx.noExcel")}</div>}
        </div>
      )}

      {/* Stats */}
      {fetched && totals && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          <Stat label={t("attUp.statSupervisors")} value={totals.supervisors} />
          <Stat label={t("attUp.statCells")} value={totals.cells} />
          <Stat label={t("attUp.statWorkers")} value={totals.workers} />
          <Stat label={t("attUp.statCounted")} value={totals.counted} />
          <Stat label={t("attUp.statHours")} value={fmtNum(totals.hours, 1)} />
          {excel && (
            <>
              <Stat label={t("attVfx.statSame")} value={`${totals.same}/${totals.matched}`}
                    tone={totals.same < totals.matched ? "#eab308" : undefined} />
              <Stat label={t("attVfx.statOnlyVfx")} value={totals.only_verifix}
                    tone={totals.only_verifix ? "#eab308" : undefined} />
              <Stat label={t("attVfx.statOnlyExcel")} value={totals.only_excel}
                    tone={totals.only_excel ? "#eab308" : undefined} />
            </>
          )}
        </div>
      )}

      {fetched && excel && (data.diffs?.length ?? 0) > 0 && (
        <DiffTable diffs={data.diffs} t={t} tl={tl} />
      )}

      {/* Body */}
      {isLoading && <SkeletonCard />}

      {isError && !isLoading && (
        <div className="rounded-xl px-4 py-6 text-center" style={{ background: "var(--bg-card)", border: "1px solid #ef4444" }}>
          <TriangleAlert size={22} className="mx-auto mb-2" style={{ color: "#ef4444" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("attUp.loadFailed")}</div>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => refetch()}>{t("attUp.retry")}</Button>
        </div>
      )}

      {!isLoading && !isError && !fetched && (
        <div className="rounded-xl px-4 py-12 text-center"
             style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)" }}>
          <CloudDownload size={26} className="mx-auto mb-3" style={{ color: "var(--text-4)" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>{t("attVfx.emptyTitle")}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-4)" }}>{t("attVfx.emptyMsg")}</div>
        </div>
      )}

      {!isLoading && !isError && fetched && (
        <div className="space-y-3">
          {filtered.unassigned.length > 0 && (
            <Section
              {...sectionProps}
              orphan
              orphanHint={t("attVfx.noSupervisorHint")}
              section={{
                manager_id: null, manager_name: "", shift: null, day_state: "open",
                cells: filtered.unassigned,
                totals: { cells: filtered.unassigned.length, included: filtered.unassigned.length, workers: 0, present: 0, hours: 0 },
              }}
            />
          )}
          {filtered.sections.map((s) => (
            <Section key={s.manager_id} {...sectionProps} section={s} />
          ))}
          {filtered.sections.length === 0 && filtered.unassigned.length === 0 && (
            <div className="rounded-xl px-4 py-10 text-center text-xs"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
              {search ? t("attUp.noMatch") : t("attVfx.noRows")}
            </div>
          )}
        </div>
      )}

      {pickInit && data?.pick && (
        <VerifixCellPicker
          pick={data.pick}
          initial={pickInit}
          dateLabel={date.split("-").reverse().join(".")}
          hasReads={fetched}
          onClose={() => setPickInit(null)}
          onConfirm={(codes) => {
            setPickInit(null);
            fetchMut.mutate({ day: date, codes });
          }}
          t={t}
          tl={tl}
          lang={lang}
          fmtAt={fmtAt}
        />
      )}

      {toast.node}
    </div>
  );
}
