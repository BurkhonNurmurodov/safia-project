import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Briefcase, CalendarClock, UserX } from "lucide-react";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
import KpiDeltaCard from "../ui/KpiDeltaCard";
import ProfileAvatar from "../ui/ProfileAvatar";
import CellLink from "../ui/CellLink";
import GroupBadge from "../ui/GroupBadge";
import { SkeletonBlock } from "../ui/Skeleton";
import { VerdictChip } from "../kpi/KpiBits";
import useIsMobile from "../../hooks/useIsMobile";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { useP, fill, fmtDate, tenureText, nameCase, useCanOpen } from "./peopleUtil";
import { StatusChip } from "./PeopleSearch";
import OverviewTab from "./OverviewTab";
import AttendanceTab from "./AttendanceTab";
import CareerTab from "./CareerTab";
import HonoursTab from "./HonoursTab";
import ConcernsTab from "./ConcernsTab";
import LeadershipTab from "./LeadershipTab";

const TABS = ["overview", "attendance", "career", "honours", "concerns", "leadership"];

const isoMinus = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - days);
  return localISO(d);
};

const signed = (v, digits = 0) => {
  if (v == null || Number.isNaN(v)) return null;
  const r = Number(v.toFixed(digits));
  // Zero is «0»: the card's own flat chip already draws the dash.
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("ru-RU", { maximumFractionDigits: digits })}`;
};

/** The four period tiles — the figures and their 7-week lines. */
function Tiles({ tiles, P }) {
  const { cur, prev, weeks } = tiles;
  const att = (x) => (x.att == null ? null : `${Math.round(x.att)}%`);
  const d = (a, b) => (a == null || b == null ? 0 : a - b);
  const prevLabel = P.prev;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <KpiDeltaCard label={P.tAtt} tooltip={P.tAttTip}
        value={att(cur)} prevValue={att(prev)} prevLabel={prevLabel}
        delta={d(cur.att, prev.att)} deltaText={cur.att != null && prev.att != null ? `${signed(cur.att - prev.att)}%` : null}
        sub={cur.listed ? fill(P.attSub, { c: cur.came, l: cur.leave, n: cur.listed }) : null}
        trend={weeks.map((w) => w.att)} />
      <KpiDeltaCard label={P.tCame} tooltip={P.tCameTip}
        value={String(cur.came)} prevValue={String(prev.came)} prevLabel={prevLabel}
        delta={d(cur.came, prev.came)} deltaText={signed(cur.came - prev.came)}
        trend={weeks.map((w) => w.came)} />
      <KpiDeltaCard label={P.tHours} tooltip={P.tHoursTip}
        value={cur.hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
        prevValue={prev.hours.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} prevLabel={prevLabel}
        delta={d(cur.hours, prev.hours)} deltaText={signed(cur.hours - prev.hours, 1)}
        trend={weeks.map((w) => w.hours)} />
      {/* Moves are neither good nor bad: no verdict chip, only the figures. */}
      <KpiDeltaCard label={P.tMoves} tooltip={P.tMovesTip}
        value={String(cur.moves)} prevValue={String(prev.moves)} prevLabel={prevLabel}
        trend={weeks.map((w) => w.moves)} />
    </div>
  );
}

/** One labelled fact of the hero — a quiet label over its value, so six facts
 *  read as one row instead of six differently styled chips. */
function HeroFact({ label, children, title }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[13px]" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
  );
}

// Today's live state: the dot is a status (green at work, yellow on a break,
// slate otherwise) — never the brand gold, which is an accent.
const LIVE_DOT = { inside: "#22c55e", break: "#eab308" };

function Fact({ icon: Icon, children, title }) {
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0 text-xs" style={{ color: "var(--text-2)" }} title={title}>
      {Icon && <Icon size={13} className="flex-shrink-0" style={{ color: "var(--text-3)" }} aria-hidden="true" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function Hero({ hero, P }) {
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const isMobile = useIsMobile();
  const c = hero.cell;
  const cat = hero.category;
  const canBrigadir = useCanOpen("overview");
  const today = hero.today;
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex gap-4 items-center">
        <ProfileAvatar muted name={nameCase(tl(hero.name))} colorKey={hero.name} size={isMobile ? 52 : 64}
          photoUrl={hero.photo ? `/api/people/${encodeURIComponent(hero.employee_id)}/photo?size=${isMobile ? 96 : 192}` : undefined} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-lg sm:text-xl font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{nameCase(tl(hero.name))}</h2>
            <StatusChip status={hero.status} dismissed={hero.dismissed} P={P} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Fact icon={Briefcase}>{tx(hero.job || "—")}</Fact>
            <Fact icon={CalendarClock} title={`${P.hired}: ${fmtDate(hero.hired)}`}>
              {P.tenure}: {tenureText(hero.tenure_months, P)}
            </Fact>
          </div>
        </div>
      </div>

      {/* The facts in ONE row of label over value — they were eight chip and
          link styles over two rows, each asking to be read first. */}
      <div className="mt-4 pt-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-6 gap-y-3"
        style={{ borderTop: "1px solid var(--border)" }}>
        <HeroFact label={P.cell}>
          {c ? (
            <>
              <CellLink id={c.id} className="text-xs font-semibold tabular-nums" title={P.cell}>
                <span className="px-1.5 py-0.5 rounded-md" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}>{c.code}</span>
              </CellLink>
              <GroupBadge group={c.letter} />
            </>
          ) : (
            <span className="truncate" style={{ color: "var(--text-3)" }}>{P.noCell}{hero.unit_name ? ` · ${tx(hero.unit_name)}` : ""}</span>
          )}
        </HeroFact>
        <HeroFact label={P.manager}>
          <span className="truncate" style={{ color: c?.leader ? "var(--text-1)" : "var(--text-3)" }}>
            {c?.leader ? tl(c.leader) : c ? P.noLeader : "—"}
          </span>
        </HeroFact>
        <HeroFact label={P.brigadir}>
          {c?.unit && canBrigadir ? (
            <button type="button" className="cell-link truncate" onClick={() => nav(`/brigadir/${c.unit_id}`)}>{tl(c.unit)}</button>
          ) : <span className="truncate">{c?.unit ? tl(c.unit) : "—"}</span>}
        </HeroFact>
        <HeroFact label={P.shift}>{c?.shift ? fill(P.shiftN, { n: c.shift }) : "—"}</HeroFact>
        <HeroFact label={P.category} title={P.categoryTip}>
          {cat ? (
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0">
              <span className="whitespace-nowrap">{cat.actual ? tx(cat.actual) : P.categoryNone}</span>
              {/* The expected step only where it is not the one held. */}
              {cat.expected && cat.expected !== cat.actual && (
                <span className="whitespace-nowrap text-xs" style={{ color: "var(--text-3)" }}>({fill(P.expected, { e: tx(cat.expected) })})</span>
              )}
              <VerdictChip counted={cat.counted} compliant={cat.compliant}>{P.verdict[cat.verdict] || cat.verdict}</VerdictChip>
            </span>
          ) : "—"}
        </HeroFact>
        {today && (
          <HeroFact label={P.today}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" aria-hidden="true"
              style={{ background: LIVE_DOT[today.status] || "#94a3b8" }} />
            <span className="truncate">
              {today.in && today.out ? `${P.live[today.status] || today.status} · ${today.in}–${today.out}`
                : today.in ? fill(P.liveSince, { s: P.live[today.status] || today.status, t: today.in })
                : (P.live[today.status] || today.status)}
            </span>
          </HeroFact>
        )}
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 sm:p-5 flex gap-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SkeletonBlock className="w-[52px] h-[52px] sm:w-16 sm:h-16 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2.5">
          <SkeletonBlock className="h-6 w-56" />
          <SkeletonBlock className="h-4 w-72 max-w-full" />
          <SkeletonBlock className="h-6 w-80 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-[118px] rounded-xl" />)}
      </div>
    </div>
  );
}

/**
 * /people/:employee_id — one person: the hero (identity, cell, category, today)
 * and the period's four tiles on every tab, the tab strip, the asked tab.
 * Everything is the server's (`GET /api/people/:id`); nothing is computed here
 * but formatting.
 */
export default function PersonCard({ eid }) {
  const P = useP();
  const nav = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();
  const todayIso = localISO(new Date());

  // The tab IS the URL's (`?tab=`), so a link can open one and back/forward
  // never disagree with the strip.
  const urlTab = useMemo(() => new URLSearchParams(location.search).get("tab"), [location.search]);
  const tab = TABS.includes(urlTab) ? urlTab : "overview";
  const setTab = (v) => {
    const q = new URLSearchParams(location.search);
    q.set("tab", v);
    nav({ search: `?${q.toString()}` }, { replace: true });
  };

  const [dateTo, setDateTo] = useState(todayIso);
  const [dateFrom, setDateFrom] = useState(isoMinus(todayIso, 29));
  const [month, setMonth] = useState(todayIso.slice(0, 7) + "-01");

  const card = useQuery({
    queryKey: ["people-card", eid, dateFrom, dateTo, tab, tab === "attendance" ? month : null],
    queryFn: () => api.get(`/api/people/${encodeURIComponent(eid)}`, {
      params: { date_from: dateFrom, date_to: dateTo, tab, ...(tab === "attendance" ? { month: month.slice(0, 7) } : {}) },
    }).then((r) => r.data),
    // Keep the hero on screen while another tab or period loads — never
    // another person's.
    placeholderData: (prev, prevQ) => (prevQ?.queryKey?.[1] === eid ? prev : undefined),
    staleTime: 30_000,
    retry: (n, err) => err?.response?.status !== 404 && n < 1,
  });

  const data = card.data;
  const status = card.error?.response?.status;
  if (status === 404) {
    return (
      <EmptyState icon={UserX} title={P.notFoundTitle} message={P.notFoundMsg} showUploadLink={false}
        action={<Button variant="secondary" icon={ArrowLeft} onClick={() => nav("/people")}>{P.backToSearch}</Button>} />
    );
  }
  if (!data) {
    return card.isError ? (
      <EmptyState tone="danger" title={P.loadFailed} message={P.loadFailedMsg} showUploadLink={false}
        action={<Button variant="secondary" onClick={() => card.refetch()}>{P.retry}</Button>} />
    ) : <HeroSkeleton />;
  }

  const hero = data.hero;
  const tabs = TABS.filter((k) => k !== "leadership" || hero.leadership);
  // A tab this person does not have («Rahbarlik» for somebody who leads
  // nothing, an old link) is answered by the server as the overview.
  const view = tabs.includes(tab) ? tab : "overview";
  const ready = data.tab === view && !card.isPlaceholderData;
  const tabProps = { data, P, eid, ready, refetch: card.refetch };

  return (
    <div className="space-y-4">
      <Hero hero={hero} P={P} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{P.period}</span>
        <DateRangePicker compactLabel dateFrom={dateFrom} dateTo={dateTo} max={todayIso}
          setDateFrom={setDateFrom} setDateTo={setDateTo} triggerClassName="px-3 py-2 text-sm" />
        <span className="text-[11px] ml-auto max-sm:hidden" style={{ color: "var(--text-3)" }}>{P.sparkNote}</span>
      </div>
      <Tiles tiles={data.tiles} P={P} />

      <SegmentedToggle asTabs size={isMobile ? "lg" : "md"} value={view} onChange={setTab} ariaLabel={P.title}
        options={tabs.map((k) => [k, P.tab[k]])} />

      {view === "overview" && <OverviewTab {...tabProps} />}
      {view === "attendance" && <AttendanceTab {...tabProps} month={month} setMonth={setMonth} />}
      {view === "career" && <CareerTab {...tabProps} />}
      {view === "honours" && <HonoursTab {...tabProps} />}
      {view === "concerns" && <ConcernsTab {...tabProps} />}
      {view === "leadership" && <LeadershipTab {...tabProps} />}
    </div>
  );
}
