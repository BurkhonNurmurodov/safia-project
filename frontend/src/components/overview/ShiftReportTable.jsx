// «Smena hisoboti» — the first block on Overview. One row per brigadir of the
// viewer's shift, five columns, and no figure computed here: every value comes
// from GET /api/shift-report, which reads each one through the page that owns it
// (backend/app/services/shift_report.py names them). This file only paints.
//
// Rules it keeps, so nobody has to rediscover them:
// - The period picker beside it does NOT reach it. Each column has its own fixed
//   window and prints it — with the date — in its own header.
// - A figure the platform cannot state is «—» with its REASON (an icon, plus the
//   words from `sm` up), never a 0 that would read as an idle or failing unit.
// - Colour is the traffic light from utils/statusBands.js — the bands the
//   «Zagruzka fayli» page paints the same figures with — and the bands are
//   printed under the table: a threshold nobody can read is a verdict nobody
//   can check.
// - It stays a TABLE on a phone. The rows are read against each other, which
//   cards would take away; headers shorten, a blank shows its icon, and the
//   icon's words move into the legend.
import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileClock, FileX, Inbox, ListChecks, PackageX, UserX } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { useFilters } from "../../context/FilterContext";
import { useFactory, useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import {
  AMBER, TONE_HEX, LOAD_BANDS, COMPL_BANDS, RESOLVED_BANDS, CONCERN_BANDS,
  loadTone, vypTone, resolvedTone, concernsTone,
} from "../../utils/statusBands";
import api from "../../utils/api";

const REASON_ICON = {
  not_configured: PackageX,
  no_people: UserX,
  no_plan: FileX,
  no_fact: FileClock,
  no_records: Inbox,
};

const SORT_VALUE = {
  load: (r) => r.load?.value,
  compl: (r) => r.compl?.value,
  quality: (r) => r.quality?.value,
  concerns: (r) => r.concerns?.open,
};
// The first press on a column puts its WORST rows on top: the lowest
// percentage, the most open concerns. A third press returns to name order.
const FIRST_DIR = { name: "asc", load: "asc", compl: "asc", quality: "asc", concerns: "desc" };
const DEFAULT_SORT = { key: "name", dir: "asc" };
const COLS = 5;

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const pctText = (v) => `${Math.round(v * 100)}%`;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const fill = (s, vars) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

// A band the way the legend prints it: ≥90%  80–89%  <80%  ·  0  1–2  ≥3.
const pctBand = ({ ok, warn }) => [`≥${ok}%`, `${warn}–${ok - 1}%`, `<${warn}%`];
const countBand = ({ ok, warn }) => [`${ok}`, `${ok + 1}–${warn}`, `≥${warn + 1}`];

function sortRows(rows, sort, nameOf) {
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  const get = SORT_VALUE[sort?.key];
  const sign = sort?.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (!get) return sign * byName(a, b);
    const va = get(a), vb = get(b);
    if (!isNum(va) || !isNum(vb)) {
      // Blanks sink to the bottom whichever way the column is sorted.
      return !isNum(va) && !isNum(vb) ? byName(a, b) : isNum(va) ? -1 : 1;
    }
    return sign * (va - vb) || byName(a, b);
  });
}

function Pill({ tone, children }) {
  return (
    <span
      className={`inline-block rounded-md px-1 sm:px-1.5 py-0.5 text-[11px] sm:text-xs leading-tight tabular-nums ${
        tone === "bad" ? "font-bold" : "font-semibold"}`}
      style={tone
        ? { color: `var(--status-${tone})`, background: `${TONE_HEX[tone]}24` }
        : { color: "var(--text-2)" }}
    >
      {children}
    </span>
  );
}

function Blank({ reason, label }) {
  const Icon = REASON_ICON[reason];
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span aria-hidden="true" style={{ color: "var(--text-4)" }}>—</span>
      <span className="inline-flex items-center gap-1 mt-0.5 text-[10px]" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={11} aria-hidden="true" className="flex-shrink-0" />}
        <span className="max-sm:sr-only">{label}</span>
      </span>
    </span>
  );
}

// Header content: the column's name over the window it covers. Below `sm` five
// columns share ~358px, so both lines switch to their short forms.
function HeadLabel({ full, short, cap, capShort, left = false, active = false }) {
  const swap = (a, b) => (
    <>
      <span className="sm:hidden">{b ?? a}</span>
      <span className="max-sm:hidden">{a}</span>
    </>
  );
  return (
    <span className={`flex flex-col leading-tight whitespace-normal ${left ? "items-start text-left" : "items-end text-right"}`}>
      <span className="text-[10.5px] sm:text-xs" style={active ? { color: "var(--brand-text)" } : undefined}>
        {swap(full, short)}
      </span>
      {cap && (
        <span className="mt-0.5 text-[9.5px] sm:text-[10.5px] font-normal" style={{ color: "var(--text-3)" }}>
          {swap(cap, capShort)}
        </span>
      )}
    </span>
  );
}

// Below `sm` a figure header stacks its sort chevron under the label and shows
// it only on the column that is sorted — a chevron beside every label is what
// would push five columns past a phone's width.
const TH_FIG = "align-bottom sm:w-[17%] max-sm:px-1.5 max-sm:[&>span]:flex-col "
  + "max-sm:[&>span]:items-end max-sm:[&>span]:gap-0.5 max-sm:[&_.lucide-chevrons-up-down]:hidden";
const TD_FIG = "px-1.5 sm:px-3 py-2 text-right align-middle";

export default function ShiftReportTable() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const navigate = useNavigate();
  const { shift, brigadirIds, ready } = useFilters();
  const { factory, locked } = useFactory();
  const [sort, setSort] = usePersistentState("overview_sr_sort", DEFAULT_SORT);

  // The toolbar's scope only — never its dates.
  const base = useMemo(() => ({
    ...(shift ? { shift } : {}),
    ...(brigadirIds?.length ? { manager_id: brigadirIds } : {}),
  }), [shift, brigadirIds]);
  const params = useFactoryParams(base);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["shift-report", params],
    queryFn: () => api.get("/api/shift-report", { params }).then((r) => r.data),
    enabled: ready,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const groups = useMemo(() => {
    const nameOf = (r) => tl(r.name || "");
    return (data?.shifts ?? []).map((g) => ({ ...g, rows: sortRows(g.rows ?? [], sort, nameOf) }));
  }, [data, sort, tl]);

  const rows = groups.flatMap((g) => g.rows);
  const single = groups.length === 1 ? groups[0] : null;
  const multi = groups.length > 1;
  const missing = rows.filter((r) => r.load?.reason || r.compl?.reason).length;
  const anyPartial = rows.some((r) => r.load?.partial && !r.load?.reason);
  const reasons = [...new Set(rows.flatMap((r) => [r.load?.reason, r.compl?.reason, r.quality?.reason]))]
    .filter((k) => REASON_ICON[k]);

  const shiftName = (s) => (s === 1 || s === 2
    ? fill(t("overview.sr.subShift"), { n: s })
    : t("overview.sr.noShift"));
  const subtitle = single ? shiftName(single.shift) : multi ? t("overview.sr.subAll") : undefined;
  // One shift on screen: the header names the date. Two: each group row does,
  // because the two shifts' «today» can be different dates.
  const dated = (whenKey, iso) => (single && iso
    ? fill(t("overview.sr.capDated"), { when: t(whenKey), date: ddmm(iso) })
    : t(whenKey));

  const onSort = (k) => setSort((s) => {
    const first = FIRST_DIR[k] || "asc";
    if (s?.key !== k) return { key: k, dir: first };
    if (s.dir === first) return { key: k, dir: first === "asc" ? "desc" : "asc" };
    return DEFAULT_SORT;
  });

  const open = (r) => navigate(`/brigadir/${r.manager_id}`);
  const onRowKey = (e, r) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(r);
    }
  };

  const figure = (cell, render) => {
    if (cell?.reason) return <Blank reason={cell.reason} label={t(`overview.sr.reason.${cell.reason}`)} />;
    if (!isNum(cell?.value)) return <span style={{ color: "var(--text-4)" }}>—</span>;
    return render(cell);
  };

  const head = (k, props) => (
    <Th
      k={k}
      sort={sort}
      onSort={onSort}
      align="right"
      cls={TH_FIG}
      {...props}
      label={<HeadLabel active={sort?.key === k} {...props.label} />}
    />
  );

  let body;
  // A failed refetch keeps the rows already on screen; only a board with
  // nothing to show gives its space to the error.
  if (isError && !data) {
    body = (
      <tr>
        <td colSpan={COLS} className="px-4 py-6 text-center whitespace-normal">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-2)" }}>{t("overview.sr.error")}</span>
            <Button variant="secondary" size="sm" onClick={() => refetch()} loading={isFetching}>
              {t("common.retry")}
            </Button>
          </div>
        </td>
      </tr>
    );
  } else if (isLoading || !data) {
    body = Array.from({ length: 6 }).map((_, i) => (
      <tr key={`sk-${i}`}>
        <td className="px-2 sm:px-3 py-2.5"><SkeletonBlock className="h-3.5 w-20 sm:w-40" /></td>
        {[0, 1, 2, 3].map((j) => (
          <td key={j} className={TD_FIG}><SkeletonBlock className="h-4 w-9 ml-auto" /></td>
        ))}
      </tr>
    ));
  } else if (!rows.length) {
    const filtered = !!shift || !!brigadirIds?.length || (factory != null && !locked);
    body = (
      <tr>
        <td colSpan={COLS} className="px-4 py-6 text-center text-xs whitespace-normal" style={{ color: "var(--text-3)" }}>
          {data.note === "no_shift" ? t("overview.sr.emptyNoShift")
            : filtered ? t("overview.sr.emptyFiltered") : t("overview.sr.empty")}
        </td>
      </tr>
    );
  } else {
    body = groups.map((g) => (
      <Fragment key={`g-${g.shift ?? "none"}`}>
        {multi && (
          <tr>
            <td
              colSpan={COLS}
              className="px-2 sm:px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider whitespace-normal"
              style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}
            >
              {fill(t("overview.sr.group"), {
                shift: shiftName(g.shift), today: ddmm(g.today), yesterday: ddmm(g.yesterday),
              })}
            </td>
          </tr>
        )}
        {g.rows.map((r) => (
          <tr
            key={r.manager_id}
            tabIndex={0}
            onClick={() => open(r)}
            onKeyDown={(e) => onRowKey(e, r)}
            className="cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
          >
            <td className="px-2 sm:px-3 py-2 align-middle">
              <span
                className="block whitespace-normal sm:whitespace-nowrap text-[11.5px] sm:text-xs font-medium leading-snug"
                style={{ color: "var(--text-1)" }}
              >
                {tl(r.name || "")}
              </span>
            </td>
            <td className={TD_FIG}>
              {figure(r.load, (c) => (
                <Pill tone={loadTone(c.value)}>
                  {pctText(c.value)}
                  {c.partial && <span className="ml-px font-normal" style={{ color: "var(--text-3)" }}>*</span>}
                </Pill>
              ))}
            </td>
            <td className={TD_FIG}>
              {figure(r.compl, (c) => <Pill tone={vypTone(c.value)}>{pctText(c.value)}</Pill>)}
            </td>
            <td className={TD_FIG}>
              {figure(r.quality, (c) => (
                <span className="inline-flex flex-col items-end leading-tight">
                  <Pill tone={resolvedTone(c.value)}>{pctText(c.value)}</Pill>
                  <span className="mt-0.5 text-[10px] tabular-nums" style={{ color: "var(--text-3)" }}>
                    {c.done}/{c.actionable}
                  </span>
                </span>
              ))}
            </td>
            <td className={TD_FIG}>
              <Pill tone={concernsTone(r.concerns?.open ?? 0)}>{r.concerns?.open ?? 0}</Pill>
            </td>
          </tr>
        ))}
      </Fragment>
    ));
  }

  const right = rows.length > 0 && (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {missing > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
          style={{ color: "var(--status-warn)", background: `${AMBER}24` }}
        >
          <AlertTriangle size={11} aria-hidden="true" />
          {fill(t("overview.sr.incomplete"), { n: missing })}
        </span>
      )}
      <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
        {fill(t("overview.sr.rows"), { n: rows.length })}
      </span>
    </div>
  );

  const bandRows = [
    { key: "load", full: t("production.kpiAvgLoad"), short: t("overview.sr.colLoadShort"), bands: pctBand(LOAD_BANDS) },
    { key: "compl", full: t("production.kpiVyp"), short: t("overview.sr.colComplShort"), bands: pctBand(COMPL_BANDS) },
    { key: "quality", full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"), bands: pctBand(RESOLVED_BANDS) },
    { key: "concerns", full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"), bands: countBand(CONCERN_BANDS) },
  ];

  return (
    <section className="mb-6" aria-label={t("overview.sr.title")}>
      <TableCard
        icon={ListChecks}
        title={t("overview.sr.title")}
        subtitle={subtitle}
        right={right}
        maxHeight="none"
      >
        <thead>
          <tr>
            <Th
              k="name"
              sort={sort}
              onSort={onSort}
              cls="align-bottom sm:w-[32%] max-sm:px-2 max-sm:[&_.lucide-chevrons-up-down]:hidden"
              label={<HeadLabel left active={sort?.key === "name"} full={t("overview.sr.colName")} />}
            />
            {head("load", {
              hint: t("overview.sr.hintLoad"),
              label: {
                full: t("production.kpiAvgLoad"), short: t("overview.sr.colLoadShort"),
                cap: dated("overview.sr.today", single?.today),
              },
            })}
            {head("compl", {
              hint: t("overview.sr.hintCompl"),
              label: {
                full: t("production.kpiVyp"), short: t("overview.sr.colComplShort"),
                cap: dated("overview.sr.yesterday", single?.yesterday),
              },
            })}
            {head("quality", {
              hint: t("overview.sr.hintQuality"),
              label: {
                full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"),
                cap: t("overview.sr.capQuality"), capShort: t("overview.sr.capQualityShort"),
              },
            })}
            {head("concerns", {
              hint: t("overview.sr.hintConcerns"),
              label: {
                full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"),
                cap: t("overview.sr.capConcerns"), capShort: t("overview.sr.capConcernsShort"),
              },
            })}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </TableCard>

      {rows.length > 0 && (
        <div className="mt-2 px-1 flex flex-col gap-1.5 text-[10.5px] leading-snug" style={{ color: "var(--text-3)" }}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-6">
            {bandRows.map((b) => (
              <span key={b.key} className="inline-flex flex-wrap items-baseline gap-x-1.5">
                <span>
                  <span className="sm:hidden">{b.short}</span>
                  <span className="max-sm:hidden">{b.full}</span>
                </span>
                {["ok", "warn", "bad"].map((tone, i) => (
                  <span key={tone} className="font-semibold tabular-nums" style={{ color: `var(--status-${tone})` }}>
                    {b.bands[i]}
                  </span>
                ))}
              </span>
            ))}
          </div>
          {anyPartial && <div>* — {t("overview.sr.partial")}</div>}
          {reasons.length > 0 && (
            <div className="sm:hidden flex flex-wrap gap-x-3 gap-y-1">
              {reasons.map((k) => {
                const Icon = REASON_ICON[k];
                return (
                  <span key={k} className="inline-flex items-center gap-1">
                    <Icon size={11} aria-hidden="true" />
                    {t(`overview.sr.reason.${k}`)}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
