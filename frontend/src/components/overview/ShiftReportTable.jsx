// «Smena hisoboti» — the shift dashboard (pages/ShiftDaily.jsx), under the KPI
// cards. One row per brigadir of the viewer's shift, five columns, and no figure
// computed here: every value comes from GET /api/shift-report, which reads each
// one through the page that owns it (backend/app/services/shift_report.py names
// them). This file only paints.
//
// Rules it keeps, so nobody has to rediscover them:
// - The day stepper beside it does NOT reach it. Each column has its own fixed
//   window and prints it — with the date — in its own header. «Bartaraf etilgan
//   %» covers the CURRENT MONTH (the operator's call, 2026-09-18), and the
//   month it names is the one the SERVER counted (`quality_month` on the
//   payload) — a month derived from the browser's clock is how the header and
//   the figures would come to name two different windows. It also leaves HAIR
//   records out, which is the Quality page's own default reading of the
//   register; the column's hint says so.
// - Its scope is the PAGE's filter bar: the shared plant, and the `shift` the
//   page hands it. A supervisor pick is never read — the page has no such
//   control, so one left standing on another page would narrow the board with
//   nothing on screen saying so.
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
//   double the board's height or compete with it. The cell is the загрузка
//   heatmap's cell — same saturated hues, same auto-contrast ink, same square
//   full-bleed rectangle ruled by a 1px line — because one platform should not
//   have two things that are both «the heatmap».
// - The name column stays uncoloured: it is the rail the eye returns to, and it
//   is what keeps the table from becoming one sheet of colour. A BLANK cell
//   stays uncoloured too — a missing figure should read as a hole in a coloured
//   field, which is exactly what it is.
// - Colour is never the only signal: every cell prints its own figure, and the
//   bands are printed under the table in the very tints the cells wear — a
//   threshold nobody can read is a verdict nobody can check.
// - It stays a TABLE on a phone. The rows are read against each other, which
//   cards would take away; the headers shorten and a blank shows its icon alone.
// - Every cell OPENS WHERE ITS FIGURE COMES FROM, on the scope it was counted
//   over (the operator's directive, 2026-09-30): load → «Zagruzka fayli» on the
//   unit's shift-day, plan fulfilment → the same page on the day before,
//   quality → the brigadir's UNRESOLVED records of the month, open concerns →
//   the brigadir's register at level brigadir, «to do» + «in work», all time.
//   A blank opens where its gap is filled — «Odamlar soni» for no people, the
//   positions for no plan / no fact, the admin catalog upload for a unit with
//   no catalog (admins only; nobody else can fix it). The target page resets
//   itself to exactly that scope and keeps it (utils/scopeLinks.js builds the
//   links, each page's `useUrlScope` reads them). A cell whose page the viewer
//   cannot open is plain, never a dead link; the NAME opens the brigadir's
//   profile, and the row itself no longer does, because a cell now has a
//   destination of its own.
import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle, FileClock, FileX, Inbox, ListChecks, PackageX, SlidersHorizontal, UserX,
} from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import StatusBandsModal from "./StatusBandsModal";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import {
  productionLink, qualityLink, concernsLink, monthSpan, QUALITY_UNRESOLVED, CONCERN_OPEN,
} from "../../utils/scopeLinks";
import { useFactory, useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import useStatusBands from "../../hooks/useStatusBands";
import {
  loadTone, vypTone, resolvedTone, concernsTone, toneFill, toneTint,
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

// Soft hyphens inside a VERY long word (13+ letters — longer than the name
// column holds on a 320px phone; at least four letters kept on each side), so
// it breaks WITH a visible hyphen instead of pushing the fifth column off the
// screen — or breaking silently, which turned «Abdurakhmonova» into
// «Abdurakhmono va…», i.e. «… and …». Shorter words get none: a hyphen is
// honoured greedily, so «Gulchehra» would split even where it fits a line of
// its own. Invisible wherever the word fits (always on sm+, no wrapping there).
const SHY = "\u00AD";
const softHyphenate = (s) => s.replace(/\S{13,}/g, (w) => [...w]
  .map((ch, i, a) => (i >= 4 && a.length - i >= 4 ? SHY + ch : ch)).join(""));
const pctText = (v) => `${Math.round(v * 100)}%`;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const fill = (s, vars) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

// A band the way the legend prints it: ≥90%  80–89%  <80%  ·  ≤5  6–20  ≥21.
const pctBand = ({ ok, warn }) => [`≥${ok}%`, `${warn}–${ok - 1}%`, `<${warn}%`];
const countBand = ({ ok, warn }) => [`≤${ok}`, `${ok + 1}–${warn}`, `≥${warn + 1}`];

// A tone only where there is a figure to judge — a blank is never coloured.
const cellTone = (cell, toneFn) =>
  (cell && !cell.reason && isNum(cell.value) ? toneFn(cell.value) : null);

// Open concerns are judged by the same three colours as the columns beside
// them — one board, one vocabulary (the operator's call, 2026-09-16). What is
// different is the BANDS, not the palette: `statusBands.CONCERN_BANDS` says
// why, and the legend prints the numbers because nobody has ruled on them yet.
// A gold intensity ramp stood here for an afternoon and is not what a reader
// of this board wants: a shade has to be compared against the rest of the
// screen before it means anything, and a verdict should not.

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
      {/* Phones get ONE line per header: the short label is a single word
          (the «%» lives on every figure under it) and the caption is ≥11px —
          «Plan / % / kecha» stacked three lines high and 9.5px captions were
          the two things nobody could read. */}
      <span className="text-[11.5px] max-[359px]:text-[11px] max-sm:whitespace-nowrap sm:text-xs" style={active ? { color: "var(--brand-text)" } : undefined}>
        {swap(full, short)}
      </span>
      {cap && (
        <span className="mt-0.5 text-[11px] max-[359px]:text-[10.5px] max-sm:whitespace-nowrap sm:text-[10.5px] font-normal" style={{ color: "var(--text-3)" }}>
          {swap(cap, capShort)}
        </span>
      )}
    </span>
  );
}

// Below `sm` a figure header stacks its sort chevron under the label and shows
// it only on the column that is sorted — a chevron beside every label is what
// would push five columns past a phone's width.
const TH_FIG = "align-bottom sm:w-[17%] max-sm:px-1 max-[359px]:px-0.5 max-sm:[&>span]:flex-col "
  + "max-sm:[&>span]:items-center max-sm:[&>span]:gap-0.5 max-sm:[&_.lucide-chevrons-up-down]:hidden";
// The cell IS the swatch — square, full-bleed, and ruled by a 1px line of the
// CARD's own colour, which is the загрузка heatmap's cell exactly. Two earlier
// shapes are the mistakes this one answers: painted cells whose gridline was
// `--border` (a 5% white that any fill swallows, so three greens read as one
// block), and rounded tiles floating in a 3px gutter, which read as a row of
// buttons rather than a heatmap. Drawing the rule in the card's colour is what
// makes it show against ANY fill in BOTH themes.
//
// The COLOUR has to be inline and cannot be a class: `DataTable` paints every
// cell's border through `[&_td]:border-[var(--border)]`, a descendant selector
// that outranks any plain utility on the cell itself — a `border-[…]` class
// here compiles, loses, and leaves the grid invisible with nothing to show for
// it. `RULE` is that one declaration and every figure cell carries it.
const TD_FIG = "text-center align-middle tabular-nums "
  + "leading-tight text-xs border";
const RULE = { borderColor: "var(--bg-card)" };
// A linked cell moves its padding onto the link, so the whole tile is the
// target and the row keeps its height. Hover tints with the cell's own INK
// (`currentColor`), which lightens a white-ink fill and darkens a dark-ink
// one, in both themes, with no colour of its own.
const TD_PAD = "px-1 max-[359px]:px-0.5 sm:px-2 py-2.5";
const LINK_CLS = "block w-full outline-none transition-colors "
  + "hover:bg-[color-mix(in_srgb,currentColor_14%,transparent)] "
  + "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]";

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
export default function ShiftReportTable({ shift = null, pageReady = true }) {
  const { t } = useLang();
  const { auth } = useAuth();
  // The bands in force. Calling this is also what tells `utils/statusBands`
  // what an admin has set — the tone helpers below answer from it.
  const bands = useStatusBands();
  const [bandsOpen, setBandsOpen] = useState(false);
  const { tl } = useTranslit();
  const { factory, locked } = useFactory();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const [sort, setSort] = usePersistentState("overview_sr_sort", DEFAULT_SORT);

  // The page's scope only — never its dates.
  const base = useMemo(() => (shift ? { shift } : {}), [shift]);
  const params = useFactoryParams(base);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["shift-report", params],
    queryFn: () => api.get("/api/shift-report", { params }).then((r) => r.data),
    enabled: pageReady,
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
  // «2026-09» → the month's name in the reader's language. Empty until the
  // payload lands, and the caption then says «sifat» alone rather than naming
  // a month nothing has counted yet.
  const qm = Number(String(data?.quality_month || "").slice(5, 7));
  const qMonth = qm >= 1 && qm <= 12 ? t(`cal.m${qm - 1}`) : "";

  const onSort = (k) => setSort((s) => {
    const first = FIRST_DIR[k] || "asc";
    if (s?.key !== k) return { key: k, dir: first };
    if (s.dir === first) return { key: k, dir: first === "asc" ? "desc" : "asc" };
    return DEFAULT_SORT;
  });

  // Where each cell leads — `{ to, page }`, or null where the viewer cannot
  // open the page or there is nothing to open. The rule is in the header note;
  // the URLs are `utils/scopeLinks.js`, so a link and the page reading it share
  // one spelling of every param.
  const isAdmin = auth?.role === "admin";
  const may = (key) => canAccessPage(auth?.role, key, access, capPages, deniedPages);
  const canProd = may("production");
  const canQuality = may("quality");
  const canConcerns = may("concerns");
  const qSpan = monthSpan(data?.quality_month);
  const prodPage = t("nav.production");

  const productionTarget = (cell, r, date) => {
    if (cell?.reason === "not_configured") {
      return isAdmin ? { to: "/admin/upload?tab=production", page: t("admin.tabProduction") } : null;
    }
    if (!canProd) return null;
    const tab = cell?.reason === "no_people" ? "people" : undefined;
    return { to: productionLink({ unit: r.manager_id, date, tab }), page: prodPage };
  };
  const qualityTarget = (r) => (canQuality && qSpan && r.name
    ? {
      to: qualityLink({ brigadir: r.name, from: qSpan.from, to: qSpan.to, status: QUALITY_UNRESOLVED }),
      page: t("nav.quality"),
    }
    : null);
  const concernsTarget = (r) => (canConcerns
    ? {
      to: concernsLink({ unit: r.manager_id, level: "supervisor", status: CONCERN_OPEN }),
      page: t("nav.concerns"),
    }
    : null);

  // One figure cell: the tile is the verdict, the figure is printed on it, and
  // a blank grows no tile at all — a missing figure reads as a hole in a
  // coloured field, which is what it is. With a `target` the whole tile is the
  // link, and its tooltip adds where it leads.
  const figTd = ({ tone, title, target, children }) => {
    const hint = target ? fill(t("overview.sr.goto"), { page: target.page }) : null;
    const fullTitle = [title, hint].filter(Boolean).join("\n") || undefined;
    return (
      <td
        className={`${TD_FIG} ${target ? "p-0" : TD_PAD} ${tone === "bad" ? "font-bold" : "font-semibold"}`}
        style={{ ...toneFill(tone), ...RULE }}
        title={fullTitle}
      >
        {target ? (
          <Link
            to={target.to}
            className={`${LINK_CLS} ${TD_PAD}`}
            aria-label={fullTitle ? fullTitle.replace(/\n/g, ". ") : undefined}
          >
            {children}
          </Link>
        ) : children}
      </td>
    );
  };
  const figCell = (cell, toneFn, render, extraTitle, target) => {
    const blank = !!cell?.reason;
    return figTd({
      tone: cellTone(cell, toneFn),
      title: blank ? t(`overview.sr.reason.${cell.reason}`) : extraTitle,
      target,
      children: blank ? <Blank reason={cell.reason} />
        : isNum(cell?.value) ? render(cell)
        : <span style={{ color: "var(--text-4)" }}>—</span>,
    });
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
          <td key={j} className="p-0 border" style={RULE}>
            <SkeletonBlock className="h-[36px] w-full" style={{ borderRadius: 0 }} />
          </td>
        ))}
      </tr>
    ));
  } else if (!rows.length) {
    const filtered = !!shift || (factory != null && !locked);
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
              className="px-2 sm:px-3 py-1.5 text-[11px] sm:text-[10.5px] font-semibold uppercase tracking-wider whitespace-normal"
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
            <tr key={r.manager_id}>
              {/* The name opens the brigadir's profile. The fills cover a row
                  hover tint, so the rail carries the mark: a brand bar down
                  the name cell. */}
              <td className="p-0 align-middle">
                <Link
                  to={`/brigadir/${r.manager_id}`}
                  className="block px-2 max-[359px]:px-1.5 sm:px-3 py-2 outline-none hover:shadow-[inset_3px_0_0_0_var(--brand)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
                >
                  {/* Below 360px the five columns only fit if a very long
                      surname may break inside the word — the alternative was
                      the «Xavotir» column cut off at the screen's edge — so it
                      breaks at a soft hyphen, visibly (`softHyphenate`). */}
                  <span
                    className="block whitespace-normal sm:whitespace-nowrap text-[11.5px] sm:text-xs font-medium leading-snug"
                    style={{ color: "var(--text-1)" }}
                  >
                    {softHyphenate(tl(r.name || ""))}
                  </span>
                </Link>
              </td>
              {figCell(r.load, loadTone, (c) => (
                <>
                  {pctText(c.value)}
                  {c.partial && <span className="ml-px font-normal opacity-70">*</span>}
                </>
              ), undefined, productionTarget(r.load, r, g.today))}
              {figCell(r.compl, vypTone, (c) => pctText(c.value), undefined,
                productionTarget(r.compl, r, g.yesterday))}
              {/* The percentage is the figure. «done/actionable» was printed
                  beside it and is not (the operator's call, 2026-09-16) — it
                  stays on the cell as its tooltip, where it costs no width. */}
              {figCell(r.quality, resolvedTone, (c) => pctText(c.value),
                r.quality && !r.quality.reason && isNum(r.quality.value)
                  ? `${r.quality.done}/${r.quality.actionable}` : undefined,
                qualityTarget(r))}
              {figTd({ tone: concernsTone(open_), target: concernsTarget(r), children: open_ })}
            </tr>
          );
        })}
      </Fragment>
    ));
  }

  const right = (rows.length > 0 || isAdmin) && (
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
      {rows.length > 0 && (
        <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {fill(t("overview.sr.rows"), { n: rows.length })}
        </span>
      )}
      {/* Where the colours are decided, for the one person who may decide
          them. The endpoint behind it is admin-only too — this button is the
          way in, never the lock. */}
      {isAdmin && (
        <Button
          variant="ghost"
          size="sm"
          icon={<SlidersHorizontal size={14} />}
          onClick={() => setBandsOpen(true)}
          title={t("overview.sr.bands.open")}
          aria-label={t("overview.sr.bands.open")}
        />
      )}
    </div>
  );

  // The legend wears the table's own tints, so a band and the cells it judges
  // are read in one vocabulary.
  const bandRows = [
    { key: "load", full: t("overview.sr.colLoad"), short: t("overview.sr.colLoadShort"), bands: pctBand(bands.load) },
    { key: "compl", full: t("overview.sr.colCompl"), short: t("overview.sr.colComplShort"), bands: pctBand(bands.compl) },
    { key: "quality", full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"), bands: pctBand(bands.quality) },
    { key: "concerns", full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"), bands: countBand(bands.concerns) },
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
              cls="align-bottom sm:w-[32%] max-sm:px-2 max-[359px]:px-1.5 max-sm:[&_.lucide-chevrons-up-down]:hidden"
              label={<HeadLabel left active={sort?.key === "name"} full={t("overview.sr.colName")} />}
            />
            {[
              ["load", t("overview.sr.hintLoad"), {
                full: t("overview.sr.colLoad"), short: t("overview.sr.colLoadShort"),
                cap: dated("overview.sr.today", single?.today),
              }],
              ["compl", t("overview.sr.hintCompl"), {
                full: t("overview.sr.colCompl"), short: t("overview.sr.colComplShort"),
                cap: dated("overview.sr.yesterday", single?.yesterday),
              }],
              ["quality", t("overview.sr.hintQuality"), {
                full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"),
                cap: qMonth
                  ? fill(t("overview.sr.capQualityMonth"), { month: qMonth })
                  : t("overview.sr.capQuality"),
                // On a phone the month alone is the caption; with none yet,
                // `HeadLabel` falls back to the full one.
                capShort: qMonth || undefined,
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

      {isAdmin && (
        <StatusBandsModal open={bandsOpen} onClose={() => setBandsOpen(false)} bands={bands} />
      )}

      {rows.length > 0 && (
        <div className="mt-2 px-1 flex flex-col gap-1.5 text-[11px] sm:text-[10.5px] leading-snug" style={{ color: "var(--text-3)" }}>
          {/* One band per line on a phone, the chips lined up under each
              other — two to a row left «<80%» wrapped onto a line of its own. */}
          <div className="grid grid-cols-1 gap-y-1.5 sm:flex sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
            {bandRows.map((b) => (
              <span key={b.key} className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <span className="max-sm:w-16 max-sm:flex-shrink-0">
                  <span className="sm:hidden">{b.short}</span>
                  <span className="max-sm:hidden">{b.full}</span>
                </span>
                {["ok", "warn", "bad"].map((tone, i) => (
                  <span
                    key={tone}
                    className="rounded-sm px-1.5 py-px font-semibold tabular-nums"
                    style={toneFill(tone)}
                  >
                    {b.bands[i]}
                  </span>
                ))}
              </span>
            ))}
          </div>
          {anyPartial && <div>* — {t("overview.sr.partial")}</div>}
          {(canProd || canQuality || canConcerns) && <div>{t("overview.sr.tapHint")}</div>}
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
