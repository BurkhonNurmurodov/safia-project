import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FileSpreadsheet, Boxes, CalendarDays, Info } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { SkeletonChart } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import DayTimeline from "./DayTimeline";
import { CATS, catColor } from "./categories";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fmtDur } from "../../utils/idleTime";
import { cellLabel } from "../../utils/cellName";
import { exportXlsx } from "../../utils/exportXlsx";
import api from "../../utils/api";

/**
 * What ONE supervisor's bar on the Ojidaniya page is made of.
 *
 * The bar is a number with no way in: it says the unit waited 464 minutes over
 * a fortnight and nothing about which cell stopped, when, or why. Pressing it
 * opens this — date by date, and inside a date cell by cell, each cell's day
 * drawn to scale (the `/idle-cell` timeline, verbatim) over the table of its
 * own events.
 *
 * Three rules it is built on:
 *
 * 1. **It mirrors the page.** The To'xtaganda/To'xtamaganda half, the
 *    «загрузкада / hammasi» scope and the doughnut's category picks all narrow
 *    it, server-side, because this is a zoom-in on one bar and not a second
 *    view of the register. An event the bar did not count has no business being
 *    totalled underneath it.
 * 2. **Two totals per date, both named.** The unit's day is the
 *    headcount-weighted MEAN of its cells (Σ(N·T)÷ΣN), so the cells listed below
 *    add up to something else entirely — usually much more. Printing only one of
 *    them either contradicts the bar the reader just pressed or leaves an
 *    unexplained gap on screen, so both are printed and each says what it is.
 * 3. **A day the unit does not read from its cells says so.** Before
 *    `idle_source.CELLS_FROM` the number came from the «Смена отчёт» row, which
 *    carries category minutes and no endpoints. Such a date shows its category
 *    table and a notice — never an empty cell list, which is what "the leaders
 *    filed nothing" looks like.
 */

const codeOf = (name) => {
  const c = CATS.find((x) => x.name === name);
  return c ? c.code : String(name || "").replace(/^Cat\s*/i, "");
};

// The category as it appears everywhere else on this page: the identity hue in
// a soft chip, the code, and the meaning where the locale has one.
function CatChip({ name, t, withLabel = true }) {
  const code = codeOf(name);
  const color = catColor(name);
  const meaning = t(`downtime.cat.${code}.label`);
  const named = meaning && !meaning.startsWith("downtime.cat.");
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0" title={named ? `${name} — ${meaning}` : name}>
      <span
        className="text-[10px] font-bold px-1 py-0.5 rounded leading-none flex-shrink-0"
        style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
      >
        {code}
      </span>
      {withLabel && <span className="truncate text-[11px]">{named ? meaning : name}</span>}
    </span>
  );
}

function Figure({ label, value, hint, strong = false }) {
  return (
    <span className="flex flex-col items-end leading-tight" title={hint}>
      <span className="text-[9px] uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
        {label}
      </span>
      <span
        className="tabular-nums"
        style={{
          fontSize: strong ? 13 : 12,
          fontWeight: strong ? 700 : 600,
          color: strong ? "var(--text-1)" : "var(--text-2)",
        }}
      >
        {value}
      </span>
    </span>
  );
}

export default function UnitOjidaniyaModal({
  open,
  onClose,
  managerId,
  managerName,
  // One entry per date the PAGE has a row for this unit, newest first:
  // { iso, dmy, counted } — `counted` is the figure the bar counted, taken from
  // the page's own response so this surface can never state a different one.
  // `byCategory` is that date's breakdown, which is all a sheet day has.
  dates = [],
  stopped = true,
  kpiOnly = false,
  cats = [],
  factory = null,
  dateFrom,
  dateTo,
  // The page's own min/hrs formatter, so every number here reads in the unit
  // the reader picked on the toolbar.
  fmt,
  scopeLine = "",
}) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const toast = useToast({ position: "bottom" });
  const [openDates, setOpenDates] = useState(() => new Set(dates.slice(0, 1).map((d) => d.iso)));
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => ({
    manager_id: managerId,
    date_from: dateFrom,
    date_to: dateTo,
    stopped: stopped ? 1 : 0,
    ...(kpiOnly ? { kpi_only: 1 } : {}),
    ...(cats.length ? { cats } : {}),
    ...(factory ? { factory } : {}),
  }), [managerId, dateFrom, dateTo, stopped, kpiOnly, cats, factory]);

  const { data, isLoading } = useQuery({
    queryKey: ["downtime-cell-detail", params],
    queryFn: () => api.get("/api/downtime/cell-detail", { params }).then((r) => r.data),
    enabled: !!open && !!managerId,
  });

  const cellsDays = useMemo(() => new Set(data?.cells_days || []), [data]);
  const days = data?.days || {};

  const toggle = (iso) => setOpenDates((prev) => {
    const next = new Set(prev);
    if (next.has(iso)) next.delete(iso); else next.add(iso);
    return next;
  });

  const unionLabel = stopped ? undefined : t("downtime.dt.unionNs");

  const onExport = async () => {
    setBusy(true);
    try {
      const where = await exportXlsx("/api/downtime/cell-detail/export.xlsx", {
        body: {
          manager_id: managerId,
          date_from: dateFrom,
          date_to: dateTo,
          stopped,
          kpi_only: kpiOnly,
          cats,
          factory,
          labels: {
            date: t("downtime.colDate"),
            cell: t("downtime.dt.colCell"),
            leader: t("idleCell.leader"),
            category: t("idleCell.category"),
            start: t("idleCell.startTime"),
            end: t("idleCell.endTime"),
            minutes: t("idleCell.colMinutes"),
            stopped: t("idleCell.colStatus"),
            note: t("idleCell.colNote"),
            source: t("downtime.dt.colSource"),
            yes: t("idleCell.stopped"),
            no: t("idleCell.notStopped"),
            srcCells: t("downtime.dt.srcCells"),
            srcSheet: t("downtime.dt.srcSheet"),
          },
        },
      });
      toast.success(t(where === "download" ? "downtime.dt.downloaded" : "downtime.dt.sentToChat"));
    } catch {
      toast.error(t("downtime.dt.exportFailed"));
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (isLoading) return <SkeletonChart className="h-48" />;
    if (!dates.length) {
      return <EmptyState title={t("downtime.noData")} message={t("downtime.dt.noRows")} />;
    }
    return dates.map((d) => {
      const cells = days[d.iso] || [];
      const isCellsDay = cellsDays.has(d.iso);
      const sum = cells.reduce((s, c) => s + (c.total || 0), 0);
      const expanded = openDates.has(d.iso);
      return (
        <section
          key={d.iso}
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          {/* One date. The header carries BOTH readings of it: what the bar
              counted, and what the cells underneath add up to. */}
          <button
            type="button"
            onClick={() => toggle(d.iso)}
            aria-expanded={expanded}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
            style={{ background: "var(--bg-inner)" }}
          >
            {expanded ? <ChevronDown size={14} style={{ color: "var(--text-3)" }} />
                      : <ChevronRight size={14} style={{ color: "var(--text-3)" }} />}
            <CalendarDays size={13} style={{ color: "var(--text-3)" }} className="flex-shrink-0" />
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
              {d.dmy}
            </span>
            {isCellsDay ? (
              cells.length > 0 && (
                <span className="text-[10px] flex items-center gap-1" style={{ color: "var(--text-4)" }}>
                  <Boxes size={11} />{cells.length} {t("downtime.dt.cellsWord")}
                </span>
              )
            ) : (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--bg-card)", color: "var(--text-3)", border: "1px solid var(--border)" }}
              >
                {t("downtime.dt.srcSheet")}
              </span>
            )}
            <span className="ml-auto flex items-center gap-4">
              {isCellsDay && cells.length > 0 && (
                <Figure
                  label={t("downtime.dt.cellsSum")}
                  value={fmt(sum)}
                  hint={t("downtime.dt.cellsSumHint")}
                />
              )}
              <Figure
                label={t("downtime.dt.counted")}
                value={fmt(d.counted || 0)}
                hint={t("downtime.dt.countedHint")}
                strong
              />
            </span>
          </button>

          {expanded && (
            <div className="p-3 space-y-3">
              {!isCellsDay ? (
                <SheetDay row={d} t={t} fmt={fmt} />
              ) : cells.length === 0 ? (
                <p className="text-[11px] px-1 py-3 text-center" style={{ color: "var(--text-4)" }}>
                  {t("downtime.dt.noFiled")}
                </p>
              ) : (
                cells.map((c) => (
                  <CellBlock key={c.cell_id} cell={c} t={t} tl={tl} fmt={fmt} unionLabel={unionLabel} />
                ))
              )}
            </div>
          )}
        </section>
      );
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tl(managerName || "")}
      subtitle={[`${dates.length ? dates[dates.length - 1].dmy : dateFrom} — ${dates.length ? dates[0].dmy : dateTo}`, scopeLine]
        .filter(Boolean).join(" · ")}
      icon={Boxes}
      maxWidth="max-w-5xl"
      bodyClassName="px-4 py-4 space-y-3"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("idleCell.cancel")}</Button>
          <Button onClick={onExport} loading={busy} icon={FileSpreadsheet}>
            {t("downtime.dt.export")}
          </Button>
        </>
      }
    >
      {body()}
      {toast.node}
    </Modal>
  );
}

// A date whose number still came from the shift report. It has categories and
// minutes and no endpoints at all, so there is nothing to draw and no cell to
// name — and saying that plainly is the whole point: an empty cell list here
// would read as "the leaders filed nothing", which is a different fact.
function SheetDay({ row, t, fmt }) {
  const entries = Object.entries(row.byCategory || {})
    .map(([k, v]) => [k, Number(v) || 0])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  return (
    <div className="space-y-2">
      <p
        className="text-[11px] flex items-start gap-1.5 px-2.5 py-2 rounded-lg"
        style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}
      >
        <Info size={12} className="flex-shrink-0 mt-0.5" />
        {t("downtime.dt.sheetDayHint")}
      </p>
      {entries.length === 0 ? (
        <p className="text-[11px] px-1 py-2 text-center" style={{ color: "var(--text-4)" }}>
          {t("downtime.dt.noFiled")}
        </p>
      ) : (
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <tbody>
            {entries.map(([cat, v]) => (
              <tr key={cat} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-3 py-2"><CatChip name={cat} t={t} /></td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>
                  {fmt(v)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// One cell's day: the timeline over the events that made it.
function CellBlock({ cell, t, tl, fmt, unionLabel }) {
  const overlap = Math.max(0, (cell.sum_min || 0) - (cell.total || 0));
  return (
    <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}
      >
        {/* A cell is its CODE; where a second fact helps it is the LEADER, never
            the workshop name (utils/cellName.js). */}
        <span className="text-[12px] font-semibold truncate" style={{ color: "var(--text-1)" }}>
          {cellLabel(cell.code, cell.leader ? tl(cell.leader) : "")}
        </span>
        <span className="ml-auto">
          <Figure
            label={t("downtime.dt.cellTotal")}
            value={fmt(cell.total || 0)}
            // The overlap is what the old minutes-only method would have
            // over-reported. Printing it only when it exists keeps the header
            // one number wide on the days that have no correction to explain.
            hint={overlap > 0
              ? `${t("idleCell.oldMethodWouldSay").replace("{v}", fmtDur(cell.sum_min, t))}`
              : undefined}
            strong
          />
        </span>
      </div>

      <DayTimeline
        intervals={cell.intervals}
        summary={cell.summary}
        t={t}
        unionLabel={unionLabel}
      />

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse", minWidth: 620 }}>
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {[
                [t("idleCell.category"), "left", 150],
                [t("idleCell.startTime"), "left", 84],
                [t("idleCell.endTime"), "left", 84],
                [t("idleCell.colMinutes"), "right", 90],
                [t("idleCell.colStatus"), "left", 120],
                [t("idleCell.colNote"), "left", null],
              ].map(([label, align, w]) => (
                <th
                  key={label}
                  className="px-3 py-2 text-[10px] uppercase tracking-wider font-semibold"
                  style={{
                    color: "var(--text-3)", textAlign: align,
                    width: w ? `${w}px` : undefined,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cell.intervals.map((iv) => (
              <tr key={iv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td className="px-3 py-2"><CatChip name={iv.category} t={t} /></td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{iv.start}</td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{iv.end}</td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-1)" }}>
                  {fmt(iv.minutes)}
                </td>
                <td className="px-3 py-2">
                  {/* Did the cell STOP for this one — the fact that decides
                      whether the minutes are downtime at all. */}
                  <span
                    className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded"
                    style={iv.stopped
                      ? { background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" }
                      : { background: "transparent", color: "var(--text-3)", border: "1px dashed var(--border)" }}
                    title={iv.stopped ? t("idleCell.stoppedHint") : t("idleCell.notCountedHint")}
                  >
                    {iv.stopped ? t("idleCell.stopped") : t("idleCell.notStopped")}
                  </span>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                  <span className="line-clamp-2" title={iv.note}>{iv.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
