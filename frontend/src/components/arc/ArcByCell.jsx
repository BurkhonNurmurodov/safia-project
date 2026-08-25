import { useMemo } from "react";
import {
  Boxes, Users, ClipboardList, Hourglass, Siren, CheckCircle2,
  ShieldCheck, Timer, CalendarClock, HelpCircle, Link2Off,
} from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock } from "../ui/Skeleton";
import { usePersistentState } from "../../hooks/usePersistentState";
import { hexA, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../../utils/arcStatus";

/**
 * The «by cells» view of the ARC register.
 *
 * An ARC division whose name ENDS in a four-digit number names one of this
 * platform's production cells by its Verifix code — «Большая мойка 1 смена
 * 0028» is cell 0028 — and that trailing number is the only link between IT's
 * ticket register and our own cell list. This tab is that link made readable:
 * one row per code the register carries, counted with exactly the expressions
 * the ticket table and the KPI strip use (the backend computes them once, in
 * routers/arc._by_cell).
 *
 * Three rules the layout is built on:
 *   • A code the cell registry has never heard of is still a ROW. The register
 *     is IT's and the cell list is ours; a code the two disagree about is a
 *     fact worth seeing, not a row to hide.
 *   • The tickets whose division names NO cell get their own row, last and
 *     labelled. Folding them away would make a partial answer read as a
 *     complete one.
 *   • The cell's CODE is a `CellLink` (→ /cells/:id) and the ROW opens the
 *     register filtered to that cell. CellLink stops propagation, so the two
 *     destinations never fight. The workshop name rides on the link's title
 *     rather than a column of its own: the code is what the ARC division
 *     names, and it is what the reader matches against the register.
 */

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const CELL_LANGS = ["ru", "uz", "uz_cyrl", "en"];

// The registry's workshop name in the viewer's language, Russian-first after
// that — the platform-wide fallback, because Russian is the column the plant
// actually fills in.
export const cellLabel = (c, lang) => {
  if (c) for (const l of [lang, ...CELL_LANGS]) if (c[l]) return c[l];
  return "";
};

const num = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));
const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const hrs = (v) => (v == null ? "—" : Number(v).toFixed(1));

const dFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "2-digit",
});
const fmtDay = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(+d) ? "—" : dFmt.format(d);
};

// A count that is zero is grey: on a hundred-row table, a column of coloured
// zeroes reads as a hundred problems.
const Count = ({ value, color }) => (
  <span className="tabular-nums" style={{ color: value ? color : "var(--text-4)" }}>
    {num(value)}
  </span>
);

export default function ArcByCell({ data, loading, lang, t, tl, onPick }) {
  const [sort, setSort] = usePersistentState("arc_cell_sort", { key: "total", dir: "desc" });
  const onSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const uncoded = data?.uncoded || null;
  // The leader's name is DB text, so it rides through the transliterator like
  // every other name on the platform — the filter that narrows by this column
  // spells the same person the same way.
  const leadName = (r) => (r.cell?.leader ? (tl ? tl(r.cell.leader) : r.cell.leader) : "");

  // Sorted here rather than on the server: the whole set is a hundred-odd rows,
  // so re-sorting is instant and costs no round trip. The «no cell» row is NOT
  // part of it — it is pinned last, because it answers a different question.
  const rows = useMemo(() => {
    const list = [...(data?.rows || [])];
    const dir = sort.dir === "asc" ? 1 : -1;
    const val = (r) => {
      switch (sort.key) {
        case "cell":     return r.code || "";
        case "leader":   return leadName(r).toLowerCase();
        case "last":     return r.last_created ? new Date(r.last_created).getTime() : 0;
        case "on_time":  return r.on_time_pct;
        case "median":   return r.median_hours;
        default:         return r[sort.key];
      }
    };
    return list.sort((a, b) => {
      const x = val(a), y = val(b);
      // A cell with no median (nothing closed yet) sorts last in both
      // directions — «unknown» is not «fastest».
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === "string") return dir * x.localeCompare(y);
      return dir * (x - y);
    });
  }, [data?.rows, sort, lang, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLS = [
    { key: "cell",     label: t("arc.cCell"),     icon: Boxes },
    { key: "leader",   label: t("arc.cLeader"),   icon: Users },
    { key: "total",    label: t("arc.cTotal"),    icon: ClipboardList, align: "right" },
    { key: "open",     label: t("arc.cOpen"),     icon: Hourglass,     align: "right" },
    { key: "overdue",  label: t("arc.cOverdue"),  icon: Siren,         align: "right" },
    { key: "done",     label: t("arc.cDone"),     icon: CheckCircle2,  align: "right" },
    { key: "on_time",  label: t("arc.cOnTime"),   icon: ShieldCheck,   align: "right", hint: t("arc.cOnTimeHint") },
    { key: "median",   label: t("arc.cMedian"),   icon: Timer,         align: "right", hint: t("arc.cMedianHint") },
    { key: "last",     label: t("arc.cLast"),     icon: CalendarClock, align: "right" },
  ];

  // The cell's identity cell: the four digits the ARC division names, pressable
  // into /cells/:id. The workshop name is the link's tooltip — never a dead
  // link (CellLink renders inert text without an id), never a blank.
  const nameCell = (r) => {
    const name = cellLabel(r.cell, lang);
    return (
      <span className="inline-flex items-center gap-2 min-w-0">
        <CellLink id={r.cell?.id} title={name ? `${r.code} · ${name}` : r.code}>
          <span className="tabular-nums">{r.code}</span>
        </CellLink>
        {!r.cell && (
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
            style={{ background: hexA(C_GREY, 0.14), color: "var(--text-3)", border: `1px dashed ${hexA(C_GREY, 0.45)}` }}
            title={t("arc.cUnknownHint")}
          >
            <Link2Off size={10} />{t("arc.cUnknown")}
          </span>
        )}
      </span>
    );
  };

  const bodyCells = (r) => (
    <>
      <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{leadName(r) || "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{num(r.total)}</td>
      <td className="px-3 py-2 text-right"><Count value={r.open} color={C_DOING} /></td>
      <td className="px-3 py-2 text-right"><Count value={r.overdue} color={C_OVERDUE} /></td>
      <td className="px-3 py-2 text-right"><Count value={r.done} color={C_DONE} /></td>
      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}
        title={r.on_time_pct == null ? t("arc.cOnTimeNone") : `${r.closed_with_due} · ${t("arc.cOnTimeHint")}`}>
        {pct(r.on_time_pct)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{hrs(r.median_hours)}</td>
      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>{fmtDay(r.last_created)}</td>
    </>
  );

  // Cards on phones — the same facts, the same order, no horizontal scroll.
  const card = (r, key, label, tone) => (
    <div key={key} onClick={() => onPick?.(key)}
      className="rounded-xl p-3 flex flex-col gap-2 cursor-pointer"
      style={{ ...cardStyle, borderLeft: `3px solid ${tone}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold min-w-0 truncate" style={{ color: "var(--text-1)" }}>{label}</span>
        <span className="text-sm font-semibold tabular-nums flex-shrink-0" style={{ color: "var(--text-1)" }}>{num(r.total)}</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-[11px]">
        <span className="inline-flex items-center gap-1"><Hourglass size={11} style={{ color: C_DOING }} /><Count value={r.open} color={C_DOING} /></span>
        <span className="inline-flex items-center gap-1"><Siren size={11} style={{ color: C_OVERDUE }} /><Count value={r.overdue} color={C_OVERDUE} /></span>
        <span className="inline-flex items-center gap-1"><CheckCircle2 size={11} style={{ color: C_DONE }} /><Count value={r.done} color={C_DONE} /></span>
        <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}><ShieldCheck size={11} />{pct(r.on_time_pct)}</span>
        <span className="inline-flex items-center gap-1" style={{ color: "var(--text-3)" }}><Timer size={11} />{hrs(r.median_hours)}</span>
      </div>
    </div>
  );

  const mobile = (
    <>
      {loading && Array.from({ length: 5 }).map((_, i) => (
        <div key={`sk-${i}`} className="rounded-xl p-3 space-y-2" style={cardStyle}>
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      ))}
      {!loading && rows.map((r) => card(r, r.code,
        r.cell ? r.code : `${r.code} · ${t("arc.cUnknown")}`,
        r.overdue ? C_OVERDUE : C_GREY))}
      {!loading && uncoded && card(uncoded, "none", t("arc.cNoCell"), C_GREY)}
      {!loading && !rows.length && !uncoded && (
        <div className="rounded-xl px-3 py-8 text-center text-xs" style={{ ...cardStyle, color: "var(--text-4)" }}>
          {t("arc.noMatch")}
        </div>
      )}
    </>
  );

  if (!loading && !rows.length && !uncoded) {
    return (
      <div className="rounded-2xl" style={cardStyle}>
        <EmptyState icon={Boxes} height="h-48" showUploadLink={false}
          title={t("arc.cEmptyTitle")} message={t("arc.cEmptyNote")} />
      </div>
    );
  }

  return (
    <>
      {/* The rule, said out loud. A reader who does not know WHY «Блок Б» is
          missing from this table cannot tell a gap from a bug. */}
      <p className="text-[11px] mb-2 inline-flex items-start gap-1.5" style={{ color: "var(--text-3)" }}>
        <HelpCircle size={12} className="flex-shrink-0 mt-[1px]" style={{ color: "var(--brand-text)" }} />
        <span>{t("arc.cRule")}</span>
      </p>

      <TableCard
        icon={Boxes}
        title={t("arc.cTitle")}
        wrap
        minWidth={880}
        mobile={mobile}
        mobileCards
        right={
          <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
            {String(t("arc.cCounts"))
              .replace("{n}", (data?.matched ?? 0).toLocaleString("ru-RU"))
              .replace("{u}", (data?.unmatched ?? 0).toLocaleString("ru-RU"))}
          </span>
        }
      >
        <thead>
          <tr>
            {COLS.map((c) => (
              <Th key={c.key} icon={c.icon} label={c.label} k={c.key} hint={c.hint}
                sort={sort} onSort={onSort} align={c.align} />
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={`sk-${i}`}>
              {COLS.map((c) => (
                <td key={c.key} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
              ))}
            </tr>
          ))}
          {!loading && rows.map((r) => (
            <tr key={r.code} className="align-top cursor-pointer" onClick={() => onPick?.(r.code)}>
              <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{nameCell(r)}</td>
              {bodyCells(r)}
            </tr>
          ))}
          {/* Pinned last: the tickets this rule cannot place. Never folded away. */}
          {!loading && uncoded && (
            <tr className="align-top cursor-pointer" onClick={() => onPick?.("none")}
              style={{ background: "var(--bg-inner)" }}>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
                  <Link2Off size={12} />
                  <span className="font-medium">{t("arc.cNoCell")}</span>
                </span>
              </td>
              {bodyCells(uncoded)}
            </tr>
          )}
        </tbody>
      </TableCard>
    </>
  );
}
