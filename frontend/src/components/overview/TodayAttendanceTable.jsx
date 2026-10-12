// «Bugungi davomat» — the shift dashboard (pages/ShiftDaily.jsx), under the
// «Smena hisoboti» board: every brigadir's attendance on their shift-day NOW,
// one row per unit, from GET /api/shift-report/attendance. No figure is
// computed here — this file only paints.
//
// Rules it keeps, so nobody has to rediscover them:
// - The figure IS /workers' «Davomat issiqlik xaritasi» for a day still being
//   worked: (came + on leave) ÷ on the list, by each brigadir's own Verifix
//   list (backend `live_staff.attendance` says who is on it), with that
//   heatmap's «Jami / Zagruzka» switch and its colour scale
//   (`statusBands.ATT_SEGMENTS`) — so once the day is closed, the heatmap
//   prints this number in this colour.
// - «Today» is each shift's own shift-day, which only the server can say, and
//   the page's day stepper does NOT reach it (the board's rule). The header
//   names the day, whether the shift still runs and when Verifix was read.
// - It is live: the minute job re-reads Verifix, so the card asks again every
//   minute while it is on screen.
// - A figure the platform cannot state is «—» with its reason (an icon, and
//   the words under the table), never a 0.
// - It is painted and laid out with the board's own pieces (`HeadLabel`,
//   `Blank`, `boardStyle.js`), so the two tables on one page read as one.
// - The percentage opens «Verifix to'g'irlash» on that unit's day — where the
//   list behind it is — and the name the brigadir's profile, as on the board.
import { Fragment, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CloudOff, Hourglass, LayoutGrid, UserCheck, UserX } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import Tooltip from "../ui/Tooltip";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { Blank, HeadLabel } from "./ShiftReportTable";
import { LINK_CLS, RULE, SK_NAME, TD_FIG, TD_PAD, TH_FIG } from "./boardStyle";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { staffLink } from "../../utils/scopeLinks";
import { useFactory, useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import { ATT_SEGMENTS, segmentFill } from "../../utils/statusBands";
import { softHyphenate } from "../../utils/personName";
import api from "../../utils/api";

// backend shift_report.ATT_REASONS — every reason a figure can be blank for.
const REASON_ICON = {
  no_cells: LayoutGrid,
  no_read: CloudOff,
  not_started: Hourglass,
  no_list: UserX,
};

const COLS = 5;
// A count cell: centred like the board's figures, on the table's own grid —
// only the painted percentage takes the heatmap's card-coloured rule (`RULE`).
const TD_COUNT = "text-center align-middle tabular-nums leading-tight text-xs font-medium";
const SORT_VALUE = {
  roster: (h) => h.roster,
  came: (h) => h.came,
  absent: (h) => h.absent,
  rate: (h) => h.value,
};
// The first press on a column puts its WORST rows on top: the lowest
// attendance, the most absent. A third press returns to name order.
const FIRST_DIR = { name: "asc", roster: "desc", came: "desc", absent: "desc", rate: "asc" };
const DEFAULT_SORT = { key: "name", dir: "asc" };

const isNum = (v) => typeof v === "number" && !Number.isNaN(v);
const pctText = (v) => `${Math.round(v * 100)}%`;
const ddmm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const hhmm = (iso) => (iso ? iso.slice(11, 16) : "");
const fill = (s, vars) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

// The scale as the legend prints it, best first: ≥95%  90–94%  …  <60%.
const LEGEND = ATT_SEGMENTS.map((s, i) => {
  const next = ATT_SEGMENTS[i + 1];
  const label = i === 0 ? `<${next.from}%`
    : next ? `${s.from}–${next.from - 1}%` : `≥${s.from}%`;
  return { label, from: s.from };
}).reverse();

function sortRows(rows, sort, nameOf, halfOf) {
  const byName = (a, b) => nameOf(a).localeCompare(nameOf(b));
  const get = SORT_VALUE[sort?.key];
  const sign = sort?.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (!get) return sign * byName(a, b);
    const va = get(halfOf(a)), vb = get(halfOf(b));
    if (!isNum(va) || !isNum(vb)) {
      // Blanks sink to the bottom whichever way the column is sorted.
      return !isNum(va) && !isNum(vb) ? byName(a, b) : isNum(va) ? -1 : 1;
    }
    return sign * (va - vb) || byName(a, b);
  });
}

// `pageReady` keeps it off the page's critical path, as the board is kept: it
// parses the plant's stored Verifix read, and the page's own queries come first.
export default function TodayAttendanceTable({ shift = null, pageReady = true }) {
  const { t } = useLang();
  const { auth } = useAuth();
  const { tl } = useTranslit();
  const { factory, locked } = useFactory();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  // «Jami» = every job title, «Zagruzka» = only the titles the загрузка counts
  // — the switch on /workers' heatmap, the same two halves.
  const [scope, setScope] = usePersistentState("shift_daily_att_scope", "all");
  const [sort, setSort] = usePersistentState("shift_daily_att_sort", DEFAULT_SORT);

  // The page's scope only — never its dates.
  const base = useMemo(() => (shift ? { shift } : {}), [shift]);
  const params = useFactoryParams(base);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["shift-attendance", params],
    queryFn: () => api.get("/api/shift-report/attendance", { params }).then((r) => r.data),
    enabled: pageReady,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const halfOf = (r) => (scope === "zag" ? r.zag : r.all) || {};
  const groups = useMemo(() => {
    const nameOf = (r) => tl(r.name || "");
    const pick = (r) => (scope === "zag" ? r.zag : r.all) || {};
    return (data?.shifts ?? []).map((g) => ({ ...g, rows: sortRows(g.rows ?? [], sort, nameOf, pick) }));
  }, [data, sort, tl, scope]);

  const rows = groups.flatMap((g) => g.rows);
  const single = groups.length === 1 ? groups[0] : null;
  const multi = groups.length > 1;
  const anyRunning = groups.some((g) => g.state === "running");
  const reasons = [...new Set(rows.map((r) => halfOf(r).reason))].filter((k) => REASON_ICON[k]);

  const shiftName = (s) => (s === 1 || s === 2
    ? fill(t("overview.sr.subShift"), { n: s })
    : t("overview.sr.noShift"));
  // «1-smena · 12.10 · davom etmoqda · Verifix 10:41» — which day, whether
  // its figures still move, and how fresh they are.
  const groupLine = (g) => [
    shiftName(g.shift),
    ddmm(g.day),
    t(g.state === "running" ? "overview.att.running" : "overview.att.ended"),
    g.read_at ? fill(t("overview.att.read"), { time: hhmm(g.read_at) }) : null,
  ].filter(Boolean).join(" · ");
  const subtitle = single ? groupLine(single) : multi ? t("overview.sr.subAll") : undefined;

  const onSort = (k) => setSort((s) => {
    const first = FIRST_DIR[k] || "asc";
    if (s?.key !== k) return { key: k, dir: first };
    if (s.dir === first) return { key: k, dir: first === "asc" ? "desc" : "asc" };
    return DEFAULT_SORT;
  });

  // Where the percentage leads — the unit's list on «Verifix to'g'irlash», or
  // nothing where the viewer cannot open that page.
  const canStaff = canAccessPage(auth?.role, "staff", access, capPages, deniedPages);
  const staffTarget = (r, day) => (canStaff
    ? { to: staffLink({ unit: r.manager_id, date: day }), page: t("nav.staff") }
    : null);

  // A blank half prints «—» in every count, and its reason once, in the
  // percentage cell.
  const countTd = (value, title) => (
    <td className={`${TD_COUNT} ${TD_PAD}`} title={title || undefined}>
      {isNum(value) ? value : <span style={{ color: "var(--text-4)" }}>—</span>}
    </td>
  );

  const rateTd = (h, r, day) => {
    const blank = !!h.reason;
    const target = blank ? null : staffTarget(r, day);
    const frac = blank ? null : fill(t("overview.att.tipFrac"), {
      came: h.came, leave: h.on_leave, roster: h.roster,
    });
    const hint = target ? fill(t("overview.sr.goto"), { page: target.page }) : null;
    const title = blank ? t(`overview.att.reason.${h.reason}`)
      : [frac, hint].filter(Boolean).join("\n");
    const paint = blank ? undefined : segmentFill(h.value, ATT_SEGMENTS);
    const children = blank
      ? <Blank reason={h.reason} icons={REASON_ICON} />
      : pctText(h.value);
    return (
      <td
        className={`${TD_FIG} ${target ? "p-0" : TD_PAD} font-semibold`}
        style={{ ...paint, ...RULE }}
        title={title || undefined}
      >
        {target ? (
          <Link to={target.to} className={`${LINK_CLS} ${TD_PAD}`} aria-label={title.replace(/\n/g, ". ")}>
            {children}
          </Link>
        ) : children}
      </td>
    );
  };

  let body;
  // A failed refetch keeps the rows already on screen; only a card with
  // nothing to show gives its space to the error.
  if (isError && !data) {
    body = (
      <tr>
        <td colSpan={COLS} className="px-4 py-6 text-center whitespace-normal">
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-2)" }}>{t("overview.att.error")}</span>
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
        <td className="px-2 sm:px-3 py-2.5">
          <SkeletonBlock className={`h-3.5 ${SK_NAME[i % SK_NAME.length]}`} />
        </td>
        {[0, 1, 2].map((j) => (
          <td key={j} className={TD_PAD}>
            <SkeletonBlock className="h-3.5 w-6 mx-auto" />
          </td>
        ))}
        <td className="p-0 border" style={RULE}>
          <SkeletonBlock className="h-[36px] w-full" style={{ borderRadius: 0 }} />
        </td>
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
              {groupLine(g)}
            </td>
          </tr>
        )}
        {g.rows.map((r) => {
          const h = halfOf(r);
          const blank = !!h.reason;
          const rosterTip = blank ? null : [
            h.not_yet ? fill(t("overview.att.tipNotYet"), { n: h.not_yet }) : null,
            h.unread ? fill(t("overview.att.tipUnread"), { n: h.unread }) : null,
          ].filter(Boolean).join("\n");
          const absentTip = !blank && h.on_leave
            ? fill(t("overview.att.tipLeave"), { n: h.on_leave }) : null;
          return (
            <tr key={r.manager_id}>
              <td className="p-0 align-middle">
                <Link
                  to={`/brigadir/${r.manager_id}`}
                  className="block px-2 max-[359px]:px-1.5 sm:px-3 py-2 outline-none hover:shadow-[inset_3px_0_0_0_var(--brand)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
                >
                  <span
                    className="block whitespace-normal sm:whitespace-nowrap text-[11.5px] sm:text-xs font-medium leading-snug"
                    style={{ color: "var(--text-1)" }}
                  >
                    {softHyphenate(tl(r.name || ""))}
                  </span>
                </Link>
              </td>
              {countTd(blank ? null : h.roster, rosterTip)}
              {countTd(blank ? null : h.came)}
              {countTd(blank ? null : h.absent, absentTip)}
              {rateTd(h, r, g.day)}
            </tr>
          );
        })}
      </Fragment>
    ));
  }

  const right = (
    <SegmentedToggle
      size="sm"
      value={scope}
      onChange={setScope}
      options={[["all", t("workers.tmAll")], ["zag", t("workers.tmZagruzka")]]}
    />
  );

  return (
    <section className="mb-6" aria-label={t("overview.att.title")}>
      <TableCard
        icon={UserCheck}
        title={(
          <span className="inline-flex items-center gap-1">
            {t("overview.att.title")}
            <Tooltip text={t("overview.att.info")} width="18rem" />
          </span>
        )}
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
              ["roster", { full: t("workers.onList"), short: t("overview.att.colRosterShort") }],
              ["came", { full: t("workers.came") }],
              ["absent", { full: t("workers.absent"), short: t("overview.att.colAbsentShort") }],
              ["rate", {
                full: t("overview.att.colRate"), short: t("overview.att.colRateShort"),
                cap: single
                  ? fill(t("overview.sr.capDated"), { when: t("overview.sr.today"), date: ddmm(single.day) })
                  : t("overview.sr.today"),
              }],
            ].map(([k, label]) => (
              <Th
                key={k}
                k={k}
                sort={sort}
                onSort={onSort}
                align="center"
                cls={TH_FIG}
                label={<HeadLabel active={sort?.key === k} {...label} />}
              />
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </TableCard>

      {rows.length > 0 && (
        <div className="mt-2 px-1 flex flex-col gap-1.5 text-[11px] sm:text-[10.5px] leading-snug" style={{ color: "var(--text-3)" }}>
          {/* The scale the percentages are painted by, in the very tints the
              cells wear — the heatmap's own, best first. */}
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>{t("overview.att.colRate")}</span>
            {LEGEND.map((b) => (
              <span
                key={b.from}
                className="rounded-sm px-1.5 py-px font-semibold tabular-nums"
                style={segmentFill(b.from / 100, ATT_SEGMENTS)}
              >
                {b.label}
              </span>
            ))}
          </span>
          {anyRunning && <div>{t("overview.att.note")}</div>}
          {canStaff && <div>{t("overview.att.tapHint")}</div>}
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {reasons.map((k) => {
                const Icon = REASON_ICON[k];
                return (
                  <span key={k} className="inline-flex items-center gap-1">
                    <Icon size={11} aria-hidden="true" />
                    {t(`overview.att.reason.${k}`)}
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
