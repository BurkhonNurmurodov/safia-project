import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRightLeft, CalendarDays, Hourglass, Info, ListChecks } from "lucide-react";
import DayStepper from "../ui/DayStepper";
import TableCard, { Th } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import { SkeletonBlock } from "../ui/Skeleton";
import { localISO } from "../ui/DateRangePicker";
import { staffLink } from "../../utils/scopeLinks";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { fill, fmtDate, DAY_PAINT, daySwatch } from "./peopleUtil";

const PAGE_SIZE = 50;

const PAINT = DAY_PAINT;

function Square({ day, P, tx, todayIso, i }) {
  const n = Number(day.date.slice(8, 10));
  const st = day.state;
  const paint = PAINT[st];
  const future = day.date > todayIso;
  const plan = day.plan === "yes" ? P.planYes : day.plan === "no" ? P.planNo : null;
  const title = [
    fmtDate(day.date),
    P.state[st || "none"] || st,
    day.in ? `${day.in}${day.out ? `–${day.out}` : ""}` : day.mark && st !== "off" ? day.mark : null,
    day.hours != null ? `${day.hours} h` : null,
    (day.cells || []).join(", ") || null,
    (day.moves || []).length ? `→ ${day.moves.map((m) => m.to_unit || tx(m.task || "")).join(", ")}` : null,
    plan ? `${P.plan}: ${plan}` : null,
    day.closed === false && !day.live && st ? P.notClosed : null,
  ].filter(Boolean).join(" · ");
  // A day still to come is only its number; a past day with no row is a
  // dashed slot — two different blanks, never one.
  const style = paint
    ? { ...paint }
    : future
      ? { background: "transparent", color: "var(--text-4)" }
      : st === "off" || st === "not_yet"
        ? { background: "var(--bg-inner)", color: "var(--text-3)" }
        : { background: "transparent", color: "var(--text-3)", boxShadow: "inset 0 0 0 1px var(--border-md)" };
  return (
    <div title={title} aria-label={title}
      className="pc-cal relative aspect-square rounded-lg flex items-start justify-start p-1.5 text-[11px] font-semibold tabular-nums leading-none"
      style={{ ...style, "--d": `${Math.min(i, 30) * 12}ms`,
               ...(day.live ? { outline: "2px solid var(--brand)", outlineOffset: 2 } : {}),
               ...(day.closed === false && !day.live && st ? { opacity: 0.55 } : {}) }}>
      {n}
      {(day.moves || []).length > 0 && (
        <ArrowRightLeft size={11} strokeWidth={2.6} aria-hidden="true" className="absolute right-1 bottom-1" />
      )}
      {st === "leave" && day.mark && (
        <span className="absolute right-1 bottom-0.5 text-[10px] font-bold" aria-hidden="true">{day.mark}</span>
      )}
      {day.plan && (
        <span aria-hidden="true" className="absolute left-1 bottom-1 w-1.5 h-1.5 rounded-full"
          style={{ background: day.plan === "yes" ? "currentColor" : "transparent", border: "1px solid currentColor" }} />
      )}
    </div>
  );
}

/** The month in figures beside its calendar: the rate (the tiles' own rule
 *  over the month so far) and how many days wear each colour — the legend and
 *  the count in one list. Every number is the server's. */
function MonthPanel({ att, P, t }) {
  const sum = att.month_sum;
  const counts = att.counts || {};
  const [y, m] = (att.month || "").split("-");
  const label = y && m ? `${t(`cal.m${Number(m) - 1}`)} ${y}` : "";
  const rows = [
    ["came", (counts.came || 0) + (counts.live || 0)],
    ["moved", counts.moved || 0],
    ["no_out", counts.no_out || 0],
    ["leave", counts.leave || 0],
    ["absent", counts.absent || 0],
    ["off", (counts.off || 0) + (counts.not_yet || 0)],
    ["none", counts.none || 0],
  ];
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-medium" style={{ color: "var(--text-2)" }}>{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[32px] leading-none font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
          {sum?.att == null ? "—" : `${Math.round(sum.att)}%`}
        </span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{P.tAtt.toLowerCase()}</span>
      </div>
      {sum && (
        <div className="mt-1.5 text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
          {sum.listed ? fill(P.monthSub, { n: sum.listed, h: sum.hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) }) : P.attEmpty}
        </div>
      )}
      <ul className="mt-4 space-y-0.5">
        {rows.map(([k, n]) => (
          <li key={k} className="flex items-center gap-2.5 py-1 text-[13px]" style={{ opacity: n ? 1 : 0.5 }}>
            {k === "moved" ? (
              <ArrowRightLeft size={12} className="flex-shrink-0 w-3" style={{ color: "var(--text-2)" }} aria-hidden="true" />
            ) : (
              <span className="w-3 h-3 rounded-[4px] flex-shrink-0" style={daySwatch(k)} aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-2)" }}>{P.state[k]}</span>
            <span className="tabular-nums font-medium" style={{ color: n ? "var(--text-1)" : "var(--text-3)" }}>{n}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--text-3)", borderTop: "1px solid var(--border)" }}>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: "var(--text-3)" }} aria-hidden="true" />{P.plan}: {P.planYes}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ border: "1px solid var(--text-3)" }} aria-hidden="true" />{P.planNo}
        </span>
      </div>
    </div>
  );
}

function StateCell({ row, P }) {
  const st = row.state || "none";
  const paint = PAINT[st];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full flex-shrink-0" aria-hidden="true"
        style={{ background: paint ? paint.background : "transparent", border: paint ? "none" : "1px solid var(--text-4)" }} />
      <span style={{ color: "var(--text-2)" }}>{P.state[st] || st}</span>
      {row.mark && (st === "leave" || st === "absent") && (
        <span className="text-[11px]" style={{ color: "var(--text-3)" }}>«{row.mark}»</span>
      )}
      {row.closed === false && !row.live && (
        <Hourglass size={12} aria-label={P.notClosed} className="flex-shrink-0" style={{ color: "var(--text-3)" }}>
          <title>{P.notClosed}</title>
        </Hourglass>
      )}
    </span>
  );
}

/** «Davomat» — the month as squares and the period's days as one table. */
export default function AttendanceTab({ data, P, ready, month, setMonth }) {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const att = ready ? data.attendance : null;
  const h = data.hero;
  const todayIso = localISO(new Date());
  const [pageRaw, setPage] = useState(1);
  const rows = att?.rows || [];
  // A shorter period never leaves the reader on a page past its end.
  const page = Math.min(pageRaw, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Monday-first calendar: blanks before the 1st.
  const lead = useMemo(() => {
    if (!att) return 0;
    const first = new Date(`${att.grid[0].date}T00:00:00`);
    return (first.getDay() + 6) % 7;
  }, [att]);

  const notes = (
    <div className="space-y-1.5">
      <p className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        <Info size={12} className="flex-shrink-0 mt-[1px]" aria-hidden="true" />{P.nameNote}
      </p>
      {h.namesakes > 0 && (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug" style={{ color: "var(--status-warn)" }}>
          <AlertTriangle size={12} className="flex-shrink-0 mt-[1px]" aria-hidden="true" />
          {fill(P.namesakeWarn, { n: h.namesakes, w: h.withheld })}
        </p>
      )}
    </div>
  );

  const open = (r) => { if (r.unit_id) nav(staffLink({ unit: r.unit_id, date: r.date })); };
  const plan = (r) => (r.plan === "yes" ? P.planYes : r.plan === "no" ? P.planNo : "—");
  const moved = (r) => (r.moves || []).map((m) => (m.to_unit ? tl(m.to_unit) : tx(m.task || "—"))
    + (m.at ? ` · ${m.at}${m.back ? `–${m.back}` : ""}` : "")).join(", ") || "—";

  return (
    <div className="space-y-4">
      <div className="@container rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-2">
          <CalendarDays size={16} style={{ color: "var(--text-3)" }} aria-hidden="true" />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{P.monthGrid}</span>
          <span className="ml-auto">
            <DayStepper month value={month} onChange={setMonth} max={localISO(new Date())} />
          </span>
        </div>
        <div className="px-4 pb-4 grid gap-x-8 gap-y-5 @3xl:grid-cols-[minmax(0,440px)_minmax(200px,1fr)] items-start">
          <div className="grid grid-cols-7 gap-1.5 max-w-[440px]">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="text-center text-[11px] font-medium pb-0.5" style={{ color: "var(--text-3)" }}>{t(`cal.d${i}`)}</div>
            ))}
            {att ? (
              <>
                {[...Array(lead)].map((_, i) => <div key={`b${i}`} />)}
                {att.grid.map((d, i) => <Square key={d.date} day={d} P={P} tx={tx} todayIso={todayIso} i={i} />)}
              </>
            ) : (
              [...Array(35)].map((_, i) => <SkeletonBlock key={i} className="aspect-square rounded-lg" />)
            )}
          </div>
          {att ? <MonthPanel att={att} P={P} t={t} /> : <SkeletonBlock className="h-[260px] w-full rounded-xl" />}
        </div>
      </div>

      <TableCard icon={ListChecks} title={P.tableTitle}
        subtitle={fill(P.tableSub, { a: fmtDate(data.period.from), b: fmtDate(data.period.to) })}
        right={att ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(P.daysN, { n: rows.length })}</span> : null}
        footer={notes}
        mobile={!att ? <div className="p-4"><SkeletonBlock className="h-24 w-full" /></div> : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-3)" }}>{P.attEmpty}</p>
        ) : (
          <ul>
            {pageRows.map((r) => (
              <li key={r.date} style={{ borderTop: "1px solid var(--border)" }}>
                <button type="button" onClick={() => open(r)} className="w-full text-left px-4 py-2.5 min-h-[52px]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-1)" }}>{fmtDate(r.date)}</span>
                    <StateCell row={r} P={P} />
                  </span>
                  <span className="block mt-0.5 text-xs truncate tabular-nums" style={{ color: "var(--text-3)" }}>
                    {[(r.cells || []).join(", "), r.in ? `${r.in}–${r.out || "…"}` : null, r.hours != null ? `${r.hours} h` : null,
                      r.plan ? `${P.plan}: ${plan(r)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}>
        <thead>
          <tr>
            <Th label={P.colDate} />
            <Th label={P.colCellShort} />
            <Th label={P.colIn} />
            <Th label={P.colOut} />
            <Th label={P.colHours} align="right" />
            <Th label={P.colMark} />
            <Th label={P.colMoved} />
            <Th label={P.colPlan} />
          </tr>
        </thead>
        <tbody>
          {!att ? (
            [...Array(6)].map((_, i) => (
              <tr key={i}><td colSpan={8} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>
            ))
          ) : rows.length === 0 ? (
            <tr><td colSpan={8} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{P.attEmpty}</td></tr>
          ) : pageRows.map((r) => (
            <tr key={r.date} onClick={() => open(r)} className={r.unit_id ? "cursor-pointer" : ""}>
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.date)}</td>
              <td className="px-3 py-2 tabular-nums">{(r.cells || []).join(", ") || "—"}</td>
              <td className="px-3 py-2 tabular-nums">{r.in || "—"}</td>
              <td className="px-3 py-2 tabular-nums">{r.out || "—"}</td>
              <td className="px-3 py-2 tabular-nums text-right">{r.hours != null ? r.hours.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : "—"}</td>
              <td className="px-3 py-2"><StateCell row={r} P={P} /></td>
              <td className="px-3 py-2 max-w-[220px] truncate" title={moved(r)}>{moved(r)}</td>
              <td className="px-3 py-2">{plan(r)}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {rows.length > PAGE_SIZE && (
        <Pagination page={page} pageCount={Math.ceil(rows.length / PAGE_SIZE)} total={rows.length}
          pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
