/**
 * Live shift monitor — the wall screen for shift managers (`/live`, Laboratory).
 *
 * One question, asked every 30 seconds: what is going wrong on this shift
 * RIGHT NOW? Idle time per brigadir and per cell (the cells' own filed
 * intervals, the unit figure being the platform's headcount-weighted mean)
 * and plan pace against the shift clock (ПЛАН/ФАКТ minutes off the Positions
 * table's own resolution). The backend (`routers/live_overview.py` →
 * `services/live_overview.py`) decides what is critical; this page makes the
 * change VISIBLE: numbers count to their new value, the board reorders with a
 * FLIP animation, a new alert slides in, a stopped cell pulses.
 *
 * Page key `live` — admin-only until the operator opens it. A shift-manager
 * is locked to their shift ∩ plant server-side; admins pick a shift, and may
 * replay a finished day (`?date=`) to look at the screen when nothing runs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { BookOpenText, RefreshCw } from "lucide-react";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { FilterPanel } from "../components/ui/ColumnFilter";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import LiveHeader from "../components/live/LiveHeader";
import KpiTiles from "../components/live/KpiTiles";
import UnitBoard from "../components/live/UnitBoard";
import AlertFeed from "../components/live/AlertFeed";
import CellGrid from "../components/live/CellGrid";
import { useFullscreen, useNewKeys, useSamples, useTick } from "../components/live/liveHooks";
import { tp } from "../components/live/liveUtils";
import { useFactory, useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useIsMobile from "../hooks/useIsMobile";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const INTERVAL = 30_000;

export default function LiveOverview() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const mobile = useIsMobile(768);
  const { ready } = useFactory();
  const factorySection = useFactorySection();

  const [shiftPick, setShiftPick] = usePersistentState("live.shift", null);
  const [onlyProblems, setOnlyProblems] = usePersistentState("live.onlyProblems", false);
  const [replay, setReplay] = useState(null);
  const [showRules, setShowRules] = useState(false);

  const baseParams = useMemo(() => ({
    ...(shiftPick ? { shift: shiftPick } : {}),
    ...(replay ? { date: replay } : {}),
  }), [shiftPick, replay]);
  const params = useFactoryParams(baseParams);

  const q = useQuery({
    queryKey: ["live-overview", params],
    queryFn: () => api.get("/api/live-overview", { params }).then((r) => r.data),
    enabled: ready,
    refetchInterval: INTERVAL,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: 1,
    staleTime: INTERVAL - 5_000,
  });
  const data = q.data;
  const offline = q.isError && !!data;
  const now = useTick(1000);
  const samples = useSamples(data);
  const newKeys = useNewKeys((data?.alerts || []).map((a) => a.key));

  const rootRef = useRef(null);
  const fs = useFullscreen(rootRef);

  // A critical count in the tab title, so a monitor minimised behind another
  // window still says something.
  const crit = data?.kpi?.alerts?.crit || 0;
  const warn = data?.kpi?.alerts?.warn || 0;
  useEffect(() => {
    if (!data) return undefined;
    const base = document.title.replace(/^\(\d+[!·]\d*\)\s*/, "");
    document.title = crit || warn ? `(${crit}!${warn}) ${base}` : base;
    return () => { document.title = base; };
  }, [crit, warn, data]);

  // A replay picked on the live day IS live.
  const liveDay = data?.shifts?.[data?.scope?.shift]?.day;
  const onReplay = (iso) => setReplay(!iso || iso === liveDay ? null : iso);

  const shiftValue = data?.scope?.shift ?? shiftPick ?? 1;
  const th = data?.thresholds || {};

  const factoryPanel = factorySection ? <FilterPanel sections={[factorySection]} /> : null;

  return (
    <Layout title={t("nav.live")}>
      <div ref={rootRef} className="live-root flex flex-col gap-4">
        <LiveHeader
          data={data} t={t} tl={tl} now={now}
          refreshedAt={q.dataUpdatedAt || null} interval={INTERVAL}
          fetching={q.isFetching} offline={offline}
          isFs={fs.on} fsSupported={fs.supported} onToggleFs={fs.toggle}
          shiftValue={shiftValue} onShift={(v) => setShiftPick(Number(v))}
          canPickShift={!!data && !data.scope?.shift_locked}
          replay={replay} onReplay={onReplay} canReplay={!!data?.scope?.can_replay}
          factoryPanel={factoryPanel}
        />

        {!data && q.isLoading && (
          <>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              <SkeletonTable rows={6} cols={6} />
            </div>
          </>
        )}

        {!data && q.isError && (
          <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <EmptyState
              title={t("live.errTitle")}
              message={String(q.error?.response?.data?.detail || q.error?.message || "")}
              showUploadLink={false}
              action={<Button variant="secondary" icon={RefreshCw} onClick={() => q.refetch()}>{t("live.retry")}</Button>}
            />
          </div>
        )}

        {data && (
          <>
            <KpiTiles kpi={data.kpi} frame={data.frame} thresholds={th} samples={samples} t={t} />

            <div className="grid gap-4 xl:grid-cols-3 items-start">
              <div className="xl:col-span-2 min-w-0">
                <UnitBoard units={data.units} thresholds={th} frame={data.frame} t={t} tl={tl} mobile={mobile} />
              </div>
              <div className="min-w-0 xl:sticky xl:top-0">
                <AlertFeed alerts={data.alerts} newKeys={newKeys} t={t} tl={tl} />
              </div>
            </div>

            <CellGrid cells={data.cells} units={data.units} onlyProblems={!!onlyProblems} onToggleOnly={setOnlyProblems} t={t} tl={tl} />

            <div className="flex flex-col gap-2 items-start">
              <Button variant="ghost" size="sm" icon={BookOpenText} onClick={() => setShowRules((v) => !v)}>
                {t("live.legend")}
              </Button>
              {showRules && (
                <ul className="text-[12px] leading-relaxed list-disc pl-5 rounded-xl px-6 py-3"
                  style={{ color: "var(--text-3)", background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                  <li>{tp(t, "live.legend.unit", { u: th.unit_idle_flag, uw: th.unit_idle_warn })}</li>
                  <li>{tp(t, "live.legend.cell", { s: th.stopped_now_crit, c: th.cell_idle_crit, cw: th.cell_idle_warn })}</li>
                  <li>{tp(t, "live.legend.pace", { pc: Math.round((th.pace_crit || 0) * 100), pw: Math.round((th.pace_warn || 0) * 100), g: Math.round((th.pace_grace || 0) * 100) })}</li>
                  <li>{tp(t, "live.legend.fresh", { m: th.plan_stale_min })}</li>
                  <li>{t("live.windowNote")}</li>
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
