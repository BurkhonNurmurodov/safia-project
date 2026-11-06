import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, UserX } from "lucide-react";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import SegmentedToggle from "../ui/SegmentedToggle";
import { localISO } from "../ui/DateRangePicker";
import { SkeletonBlock } from "../ui/Skeleton";
import useIsMobile from "../../hooks/useIsMobile";
import api from "../../utils/api";
import { useP } from "./peopleUtil";
import IdentityRail from "./IdentityRail";
import PeriodBand from "./PeriodBand";
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

/** The card's frame while the first answer is on its way — the shapes it
 *  will take, at their size, so nothing jumps when it lands. */
function CardSkeleton() {
  return (
    <div className="@container">
      <div className="grid gap-4 @5xl:grid-cols-[300px_minmax(0,1fr)] items-start">
        <div className="rounded-2xl p-5 flex @5xl:flex-col items-center gap-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SkeletonBlock className="w-[74px] h-[74px] @5xl:w-[114px] @5xl:h-[114px] rounded-full flex-shrink-0" />
          <div className="flex-1 w-full space-y-2.5 @5xl:flex @5xl:flex-col @5xl:items-center">
            <SkeletonBlock className="h-5 w-56 max-w-full" />
            <SkeletonBlock className="h-4 w-40" />
            <SkeletonBlock className="h-4 w-32" />
          </div>
        </div>
        <div className="space-y-4 min-w-0">
          <SkeletonBlock className="h-[260px] w-full rounded-2xl" />
          <SkeletonBlock className="h-[38px] w-[420px] max-w-full rounded-xl" />
          <SkeletonBlock className="h-[320px] w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

/**
 * /people/:employee_id — one person: who they are (the identity column, in view
 * while the tabs scroll on a wide card), the period on one band (the rate with
 * the period's days drawn beside it, and the other three tiles), the tab
 * strip, the asked tab.
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
    ) : <CardSkeleton />;
  }

  const hero = data.hero;
  const tabs = TABS.filter((k) => k !== "leadership" || hero.leadership);
  // A tab this person does not have («Rahbarlik» for somebody who leads
  // nothing, an old link) is answered by the server as the overview.
  const view = tabs.includes(tab) ? tab : "overview";
  const ready = data.tab === view && !card.isPlaceholderData;
  const tabProps = { data, P, eid, ready, refetch: card.refetch };
  // A day pressed on the band's grid opens that month on «Davomat».
  const pickDay = (iso) => { setMonth(`${iso.slice(0, 7)}-01`); setTab("attendance"); };

  return (
    <div className="@container">
      <div className="grid gap-4 @5xl:grid-cols-[300px_minmax(0,1fr)] items-start">
        <IdentityRail hero={hero} P={P} />
        <div className="min-w-0 space-y-4">
          <PeriodBand data={data} P={P} todayIso={todayIso} onPickDay={pickDay}
            dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo} />

          <SegmentedToggle asTabs size={isMobile ? "lg" : "md"} value={view} onChange={setTab} ariaLabel={P.title}
            options={tabs.map((k) => [k, P.tab[k]])} />

          {/* A new tab arrives — it never snaps in. */}
          <div key={view} className="pc-reveal">
            {view === "overview" && <OverviewTab {...tabProps} />}
            {view === "attendance" && <AttendanceTab {...tabProps} month={month} setMonth={setMonth} />}
            {view === "career" && <CareerTab {...tabProps} />}
            {view === "honours" && <HonoursTab {...tabProps} />}
            {view === "concerns" && <ConcernsTab {...tabProps} />}
            {view === "leadership" && <LeadershipTab {...tabProps} />}
          </div>
        </div>
      </div>
    </div>
  );
}
