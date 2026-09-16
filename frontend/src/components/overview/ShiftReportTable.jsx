// «Smena hisoboti» — Overview, under the KPI cards. One row per brigadir of the
// viewer's shift, five columns, and no figure computed here: every value comes
// from GET /api/shift-report, which reads each one through the page that owns it
// (backend/app/services/shift_report.py names them). This file only paints.
//
// Rules it keeps, so nobody has to rediscover them:
// - The period picker beside it does NOT reach it. Each column has its own fixed
//   window and prints it — with the date — in its own header.
// - A figure the platform cannot state is «—» with its REASON (an icon, and the
//   words under the table), never a 0 that would read as an idle or failing unit.
// - It is a HEATMAP (the operator's call, 2026-09-16): the whole cell carries
//   its band's colour, so each column reads as one lane down the page. Five
//   short values right-aligned across a full-width table left the board mostly
//   empty space, and that emptiness was the first thing anybody saw. The tints
//   are FLAT band colours, never a gradient — these are verdicts, not
//   intensities — and the figures sit centred in the fill, because the colour
//   does the comparing now and centred digits cost nothing. Every row is ONE
//   line high and carries ONE figure per cell, so nothing beside the value can
//   double the board's height or compete with it.
// - The name column stays uncoloured: it is the rail the eye returns to, and it
//   is what keeps the table from becoming one sheet of colour. A BLANK cell
//   stays uncoloured too — a missing figure should read as a hole in a coloured
//   field, which is exactly what it is.
// - Colour is never the only signal: every cell prints its own figure, and the
//   bands are printed under the table in the very tints the cells wear — a
//   threshold nobody can read is a verdict nobody can check.
// - It stays a TABLE on a phone. The rows are read against each other, which
//   cards would take away; the headers shorten and a blank shows its icon alone.
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
  LOAD_BANDS, COMPL_BANDS, RESOLVED_BANDS,
  loadTone, vypTone, resolvedTone, toneFill, toneTint,
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

// A band the way the legend prints it: ≥90%  80–89%  <80%.
const pctBand = ({ ok, warn }) => [`≥${ok}%`, `${warn}–${ok - 1}%`, `<${warn}%`];

// A tone only where there is a figure to judge — a blank is never coloured.
const cellTone = (cell, toneFn) =>
  (cell && !cell.reason && isNum(cell.value) ? toneFn(cell.value) : null);

// Open concerns carry NO traffic light, and that is deliberate. Nothing on this
// platform defines how many open concerns is «bad»: real counts run from 6 to
// 105, so the 0 / 1–2 / ≥3 band this shipped with painted every cell red, and a
// column that is red everywhere carries no information at all. It is a
// MAGNITUDE, so it gets the platform's value-intensity ramp — brand gold, the
// «Toifalar bo'yicha» matrix's own easing — scaled to the largest count on
// screen, with the legend saying so. Red here would be a verdict nobody has
// defined, which is the same reason «Xarajat» refuses one.
// The ramp does not start at nothing: beside three SOLID columns a 6% gold
// would read as an empty cell, and «a few» is not «none» — 0 is the only count
// this column leaves unfilled. Eased, so the long tail of small backlogs still
// separates (the matrix's own exponent).
const RAMP_LO = 0.14, RAMP_HI = 0.92;
const rampAlpha = (k) => RAMP_LO + k * (RAMP_HI - RAMP_LO);
const RAMP = [0, 0.2, 0.4, 0.6, 0.8, 1].map(rampAlpha);
function concernCell(n, max) {
  if (!n || !max) return undefined;
  const a = rampAlpha(Math.pow(Math.min(n / max, 1), 0.62));
  return {
    background: `rgba(var(--brand-rgb), ${a.toFixed(3)})`,
    // Gold at full strength needs dark ink in BOTH themes, so this one literal
    // is theme-independent by construction — the matrix carries it for the
    // same reason.
    color: a > 0.55 ? "#1a1508" : "var(--text-1)",
  };
}

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

// A blank is one line: the dash and its reason's icon. The words are under the
// table, for every width — a second line in the cell is what made most rows
// twice as tall as they needed to be.
function Blank({ reason }) {
  const Icon = REASON_ICON[reason];
  return (
    <span className="inline-flex items-center justify-center gap-1" style={{ color: "var(--text-4)" }}>
      <span aria-hidden="true">—</span>
      {Icon && <Icon size={11} aria-hidden="true" className="flex-shrink-0" />}
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
    <span className={`flex flex-col leading-tight whitespace-normal ${left ? "items-start text-left" : "items-center text-center"}`}>
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
const TH_FIG = "align-bottom sm:w-[17%] max-sm:px-1 max-sm:[&>span]:flex-col "
  + "max-sm:[&>span]:items-center max-sm:[&>span]:gap-0.5 max-sm:[&_.lucide-chevrons-up-down]:hidden";
// The cell IS the swatch, so its padding is the fill's height: one line of
// figures, centred both ways.
const TD_FIG = "px-1 sm:px-2 py-2.5 text-center align-middle tabular-nums leading-tight";
const TD_INK = "text-[11px] sm:text-xs";

// The name placeholders cycle a fixed list — Math.random() re-rolls on every
// render and makes the skeleton twitch (the SkeletonMatrix rule).
const SK_NAME = ["w-3/4", "w-1/2", "w-2/3", "w-3/5", "w-4/5", "w-7/12"];

// `pageReady` is what keeps this board off the page's critical path. One
// request can run the «Zagruzka fayli» engine twice per configured unit, and
// on a single-worker backend that competes with the very queries the KPI cards
// and the trend are waiting on — so the whole page read as «still loading»
// while the slowest block on it worked. Held until the page's own data is in,
// the board fills in UNDER a page that is already readable. The default is
// true: a caller that does not say otherwise gets the old behaviour.
export default function ShiftReportTable({ pageReady = true }) {
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
    enabled: ready && pageReady,
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
  // The ramp's domain is the board on screen, which is what the legend states.
  const concernMax = rows.reduce((m, r) => Math.max(m, r.concerns?.open ?? 0), 0);

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

  // One figure cell: the fill is the verdict, the figure is printed on it, and
  // a blank keeps the card's own background.
  const figCell = (cell, toneFn, render, extraTitle) => {
    const tone = cellTone(cell, toneFn);
    const blank = !!cell?.reason;
    const title = blank ? t(`overview.sr.reason.${cell.reason}`) : extraTitle;
    return (
      <td
        className={`${TD_FIG} ${TD_INK} ${tone === "bad" ? "font-bold" : "font-semibold"}`}
        style={toneFill(tone)}
        title={title}
      >
        {blank ? <Blank reason={cell.reason} />
          : isNum(cell?.value) ? render(cell)
          : <span style={{ color: "var(--text-4)" }}>—</span>}
      </td>
    );
  };

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
    // The loaded cell is a filled lane edge to edge, so the placeholder is one
    // too — a small centred block would promise a board that no longer exists.
    body = Array.from({ length: 6 }).map((_, i) => (
      <tr key={`sk-${i}`}>
        <td className="px-2 sm:px-3 py-2.5">
          <SkeletonBlock className={`h-3.5 ${SK_NAME[i % SK_NAME.length]}`} />
        </td>
        {[0, 1, 2, 3].map((j) => (
          <td key={j} className="px-1 py-1.5 align-middle">
            <SkeletonBlock className="h-6 w-full rounded-md" />
          </td>
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
        {g.rows.map((r) => {
          const open_ = r.concerns?.open ?? 0;
          return (
            <tr
              key={r.manager_id}
              tabIndex={0}
              onClick={() => open(r)}
              onKeyDown={(e) => onRowKey(e, r)}
              className="group cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
            >
              {/* The fills cover the row's own hover tint, so the rail carries
                  the mark instead: a brand bar down the name cell. */}
              <td className="px-2 sm:px-3 py-2 align-middle group-hover:shadow-[inset_3px_0_0_0_var(--brand)]">
                <span
                  className="block whitespace-normal sm:whitespace-nowrap text-[11.5px] sm:text-xs font-medium leading-snug"
                  style={{ color: "var(--text-1)" }}
                >
                  {tl(r.name || "")}
                </span>
              </td>
              {figCell(r.load, loadTone, (c) => (
                <>
                  {pctText(c.value)}
                  {c.partial && <span className="ml-px font-normal opacity-70">*</span>}
                </>
              ))}
              {figCell(r.compl, vypTone, (c) => pctText(c.value))}
              {/* The percentage is the figure. «done/actionable» was printed
                  beside it and is not (the operator's call, 2026-09-16) — it
                  stays on the cell as its tooltip, where it costs no width. */}
              {figCell(r.quality, resolvedTone, (c) => pctText(c.value),
                r.quality && !r.quality.reason && isNum(r.quality.value)
                  ? `${r.quality.done}/${r.quality.actionable}` : undefined)}
              <td
                className={`${TD_FIG} ${TD_INK} font-semibold`}
                style={concernCell(open_, concernMax)}
              >
                {open_ === 0 ? <span style={{ color: "var(--text-4)" }}>0</span> : open_}
              </td>
            </tr>
          );
        })}
      </Fragment>
    ));
  }

  const right = rows.length > 0 && (
    <div className="flex items-center gap-2 flex-wrap justify-end">
      {missing > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
          style={{ color: "var(--status-warn)", background: toneTint("warn") }}
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

  // The legend wears the table's own tints, so a band and the cells it judges
  // are read in one vocabulary.
  const bandRows = [
    { key: "load", full: t("production.kpiAvgLoad"), short: t("overview.sr.colLoadShort"), bands: pctBand(LOAD_BANDS) },
    { key: "compl", full: t("production.kpiVyp"), short: t("overview.sr.colComplShort"), bands: pctBand(COMPL_BANDS) },
    { key: "quality", full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"), bands: pctBand(RESOLVED_BANDS) },
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
            {[
              ["load", t("overview.sr.hintLoad"), {
                full: t("production.kpiAvgLoad"), short: t("overview.sr.colLoadShort"),
                cap: dated("overview.sr.today", single?.today),
              }],
              ["compl", t("overview.sr.hintCompl"), {
                full: t("production.kpiVyp"), short: t("overview.sr.colComplShort"),
                cap: dated("overview.sr.yesterday", single?.yesterday),
              }],
              ["quality", t("overview.sr.hintQuality"), {
                full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"),
                cap: t("overview.sr.capQuality"), capShort: t("overview.sr.capQualityShort"),
              }],
              ["concerns", t("overview.sr.hintConcerns"), {
                full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"),
                cap: t("overview.sr.capConcerns"), capShort: t("overview.sr.capConcernsShort"),
              }],
            ].map(([k, hint, label]) => (
              <Th
                key={k}
                k={k}
                sort={sort}
                onSort={onSort}
                align="center"
                cls={TH_FIG}
                hint={hint}
                label={<HeadLabel active={sort?.key === k} {...label} />}
              />
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </TableCard>

      {rows.length > 0 && (
        <div className="mt-2 px-1 flex flex-col gap-1.5 text-[10.5px] leading-snug" style={{ color: "var(--text-3)" }}>
          <div className="grid grid-cols-1 gap-y-1 sm:flex sm:flex-wrap sm:gap-x-6">
            {bandRows.map((b) => (
              <span key={b.key} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span>
                  <span className="sm:hidden">{b.short}</span>
                  <span className="max-sm:hidden">{b.full}</span>
                </span>
                {["ok", "warn", "bad"].map((tone, i) => (
                  <span
                    key={tone}
                    className="rounded px-1 py-px font-semibold tabular-nums"
                    style={toneFill(tone)}
                  >
                    {b.bands[i]}
                  </span>
                ))}
              </span>
            ))}
            {/* The concerns column is a magnitude, so its legend is the ramp and
                the number it tops out at, not a threshold. */}
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span>
                <span className="sm:hidden">{t("overview.sr.colConcernsShort")}</span>
                <span className="max-sm:hidden">{t("overview.sr.colConcerns")}</span>
              </span>
              <span className="inline-flex h-2.5 rounded overflow-hidden border" style={{ borderColor: "var(--border)" }}>
                {RAMP.map((a) => (
                  <i key={a} className="block w-3.5" style={{ background: `rgba(var(--brand-rgb), ${a})` }} />
                ))}
              </span>
              <span>{fill(t("overview.sr.concernRamp"), { n: concernMax })}</span>
            </span>
          </div>
          {anyPartial && <div>* — {t("overview.sr.partial")}</div>}
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
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
