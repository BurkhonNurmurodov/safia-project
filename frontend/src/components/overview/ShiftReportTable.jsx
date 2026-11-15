// «Smena hisoboti» — the shift dashboard (pages/ShiftDaily.jsx), under the KPI
// cards. One row per brigadir of the viewer's shift, six columns, and no figure
// computed here: every value comes from GET /api/shift-report, which reads each
// one through the page that owns it (backend/app/services/shift_report.py names
// them). This file only paints.
//
// Rules it keeps, so nobody has to rediscover them:
// - The day stepper beside it does NOT reach it. Each column has its own fixed
//   window and prints it — with the date — in its own header. «Sifat nazorati
//   %» covers ALL TIME (the operator's call, 2026-11-13; it was the current
//   month from 2026-09-18, and thirteen days into one a brigadir was judged on
//   a record or two). The span is the one the SERVER counted (`quality_from` /
//   `quality_to` on the payload) and the cell's link opens the Quality page on
//   exactly it. A payload from before the change still names its month
//   (`quality_month`) and is captioned and linked by that. The FIGURE, from
//   the evening of 2026-11-13, is `quality_work`: solved since 1 October ÷ had
//   to solve (that plus everything unsolved today, hair included) — «21/76 =
//   28%» — printed as a percentage alone; the hover box spells out the
//   fraction and keeps the all-time rate (`quality_hair`) the cell printed
//   before. `qualityOpen` below is the whole record. The cell opens the
//   Quality page «Soch bilan» on the brigadir's unresolved records — the
//   «unsolved» half of the total.
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
// - «Davomat» (2026-10-12) is the unit's attendance on its shift-day so far:
//   /workers' «Davomat issiqlik xaritasi» figure, (came + on leave) ÷ on the
//   list, read off the stored live Verifix read — and painted on that
//   heatmap's own scale (`statusBands.ATT_SEGMENTS`), not the board's three
//   bands, so one unit-day wears one colour on both pages. Not admin-editable.
// - It stays a TABLE on a phone. The rows are read against each other, which
//   cards would take away; the headers shorten and a blank shows its icon alone.
//   With six columns the «bugun» / «kecha» captions drop their dates on a
//   phone and the subtitle names the day instead — a date under each of them
//   was what a sixth column had no room for.
// - Every cell OPENS WHERE ITS FIGURE COMES FROM, on the scope it was counted
//   over (the operator's directive, 2026-09-30): load → «Zagruzka fayli» on the
//   unit's shift-day, attendance → «Verifix to'g'irlash» on that day (the list
//   behind it), plan fulfilment → the same page on the day before,
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
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CloudOff, FileClock, FileX, Hourglass, Inbox, LayoutGrid, ListChecks,
  PackageX, SlidersHorizontal, UserX, Users,
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
  productionLink, qualityLink, concernsLink, staffLink, monthSpan, QUALITY_UNRESOLVED,
  CONCERN_OPEN,
} from "../../utils/scopeLinks";
import { useFactory, useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import useStatusBands from "../../hooks/useStatusBands";
import {
  loadTone, vypTone, resolvedTone, concernsTone, attTone, toneFill, toneTint,
  ATT_SEGMENTS, segmentFill,
} from "../../utils/statusBands";
import api from "../../utils/api";
import { softHyphenate } from "../../utils/personName";

const REASON_ICON = {
  not_configured: PackageX,
  no_people: UserX,
  no_plan: FileX,
  no_fact: FileClock,
  no_records: Inbox,
  // «Davomat»: no workload cell, Verifix not read yet, nobody's shift begun,
  // nobody on the list (backend shift_report.REASONS).
  no_cells: LayoutGrid,
  no_read: CloudOff,
  not_started: Hourglass,
  no_list: Users,
};

const SORT_VALUE = {
  load: (r) => r.load?.value,
  att: (r) => r.att?.value,
  compl: (r) => r.compl?.value,
  // the figure the column prints: the overall rate, hair included
  // the figure the column prints: solved ÷ had to solve (`quality_work`); a
  // payload from before it still carries the all-time rate
  quality: (r) => (r.quality_work ?? r.quality_hair)?.value,
  // the column's second lane: the same figure without hair
  qualityNoHair: (r) => (r.quality_work_nohair ?? r.quality)?.value,
  concerns: (r) => r.concerns?.open,
};
// The first press on a column puts its WORST rows on top: the lowest
// percentage, the most open concerns. A third press returns to name order.
const FIRST_DIR = { name: "asc", load: "asc", att: "asc", compl: "asc", quality: "asc", qualityNoHair: "asc", concerns: "desc" };
const DEFAULT_SORT = { key: "name", dir: "asc" };
const COLS = 6;

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);

// «Davomat»'s scale as the legend prints it, best first: ≥95%  90–94%  …  <60%,
// each chip in the very paint its cells wear.
const ATT_LEGEND = ATT_SEGMENTS.map((seg, i, all) => ({
  label: i === 0 ? `<${all[1].from}%`
    : all[i + 1] ? `${seg.from}–${all[i + 1].from - 1}%` : `≥${seg.from}%`,
  style: segmentFill(seg.from / 100, ATT_SEGMENTS),
})).reverse();

// A name longer than its column breaks WITH a visible hyphen (utils/personName
// `softHyphenate`) instead of pushing the last column off a 320px screen.
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

// Header content: the column's name over the window it covers. Below `sm` six
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
// would push six columns past a phone's width.
// «Sifat nazorati %» is ONE cell cut corner to corner — «soch bilan» top-left,
// «sochsiz» bottom-right (`splitCell`). Its header carries a third line naming
// the halves at the left and right edges, over their corners, each a sort
// control for its half; the header's own press sorts by «soch bilan».
function LaneLabels({ lanes, sort, onSort }) {
  return (
    <span className="mt-1 flex w-full justify-between gap-1 sm:px-1.5">
      {lanes.map((l, i) => {
        const on = sort?.key === l.k;
        return (
          <button
            key={l.k}
            type="button"
            title={l.title}
            aria-pressed={on}
            onClick={(e) => { e.stopPropagation(); onSort(l.k); }}
            className={`min-w-0 px-0.5 ${i ? "text-right" : "text-left"} text-[11px] max-[359px]:text-[10.5px] sm:text-[10.5px] font-semibold whitespace-nowrap outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand)]`}
            style={{ color: on ? "var(--brand-text)" : "var(--text-3)" }}
          >
            {/* the short names at every width: the split cell is ~88px */}
            {l.short}
          </button>
        );
      })}
    </span>
  );
}

// The split cell's header: its half labels sit under the title over the box.
// On sm+ the COLUMN is exactly the 90px box (`splitCell` — option B on the
// design canvas, 2026-11-15: a ~150px-long box laid the diagonal almost flat),
// with no dark margin either side of it (the operator, next: «remove the black
// part around the box»). In this auto-layout table a px column beside
// percentage ones is WIDENED to soak up the slack — measured: 90px became
// 154px while the name column sat at 30% — so the name column carries no width
// and takes the slack itself.
const TH_PAIR = "align-bottom sm:w-[90px] sm:min-w-[90px] sm:max-w-[90px] sm:px-0 max-sm:px-1 max-[359px]:px-0.5 [&>span]:flex [&>span]:w-full "
  + "[&>span>span:first-child]:flex-1 [&>span>span:first-child]:w-full max-sm:[&_.lucide-chevrons-up-down]:hidden";
const TH_FIG = "align-bottom sm:w-[14%] max-sm:px-1 max-[359px]:px-0.5 max-sm:[&>span]:flex-col "
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
export default function ShiftReportTable({ shift = null, date = null, pageReady = true }) {
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

  // The page's scope, plus the shift-day its stepper picked (2026-11-06): that
  // day replaces «today» and the day before it «yesterday»; the quality month
  // is the picked day's. No date = the shift's own current day, as before.
  const base = useMemo(() => ({ ...(shift ? { shift } : {}), ...(date ? { date } : {}) }), [shift, date]);
  const params = useFactoryParams(base);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["shift-report", "hrs", params],
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
  const reasons = [...new Set(rows.flatMap((r) => [r.load?.reason, r.att?.reason, r.compl?.reason, (r.quality_work ?? r.quality_hair)?.reason, (r.quality_work_nohair ?? r.quality)?.reason]))]
    .filter((k) => REASON_ICON[k]);

  const picked = !!data?.picked;
  const todayKey = picked ? "overview.sr.pickedDay" : "overview.sr.today";
  const prevKey = picked ? "overview.sr.pickedPrev" : "overview.sr.yesterday";
  const shiftName = (s) => (s === 1 || s === 2
    ? fill(t("overview.sr.subShift"), { n: s })
    : t("overview.sr.noShift"));
  // On a phone the «bugun» / «kecha» captions print no date (six columns have
  // no room for one each), so the subtitle names the day there.
  const subtitle = single
    ? (
      <>
        {shiftName(single.shift)}
        {single.today && (
          <span className="sm:hidden">
            {" · "}
            {fill(t("overview.sr.capDated"), { when: t(todayKey), date: ddmm(single.today) })}
          </span>
        )}
      </>
    )
    : multi ? t("overview.sr.subAll") : undefined;
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
  // The quality column counts ALL TIME: the payload names the span itself.
  const qAll = !qMonth && !!data?.quality_from && !!data?.quality_to;

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
  const canStaff = may("staff");
  const qSpan = qAll
    ? { from: data.quality_from, to: data.quality_to }
    : monthSpan(data?.quality_month);
  const prodPage = t("nav.production");

  const productionTarget = (cell, r, date) => {
    if (cell?.reason === "not_configured") {
      return isAdmin ? { to: "/panel/production", page: t("admin.tabProduction") } : null;
    }
    if (!canProd) return null;
    const tab = cell?.reason === "no_people" ? "people" : undefined;
    return { to: productionLink({ unit: r.manager_id, date, tab }), page: prodPage };
  };
  const staffTarget = (r, date) => (canStaff
    ? { to: staffLink({ unit: r.manager_id, date }), page: t("nav.staff") }
    : null);
  // `hair: "with"` opens the Quality page «Soch bilan» — the figure counts
  // every record, so the list behind it must too.
  // Each lane opens the Quality page in its own reading: «soch bilan» with
  // hair, «sochsiz» without (no `hair` param lands the page «Sochsiz»).
  const qualityTarget = (r, noHair = false) => (canQuality && qSpan && r.name
    ? {
      to: qualityLink({
        brigadir: r.name, from: qSpan.from, to: qSpan.to, status: QUALITY_UNRESOLVED,
        hair: noHair ? undefined : "with",
      }),
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
  // link, and its tooltip adds where it leads. `paint` replaces the band fill
  // for a column painted on a scale of its own («Davomat»); `tone` still says
  // whether the figure is read in bold.
  // An instant tooltip: the browser's own `title` waits about a second, which
  // reads as «nothing there» on a board scanned row by row. A fixed portal, so
  // the table's scroller never clips it; it closes on leave and on scroll.
  const [tip, setTip] = useState(null);
  useEffect(() => {
    if (!tip) return undefined;
    const off = () => setTip(null);
    window.addEventListener("scroll", off, true);
    return () => window.removeEventListener("scroll", off, true);
  }, [tip]);
  const showTip = (e, text, node) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, node, x: r.left + r.width / 2, y: r.top });
  };

  // `tipNode` draws the box's content in place of the `title` text (the
  // quality cell's little table); `title` then stays its spoken form, and the
  // «opens on …» line still follows.
  // `bare` drops the cell's own padding, for children that paint edge to edge
  // themselves (the quality cell's two halves).
  const figTd = ({ tone, paint, title, tipNode, target, children, bare = false }) => {
    const hint = target ? fill(t("overview.sr.goto"), { page: target.page }) : null;
    const fullTitle = [title, hint].filter(Boolean).join("\n") || undefined;
    const node = tipNode ? (
      <>
        {tipNode}
        {hint && <div className="mt-1.5">{hint}</div>}
      </>
    ) : null;
    return (
      <td
        className={`${TD_FIG} ${target || bare ? "p-0" : TD_PAD} ${tone === "bad" ? "font-bold" : "font-semibold"}`}
        style={{ ...(paint ?? toneFill(tone)), ...RULE }}
        onMouseEnter={fullTitle ? (e) => showTip(e, fullTitle, node) : undefined}
        onMouseLeave={fullTitle ? () => setTip(null) : undefined}
      >
        {target ? (
          <Link
            to={target.to}
            className={`${LINK_CLS} ${bare ? "" : TD_PAD}`}
            aria-label={fullTitle ? fullTitle.replace(/\n/g, ". ") : undefined}
          >
            {children}
          </Link>
        ) : children}
      </td>
    );
  };
  // Hours per person, spelled as hours and minutes (7.8 h → 7 h 48 min).
  const hm = (minutes) => {
    const total = Math.round(minutes);
    return fill(t("overview.sr.hm"), { h: Math.floor(total / 60), m: total % 60 });
  };
  // The day's work behind the load %: plan minutes per person.
  const loadTitle = (c) => (isNum(c?.plan_min) && c.people
    ? hm(c.plan_min / c.people) : undefined);
  // Plan fulfilment's twin: the actual minutes per person, the day before.
  // Plan fulfilment: when the people ACTUALLY started and finished the day
  // before (Verifix) and the hours they worked — never the plan minutes ÷ heads.
  const complTitle = (c) => {
    const k = c?.clock;
    if (!k) return undefined;
    const line = fill(t("overview.sr.clock"), { a: k.start, b: k.end });
    return isNum(k.avg_min) ? `${line} · ${hm(k.avg_min)}` : line;
  };

  // The quality cell's hover box says ONE thing: how many problems are LEFT —
  // not solved yet — under that caption, a number for the hair category and a
  // number for everything else (the operator, 2026-11-13, after the box had
  // grown to three rows by three columns: «it's too many information here, I
  // need how much they left, and with hair and without hair should be
  // together»). The two add up to the list the cell's link opens. The totals,
  // the solved counts and the overall row are gone from it; the cell's own %
  // is the overall verdict. A reading with nothing left reads 0.
  const qualityRows = (r) => {
    const all = r.quality_hair;
    if (!all || all.reason || !isNum(all.value)) return null;
    const left = (c) => Math.max(0, (c?.actionable ?? 0) - (c?.done ?? 0));
    const rest = left(r.quality);
    return [
      { label: t("overview.sr.qHair"), left: Math.max(0, left(all) - rest) },
      { label: t("overview.sr.hairWithout"), left: rest },
    ];
  };
  // THE quality cell and its hover box, from 2026-11-13 (the operator, on a
  // brigadir whose cell read 70% with 55 problems unsolved: «the percentage
  // should be for unsolved like 21 out of 76, it should be red»). The CELL
  // prints `quality_work` — solved since the server's day (`quality_since_from`,
  // 1 October) ÷ had to solve, where «had to solve» is everything NOT solved
  // today, all time, hair included, plus that solved count; the server folds
  // it (backend `shift_report.work_cell`), this file only paints. The BOX
  // spells the fraction out — «Solved from 01.10 / had to solve  21/76» — and
  // under it the all-time closure rate the cell used to print («All time
  // 70%», `quality_hair`), so that figure is not lost. The register has no
  // solve date, so «solved from 01.10» means «filed since, and solved»; the
  // header hint says so. A payload without `quality_work` — an older server —
  // keeps the all-time rate in the cell and the «left: hair / without hair»
  // box below.
  const qFrom = data?.quality_since_from || "";
  const qWork = !!qFrom && rows.some((r) => r.quality_work);
  // `noHair` picks the column's second lane: the same two figures with the
  // hair category left out (`quality_work_nohair`, `quality`).
  const qualityCell = (r, noHair = false) => (qWork
    ? (noHair ? r.quality_work_nohair ?? r.quality : r.quality_work)
    : (noHair ? r.quality : r.quality_hair));
  const qualityOpen = (r, noHair = false) => {
    const w = noHair ? r.quality_work_nohair : r.quality_work;
    if (!qWork || !w || w.reason || !isNum(w.value)) return null;
    const all = noHair ? r.quality : r.quality_hair;
    return {
      lane: t(noHair ? "overview.sr.hairWithout" : "overview.sr.hairWith"),
      // «sochsiz» reads solved / LEFT, as its cell does («1/4»: 1 solved,
      // 4 still open); «soch bilan» stays solved / had to solve.
      // «sochsiz» counts solved from the 1st of the month (the server's
      // `quality_nohair_since_from`), «soch bilan» from 1 October.
      caption: fill(t(noHair ? "overview.sr.qSinceLeft" : "overview.sr.qSince"),
        { date: ddmm(noHair ? data?.quality_nohair_since_from || qFrom : qFrom) }),
      text: noHair ? `${w.done}/${Math.max(0, w.total - w.done)}` : `${w.done}/${w.total}`,
      allTime: all && !all.reason && isNum(all.value) ? pctText(all.value) : null,
    };
  };
  // The split cell's hover box: EVERYTHING about both halves (the operator,
  // 2026-11-15: «in the hover box write all information about it, with hair
  // and without hair») — per half its name and percentage, the fraction it is
  // counted from and the all-time rate.
  const qualityPct = (r, noHair) => {
    const c = qualityCell(r, noHair);
    return c && !c.reason && isNum(c.value) ? pctText(c.value) : "—";
  };
  // Its spoken form, for the link's aria-label.
  // The hover box from 2026-11-15 (the operator: «the part … should always be
  // with the new month, and after that line write overall how many left from
  // the past, and same with the hair part»): per half its name and the cell's
  // %, then «Noyabr: bartaraf etilgan / jami  4/9» — the records FILED this
  // month, solved / needing action — then «O'tgan oylardan qolgan  18», the
  // records filed before the month still not solved. The server counts both
  // (`quality_box`, backend `shift_report.box_half`); the month is the one it
  // counted (`quality_nohair_since_from`). A payload without `quality_box`
  // falls back to the earlier box below.
  const qMonthName = (() => {
    const mo = Number(String(data?.quality_nohair_since_from || "").slice(5, 7));
    return mo >= 1 && mo <= 12 ? t(`cal.m${mo - 1}`) : "";
  })();
  const boxHalves = (r) => {
    const box = r.quality_box;
    if (!box) return null;
    return [false, true].map((noHair) => {
      const h = box[noHair ? "nohair" : "hair"] || {};
      return {
        lane: t(noHair ? "overview.sr.hairWithout" : "overview.sr.hairWith"),
        pct: qualityPct(r, noHair),
        month: `${h.month_done ?? 0}/${h.month_total ?? 0}`,
        // «O'tgan oylardan: bartaraf etilgan / jami  2/8» — of the backlog
        // left from earlier months when this month's list was taken, how many
        // are solved now (the operator, 2026-11-15: «put a slash for left from
        // past months too — are they solving or not»). Without the list's
        // numbers (`past_total` null) it falls back to «qolgan N».
        pastSlash: h.past_total != null,
        past: h.past_total != null ? `${h.past_done ?? 0}/${h.past_total}` : h.past_left ?? 0,
      };
    });
  };
  const monthCaption = () => fill(t("overview.sr.qMonthLine"), { month: qMonthName });
  // The list is taken on the month's first board — for November 2026 that was
  // 13.11, so the caption names the day whenever it is not the 1st.
  const qPastOn = data?.quality_past_since || "";
  const pastCaption = (h) => (h.pastSlash
    ? fill(t(qPastOn && !qPastOn.endsWith("-01") ? "overview.sr.qPastLineSince" : "overview.sr.qPastLine"),
      { date: ddmm(qPastOn) })
    : t("overview.sr.qPastLeft"));
  const qualityTitle = (r) => {
    const halves = boxHalves(r);
    if (halves) {
      return halves.flatMap((h) => [`${h.lane}: ${h.pct}`, `${monthCaption()}: ${h.month}`,
        `${pastCaption(h)}: ${h.past}`]).join("\n");
    }
    const lines = [false, true].flatMap((noHair) => {
      const open = qualityOpen(r, noHair);
      if (!open) return [];
      return [`${open.lane}: ${qualityPct(r, noHair)}`, `${open.caption}: ${open.text}`,
        open.allTime ? `${t("overview.sr.qAllTime")}: ${open.allTime}` : null].filter(Boolean);
    });
    if (lines.length) return lines.join("\n");
    const rows = qualityRows(r);
    return rows
      ? `${t("overview.sr.qLeftTitle")}: ${rows.map((x) => `${x.label} ${x.left}`).join(", ")}`
      : undefined;
  };
  const qualityTip = (r) => {
    const box = boxHalves(r);
    if (box) {
      const line = (label, value) => (
        <div className="mt-1 flex items-baseline justify-between gap-6">
          <span className="font-medium" style={{ color: "var(--text-3)" }}>{label}</span>
          <span className="font-semibold tabular-nums">{value}</span>
        </div>
      );
      return (
        <div className="whitespace-nowrap">
          {box.map((h, i) => (
            <div key={h.lane} className={i ? "mt-2 border-t pt-2" : ""} style={{ borderColor: "var(--border)" }}>
              <div className="flex items-baseline justify-between gap-6">
                <span className="font-semibold first-letter:uppercase">{h.lane}</span>
                <span className="text-sm font-bold tabular-nums">{h.pct}</span>
              </div>
              {line(monthCaption(), h.month)}
              {line(pastCaption(h), h.past)}
            </div>
          ))}
        </div>
      );
    }
    const halves = [false, true].map((noHair) => [noHair, qualityOpen(r, noHair)]).filter(([, o]) => o);
    if (halves.length) {
      return (
        <div className="whitespace-nowrap">
          {halves.map(([noHair, open], i) => (
            <div key={open.lane} className={i ? "mt-2 border-t pt-2" : ""} style={{ borderColor: "var(--border)" }}>
              <div className="flex items-baseline justify-between gap-6">
                <span className="font-semibold first-letter:uppercase">{open.lane}</span>
                <span className="text-sm font-bold tabular-nums">{qualityPct(r, noHair)}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-6">
                <span className="font-medium" style={{ color: "var(--text-3)" }}>{open.caption}</span>
                <span className="font-semibold tabular-nums">{open.text}</span>
              </div>
              {open.allTime && (
                <div className="mt-0.5 flex items-baseline justify-between gap-6">
                  <span className="font-medium" style={{ color: "var(--text-3)" }}>{t("overview.sr.qAllTime")}</span>
                  <span className="font-semibold tabular-nums">{open.allTime}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }
    const rows = qualityRows(r);
    if (!rows) return null;
    return (
      <div className="whitespace-nowrap">
        <div className="font-medium" style={{ color: "var(--text-3)" }}>{t("overview.sr.qLeftTitle")}</div>
        <table className="mt-1 w-full border-separate border-spacing-0">
          <tbody>
            {rows.map((x) => (
              <tr key={x.label}>
                <td className="py-0.5 text-left font-medium first-letter:uppercase">{x.label}</td>
                <td className="py-0.5 pl-6 text-right font-semibold tabular-nums">{x.left}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ONE cell cut by a diagonal from its top-right corner to its bottom-left
  // one (the operator, 2026-11-15: «I want diagonal lines, just work on the
  // formatting, it should be the one box»): «soch bilan» fills the top-left
  // triangle with its % in the top-left corner, «sochsiz» the bottom-right one
  // with its % in the bottom-right corner, each in its own band's fill and ink.
  // Drawn as ONE SVG stretched over the cell (`preserveAspectRatio="none"`):
  // two triangles and a 2px non-scaling rule in the card's colour — smooth at
  // any cell shape, where a CSS gradient's hard stop showed a jagged line. The
  // cell keeps the board's padding and one-line height; the figures sit in the
  // corners, inset so they clear the rule (smaller on a phone, where the cell
  // is ~55px wide). A half with no figure stays unfilled with «—»; a cell with
  // neither is the usual blank. Two side-by-side halves stood here for an
  // hour first; the operator wanted the diagonal back.
  const splitCell = (r) => splitFig(qualityCell(r), qualityCell(r, true), {
    title: qualityTitle(r), tipNode: qualityTip(r), target: qualityTarget(r),
  });
  // The drawing itself, for any two figures — a brigadir's row, or the
  // «O'rtacha» row under the board.
  const splitFig = (a, b, { title, tipNode, target }) => {
    const has = (c) => !!c && !c.reason && isNum(c.value);
    if (!has(a) && !has(b)) {
      return figCell(a, resolvedTone, (c) => pctText(c.value), title, target, tipNode);
    }
    const fa = has(a) ? toneFill(resolvedTone(a.value)) : null;
    const fb = has(b) ? toneFill(resolvedTone(b.value)) : null;
    const fig = (c, f) => (has(c)
      ? <span style={{ color: f.color }}>{pctText(c.value)}</span>
      : <span style={{ color: "var(--text-4)" }}>—</span>);
    const corner = "absolute font-bold leading-none text-[10.5px] sm:text-xs";
    return figTd({
      paint: { position: "relative" },
      title,
      tipNode,
      target,
      children: (
        <>
          {/* The BOX fills the cell: the column itself is 90px on sm+
              (TH_PAIR), the whole ~55px cell on a phone. */}
          <span className="pointer-events-none absolute inset-0">
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100"
              preserveAspectRatio="none" aria-hidden="true">
              <polygon points="0,0 100,0 0,100" fill={fa?.background ?? "transparent"} />
              <polygon points="100,0 100,100 0,100" fill={fb?.background ?? "transparent"} />
              <line x1="100" y1="0" x2="0" y2="100" stroke="var(--bg-card)" strokeWidth="2"
                vectorEffect="non-scaling-stroke" />
            </svg>
            <span className={`${corner} left-[3px] top-[3px] sm:left-1.5 sm:top-[5px]`}>{fig(a, fa)}</span>
            <span className={`${corner} right-[3px] bottom-[3px] sm:right-1.5 sm:bottom-[5px]`}>{fig(b, fb)}</span>
          </span>
          {/* holds the row's one-line height */}
          <span className="invisible">0</span>
        </>
      ),
    });
  };

  const figCell = (cell, toneFn, render, extraTitle, target, tipNode) => {
    const blank = !!cell?.reason;
    return figTd({
      tone: cellTone(cell, toneFn),
      title: blank ? t(`overview.sr.reason.${cell.reason}`) : extraTitle,
      tipNode: blank ? null : tipNode,
      target,
      children: blank ? <Blank reason={cell.reason} />
        : isNum(cell?.value) ? render(cell)
        : <span style={{ color: "var(--text-4)" }}>—</span>,
    });
  };

  // «Davomat» — painted on /workers' heatmap scale; its tooltip spells out the
  // fraction, who is still to come and when Verifix was read. A blank has no
  // link: nothing on another page fills a read that has not happened yet.
  //
  // The cell prints the COUNT, not the rate (the operator, 2026-11-15: «that
  // brigadir has 98 people but came 80 — like 80/98»): (came + on leave) /
  // on the list, the very fraction its colour is painted from, with the list
  // dimmer so the eye reads who came first. The % leads the tooltip. A
  // payload without the counts keeps printing the %.
  const attCell = (cell, r, date) => {
    const blank = !!cell?.reason;
    const has = !blank && isNum(cell?.value);
    const hasCount = has && isNum(cell.came) && isNum(cell.roster);
    const title = blank ? t(`overview.sr.reason.${cell.reason}`)
      : has ? [
        hasCount ? pctText(cell.value) : null,
        fill(t("overview.sr.attFrac"), { came: cell.came, leave: cell.on_leave, roster: cell.roster }),
        cell.not_yet ? fill(t("overview.sr.attNotYet"), { n: cell.not_yet }) : null,
        cell.unread ? fill(t("overview.sr.attUnread"), { n: cell.unread }) : null,
        cell.read_at ? fill(t("overview.sr.attRead"), { time: cell.read_at.slice(11, 16) }) : null,
      ].filter(Boolean).join("\n")
      : undefined;
    return figTd({
      tone: has ? attTone(cell.value) : null,
      paint: has ? segmentFill(cell.value, ATT_SEGMENTS) : undefined,
      title,
      target: has ? staffTarget(r, date) : null,
      children: blank ? <Blank reason={cell.reason} />
        : hasCount ? (
          <span className="whitespace-nowrap">
            {cell.came + (isNum(cell.on_leave) ? cell.on_leave : 0)}
            <span className="font-normal opacity-75 text-[10px] sm:text-[11px]">/{cell.roster}</span>
          </span>
        )
        : has ? pctText(cell.value)
        : <span style={{ color: "var(--text-4)" }}>—</span>,
    });
  };

  // «O'rtacha» — the row under the board (the operator, 2026-11-15: «add
  // average for all column here in the bottom»): each column's plain mean over
  // the brigadirs it closes, blanks left out. With both shifts on screen each
  // shift ends in its own «O'rtacha» and the board in «Umumiy o'rtacha» over
  // everybody (the operator, same day: «Add per-shift rows»). Painted on the
  // same bands as the rows. Not a link — no one page holds an average.
  // «Davomat» prints the mean RATE, since rosters differ in size; «Xavotirlar»
  // the mean count to one decimal.
  const meanOf = (cells) => {
    const vals = cells.filter((c) => c && !c.reason && isNum(c.value)).map((c) => c.value);
    return vals.length ? { value: vals.reduce((s, v) => s + v, 0) / vals.length } : { value: null };
  };
  const avgRow = (rows, key, label) => {
    const load = meanOf(rows.map((r) => r.load));
    const att = meanOf(rows.map((r) => r.att));
    const compl = meanOf(rows.map((r) => r.compl));
    const qa = meanOf(rows.map((r) => qualityCell(r)));
    const qb = meanOf(rows.map((r) => qualityCell(r, true)));
    const conc = Math.round((rows.reduce((s, r) => s + (r.concerns?.open ?? 0), 0) / rows.length) * 10) / 10;
    const hint = t("overview.sr.avgHint");
    const hasAtt = isNum(att.value);
    return (
      <tr key={key} style={{ boxShadow: "inset 0 2px 0 0 var(--border)" }}>
        <td className="px-2 max-[359px]:px-1.5 sm:px-3 py-2 align-middle" title={hint}>
          <span className="block text-[11.5px] sm:text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-1)" }}>
            {label}
          </span>
        </td>
        {figCell(load, loadTone, (c) => pctText(c.value), hint)}
        {figTd({
          tone: hasAtt ? attTone(att.value) : null,
          paint: hasAtt ? segmentFill(att.value, ATT_SEGMENTS) : undefined,
          title: hint,
          children: hasAtt ? pctText(att.value) : <span style={{ color: "var(--text-4)" }}>—</span>,
        })}
        {figCell(compl, vypTone, (c) => pctText(c.value), hint)}
        {splitFig(qa, qb, { title: hint })}
        {figTd({ tone: concernsTone(conc), title: hint, children: conc })}
      </tr>
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
        {[0, 1, 2, 3, 4].map((j) => (
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
                shift: shiftName(g.shift), when: t(todayKey), today: ddmm(g.today), prev: t(prevKey), yesterday: ddmm(g.yesterday),
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
                  {/* Below 360px the six columns only fit if a very long
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
              ), loadTitle(r.load), productionTarget(r.load, r, g.today))}
              {attCell(r.att, r, g.today)}
              {figCell(r.compl, vypTone, (c) => pctText(c.value), complTitle(r.compl),
                productionTarget(r.compl, r, g.yesterday))}
              {/* ONE cell cut corner to corner: «soch bilan» top-left,
                  «sochsiz» bottom-right (`splitCell`); the hover box carries
                  both halves in full (`qualityTip`). */}
              {splitCell(r)}
              {figTd({ tone: concernsTone(open_), target: concernsTarget(r), children: open_ })}
            </tr>
          );
        })}
        {multi && avgRow(g.rows, `avg-${g.shift ?? "none"}`, t("overview.sr.avg"))}
      </Fragment>
    ));
    body = (
      <>
        {body}
        {avgRow(rows, "avg", t(multi ? "overview.sr.avgAll" : "overview.sr.avg"))}
      </>
    );
  }

  const right =(rows.length > 0 || isAdmin) && (
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
  const toneChips = (labels) =>
    ["ok", "warn", "bad"].map((tone, i) => ({ label: labels[i], style: toneFill(tone) }));
  const bandRows = [
    { key: "load", full: t("overview.sr.colLoad"), short: t("overview.sr.colLoadShort"), chips: toneChips(pctBand(bands.load)) },
    { key: "att", full: t("overview.sr.colAtt"), short: t("overview.sr.colAttShort"), chips: ATT_LEGEND },
    { key: "compl", full: t("overview.sr.colCompl"), short: t("overview.sr.colComplShort"), chips: toneChips(pctBand(bands.compl)) },
    { key: "quality", full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"), chips: toneChips(pctBand(bands.quality)) },
    { key: "concerns", full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"), chips: toneChips(countBand(bands.concerns)) },
  ];

  return (
    <section className="mb-6" aria-label={t("overview.sr.title")}>
      {tip && createPortal(
        <div
          role="tooltip"
          className={`pointer-events-none fixed z-[300] whitespace-pre-line rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-lg ${tip.node ? "max-w-[calc(100vw-1rem)]" : "max-w-[18rem]"}`}
          style={{
            left: tip.x, top: tip.y - 6, transform: "translate(-50%, -100%)",
            background: "var(--bg-card)", color: "var(--text-1)", border: "1px solid var(--border)",
          }}
        >
          {tip.node ?? tip.text}
        </div>,
        document.body,
      )}
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
              cls="align-bottom max-sm:px-2 max-[359px]:px-1.5 max-sm:[&_.lucide-chevrons-up-down]:hidden"
              label={<HeadLabel left active={sort?.key === "name"} full={t("overview.sr.colName")} />}
            />
            {[
              ["load", t("overview.sr.hintLoad"), {
                full: t("overview.sr.colLoad"), short: t("overview.sr.colLoadShort"),
                cap: dated(todayKey, single?.today), capShort: t(todayKey),
              }],
              ["att", t("overview.sr.hintAtt"), {
                full: t("overview.sr.colAtt"), short: t("overview.sr.colAttShort"),
                cap: dated(todayKey, single?.today), capShort: t(todayKey),
              }],
              ["compl", t("overview.sr.hintCompl"), {
                full: t("overview.sr.colCompl"), short: t("overview.sr.colComplShort"),
                cap: dated(prevKey, single?.yesterday), capShort: t(prevKey),
              }],
              ["quality", t("overview.sr.hintQuality"), {
                full: t("overview.sr.colQuality"), short: t("overview.sr.colQualityShort"),
                // No date under the title once the split cell is on (the
                // operator, 2026-11-15: «remove the date here, the date in the
                // hover box is enough») — the box names its month.
                cap: qWork ? undefined
                  : qAll ? t("overview.sr.capQualityAll")
                  : qMonth ? fill(t("overview.sr.capQualityMonth"), { month: qMonth })
                  : t("overview.sr.capQuality"),
                // On a phone the short form is the caption; with none yet,
                // `HeadLabel` falls back to the full one.
                capShort: qWork ? undefined
                  : qAll ? t("overview.sr.capQualityAllShort") : qMonth || undefined,
              }, [
                { k: "quality", full: t("overview.sr.hairWith"), short: t("overview.sr.hairWithShort"), title: t("overview.sr.hairWithHint") },
                { k: "qualityNoHair", full: t("overview.sr.hairWithout"), short: t("overview.sr.hairWithoutShort"), title: t("overview.sr.hairWithoutHint") },
              ]],
              ["concerns", t("overview.sr.hintConcerns"), {
                full: t("overview.sr.colConcerns"), short: t("overview.sr.colConcernsShort"),
                cap: t("overview.sr.capConcerns"), capShort: t("overview.sr.capConcernsShort"),
              }],
            ].map(([k, hint, label, lanes]) => {
              const on = sort?.key === k || !!lanes?.some((l) => l.k === sort?.key);
              return (
                <Th
                  key={k}
                  k={k}
                  sort={sort}
                  onSort={onSort}
                  align="center"
                  cls={lanes ? TH_PAIR : TH_FIG}
                  alsoActive={on}
                  hint={hint}
                  label={lanes ? (
                    <span className="flex flex-col items-center">
                      <HeadLabel active={on} {...label} />
                      <LaneLabels lanes={lanes} sort={sort} onSort={onSort} />
                    </span>
                  ) : <HeadLabel active={on} {...label} />}
                />
              );
            })}
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
                {b.chips.map((c) => (
                  <span
                    key={c.label}
                    className="rounded-sm px-1.5 py-px font-semibold tabular-nums"
                    style={c.style}
                  >
                    {c.label}
                  </span>
                ))}
              </span>
            ))}
          </div>
          {anyPartial && <div>* — {t("overview.sr.partial")}</div>}
          {(canProd || canStaff || canQuality || canConcerns) && <div>{t("overview.sr.tapHint")}</div>}
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
