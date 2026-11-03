import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { CookingPot, RotateCw, Database } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import DayStepper from "../components/ui/DayStepper";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { SkeletonCard, SkeletonChart, SkeletonBlock } from "../components/ui/Skeleton";
import OvenLive from "../components/ovens/OvenLive";
import { BakesView, UseView, AlarmsView } from "../components/ovens/OvenPeriod";
import OvenDay from "../components/ovens/OvenDay";
import OvenInfo from "../components/ovens/OvenInfo";
import { useOT, fill, stamp } from "../components/ovens/ovensUtil";
import { useAuth } from "../context/AuthContext";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";

// «Pechlar» (/ovens) — the Revent ovens, everything their Windows «Revent Oven
// Manager» shows: the live board, the bakes, the oven modes (utilisation),
// alarms and the door, one day's graph, and what each oven says about itself.
// The ovens are on the factory LAN; a collector there reads them (read-only)
// and posts here (routers/ovens.py). The page reads only what was posted.

const TABS = ["live", "bakes", "use", "alarms", "day", "info"];
const NONE = [];
const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function Ovens() {
  const T = useOT();
  const navigate = useNavigate();
  const isAdmin = useAuth()?.auth?.role === "admin";
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get("tab")) ? params.get("tab") : "live";
  const setTab = (t) => setParams((p) => { const n = new URLSearchParams(p); n.set("tab", t); return n; }, { replace: true });

  const today = todayISO();
  const [range, setRange] = useState({ from: addDays(today, -6), to: today });
  const [ovenSel, setOvenSel] = usePersistentState("ovens_sel", NONE);
  const [dayOven, setDayOven] = usePersistentState("ovens_day_oven", null);
  const [dayDate, setDayDate] = useState(today);

  const board = useQuery({
    queryKey: ["ovens-board"],
    queryFn: () => api.get("/api/ovens/board").then((r) => r.data),
    refetchInterval: tab === "live" ? 30_000 : false,
    staleTime: 20_000,
  });
  const ovens = board.data?.ovens || NONE;
  const nameOf = useMemo(() => new Map(ovens.map((o) => [o.id, o.name])), [ovens]);
  const sel = ovenSel.filter((id) => nameOf.has(id));
  const oneOven = nameOf.has(dayOven) ? dayOven : ovens[0]?.id ?? null;

  const periodTab = tab === "bakes" || tab === "use" || tab === "alarms";
  const periodParams = { date_from: range.from, date_to: range.to, ...(sel.length ? { ovens: sel.join(",") } : {}) };
  const period = useQuery({
    queryKey: ["ovens-analysis", periodParams],
    queryFn: () => api.get("/api/ovens/analysis", { params: periodParams }).then((r) => r.data),
    enabled: periodTab && ovens.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const todayQ = useQuery({
    queryKey: ["ovens-analysis", { date_from: today, date_to: today }],
    queryFn: () => api.get("/api/ovens/analysis", { params: { date_from: today, date_to: today } }).then((r) => r.data),
    enabled: tab === "live" && ovens.length > 0,
    refetchInterval: tab === "live" ? 300_000 : false,
    staleTime: 120_000,
  });
  const dayQ = useQuery({
    queryKey: ["ovens-day", oneOven, dayDate],
    queryFn: () => api.get("/api/ovens/day", { params: { oven: oneOven, date: dayDate } }).then((r) => r.data),
    enabled: tab === "day" && oneOven != null,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const infoQ = useQuery({
    queryKey: ["ovens-info", oneOven],
    queryFn: () => api.get("/api/ovens/info", { params: { oven: oneOven } }).then((r) => r.data),
    enabled: tab === "info" && oneOven != null,
    staleTime: 300_000,
  });

  const openDay = (ovenId, date) => {
    setDayOven(ovenId);
    setDayDate(date);
    setTab("day");
  };

  // ── filters ───────────────────────────────────────────────────────────────
  const ovenKeys = ovens.map((o) => o.id);
  const sections = [];
  if (periodTab && ovens.length > 1) {
    sections.push({
      key: "ovens", icon: CookingPot, label: T.fOvens, group: T.grpScope, pinned: true,
      active: sel.length > 0,
      display: sel.length === 1 ? nameOf.get(sel[0]) : sel.length ? fill(T.nSelected, { n: sel.length }) : "",
      onClear: () => setOvenSel([]),
      render: () => <OptsFilter opts={ovenKeys} sel={sel} onChange={setOvenSel} labelOf={(k) => nameOf.get(k) || "·"} />,
    });
  }
  if ((tab === "day" || tab === "info") && ovens.length > 0) {
    sections.push({
      key: "oven", icon: CookingPot, label: T.fOven, group: T.grpScope, pinned: true,
      active: true, display: nameOf.get(oneOven) || "",
      render: ({ close }) => (
        <PickFilter opts={ovens.map((o) => ({ value: o.id, label: o.name }))} value={oneOven}
          onChange={(v) => setDayOven(v)} close={close} />
      ),
    });
  }

  const tabs = [
    ["live", T.tLive], ["bakes", T.tBakes], ["use", T.tUse], ["alarms", T.tAlarms], ["day", T.tDay], ["info", T.tInfo],
  ];
  const active = tab === "live" ? board : periodTab ? period : tab === "day" ? dayQ : infoQ;
  const lastLog = ovens.map((o) => o.logs_at).filter(Boolean).sort().pop();

  let body;
  if (board.isError && !board.data) {
    body = <EmptyState tone="danger" title={T.loadError} message={T.loadErrorMsg} showUploadLink={false}
      action={<Button size="sm" variant="secondary" onClick={() => board.refetch()}><RotateCw size={12} /> {T.retry}</Button>} />;
  } else if (board.isPending) {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 lg:gap-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
        <SkeletonChart className="h-72" />
      </div>
    );
  } else if (!ovens.length) {
    body = <EmptyState icon={CookingPot} title={T.noOvens} message={isAdmin ? T.noOvensAdmin : T.noOvensUser} showUploadLink={false}
      action={isAdmin ? <Button size="sm" variant="secondary" onClick={() => navigate("/panel/ovens")}>{T.openRegister}</Button> : null} />;
  } else if (active.isError && !active.data) {
    body = <EmptyState tone="danger" title={T.loadError} message={T.loadErrorMsg} showUploadLink={false}
      action={<Button size="sm" variant="secondary" onClick={() => active.refetch()}><RotateCw size={12} /> {T.retry}</Button>} />;
  } else if (!active.data) {
    body = (
      <div className="space-y-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        <SkeletonChart className="h-72" />
        <SkeletonBlock className="h-64 rounded-2xl" />
      </div>
    );
  } else {
    const dim = { opacity: active.isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" };
    const noLogs = periodTab && !period.data.days.some((r) => r.logged);
    body = (
      <div style={dim} aria-busy={active.isPlaceholderData}>
        {tab === "live" && <OvenLive board={board.data} todayRows={todayQ.data?.days} />}
        {noLogs && <EmptyState icon={Database} title={T.noLogs} message={T.noLogsMsg} showUploadLink={false} />}
        {!noLogs && tab === "bakes" && <BakesView data={period.data} onOpenDay={openDay} />}
        {!noLogs && tab === "use" && <UseView data={period.data} onOpenDay={openDay} />}
        {!noLogs && tab === "alarms" && <AlarmsView data={period.data} onOpenDay={openDay} />}
        {tab === "day" && <OvenDay day={dayQ.data} />}
        {tab === "info" && <OvenInfo info={infoQ.data} />}
      </div>
    );
  }

  return (
    <Layout title={T.title}>
      <div className="mb-4">
        <SegmentedToggle asTabs value={tab} onChange={setTab} options={tabs} />
      </div>
      {ovens.length > 0 && tab !== "live" && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {periodTab && (
            <DateRangePicker dateFrom={range.from} dateTo={range.to} max={today}
              setDateFrom={(v) => setRange((r) => ({ ...r, from: v }))}
              setDateTo={(v) => setRange((r) => ({ ...r, to: v }))}
              compactLabel triggerClassName="px-3 py-2 text-sm" />
          )}
          {tab === "day" && <DayStepper value={dayDate} onChange={setDayDate} max={today} />}
          {sections.length > 0 && (
            // The oven pick of the day / info tabs is required (no «all»), so
            // it is never a narrowing to clear; only the period's pick is.
            <FilterPanel sections={sections} chipsWrap
              activeCount={periodTab && sel.length ? 1 : 0} anyActive={periodTab && sel.length > 0}
              onClearAll={() => setOvenSel([])} />
          )}
          <div className="flex-1" />
          {lastLog && (
            <span className="text-[11px] whitespace-nowrap flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
              <Database size={12} /> {stamp(lastLog)}
            </span>
          )}
        </div>
      )}
      {body}
    </Layout>
  );
}
